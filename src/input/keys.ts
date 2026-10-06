// KeyboardEvent.code → libretro RETROK_* keycodes (for the Dreamcast keyboard device),
// plus human-readable names for binding UIs.

const RETROK: Record<string, number> = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Pause: 19,
  Escape: 27,
  Space: 32,
  Quote: 39,
  Comma: 44,
  Minus: 45,
  Period: 46,
  Slash: 47,
  Semicolon: 59,
  Equal: 61,
  BracketLeft: 91,
  Backslash: 92,
  BracketRight: 93,
  Backquote: 96,
  Delete: 127,
  Numpad0: 256,
  Numpad1: 257,
  Numpad2: 258,
  Numpad3: 259,
  Numpad4: 260,
  Numpad5: 261,
  Numpad6: 262,
  Numpad7: 263,
  Numpad8: 264,
  Numpad9: 265,
  NumpadDecimal: 266,
  NumpadDivide: 267,
  NumpadMultiply: 268,
  NumpadSubtract: 269,
  NumpadAdd: 270,
  NumpadEnter: 271,
  NumpadEqual: 272,
  ArrowUp: 273,
  ArrowDown: 274,
  ArrowRight: 275,
  ArrowLeft: 276,
  Insert: 277,
  Home: 278,
  End: 279,
  PageUp: 280,
  PageDown: 281,
  NumLock: 300,
  CapsLock: 301,
  ScrollLock: 302,
  ShiftRight: 303,
  ShiftLeft: 304,
  ControlRight: 305,
  ControlLeft: 306,
  AltRight: 307,
  AltLeft: 308,
  MetaRight: 309,
  MetaLeft: 310,
  ContextMenu: 319,
  PrintScreen: 316,
  IntlBackslash: 323,
};

for (let i = 0; i < 10; i++) RETROK[`Digit${i}`] = 48 + i;
for (let i = 0; i < 26; i++) RETROK[`Key${String.fromCharCode(65 + i)}`] = 97 + i;
for (let i = 1; i <= 15; i++) RETROK[`F${i}`] = 281 + i;

export function retroKeyFromCode(code: string): number {
  return RETROK[code] ?? 0;
}

export const RETROKMOD = { SHIFT: 1, CTRL: 2, ALT: 4, META: 8, NUMLOCK: 16, CAPSLOCK: 32, SCROLLLOCK: 64 };

export function retroModifiers(e: KeyboardEvent): number {
  let m = 0;
  if (e.shiftKey) m |= RETROKMOD.SHIFT;
  if (e.ctrlKey) m |= RETROKMOD.CTRL;
  if (e.altKey) m |= RETROKMOD.ALT;
  if (e.metaKey) m |= RETROKMOD.META;
  if (e.getModifierState?.('NumLock')) m |= RETROKMOD.NUMLOCK;
  if (e.getModifierState?.('CapsLock')) m |= RETROKMOD.CAPSLOCK;
  return m;
}

export function keyLabel(code: string | undefined): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const names: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Space',
    Enter: 'Enter',
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt',
    AltRight: 'R-Alt',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
  };
  return names[code] ?? code;
}
