import { authClient } from './auth-client';

export function useAuth() {
  const session = authClient.useSession();

  return {
    ...session,
    status: session.isPending
      ? 'loading'
      : session.data
        ? 'authenticated'
        : 'unauthenticated'
  } as const;
}