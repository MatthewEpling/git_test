// RetroAchievements trigger logic ("MemAddr" strings): parser and per-frame evaluator.
// Follows the rcheevos condition semantics: memory sizes, delta/prior/BCD/invert, hit
// counts, ResetIf/PauseIf, AddSource/SubSource/AddHits/SubHits, AndNext/OrNext,
// AddAddress, ResetNextIf, Remember/Recall, Measured/MeasuredIf, and alt groups.

export type MemSize =
  | 'bit0' | 'bit1' | 'bit2' | 'bit3' | 'bit4' | 'bit5' | 'bit6' | 'bit7'
  | 'low4' | 'high4' | '8' | '16' | '24' | '32' | 'bitcount' | '16be' | '24be' | '32be'
  | 'float' | 'floatbe' | 'double32' | 'double32be' | 'mbf32' | 'mbf32le';

export type OperandType = 'mem' | 'delta' | 'prior' | 'bcd' | 'invert' | 'const' | 'recall';

export interface Operand {
  type: OperandType;
  size?: MemSize;
  address?: number;
  value?: number;
}

export type Flag =
  | '' | 'ResetIf' | 'PauseIf' | 'AddSource' | 'SubSource' | 'AddHits' | 'SubHits' | 'AndNext' | 'OrNext'
  | 'Measured' | 'MeasuredPercent' | 'MeasuredIf' | 'Trigger' | 'ResetNextIf' | 'AddAddress' | 'Remember';

export interface Condition {
  flag: Flag;
  left: Operand;
  op: string;
  right: Operand | null;
  requiredHits: number;
  hits: number;
}

export interface Group {
  conditions: Condition[];
}

export interface Trigger {
  core: Group;
  alts: Group[];
}

const FLAGS: Record<string, Flag> = {
  R: 'ResetIf', P: 'PauseIf', A: 'AddSource', B: 'SubSource', C: 'AddHits', D: 'SubHits', N: 'AndNext', O: 'OrNext',
  M: 'Measured', G: 'MeasuredPercent', Q: 'MeasuredIf', T: 'Trigger', Z: 'ResetNextIf', I: 'AddAddress', K: 'Remember',
};

const SIZES: Record<string, MemSize> = {
  M: 'bit0', N: 'bit1', O: 'bit2', P: 'bit3', Q: 'bit4', R: 'bit5', S: 'bit6', T: 'bit7', L: 'low4', U: 'high4',
  H: '8', W: '24', X: '32', K: 'bitcount', I: '16be', J: '24be', G: '32be',
};
const FLOAT_SIZES: Record<string, MemSize> = { F: 'float', B: 'floatbe', H: 'double32', I: 'double32be', M: 'mbf32', L: 'mbf32le' };

const MODIFIER_FLAGS = new Set<Flag>(['AddSource', 'SubSource', 'AddHits', 'SubHits', 'AndNext', 'OrNext', 'ResetNextIf', 'AddAddress', 'Remember']);
const COMPARISONS = ['!=', '<=', '>=', '==', '=', '<', '>'];
const ARITHMETIC = ['*', '/', '&', '^', '%', '+', '-'];

export class ParseError extends Error {}

