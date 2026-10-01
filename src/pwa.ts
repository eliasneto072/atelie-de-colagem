/**
 * Offline support and "install as an app". The service worker (public/sw.js) downloads the
 * whole build on the first visit, so the editor keeps working without internet afterwards.
 * Only registered in production builds: in development it would serve stale files.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // offline mode is a bonus; the editor works without it
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
