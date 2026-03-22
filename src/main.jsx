import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerSW } from 'virtual:pwa-register';

// Register service worker for PWA offline support
registerSW({
  onNeedRefresh() {
    // Optional: show a "New version available" toast
    console.log('[CETRanker] New version available, refresh to update.');
  },
  onOfflineReady() {
    console.log('[CETRanker] App ready to work offline.');
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