class Parser {
  i = 0;
  constructor(readonly s: string) {}
  peek(n = 0) {
    return this.s[this.i + n] ?? '';
  }
  eat(str: string) {
    if (this.s.startsWith(str, this.i)) {
      this.i += str.length;
      return true;
    }
    return false;
  }
  hex(): number {
    const m = /^[0-9a-fA-F]+/.exec(this.s.slice(this.i));
    if (!m) throw new ParseError(`Expected hex digits at ${this.i} in "${this.s}"`);
    this.i += m[0].length;
    return parseInt(m[0], 16);
  }
  operand(): Operand {
    if (this.eat('{recall}')) return { type: 'recall' };
    let type: OperandType = 'mem';
    const c = this.peek();
    const prefix: Record<string, OperandType> = { d: 'delta', D: 'delta', p: 'prior', P: 'prior', b: 'bcd', B: 'bcd', '~': 'invert' };
    if (prefix[c] && (this.peek(1) === '0' || this.peek(1) === 'f' || this.peek(1) === 'F')) {
      type = prefix[c];
      this.i++;
    }
    if (this.peek() === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
      this.i += 2;
      let sc = this.peek();
      if (sc === ' ') {
        this.i++;
        sc = this.peek();
      }
      let size: MemSize = '16';
      const upper = sc.toUpperCase();
      if (SIZES[upper] && !/[0-9a-fA-F]/.test(sc)) {
        size = SIZES[upper];
        this.i++;
      } else if (upper === 'H' || upper === 'G') {
        size = SIZES[upper];
        this.i++;
      }
      return { type, size, address: this.hex() };
    }
    if ((this.peek() === 'f' || this.peek() === 'F') && FLOAT_SIZES[this.peek(1).toUpperCase()] && /[0-9a-fA-F]/.test(this.peek(2))) {
      const size = FLOAT_SIZES[this.peek(1).toUpperCase()];
      this.i += 2;
      return { type, size, address: this.hex() };
    }
    if (type !== 'mem') throw new ParseError(`Expected memory reference at ${this.i} in "${this.s}"`);
    if (this.peek() === 'h' || this.peek() === 'H') {
      this.i++;
      return { type: 'const', value: this.hex() };
    }
    // Only "f"-prefixed constants may have a fraction; "1.2." is value 1 with 2 hits.
    const isFloat = this.peek() === 'f' || this.peek() === 'F';
    if (isFloat || this.peek() === 'v' || this.peek() === 'V') this.i++;
    const m = (isFloat ? /^-?\d+(\.\d+)?/ : /^-?\d+/).exec(this.s.slice(this.i));
    if (!m) throw new ParseError(`Expected a value at ${this.i} in "${this.s}"`);
    this.i += m[0].length;
    return { type: 'const', value: Number(m[0]) };
  }
  condition(): Condition {
    let flag: Flag = '';
    if (this.peek(1) === ':' && FLAGS[this.peek().toUpperCase()]) {
      flag = FLAGS[this.peek().toUpperCase()];
      this.i += 2;
    }
    const left = this.operand();
    let op = '';
    let right: Operand | null = null;
    for (const o of [...COMPARISONS, ...ARITHMETIC]) {
      if (this.eat(o)) {
        op = o === '==' ? '=' : o;
        right = this.operand();
        break;
      }
    }
    let requiredHits = 0;
    if (this.peek() === '.') {
      const m = /^\.(\d+)\./.exec(this.s.slice(this.i));
      if (!m) throw new ParseError(`Bad hit count at ${this.i} in "${this.s}"`);
      requiredHits = Number(m[1]);
      this.i += m[0].length;
    } else if (this.peek() === '(') {
      const m = /^\((\d+)\)/.exec(this.s.slice(this.i));
      if (!m) throw new ParseError(`Bad hit count at ${this.i} in "${this.s}"`);
      requiredHits = Number(m[1]);
      this.i += m[0].length;
    }
    return { flag, left, op, right, requiredHits, hits: 0 };
  }
}

export function parseTrigger(s: string): Trigger {
  const p = new Parser(s.trim());
  const groups: Group[] = [{ conditions: [] }];
  if (!p.s) return { core: groups[0], alts: [] };
  for (;;) {
    // An alt group may be empty when the core group is empty ("S0xH1=1").
    if (p.peek() === 'S' && groups.at(-1)!.conditions.length === 0 && groups.length === 1) {
      p.i++;
      groups.push({ conditions: [] });
      continue;
    }
    groups.at(-1)!.conditions.push(p.condition());
    const c = p.peek();
    if (c === '') break;
    p.i++;
    if (c === '_') continue;
    if (c === 'S' || c === 's') {
      groups.push({ conditions: [] });
      continue;
    }
    throw new ParseError(`Unexpected "${c}" at ${p.i - 1} in "${s}"`);
  }
  return { core: groups[0], alts: groups.slice(1) };
}

