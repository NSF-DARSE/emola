/**
 * Anonymisation for anything that leaves this machine.
 *
 * Sensitive values are swapped for stable placeholder tokens before a notice
 * is sent to a model, and swapped back locally once the response returns. The
 * model sees the *structure* — that there is a host, that it has an IP — so it
 * can write a specific summary, but never learns the real values.
 *
 * Deliberately regex-driven. Finding IP addresses and host names is exact
 * pattern matching, which is the one job a language model should not be
 * trusted with.
 */

export type SensitiveKind = 'EMAIL' | 'IP' | 'HOST' | 'PHONE';

export interface Mapping {
  /** token -> the real value it stands for. Never leaves the process. */
  values: Record<string, string>;
}

interface Detector {
  kind: SensitiveKind;
  pattern: RegExp;
  /** Human word used in the leak error, matched by the tests. */
  noun: string;
}

/*
 * Order matters. Emails are matched first so an address is taken as a whole
 * rather than being partially eaten by a later pattern.
 */
const DETECTORS: Detector[] = [
  { kind: 'EMAIL', noun: 'email address', pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  {
    kind: 'IP',
    noun: 'IP address',
    pattern:
      /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b/g,
  },
  {
    kind: 'HOST',
    noun: 'host name',
    pattern: /\b[a-z]{2,6}-[a-z]{2,8}-(?:prd|prod|dev|tst|test|qa|stg)-\d{1,3}\b/gi,
  },
  { kind: 'PHONE', noun: 'phone number', pattern: /\b\d{3}-\d{3}-\d{4}\b/g },
];

/** Accumulating state so a whole batch can share one token namespace. */
class Tokeniser {
  readonly values: Record<string, string> = {};
  private readonly seen = new Map<string, string>();
  private readonly counters: Record<string, number> = {};

  apply(text: string): string {
    let out = text;
    for (const d of DETECTORS) {
      out = out.replace(d.pattern, (match) => {
        const cacheKey = `${d.kind}:${match}`;
        const existing = this.seen.get(cacheKey);
        if (existing) return existing;

        this.counters[d.kind] = (this.counters[d.kind] ?? 0) + 1;
        const token = `[${d.kind}_${this.counters[d.kind]}]`;
        this.seen.set(cacheKey, token);
        this.values[token] = match;
        return token;
      });
    }
    return out;
  }
}

/** Replace every sensitive value with a stable token. */
export function anonymize(text: string): { text: string; mapping: Mapping } {
  const t = new Tokeniser();
  const out = t.apply(text);
  return { text: out, mapping: { values: t.values } };
}

/**
 * Anonymise many messages under ONE shared mapping, so the same host appearing
 * in March and in April is [HOST_1] both times. Without this the model cannot
 * tell that two months of notices are about the same machine.
 */
export function anonymizeMany(texts: string[]): { texts: string[]; mapping: Mapping } {
  const t = new Tokeniser();
  const out = texts.map((x) => t.apply(x));
  return { texts: out, mapping: { values: t.values } };
}

/**
 * Swap tokens back for their real values. Tokens we have no mapping for are
 * left exactly as they are — if a model invents `[HOST_9]`, we surface the
 * token rather than guessing at a value.
 */
export function restore(text: string, mapping: Mapping): string {
  let out = text;
  for (const [token, value] of Object.entries(mapping.values)) {
    out = out.split(token).join(value);
  }
  return out;
}

export class SensitiveDataLeak extends Error {}

/**
 * The seatbelt. Called immediately before anything crosses the network: if a
 * detector still fires on the outbound payload, one of the patterns above is
 * wrong and the request must not happen.
 */
export function assertNoSensitiveData(text: string): void {
  for (const d of DETECTORS) {
    d.pattern.lastIndex = 0;
    const hit = d.pattern.exec(text);
    if (hit) {
      throw new SensitiveDataLeak(
        `Refusing to send: found a ${d.noun} ("${hit[0]}") in text that should be anonymised.`,
      );
    }
  }
}
