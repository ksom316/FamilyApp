const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const SAFE_ROUTES = [
  /^\/\(family\)\/chat\/family$/,
  new RegExp(`^/\\(family\\)/private-chat/${UUID}$`, 'i'),
  new RegExp(`^/\\(family\\)/emergency/${UUID}$`, 'i'),
  /^\/\(family\)\/location$/,
  new RegExp(`^/\\(family\\)/tasks/${UUID}$`, 'i'),
  /^\/\(family\)\/plans$/,
  /^\/\(family\)\/calendar$/,
  new RegExp(`^/\\(family\\)/polls/${UUID}$`, 'i'),
  /^\/\(family\)\/capsules$/
];

export type PushDestination = {
  familyId: string;
  notificationId: string;
  route: string;
};

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^${UUID}$`, 'i').test(value);
}

export function readPushDestination(data: Record<string, unknown> | null | undefined): PushDestination | null {
  if (!data || data.kind !== 'familyapp_notification' || !isUuid(data.familyId) || !isUuid(data.notificationId)) return null;
  const route = data.route;
  if (typeof route !== 'string' || !SAFE_ROUTES.some((allowedRoute) => allowedRoute.test(route))) return null;
  return { familyId: data.familyId, notificationId: data.notificationId, route };
}

export function routesMatch(pathname: string, route: string) {
  const normalizedTarget = route.replace('/(family)', '');
  return pathname === normalizedTarget || pathname === route;
}
