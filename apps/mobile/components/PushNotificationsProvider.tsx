import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, type PropsWithChildren } from 'react';

import { markDepartureNotificationRead, markNotificationRead } from '../lib/notifications';
import {
  addPushResponseListener,
  addPushTokenRefreshListener,
  consumeLastPushResponse,
  registerCurrentPushDevice,
  setActiveNotificationPathname
} from '../lib/push-notifications';
import { readPushDestination } from '../lib/push-routing';
import { useAuth } from '../lib/use-auth';

export function PushNotificationsProvider({ children }: PropsWithChildren) {
  const { data, status } = useAuth();
  const pathname = usePathname();
  const authenticatedUserId = status === 'authenticated' ? data?.user.id ?? null : null;

  useEffect(() => setActiveNotificationPathname(pathname), [pathname]);

  const openPush = useCallback((payload: Record<string, unknown>) => {
    const destination = readPushDestination(payload);
    if (!destination) return;
    const markRead = destination.type === 'member_removed'
      ? markDepartureNotificationRead(destination.notificationId)
      : markNotificationRead(destination.familyId, destination.notificationId);
    void markRead.catch(() => {});
    if (destination.type === 'member_removed') router.replace(destination.route as never);
    else router.push(destination.route as never);
  }, []);

  useEffect(() => {
    if (!authenticatedUserId) return;
    void registerCurrentPushDevice(authenticatedUserId);
    void consumeLastPushResponse(openPush);
    const responseSubscription = addPushResponseListener(openPush);
    const tokenSubscription = addPushTokenRefreshListener(authenticatedUserId);
    return () => {
      responseSubscription.remove();
      tokenSubscription.remove();
    };
  }, [authenticatedUserId, openPush]);

  return children;
}
