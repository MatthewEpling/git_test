// Audio output: the core produces 44.1 kHz stereo int16 once per frame. An AudioWorklet
// plays it from a ring buffer and nudges its playback rate (±0.5%) to keep the buffer
// near the target latency, so the 59.94 Hz emulation never drifts into crackles.

const WORKLET = `
class DreamportOutput extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 44100 * 2;          // two seconds of stereo frames
    this.buf = new Float32Array(this.capacity * 2);
    this.write = 0;                      // in frames (monotonic)
    this.read = 0;                       // fractional, in frames (monotonic)
    this.target = 0.06 * sampleRate;     // frames
    this.underruns = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'samples') this.push(d.samples);
      else if (d.type === 'latency') this.target = Math.max(0.02, d.seconds) * sampleRate;
      else if (d.type === 'clear') { this.read = this.write; }
    };
    this.reportCountdown = 0;
  }
  push(s) {
    const frames = s.length >> 1;
    // Drop the oldest audio if we are far behind (e.g. after the tab was hidden).
    if (this.write - this.read + frames > this.capacity) this.read = this.write + frames - this.target;
    for (let i = 0; i < frames; i++) {
      const at = ((this.write + i) % this.capacity) * 2;
      this.buf[at] = s[i * 2];
      this.buf[at + 1] = s[i * 2 + 1];
    }
    this.write += frames;
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    const n = L.length;
    let avail = this.write - this.read;
    const ratio = 1 + Math.max(-0.005, Math.min(0.005, (avail - this.target) / this.target * 0.01));
    for (let i = 0; i < n; i++) {
      avail = this.write - this.read;
      if (avail < 2) { L[i] = 0; R[i] = 0; continue; }
      const f = Math.floor(this.read), t = this.read - f;
      const a = (f % this.capacity) * 2, b = ((f + 1) % this.capacity) * 2;
      L[i] = this.buf[a] + (this.buf[b] - this.buf[a]) * t;
      R[i] = this.buf[a + 1] + (this.buf[b + 1] - this.buf[a + 1]) * t;
      this.read += ratio;
    }
    if (this.write - this.read < 2) this.underruns++;
    if (--this.reportCountdown <= 0) {
      this.reportCountdown = 20;
      this.port.postMessage({ buffered: (this.write - this.read) / sampleRate, underruns: this.underruns });
    }
    return true;
  }
}
registerProcessor('dreamport-output', DreamportOutput);
`;

export class AudioOutput {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private volume = 0.8;
  private muted = false;
  private latency = 0.06;
  private ready: Promise<void> | null = null;
  /** Seconds of audio queued in the worklet (reported a few times a second). */
  buffered = 0;
  underruns = 0;

  init(sampleRate: number): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      let ctx: AudioContext;
      try {
        ctx = new AudioContext({ sampleRate, latencyHint: 'interactive' });
      } catch {
        ctx = new AudioContext({ latencyHint: 'interactive' });
      }
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const node = new AudioWorkletNode(ctx, 'dreamport-output', { numberOfInputs: 0, outputChannelCount: [2] });
      node.port.onmessage = (e) => {
        this.buffered = e.data.buffered;
        this.underruns = e.data.underruns;
      };
      const gain = ctx.createGain();
      node.connect(gain).connect(ctx.destination);
      this.ctx = ctx;
      this.node = node;
      this.gain = gain;
      this.applyGain();
      this.setLatency(this.latency);
    })();
    return this.ready;
  }

  /** Browsers start audio suspended until a user gesture; call this from one. */
  resume() {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
  }

  push(samples: Int16Array) {
    if (!this.node) return;
    const f = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) f[i] = samples[i] / 32768;
    this.node.port.postMessage({ type: 'samples', samples: f }, [f.buffer]);
  }

  clear() {
    this.node?.port.postMessage({ type: 'clear' });
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyGain();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyGain();
  }

  setLatency(seconds: number) {
    this.latency = seconds;
    this.node?.port.postMessage({ type: 'latency', seconds });
  }

  private applyGain() {
    if (this.gain) this.gain.gain.value = this.muted ? 0 : this.volume * this.volume;
  }

  /** A MediaStream of the game audio (post-volume), for netplay streaming. */
  stream(): MediaStream | null {
    if (!this.ctx || !this.node) return null;
    if (!this.streamDest) {
      this.streamDest = this.ctx.createMediaStreamDestination();
      this.node.connect(this.streamDest);
    }
    return this.streamDest.stream;
  }

  get running() {
    return this.ctx?.state === 'running';
  }

  async close() {
    await this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.node = null;
    this.ready = null;
  }
}
