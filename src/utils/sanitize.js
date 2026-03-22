// ──────────────────────────────────────────────────────────────
// Input Sanitization & Validation
//
// NOTE ON SQL INJECTION:
// The Supabase JS client sends ALL queries through PostgREST using
// parameterized HTTP calls — .eq(), .in(), .not(), .insert() etc.
// are all safe by design. No raw SQL is constructed anywhere in
// this app, so SQL injection via query parameters is not possible.
//
// This file handles:
//  1. Auth input validation before calling Supabase Auth
//  2. XSS-safe display (React handles this automatically via JSX)
//  3. General string hygiene for any text stored in the DB
// ──────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validate and normalise an email address.
 * Throws a descriptive Error if invalid.
 */
export function validateEmail(raw) {
  if (typeof raw !== 'string') throw new Error('Email must be a string.');
  const email = raw.trim().toLowerCase().slice(0, 254);
  if (!email)              throw new Error('Email is required.');
  if (!EMAIL_REGEX.test(email)) throw new Error('Enter a valid email address.');
  return email;
}

/**
 * Validate a password.
 * Does NOT modify the password — passwords should never be normalised.
 * Throws a descriptive Error if invalid.
 */
export function validatePassword(raw) {
  if (typeof raw !== 'string') throw new Error('Password must be a string.');
  if (raw.length < 8)  throw new Error('Password must be at least 8 characters.');
  if (raw.length > 128) throw new Error('Password must be under 128 characters.');
  return raw;
}

/**
 * Validate a display name.
 * Strips leading/trailing whitespace, collapses internal spaces,
 * removes null bytes and control characters.
 */
export function validateDisplayName(raw) {
  if (typeof raw !== 'string') throw new Error('Name must be a string.');
  const name = raw
    .replace(/\0/g, '')                     // null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // control chars
    .replace(/\s+/g, ' ')                   // collapse whitespace
    .trim()
    .slice(0, 50);
  if (!name) throw new Error('Display name is required.');
  return name;
}

/**
 * General-purpose text sanitiser for any string going into the DB.
 * Removes null bytes and dangerous control characters.
 * React's JSX escaping prevents XSS on render.
 */
export function sanitizeText(raw, maxLen = 1000) {
  if (raw == null) return '';
  return String(raw)
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * Validate confirm-password match.
 */
export function validatePasswordMatch(password, confirm) {
  if (password !== confirm) throw new Error('Passwords do not match.');
}
