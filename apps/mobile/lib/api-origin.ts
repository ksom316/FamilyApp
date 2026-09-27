const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);

function withoutTrailingSlash(value: string) {
  return value.replace(/\/$/, '');
}

/**
 * Native builds call the Worker directly. Hosted web builds use their own origin so the
 * Vercel rewrites can keep Better Auth cookies first-party in Safari and other browsers.
 */
export function resolveClientApiUrl(configuredApiUrl: string, platform: string, browserUrl?: string) {
  const configured = withoutTrailingSlash(configuredApiUrl);
  if (platform !== 'web' || !browserUrl) return configured;

  try {
    const apiUrl = new URL(configured);
    const pageUrl = new URL(browserUrl);

    if (loopbackHosts.has(pageUrl.hostname)) {
      if (loopbackHosts.has(apiUrl.hostname)) apiUrl.hostname = pageUrl.hostname;
      return withoutTrailingSlash(apiUrl.toString());
    }

    if (pageUrl.protocol === 'https:') return pageUrl.origin;
    return configured;
  } catch {
    return configured;
  }
}
