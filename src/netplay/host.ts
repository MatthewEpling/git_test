// Netplay host: streams the game (video + audio) to up to three guests over WebRTC and
// feeds their controller input into the emulator as extra players.

import type { EmulatorSession } from '../emu/session';
import { DEVICE } from '../emu/libretro';
import type { PortConfig } from '../input/manager';
import { decodeInput, encodeSignal, decodeSignal, seqNewer } from './codec';
import { SignalClient, type RelayData, type SignalMessage } from './signaling';

export interface GuestInfo {
  id: string;
  name: string;
  state: 'connecting' | 'connected' | 'disconnected';
  port: number | null;
  rttMs: number | null;
  via: 'room' | 'invite';
}

export interface HostOptions {
  iceServers: RTCIceServer[];
  bitrateKbps: number;
  hostName: string;
  title: string;
  onChange: () => void;
  onChat?: (from: string, text: string) => void;
  onEvent?: (text: string) => void;
}

interface Peer {
  info: GuestInfo;
  pc: RTCPeerConnection;
  ctrl?: RTCDataChannel;
  input?: RTCDataChannel;
  lastSeq: number;
  pingTimer?: number;
}

const STREAM_HEIGHT = 720;

export class NetplayHost {
  readonly guests = new Map<string, Peer>();
  room: string | null = null;
  private signal: SignalClient | null = null;
  private streamCanvas: HTMLCanvasElement;
  private stream: MediaStream;
  private videoTrack: MediaStreamTrack;
  private savedPorts: (PortConfig | null)[] = [null, null, null, null];
  private presentHook: () => void;
  private inviteCount = 0;
  closed = false;

  constructor(private session: EmulatorSession, private opts: HostOptions) {
    this.streamCanvas = document.createElement('canvas');
    this.streamCanvas.width = Math.round(STREAM_HEIGHT * (4 / 3));
    this.streamCanvas.height = STREAM_HEIGHT;
    const ctx = this.streamCanvas.getContext('2d', { alpha: false })!;
    ctx.fillRect(0, 0, this.streamCanvas.width, this.streamCanvas.height);
    this.stream = this.streamCanvas.captureStream(0);
    this.videoTrack = this.stream.getVideoTracks()[0];
    if ('contentHint' in this.videoTrack) this.videoTrack.contentHint = 'motion';
    const audio = session.audio.stream();
    audio?.getAudioTracks().forEach((t) => this.stream.addTrack(t));

    // Copy each displayed frame (with the chosen filter) into the stream canvas.
    this.presentHook = () => {
      if (![...this.guests.values()].some((g) => g.info.state === 'connected')) return;
      const src = session.presenter.canvas;
      const vp = session.presenter.viewport;
      const dpr = src.width / Math.max(1, src.clientWidth);
      const aspect = vp.w / Math.max(1, vp.h);
      const w = Math.round(STREAM_HEIGHT * aspect);
      if (this.streamCanvas.width !== w) this.streamCanvas.width = w;
      ctx.drawImage(src, vp.x * dpr, vp.y * dpr, vp.w * dpr, vp.h * dpr, 0, 0, w, STREAM_HEIGHT);
      (this.videoTrack as MediaStreamTrack & { requestFrame?: () => void }).requestFrame?.();
    };
    session.presentHooks.add(this.presentHook);
  }

  // ───────────────────────── Room codes ─────────────────────────

  async openRoom(signalUrl: string): Promise<string> {
    const client = await SignalClient.connect(signalUrl);
    this.signal = client;
    return new Promise((resolve, reject) => {
      client.onMessage = (m) => {
        if (m.t === 'room') {
          this.room = m.room;
          this.opts.onChange();
          resolve(m.room);
        } else if (m.t === 'error') reject(new Error(m.message));
        else void this.onSignal(m);
      };
      client.onClose = () => {
        this.signal = null;
        this.room = null;
        this.opts.onChange();
      };
      client.send({ t: 'host', name: this.opts.hostName });
    });
  }

