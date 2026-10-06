// Netplay guest: receives the host's game stream and sends this player's controller and
// keyboard state back ~60 times a second.

import { InputManager } from '../input/manager';
import { encodeInput, encodeSignal, decodeSignal } from './codec';
import { waitForIce } from './host';
import { SignalClient, type RelayData } from './signaling';

export type GuestStatus = 'connecting' | 'connected' | 'closed';

export interface GuestCallbacks {
  onStream: (stream: MediaStream) => void;
  onStatus: (status: GuestStatus, detail?: string) => void;
  onInfo: (info: { host: string; title: string; port: number | null; rttMs: number | null; paused: boolean }) => void;
  onChat?: (from: string, text: string) => void;
}

export class NetplayGuest {
  private pc: RTCPeerConnection;
  private input?: RTCDataChannel;
  private ctrl?: RTCDataChannel;
  private signal: SignalClient | null = null;
  private timer = 0;
  private seq = 0;
  readonly inputs = new InputManager();
  info = { host: 'Host', title: '', port: null as number | null, rttMs: null as number | null, paused: false };
  private closed = false;

  private constructor(iceServers: RTCIceServer[], private name: string, private cb: GuestCallbacks) {
    this.pc = new RTCPeerConnection({ iceServers });
    const stream = new MediaStream();
    this.pc.ontrack = (e) => {
      stream.addTrack(e.track);
      // Ask the browser to play frames as soon as they arrive (lowest latency).
      const r = e.receiver as RTCRtpReceiver & { jitterBufferTarget?: number; playoutDelayHint?: number };
      try {
        if ('jitterBufferTarget' in r) r.jitterBufferTarget = 0;
        if ('playoutDelayHint' in r) r.playoutDelayHint = 0;
      } catch {
        // not supported
      }
      cb.onStream(stream);
    };
    this.pc.ondatachannel = (e) => {
      if (e.channel.label === 'input') {
        this.input = e.channel;
        this.input.binaryType = 'arraybuffer';
      } else if (e.channel.label === 'ctrl') {
        this.ctrl = e.channel;
        this.ctrl.onopen = () => {
          this.ctrl!.send(JSON.stringify({ t: 'hello', name: this.name }));
          cb.onStatus('connected');
        };
        this.ctrl.onmessage = (m) => this.onCtrl(String(m.data));
        this.ctrl.onclose = () => this.end('The connection to the host closed.');
      }
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'failed') this.end('Could not keep a connection to the host. A TURN server may be needed on strict networks.');
    };
    this.startSending();
  }

  private onCtrl(raw: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.t) {
      case 'welcome':
        this.info = { ...this.info, host: String(msg.host ?? 'Host'), title: String(msg.title ?? ''), port: msg.port as number | null };
        break;
      case 'assigned':
        this.info.port = msg.port as number | null;
        break;
      case 'ping':
        this.ctrl?.send(JSON.stringify({ t: 'pong', ts: msg.ts }));
        return;
      case 'paused':
        this.info.paused = !!msg.paused;
        break;
      case 'chat':
        this.cb.onChat?.(String(msg.from), String(msg.text));
        return;
      case 'bye':
        this.end('The host ended the game.');
        return;
    }
    this.cb.onInfo({ ...this.info });
  }

  private startSending() {
    const send = () => {
      if (this.input?.readyState !== 'open') return;
      const pad = this.inputs.localPad();
      this.input.send(encodeInput({ seq: this.seq++ & 0xffff, pad, keys: this.inputs.localRetroKeys() }));
    };
    this.timer = window.setInterval(send, 1000 / 60);
  }

  chat(text: string) {
    if (this.ctrl?.readyState === 'open') this.ctrl.send(JSON.stringify({ t: 'chat', text: text.slice(0, 200) }));
  }

  /** Joins through a room code on a signaling server. */
  static async joinRoom(url: string, room: string, name: string, iceServers: RTCIceServer[], cb: GuestCallbacks): Promise<NetplayGuest> {
    const signal = await SignalClient.connect(url);
    const g = new NetplayGuest(iceServers, name, cb);
    g.signal = signal;
    let hostId = '';
    g.pc.onicecandidate = (e) => e.candidate && hostId && signal.send({ t: 'signal', to: hostId, data: { kind: 'ice', candidate: e.candidate.toJSON() } satisfies RelayData });
    await new Promise<void>((resolve, reject) => {
      signal.onMessage = async (m) => {
        if (m.t === 'joined') resolve();
        else if (m.t === 'error') reject(new Error(m.message));
        else if (m.t === 'closed') g.end(m.reason);
        else if (m.t === 'signal') {
          hostId = m.from;
          if (m.data.kind === 'offer') {
            g.info.host = m.data.name ?? g.info.host;
            g.info.title = m.data.title ?? '';
            await g.pc.setRemoteDescription({ type: 'offer', sdp: m.data.sdp });
            const answer = await g.pc.createAnswer();
            await g.pc.setLocalDescription(answer);
            signal.send({ t: 'signal', to: hostId, data: { kind: 'answer', sdp: answer.sdp!, name } satisfies RelayData });
            cb.onInfo({ ...g.info });
          } else if (m.data.kind === 'ice') {
            await g.pc.addIceCandidate(m.data.candidate).catch(() => undefined);
          }
        }
      };
      signal.onClose = () => !g.closed && g.cb.onStatus('connecting', 'Lost the signaling server; staying connected to the host if possible.');
      signal.send({ t: 'join', room: room.trim().toUpperCase(), name });
    }).catch((e) => {
      g.close();
      throw e;
    });
    return g;
  }

  /** Accepts an invite code and returns the reply code to send back to the host. */
  static async fromInvite(code: string, name: string, iceServers: RTCIceServer[], cb: GuestCallbacks): Promise<{ guest: NetplayGuest; reply: string }> {
    const offer = await decodeSignal(code);
    if (offer.kind !== 'offer') throw new Error('That is a reply code. Paste the invite code from the host.');
    const g = new NetplayGuest(iceServers, name, cb);
    g.info.host = offer.name ?? 'Host';
    g.info.title = offer.title ?? '';
    await g.pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
    await g.pc.setLocalDescription(await g.pc.createAnswer());
    await waitForIce(g.pc);
    const reply = await encodeSignal({ kind: 'answer', sdp: g.pc.localDescription!.sdp, name });
    cb.onInfo({ ...g.info });
    return { guest: g, reply };
  }

  private end(reason: string) {
    if (this.closed) return;
    this.close();
    this.cb.onStatus('closed', reason);
  }

  close() {
    this.closed = true;
    clearInterval(this.timer);
    this.signal?.close();
    this.pc.close();
  }
}
