import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { validateEmail, validatePassword, validateDisplayName, validatePasswordMatch } from '../utils/sanitize';
import { authLimiter, checkRateLimit } from '../utils/rateLimiter';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true); // true while restoring session

  // ── Restore session on mount ───────────────────────────────
  useEffect(() => {
    // Get current session synchronously from local storage
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Sign in with email + password ─────────────────────────
  async function signIn(rawEmail, rawPassword) {
    checkRateLimit(authLimiter, 'signin', 'sign-in attempts');
    const email    = validateEmail(rawEmail);
    const password = validatePassword(rawPassword);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return data.user;
  }

  // ── Register with email + password + display name ─────────
  async function signUp(rawEmail, rawPassword, rawConfirm, rawName) {
    checkRateLimit(authLimiter, 'signup', 'sign-up attempts');
    const email       = validateEmail(rawEmail);
    const password    = validatePassword(rawPassword);
    validatePasswordMatch(rawPassword, rawConfirm);
    const displayName = rawName ? validateDisplayName(rawName) : email.split('@')[0];

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });
    if (error) throw new Error(error.message);
    return data.user;
  }

  // ── Sign in with Google OAuth ──────────────────────────────
  async function signInWithGoogle() {
    checkRateLimit(authLimiter, 'google', 'OAuth attempts');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw new Error(error.message);
  }

  // ── Sign out ───────────────────────────────────────────────
  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    authLimiter.reset('signin');
    authLimiter.reset('signup');
  }

  // ── Helpers ───────────────────────────────────────────────
  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User';
  const userInitial = displayName[0]?.toUpperCase() || 'U';

  return (
    <AuthContext.Provider value={{ user, loading, displayName, userInitial, signIn, signUp, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Hook to use auth context. Throws if used outside AuthProvider. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
