import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Synchronously ensure the offline folder manifest is marked initialized on boot
try {
  const manifestKey = 'domyos_offline_fs_manifest_v1';
  if (!localStorage.getItem(manifestKey)) {
    localStorage.setItem(
      manifestKey,
      JSON.stringify({
        initialized: true,
        initializedAtIso: new Date().toISOString(),
        rootFolderName: 'DomyosCyclingHub',
        foldersCreated: [
          '/DomyosCyclingHub/App_Engine',
          '/DomyosCyclingHub/Workouts_Library/default',
          '/DomyosCyclingHub/Workouts_Library/shared',
          '/DomyosCyclingHub/User_Data/default/Workouts_FIT',
        ],
        cloudConnected: false,
        installedEngineVersion: '2.1.0',
      })
    );
  }
} catch {
  // ignore
}

// Register Service Worker & automatically reload when a new build is deployed via GitHub Actions
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        reg.update().catch(() => {});
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(<App />);
