import { createMiddleware } from 'hono/factory';

import { createAuth, type AuthBindings, type AuthSession } from './auth';

export type ApiEnv = {
  Bindings: AuthBindings;
  Variables: {
    session: AuthSession | null;
  };
};

export const sessionMiddleware = createMiddleware<ApiEnv>(async (c, next) => {
  const session = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers
  });

  c.set('session', session);
  await next();
});
