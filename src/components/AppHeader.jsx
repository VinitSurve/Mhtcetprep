import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Shared app header used on Home and Analytics pages.
 * Shows branding, user avatar + name, and logout dropdown.
 */
export default function AppHeader({ title, subtitle }) {
  const navigate          = useNavigate();
  const { user, displayName, userInitial, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    setMenuOpen(false);
    try { await signOut(); } catch (_) {}
    navigate('/login', { replace: true });
  }

  return (
    <header className="border-b border-cet-border px-6 py-4 sticky top-0 z-20 bg-cet-bg/95 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        {/* Branding / title */}
        <div>
          {title ? (
            <>
              <h1 className="font-display text-lg font-bold text-cet-text">{title}</h1>
              {subtitle && <p className="text-xs text-cet-dim font-mono">{subtitle}</p>}
            </>
          ) : (
            <>
              <h1
                className="font-display text-xl font-bold text-cet-text tracking-tight cursor-pointer"
                onClick={() => navigate('/')}>
                CET<span className="text-cet-accent">Ranker</span>
              </h1>
              <p className="text-xs text-cet-dim font-mono">MAH MCA CET · Rank Improvement System</p>
            </>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/analytics')}
            className="hidden sm:block px-3 py-1.5 rounded-lg border border-cet-border text-cet-dim hover:border-cet-accent/50 hover:text-cet-text text-xs font-mono transition-all">
            Analytics
          </button>

          {/* User avatar + dropdown */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-cet-border hover:border-cet-accent/50 transition-all">
                {/* Avatar */}
                {user.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt={displayName}
                    className="w-7 h-7 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-cet-accent/20 border border-cet-accent/40 flex items-center justify-center text-cet-accent font-mono font-bold text-xs">
                    {userInitial}
                  </div>
                )}
                <span className="text-xs font-mono text-cet-dim hidden sm:block max-w-[100px] truncate">
                  {displayName}
                </span>
                <svg className="w-3 h-3 text-cet-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
              </button>

              {/* Dropdown */}
              {menuOpen && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)}/>
                  <div className="absolute right-0 mt-2 w-48 bg-cet-panel border border-cet-border rounded-xl shadow-xl z-20 py-1 animate-fade-in">
                    <div className="px-4 py-2 border-b border-cet-border">
                      <div className="text-xs font-mono text-cet-text truncate">{displayName}</div>
                      <div className="text-xs font-mono text-cet-muted truncate">{user.email}</div>
                    </div>
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/analytics'); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-cet-dim hover:text-cet-text hover:bg-cet-border/30 transition-colors font-mono">
                      📊 Analytics
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2.5 text-sm text-cet-red hover:bg-cet-red/10 transition-colors font-mono">
                      ↩ Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
