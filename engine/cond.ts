// Conditions: what `needs`, `access` and `recovery` hold. Ids, `unknown`,
// `and`, `or` and brackets, nested to any depth. `and` and `or` never share a
// level unbracketed, so nobody has to remember which binds tighter.

/** A fact about the setup you don't know: assumed, never known. */
export const UNKNOWN = 'unknown';
/** The words of a condition, which no thing can have as its id. */
export const RESERVED: readonly string[] = ['and', 'or', UNKNOWN];

export type Op = 'and' | 'or';
/** An id, `unknown`, or every (`and`) or any one (`or`) of its parts. Brackets as written are kept. */
export type Cond = string | { op: Op; of: Cond[] };

/** A word of a condition, and where it is in the text. */
export interface Word {
  text: string;
  from: number;
  to: number;
}

/** A condition that doesn't parse, with where in its text. */
export class CondError extends Error {
  readonly from: number;
  readonly to: number;

  constructor(message: string, from: number, to: number) {
    super(message);
    this.from = from;
    this.to = to;
  }
}

const tokens = (s: string): Word[] =>
  [...s.matchAll(/[()]|[^\s()]+/g)].map((m) => ({ text: m[0], from: m.index, to: m.index + m[0].length }));

/** The ids and `unknown`s in a condition's text, where they are; brackets and operators left out. */
export const words = (s: string): Word[] =>
  tokens(s).filter((t) => t.text !== '(' && t.text !== ')' && t.text !== 'and' && t.text !== 'or');

const isOp = (w: string): w is Op => w === 'and' || w === 'or';

export function parseCond(s: string): Cond {
  const ts = tokens(s);
  let i = 0;
  const end = { text: '', from: s.length, to: s.length };
  const fail = (message: string, t: Word = ts[i] ?? end) => new CondError(message, t.from, t.to);
  if (!ts.length) throw fail('empty: name what it takes, or leave the field out');

  interface Part {
    c: Cond;
    from: number;
    to: number;
  }
  const slice = (a: Part, b: Part) => s.slice(a.from, b.to);

  const term = (): Part => {
    if (i === ts.length) throw fail(`expected a name after ${ts[i - 1].text}`, ts[i - 1]);
    const t = ts[i];
    if (t.text === ')' || isOp(t.text)) throw fail(`expected a name before ${t.text}`);
    if (t.text.includes('?')) throw fail('write unknown, not ?');
    i++;
    if (t.text !== '(') return { c: t.text, from: t.from, to: t.to };
    const inner = level();
    if (ts[i]?.text !== ')') throw fail('this ( is never closed', t);
    return { c: inner.c, from: t.from, to: ts[i++].to };
  };

  // A run of parts joined by one operator, up to a ) or the end.
  const level = (): Part => {
    const parts = [term()];
    let op: Op | null = null;
    while (i < ts.length && ts[i].text !== ')') {
      const t = ts[i];
      if (!isOp(t.text)) throw fail(`expected and or or before ${t.text}`);
      if (op && t.text !== op) {
        i++;
        const next = term();
        const [first, last] = [parts[0], parts[parts.length - 1]];
        const before = parts.length > 1 ? `${slice(first, parts[parts.length - 2])} ${op} ` : '';
        throw fail(
          `mixes ${op} with ${t.text}: bracket what goes together, as in ` +
            `(${slice(first, last)}) ${t.text} ${slice(next, next)}, or ` +
            `${before}(${slice(last, last)} ${t.text} ${slice(next, next)})`,
          t,
        );
      }
      op = t.text;
      i++;
      parts.push(term());
    }
    if (!op) return parts[0];
    return { c: { op, of: parts.map((p) => p.c) }, from: parts[0].from, to: parts[parts.length - 1].to };
  };

  const top = level();
  if (i < ts.length) throw fail('this ) has no ( before it');
  return top.c;
}

/** A condition as text: one space around each operator, and brackets around every group inside another. */
export function fmtCond(c: Cond): string {
  return typeof c === 'string' ? c : c.of.map((x) => (typeof x === 'string' ? x : `(${fmtCond(x)})`)).join(` ${c.op} `);
}

/** Each id a condition names, in order; `unknown` isn't one. */
export function* refs(c: Cond | null): Generator<string> {
  if (c === null) return;
  if (typeof c !== 'string') for (const x of c.of) yield* refs(x);
  else if (c !== UNKNOWN) yield c;
}

/** The parts of a condition joined by op at its top: its options for `or`, its requirements for `and`. */
export const split = (c: Cond, op: Op): Cond[] => (typeof c !== 'string' && c.op === op ? c.of : [c]);

/** Whether a condition holds, given what each id is. `unknown` never appears where this is used. */
export const holds = (c: Cond, f: (id: string) => boolean): boolean =>
  typeof c === 'string' ? f(c) : c.op === 'and' ? c.of.every((x) => holds(x, f)) : c.of.some((x) => holds(x, f));
