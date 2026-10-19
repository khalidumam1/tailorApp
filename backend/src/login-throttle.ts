/**
 * Per-account login throttling.
 *
 * The IP-based rate limiter alone cannot stop credential stuffing against a
 * single account, and a purely IP-based lockout punishes every staff member
 * behind one shop router. This throttle keys on (email, IP): repeated failed
 * attempts for the same account from the same network trigger an exponentially
 * growing block, while other accounts and other networks are unaffected.
 *
 * Keys are derived from the *submitted* email whether or not the account
 * exists, and failures against non-existent accounts are recorded too, so the
 * block behaviour reveals nothing about which emails are registered.
 *
 * State is in-memory (single API instance). If the API is ever scaled to
 * multiple instances, move this to a shared store — the interface stays.
 */

export interface LoginThrottleOptions {
  /** Failures inside the window that trigger a block. */
  maxFailures?: number;
  /** Sliding window for counting failures. */
  windowMs?: number;
  /** Block length for the first block; doubles per extra failure. */
  baseBlockMs?: number;
  /** Upper bound for a single block. */
  maxBlockMs?: number;
  now?: () => number;
}

interface Entry {
  failures: number[];
  blockedUntil: number;
}

export class LoginThrottle {
  private readonly entries = new Map<string, Entry>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly baseBlockMs: number;
  private readonly maxBlockMs: number;
  private readonly now: () => number;

  constructor(options: LoginThrottleOptions = {}) {
    this.maxFailures = options.maxFailures ?? 5;
    this.windowMs = options.windowMs ?? 15 * 60 * 1000;
    this.baseBlockMs = options.baseBlockMs ?? 60 * 1000;
    this.maxBlockMs = options.maxBlockMs ?? 30 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  static keyFor(email: string, ip: string | undefined): string {
    return `${email.trim().toLowerCase()}|${ip ?? 'unknown'}`;
  }

  /** Milliseconds the caller must wait, or 0 when the attempt may proceed. */
  retryAfterMs(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    const remaining = entry.blockedUntil - this.now();
    if (remaining <= 0) return 0;
    return remaining;
  }

  recordFailure(key: string): void {
    const now = this.now();
    const cutoff = now - this.windowMs;
    const entry = this.entries.get(key) ?? { failures: [], blockedUntil: 0 };
    entry.failures = entry.failures.filter((at) => at > cutoff);
    entry.failures.push(now);
    if (entry.failures.length >= this.maxFailures) {
      const extra = entry.failures.length - this.maxFailures;
      const block = Math.min(this.baseBlockMs * 2 ** extra, this.maxBlockMs);
      entry.blockedUntil = now + block;
    }
    this.entries.set(key, entry);
    this.prune(cutoff);
  }

  recordSuccess(key: string): void {
    this.entries.delete(key);
  }

  private prune(cutoff: number): void {
    // Cheap opportunistic cleanup so the map cannot grow without bound.
    if (this.entries.size < 1024) return;
    for (const [key, entry] of this.entries) {
      if (entry.blockedUntil <= this.now() && entry.failures.every((at) => at <= cutoff)) {
        this.entries.delete(key);
      }
    }
  }
}

export const loginThrottle = new LoginThrottle();