  private async onSignal(m: SignalMessage) {
    if (m.t === 'peer') {
      const peer = this.createPeer(m.id, m.name, 'room');
      peer.pc.onicecandidate = (e) => e.candidate && this.signal?.send({ t: 'signal', to: m.id, data: { kind: 'ice', candidate: e.candidate.toJSON() } satisfies RelayData });
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.signal?.send({ t: 'signal', to: m.id, data: { kind: 'offer', sdp: offer.sdp!, name: this.opts.hostName, title: this.opts.title } satisfies RelayData });
    } else if (m.t === 'signal') {
      const peer = this.guests.get(m.from);
      if (!peer) return;
      if (m.data.kind === 'answer') await peer.pc.setRemoteDescription({ type: 'answer', sdp: m.data.sdp }).catch(() => undefined);
      else if (m.data.kind === 'ice') await peer.pc.addIceCandidate(m.data.candidate).catch(() => undefined);
    } else if (m.t === 'left') {
      this.dropGuest(m.id);
    }
  }

  // ───────────────────────── Invite codes (no server) ─────────────────────────

  /** Creates a one-time invite code for one guest. Returns the pending guest id and code. */
  async createInvite(): Promise<{ id: string; code: string }> {
    const id = `invite-${++this.inviteCount}`;
    const peer = this.createPeer(id, `Player (invite ${this.inviteCount})`, 'invite');
    await peer.pc.setLocalDescription(await peer.pc.createOffer());
    await waitForIce(peer.pc);
    const code = await encodeSignal({ kind: 'offer', sdp: peer.pc.localDescription!.sdp, name: this.opts.hostName, title: this.opts.title });
    return { id, code };
  }

  async acceptReply(id: string, code: string) {
    const peer = this.guests.get(id);
    if (!peer) throw new Error('That invite is no longer open. Create a new one.');
    const s = await decodeSignal(code);
    if (s.kind !== 'answer') throw new Error('Paste the reply code from your friend, not an invite code.');
    if (s.name) peer.info.name = s.name.slice(0, 24);
    await peer.pc.setRemoteDescription({ type: 'answer', sdp: s.sdp });
    this.opts.onChange();
  }

  // ───────────────────────── Peers ─────────────────────────

