// Netplay wire formats: a compact binary input packet sent ~60 times a second, and
// shareable invite/reply codes for serverless (copy & paste) connections.

import { emptyPad, type PadState } from '../input/manager';

export interface InputPacket {
  seq: number;
  pad: PadState;
  /** Held keys as libretro RETROK codes (for the Dreamcast keyboard). */
  keys: number[];
}

export function encodeInput(p: InputPacket): ArrayBuffer {
  const keys = p.keys.slice(0, 16);
  const buf = new ArrayBuffer(2 + 2 + 8 + 4 + 1 + keys.length * 2);
  const v = new DataView(buf);
  v.setUint16(0, p.seq & 0xffff, true);
  v.setUint16(2, p.pad.buttons & 0xffff, true);
  p.pad.axes.forEach((a, i) => v.setInt16(4 + i * 2, a, true));
  v.setUint16(12, p.pad.triggers[0], true);
  v.setUint16(14, p.pad.triggers[1], true);
  v.setUint8(16, keys.length);
  keys.forEach((k, i) => v.setUint16(17 + i * 2, k, true));
  return buf;
}

export function decodeInput(buf: ArrayBuffer): InputPacket | null {
  if (buf.byteLength < 17) return null;
  const v = new DataView(buf);
  const pad = emptyPad();
  pad.buttons = v.getUint16(2, true);
  for (let i = 0; i < 4; i++) pad.axes[i] = v.getInt16(4 + i * 2, true);
  pad.triggers = [Math.min(32767, v.getUint16(12, true)), Math.min(32767, v.getUint16(14, true))];
  const n = Math.min(v.getUint8(16), 16, Math.floor((buf.byteLength - 17) / 2));
  const keys: number[] = [];
  for (let i = 0; i < n; i++) keys.push(v.getUint16(17 + i * 2, true));
  return { seq: v.getUint16(0, true), pad, keys };
}

/** Is `seq` newer than `last`, allowing for 16-bit wraparound? */
export function seqNewer(seq: number, last: number): boolean {
  const d = (seq - last) & 0xffff;
  return d !== 0 && d < 0x8000;
}

// ───────────────────────── Invite codes ─────────────────────────

const PREFIX = 'DP1.';

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export interface SignalBlob {
  kind: 'offer' | 'answer';
  sdp: string;
  name?: string;
  title?: string;
}

export async function encodeSignal(s: SignalBlob): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(s));
  return PREFIX + toBase64Url(await pipe(raw, new CompressionStream('deflate-raw')));
}

export async function decodeSignal(code: string): Promise<SignalBlob> {
  const trimmed = code.trim().replace(/\s+/g, '');
  if (!trimmed.startsWith(PREFIX)) throw new Error('That does not look like a Dreamport code. Copy the whole code, starting with "DP1."');
  try {
    const json = new TextDecoder().decode(await pipe(fromBase64Url(trimmed.slice(PREFIX.length)), new DecompressionStream('deflate-raw')));
    const s = JSON.parse(json) as SignalBlob;
    if ((s.kind !== 'offer' && s.kind !== 'answer') || typeof s.sdp !== 'string') throw new Error();
    return s;
  } catch {
    throw new Error('That code is incomplete or damaged. Ask for it to be copied again.');
  }
}

export function parseIceServers(text: string): RTCIceServer[] {
  // One server per line: "stun:host:port" or "turn:host:port user pass".
  return text
    .split(/\n|,/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [urls, username, credential] = l.split(/\s+/);
      return username ? { urls, username, credential } : { urls };
    });
}
