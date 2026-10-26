import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/hanken-grotesk/index.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import './styles/app.css';
import { App } from './App';
import { store } from './lib/store';
import { watchInstall } from './lib/install';
import { onNewVersion, onQuietScreen, setQuietScreen, setReloadGuard, watchForUpdates } from './lib/update';

watchInstall();
setReloadGuard(() => store.reloadUnsafe());
setQuietScreen(() => ['boot', 'welcome'].includes(store.getSnapshot().phase));
let lastPhase = store.getSnapshot().phase;
store.subscribe(() => {
  const phase = store.getSnapshot().phase;
  if (phase !== lastPhase && phase === 'welcome') onQuietScreen();
  lastPhase = phase;
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) =>
    registerSW({ immediate: true, onNeedReload: onNewVersion, onRegisteredSW: (_url, registration) => registration && watchForUpdates(registration) }),
  );
}

void store.boot();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
