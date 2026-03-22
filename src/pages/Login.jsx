import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authLimiter } from '../utils/rateLimiter';

export default function Login() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { signIn, signUp } = useAuth();

  const from = location.state?.from?.pathname || '/';

  const [tab, setTab]             = useState('login');   // 'login' | 'register'
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [name, setName]           = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [info, setInfo]           = useState('');        // e.g. "check your email"

  const retryMs   = authLimiter.retryAfterMs('signin') || authLimiter.retryAfterMs('signup');
  const isLimited = retryMs > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (tab === 'login') {
        await signIn(email, password);
        navigate(from, { replace: true });
      } else {
        const user = await signUp(email, password, confirmPw, name);
        if (user && !user.confirmed_at) {
          setInfo('Account created!');
          setTab('login');
        } else {
          navigate(from, { replace: true });
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cet-bg font-body flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-extrabold">
            CET<span className="text-cet-accent">Ranker</span>
          </h1>
          <p className="text-cet-dim text-xs font-mono mt-1">MAH MCA CET · Rank Improvement System</p>
        </div>

        <div className="bg-cet-panel border border-cet-border rounded-2xl p-7">
          {/* Tabs */}
          <div className="flex rounded-lg bg-cet-bg border border-cet-border p-0.5 mb-6">
            {['login','register'].map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); setInfo(''); }}
                className={`flex-1 py-2 rounded-md text-sm font-mono font-medium transition-all
                  ${tab === t
                    ? 'bg-cet-accent text-black'
                    : 'text-cet-dim hover:text-cet-text'}`}>
                {t === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          {/* Info / Error banners */}
          {info && (
            <div className="mb-4 p-3 rounded-lg bg-cet-blue/10 border border-cet-blue/30 text-cet-blue text-xs font-mono">
              {info}
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-cet-red/10 border border-cet-red/30 text-cet-red text-xs font-mono">
              {error}
            </div>
          )}
          {isLimited && !error && (
            <div className="mb-4 p-3 rounded-lg bg-cet-yellow/10 border border-cet-yellow/30 text-cet-yellow text-xs font-mono">
              Too many attempts. Wait {Math.ceil(retryMs / 1000)}s before trying again.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Display name — register only */}
            {tab === 'register' && (
              <div>
                <label className="text-xs font-mono text-cet-dim block mb-1">DISPLAY NAME</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name (optional)"
                  maxLength={50}
                  autoComplete="name"
                  className="w-full px-4 py-2.5 rounded-lg bg-cet-bg border border-cet-border text-cet-text text-sm font-body placeholder:text-cet-muted focus:outline-none focus:border-cet-accent transition-colors"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="text-xs font-mono text-cet-dim block mb-1">EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                maxLength={254}
                autoComplete={tab === 'login' ? 'username' : 'email'}
                className="w-full px-4 py-2.5 rounded-lg bg-cet-bg border border-cet-border text-cet-text text-sm font-body placeholder:text-cet-muted focus:outline-none focus:border-cet-accent transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label className="text-xs font-mono text-cet-dim block mb-1">PASSWORD</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={tab === 'register' ? 'Min 8 characters' : 'Your password'}
                  required
                  maxLength={128}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  className="w-full px-4 py-2.5 pr-10 rounded-lg bg-cet-bg border border-cet-border text-cet-text text-sm font-body placeholder:text-cet-muted focus:outline-none focus:border-cet-accent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-cet-muted hover:text-cet-dim transition-colors text-xs font-mono">
                  {showPw ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </div>

            {/* Confirm password — register only */}
            {tab === 'register' && (
              <div>
                <label className="text-xs font-mono text-cet-dim block mb-1">CONFIRM PASSWORD</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Re-enter password"
                  required
                  maxLength={128}
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 rounded-lg bg-cet-bg border border-cet-border text-cet-text text-sm font-body placeholder:text-cet-muted focus:outline-none focus:border-cet-accent transition-colors"
                />
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || isLimited}
              className={`w-full py-3 rounded-lg font-display font-bold text-sm transition-all mt-2
                ${loading || isLimited
                  ? 'bg-cet-border text-cet-muted cursor-not-allowed'
                  : 'bg-cet-accent text-black hover:bg-amber-400'}`}>
              {loading
                ? 'Please wait…'
                : tab === 'login' ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>

          {/* Footer note */}
          <p className="text-center text-xs text-cet-muted font-mono mt-5">
            {tab === 'login'
              ? "Don't have an account? "
              : 'Already have an account? '}
            <button
              onClick={() => { setTab(tab === 'login' ? 'register' : 'login'); setError(''); setInfo(''); }}
              className="text-cet-accent hover:underline">
              {tab === 'login' ? 'Register' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