// ───────────────────────── Memory ─────────────────────────

export interface Memory {
  bytes: Uint8Array;
}

function readRaw(bytes: Uint8Array, address: number, size: MemSize): number {
  const b = (o: number) => bytes[address + o] ?? 0;
  if (address < 0 || address >= bytes.length) return 0;
  switch (size) {
    case 'bit0': case 'bit1': case 'bit2': case 'bit3': case 'bit4': case 'bit5': case 'bit6': case 'bit7':
      return (b(0) >> Number(size.slice(3))) & 1;
    case 'low4':
      return b(0) & 0xf;
    case 'high4':
      return b(0) >> 4;
    case '8':
      return b(0);
    case '16':
      return b(0) | (b(1) << 8);
    case '24':
      return b(0) | (b(1) << 8) | (b(2) << 16);
    case '32':
      return (b(0) | (b(1) << 8) | (b(2) << 16) | (b(3) << 24)) >>> 0;
    case '16be':
      return (b(0) << 8) | b(1);
    case '24be':
      return (b(0) << 16) | (b(1) << 8) | b(2);
    case '32be':
      return ((b(0) << 24) | (b(1) << 16) | (b(2) << 8) | b(3)) >>> 0;
    case 'bitcount': {
      let v = b(0);
      let n = 0;
      while (v) {
        n += v & 1;
        v >>= 1;
      }
      return n;
    }
    case 'float':
    case 'floatbe': {
      const dv = new DataView(new Uint8Array([b(0), b(1), b(2), b(3)]).buffer);
      return dv.getFloat32(0, size === 'float');
    }
    case 'double32':
    case 'double32be': {
      // The upper 32 bits of a double, reinterpreted with the low half zeroed.
      const le = size === 'double32';
      const dv = new DataView(new ArrayBuffer(8));
      const hi = le ? [b(3), b(2), b(1), b(0)] : [b(0), b(1), b(2), b(3)];
      hi.forEach((v, i) => dv.setUint8(i, v));
      return dv.getFloat64(0, false);
    }
    case 'mbf32':
    case 'mbf32le': {
      const bytesBe = size === 'mbf32' ? [b(0), b(1), b(2), b(3)] : [b(3), b(2), b(1), b(0)];
      const exp = bytesBe[0];
      if (!exp) return 0;
      const sign = bytesBe[1] & 0x80 ? -1 : 1;
      const mant = ((bytesBe[1] | 0x80) << 16) | (bytesBe[2] << 8) | bytesBe[3];
      return sign * mant * 2 ** (exp - 128 - 24);
    }
  }
}

const SIZE_MASK: Partial<Record<MemSize, number>> = {
  bit0: 1, bit1: 1, bit2: 1, bit3: 1, bit4: 1, bit5: 1, bit6: 1, bit7: 1, low4: 0xf, high4: 0xf,
  '8': 0xff, '16': 0xffff, '24': 0xffffff, '32': 0xffffffff, '16be': 0xffff, '24be': 0xffffff, '32be': 0xffffffff,
};

function fromBcd(v: number): number {
  let out = 0;
  let mul = 1;
  while (v > 0) {
    out += (v & 0xf) * mul;
    mul *= 10;
    v = Math.floor(v / 16);
  }
  return out;
}

interface MemRefState {
  value: number;
  delta: number;
  prior: number;
  seen: number;
}

/** Tracks current/previous/prior values for every memory reference across frames. */
export class MemoryTracker {
  private refs = new Map<string, MemRefState & { size: MemSize; address: number }>();
  frame = 0;
  constructor(public bytes: Uint8Array) {}