  private createPeer(id: string, name: string, via: GuestInfo['via']): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.opts.iceServers });
    const peer: Peer = { info: { id, name: name.slice(0, 24), state: 'connecting', port: null, rttMs: null, via }, pc, lastSeq: -1 };
    this.guests.set(id, peer);

    for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);
    peer.ctrl = pc.createDataChannel('ctrl', { ordered: true });
    peer.input = pc.createDataChannel('input', { ordered: false, maxRetransmits: 0 });
    peer.input.binaryType = 'arraybuffer';

    peer.input.onmessage = (e) => {
      const pkt = decodeInput(e.data as ArrayBuffer);
      if (!pkt || (peer.lastSeq >= 0 && !seqNewer(pkt.seq, peer.lastSeq))) return;
      peer.lastSeq = pkt.seq;
      this.session.input.setRemote(id, pkt.pad, pkt.keys);
    };
    peer.ctrl.onopen = () => {
      peer.info.state = 'connected';
      this.autoAssign(peer);
      this.sendCtrl(peer, { t: 'welcome', host: this.opts.hostName, title: this.opts.title, port: peer.info.port });
      peer.pingTimer = window.setInterval(() => this.sendCtrl(peer, { t: 'ping', ts: performance.now() }), 1000);
      this.opts.onEvent?.(`${peer.info.name} joined${peer.info.port !== null ? ` as player ${peer.info.port + 1}` : ''}`);
      this.opts.onChange();
      void this.tuneSenders(pc);
    };
    peer.ctrl.onmessage = (e) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.t === 'pong') {
        peer.info.rttMs = Math.round(performance.now() - Number(msg.ts));
        this.opts.onChange();
      } else if (msg.t === 'hello' && typeof msg.name === 'string') {
        peer.info.name = msg.name.slice(0, 24);
        this.opts.onChange();
      } else if (msg.t === 'chat' && typeof msg.text === 'string') {
        const text = msg.text.slice(0, 200);
        this.opts.onChat?.(peer.info.name, text);
        this.broadcast({ t: 'chat', from: peer.info.name, text }, peer.info.id);
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.dropGuest(id);
    };
    this.opts.onChange();
    return peer;
  }

  private async tuneSenders(pc: RTCPeerConnection) {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue;
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = this.opts.bitrateKbps * 1000;
      params.encodings[0].maxFramerate = 60;
      (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = 'maintain-framerate';
      await sender.setParameters(params).catch(() => undefined);
    }
  }

  private sendCtrl(peer: Peer, msg: object) {
    if (peer.ctrl?.readyState === 'open') peer.ctrl.send(JSON.stringify(msg));
  }

  private broadcast(msg: object, except?: string) {
    for (const p of this.guests.values()) if (p.info.id !== except) this.sendCtrl(p, msg);
  }

  chat(text: string) {
    this.broadcast({ t: 'chat', from: this.opts.hostName, text: text.slice(0, 200) });
  }

  /** Free ports for guests: 2–4 first, never the host's own port 1 unless asked. */
  private autoAssign(peer: Peer) {
    const used = new Set([...this.guests.values()].map((g) => g.info.port).filter((p) => p !== null));
    for (let port = 1; port < 4; port++) {
      if (!used.has(port)) {
        this.assignPort(peer.info.id, port);
        return;
      }
    }
  }

  assignPort(id: string, port: number | null) {
    const peer = this.guests.get(id);
    if (!peer) return;
    if (port !== null) {
      for (const other of this.guests.values()) if (other !== peer && other.info.port === port) this.assignPort(other.info.id, null);
    }
    const ports = this.session.input.ports.map((p) => ({ ...p }));
    if (peer.info.port !== null) {
      ports[peer.info.port] = this.savedPorts[peer.info.port] ?? { device: DEVICE.JOYPAD, source: 'none' };
      this.savedPorts[peer.info.port] = null;
    }
    if (port !== null) {
      this.savedPorts[port] = ports[port];
      const device = ports[port].device === DEVICE.NONE ? DEVICE.JOYPAD : ports[port].device;
      ports[port] = { device, source: `remote-${id}` };
    }
    peer.info.port = port;
    this.session.applyPorts(ports);
    this.sendCtrl(peer, { t: 'assigned', port });
    this.opts.onChange();
  }

  kick(id: string) {
    this.signal?.send({ t: 'kick', id });
    this.dropGuest(id);
  }

  private dropGuest(id: string) {
    const peer = this.guests.get(id);
    if (!peer) return;
    if (peer.info.port !== null) this.assignPort(id, null);
    clearInterval(peer.pingTimer);
    peer.pc.close();
    this.session.input.removeRemote(id);
    this.guests.delete(id);
    if (peer.info.state === 'connected') this.opts.onEvent?.(`${peer.info.name} left`);
    this.opts.onChange();
  }

  setPaused(paused: boolean) {
    this.broadcast({ t: 'paused', paused });
  }

  close() {
    this.closed = true;
    this.broadcast({ t: 'bye' });
    for (const id of [...this.guests.keys()]) this.dropGuest(id);
    this.signal?.close();
    this.signal = null;
    this.room = null;
    this.session.presentHooks.delete(this.presentHook);
    this.videoTrack.stop();
  }
}

/** Resolves once ICE gathering is complete (or after a timeout, with what we have). */
export function waitForIce(pc: RTCPeerConnection, timeoutMs = 4000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => pc.iceGatheringState === 'complete' && done();
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener('icegatheringstatechange', check);
  });
}
