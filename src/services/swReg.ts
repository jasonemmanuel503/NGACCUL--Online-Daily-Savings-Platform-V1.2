// Service Worker Registration helper for PWA support and cache-first workflows

export function registerSW() {
  const isProd = (import.meta as any).env?.PROD || (typeof process !== 'undefined' && process.env.NODE_ENV === 'production');
  if ('serviceWorker' in navigator && isProd) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('[SW] ServiceWorker registered with scope:', registration.scope);
        })
        .catch((error) => {
          console.error('[SW] ServiceWorker registration failed:', error);
        });
    });
  }
}