  /** Call once per frame before evaluating triggers. */
  advance(bytes = this.bytes) {
    this.bytes = bytes;
    this.frame++;
    for (const r of this.refs.values()) {
      const v = readRaw(bytes, r.address, r.size);
      r.delta = r.value;
      if (v !== r.value) r.prior = r.value;
      r.value = v;
    }
  }

  get(size: MemSize, address: number): MemRefState {
    const key = `${size}:${address}`;
    let r = this.refs.get(key);
    if (!r) {
      const v = readRaw(this.bytes, address, size);
      r = { size, address, value: v, delta: v, prior: v, seen: this.frame };
      this.refs.set(key, r);
    }
    return r;
  }
}

// ───────────────────────── Evaluation ─────────────────────────

interface EvalCtx {
  mem: MemoryTracker;
  recall: number;
}

function operandValue(o: Operand, addAddress: number, ctx: EvalCtx): number {
  switch (o.type) {
    case 'const':
      return o.value!;
    case 'recall':
      return ctx.recall;
    default: {
      const r = ctx.mem.get(o.size!, (o.address! + addAddress) >>> 0);
      if (o.type === 'delta') return r.delta;
      if (o.type === 'prior') return r.prior;
      if (o.type === 'bcd') return fromBcd(r.value);
      if (o.type === 'invert') return ~r.value & (SIZE_MASK[o.size!] ?? 0xffffffff) >>> 0;
      return r.value;
    }
  }
}

function arithmetic(a: number, op: string, b: number): number {
  switch (op) {
    case '*':
      return a * b;
    case '/':
      return b === 0 ? 0 : Number.isInteger(a) && Number.isInteger(b) ? Math.floor(a / b) : a / b;
    case '&':
      return (a & b) >>> 0;
    case '^':
      return (a ^ b) >>> 0;
    case '%':
      return b === 0 ? 0 : a % b;
    case '+':
      return a + b;
    case '-':
      return a - b;
    default:
      return a;
  }
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case '=':
      return a === b;
    case '!=':
      return a !== b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    default:
      return a !== 0;
  }
}

export interface GroupResult {
  valid: boolean;
  paused: boolean;
  reset: boolean;
  measured?: { value: number; target: number };
}

