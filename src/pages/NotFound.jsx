import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-cet-bg flex items-center justify-center px-4">
      <div className="text-center animate-slide-up">
        <div className="font-mono text-7xl font-bold text-cet-border mb-4">404</div>
        <div className="font-display text-xl font-bold text-cet-text mb-2">Page not found</div>
        <div className="text-cet-dim text-sm font-mono mb-8">
          This route doesn't exist in CETRanker.
        </div>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 bg-cet-accent text-black font-display font-bold rounded-lg hover:bg-amber-400 transition-all">
          ← Back to Home
        </button>
      </div>
    </div>
  );
}
