import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Intentionally avoid exposing internal details in production UI.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-cet-bg text-cet-text flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-cet-panel border border-cet-border rounded-2xl p-8 text-center animate-slide-up">
            <div className="text-4xl mb-3">⚠️</div>
            <h1 className="font-display text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-sm text-cet-dim font-mono mb-6">
              Please refresh the page. If the issue persists, try again in a few minutes.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 rounded-lg bg-cet-accent text-black font-display font-bold text-sm hover:bg-amber-400 transition-all">
              Refresh App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