/** Splits a group into chains: runs of modifier conditions ending in a normal one. */
function chains(group: Group): Condition[][] {
  const out: Condition[][] = [];
  let cur: Condition[] = [];
  for (const c of group.conditions) {
    cur.push(c);
    if (!MODIFIER_FLAGS.has(c.flag)) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

function evalChain(chain: Condition[], ctx: EvalCtx, result: GroupResult): boolean {
  let addValue = 0;
  let addHits = 0;
  let addAddress = 0;
  let andNext: boolean | null = null;
  let orNext: boolean | null = null;
  let resetNext = false;
  let valid = true;
  for (const c of chain) {
    let left = operandValue(c.left, addAddress, ctx);
    if (c.right && ARITHMETIC.includes(c.op)) left = arithmetic(left, c.op, operandValue(c.right, addAddress, ctx));

    if (c.flag === 'AddSource') {
      addValue += left;
      addAddress = 0;
      continue;
    }
    if (c.flag === 'SubSource') {
      addValue -= left;
      addAddress = 0;
      continue;
    }
    if (c.flag === 'AddAddress') {
      addAddress = left >>> 0;
      continue;
    }
    if (c.flag === 'Remember') {
      ctx.recall = addValue + left;
      addValue = 0;
      addAddress = 0;
      continue;
    }

    const lhs = addValue + left;
    const rhs = c.right && !ARITHMETIC.includes(c.op) ? operandValue(c.right, addAddress, ctx) : 0;
    let cond = c.right && !ARITHMETIC.includes(c.op) ? compare(lhs, c.op, rhs) : lhs !== 0;
    const measuredRaw = lhs;
    addValue = 0;
    addAddress = 0;

    if (andNext !== null) cond = cond && andNext;
    if (orNext !== null) cond = cond || orNext;
    andNext = null;
    orNext = null;

    if (resetNext) {
      c.hits = 0;
      resetNext = false;
    }
    if (cond && (c.requiredHits === 0 || c.hits < c.requiredHits)) c.hits++;
    const totalHits = c.hits + addHits;
    let effective: boolean = cond;
    if (c.requiredHits > 0) effective = totalHits >= c.requiredHits;
    else if (addHits !== 0) effective = cond || totalHits > 0;

    switch (c.flag) {
      case 'AndNext':
        andNext = effective;
        continue;
      case 'OrNext':
        orNext = effective;
        continue;
      case 'AddHits':
        addHits += c.hits;
        continue;
      case 'SubHits':
        addHits -= c.hits;
        continue;
      case 'ResetNextIf':
        resetNext = effective;
        continue;
      case 'PauseIf':
        if (effective) result.paused = true;
        break;
      case 'ResetIf':
        if (effective) {
          result.reset = true;
          valid = false;
        }
        break;
      case 'Measured':
      case 'MeasuredPercent':
        result.measured = c.requiredHits
          ? { value: Math.min(totalHits, c.requiredHits), target: c.requiredHits }
          : { value: Math.max(0, Math.min(measuredRaw, rhs)), target: rhs };
        if (!effective) valid = false;
        break;
      case 'MeasuredIf':
        if (!effective) {
          valid = false;
          if (result.measured) result.measured.value = 0;
        }
        break;
      default:
        if (!effective) valid = false;
    }
    addHits = 0;
  }
  return valid;
}

export function evaluateGroup(group: Group, ctx: EvalCtx): GroupResult {
  const result: GroupResult = { valid: true, paused: false, reset: false };
  const all = chains(group);
  const pauseChains = all.filter((ch) => ch.at(-1)!.flag === 'PauseIf');
  for (const ch of pauseChains) evalChain(ch, ctx, result);
  if (result.paused) return { ...result, valid: false };
  for (const ch of all) {
    if (ch.at(-1)!.flag === 'PauseIf') continue;
    if (!evalChain(ch, ctx, result)) result.valid = false;
  }
  if (result.reset) result.valid = false;
  return result;
}

export function resetHits(t: Trigger) {
  for (const g of [t.core, ...t.alts]) for (const c of g.conditions) c.hits = 0;
}

export interface TriggerResult {
  triggered: boolean;
  measured?: { value: number; target: number };
}

/** Evaluates a trigger for this frame (updates hit counts). */
export function evaluateTrigger(t: Trigger, mem: MemoryTracker): TriggerResult {
  const ctx: EvalCtx = { mem, recall: 0 };
  const core = evaluateGroup(t.core, ctx);
  const alts = t.alts.map((g) => evaluateGroup(g, ctx));
  if (core.reset || alts.some((a) => a.reset)) {
    resetHits(t);
    return { triggered: false, measured: core.measured ?? alts.find((a) => a.measured)?.measured };
  }
  const altOk = t.alts.length === 0 || alts.some((a) => a.valid);
  return { triggered: core.valid && altOk, measured: core.measured ?? alts.find((a) => a.measured)?.measured };
}

export type AchievementState = 'waiting' | 'active' | 'triggered' | 'disabled';

/** One achievement's runtime: an achievement must evaluate false once before it can unlock. */
export class TriggerRuntime {
  state: AchievementState = 'waiting';
  measured?: { value: number; target: number };
  readonly trigger: Trigger;
  constructor(memAddr: string) {
    this.trigger = parseTrigger(memAddr);
  }

  /** Returns true on the frame the achievement unlocks. */
  step(mem: MemoryTracker): boolean {
    if (this.state === 'triggered' || this.state === 'disabled') return false;
    const r = evaluateTrigger(this.trigger, mem);
    this.measured = r.measured;
    if (this.state === 'waiting') {
      if (!r.triggered) this.state = 'active';
      else resetHits(this.trigger);
      return false;
    }
    if (r.triggered) {
      this.state = 'triggered';
      return true;
    }
    return false;
  }
}
