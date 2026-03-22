// ──────────────────────────────────────────────────────────────
// Client-side Rate Limiter  (Token-bucket per operation key)
// Prevents brute-force auth and API abuse from the browser.
// Server-side: Supabase has built-in auth rate limiting.
// ──────────────────────────────────────────────────────────────

class TokenBucket {
  /**
   * @param {number} maxTokens   — max requests allowed in window
   * @param {number} windowMs    — rolling window in ms
   */
  constructor(maxTokens, windowMs) {
    this.maxTokens = maxTokens;
    this.windowMs  = windowMs;
    this.log       = {}; // key → [timestamp, ...]
  }

  /**
   * Returns true if the request is allowed, false if rate-limited.
   * @param {string} key — e.g. 'auth', 'fetch', 'insert'
   */
  allow(key) {
    const now = Date.now();
    if (!this.log[key]) this.log[key] = [];
    // Evict timestamps outside the window
    this.log[key] = this.log[key].filter(t => now - t < this.windowMs);
    if (this.log[key].length >= this.maxTokens) return false;
    this.log[key].push(now);
    return true;
  }

  /** Milliseconds until the oldest token expires and a slot opens. */
  retryAfterMs(key) {
    if (!this.log[key] || this.log[key].length < this.maxTokens) return 0;
    const oldest = Math.min(...this.log[key]);
    return Math.max(0, this.windowMs - (Date.now() - oldest));
  }

  /** Human-readable retry message. */
  retryMessage(key) {
    const ms  = this.retryAfterMs(key);
    const sec = Math.ceil(ms / 1000);
    return sec > 0 ? `Too many attempts. Try again in ${sec}s.` : '';
  }

  reset(key) {
    this.log[key] = [];
  }
}

// ── Shared limiters ────────────────────────────────────────────

/** Auth (login / register) — 5 attempts per 60 seconds */
export const authLimiter = new TokenBucket(5, 60_000);

/** Data fetch (questions, analytics) — 60 per 60 seconds */
export const fetchLimiter = new TokenBucket(60, 60_000);

/** Attempt inserts — 120 per 60 seconds (exam mode needs ~100 at once) */
export const insertLimiter = new TokenBucket(120, 60_000);

/**
 * Throws a human-readable error if rate limited.
 * @param {TokenBucket} limiter
 * @param {string}      key
 * @param {string}      [label]
 */
export function checkRateLimit(limiter, key, label = 'requests') {
  if (!limiter.allow(key)) {
    const msg = limiter.retryMessage(key);
    throw new Error(msg || `Too many ${label}. Please slow down.`);
  }
}
