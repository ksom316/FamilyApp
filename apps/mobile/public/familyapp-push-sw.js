const WORKER_VERSION = '2026-09-27.3';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const SAFE_ROUTES = [
  /^\/$/, /^\/family$/, /^\/chat\/family$/,
  new RegExp(`^/private-chat/${UUID}$`, 'i'),
  new RegExp(`^/emergency/${UUID}$`, 'i'),
  /^\/location$/, /^\/check-ins$/,
  new RegExp(`^/tasks/${UUID}$`, 'i'),
  /^\/plans$/, /^\/calendar$/,
  new RegExp(`^/polls/${UUID}$`, 'i'),
  /^\/capsules$/, /^\/notifications$/
];

function safeText(value, fallback, maximum) {
  return typeof value === 'string' && value.trim() ? value.slice(0, maximum) : fallback;
}

function safeRoute(value) {
  return typeof value === 'string' && SAFE_ROUTES.some((allowed) => allowed.test(value)) ? value : '/notifications';
}

// This worker has no fetch/cache behavior that can become incompatible with an
// already-open app. Activate notification fixes immediately instead of leaving a
// corrected worker waiting behind a long-lived desktop tab.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const route = safeRoute(payload.route);
  event.waitUntil((async () => {
    await self.registration.showNotification(safeText(payload.title, 'Kinzae', 140), {
      body: safeText(payload.body, 'Open Kinzae to see what is new.', 300),
      icon: '/familyapp-icon-192.png',
      badge: '/familyapp-maskable-512.png',
      data: { route, workerVersion: WORKER_VERSION }
    });
    // Visible only in service-worker developer tools; contains no message or
    // subscription data and distinguishes an old worker from this fixed version.
    console.info('Kinzae Web Push displayed', { workerVersion: WORKER_VERSION });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = safeRoute(event.notification.data && event.notification.data.route);
  const target = new URL(route, self.location.origin);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      if ('navigate' in existing) await existing.navigate(target.href);
      return existing.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});
