// Browser side of the room-code signaling server.

export type SignalMessage =
  | { t: 'room'; room: string; id: string }
  | { t: 'joined'; room: string; id: string }
  | { t: 'peer'; id: string; name: string }
  | { t: 'left'; id: string }
  | { t: 'signal'; from: string; data: RelayData }
  | { t: 'closed'; reason: string }
  | { t: 'error'; message: string };

export type RelayData =
  | { kind: 'offer' | 'answer'; sdp: string; name?: string; title?: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

export function defaultSignalUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${import.meta.env.BASE_URL}signal`;
}

export class SignalClient {
  private ws: WebSocket;
  onMessage?: (m: SignalMessage) => void;
  onClose?: () => void;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (e) => {
      try {
        this.onMessage?.(JSON.parse(String(e.data)));
      } catch {
        // ignore malformed messages
      }
    };
    ws.onclose = () => this.onClose?.();
  }

  static connect(url: string, timeoutMs = 4000): Promise<SignalClient> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        reject(new Error('Invalid signaling server address.'));
        return;
      }
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('No signaling server answered. Use invite codes instead, or set a server in Netplay settings.'));
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve(new SignalClient(ws));
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('No signaling server answered. Use invite codes instead, or set a server in Netplay settings.'));
      };
    });
  }

  send(msg: object) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.ws.onclose = null;
    this.ws.close();
  }
}
