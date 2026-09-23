import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { createAuth, getTrustedOrigins } from './auth';
import { sessionMiddleware, type ApiEnv } from './session-middleware';

const app = new Hono<ApiEnv>();

app.get('/health', (c) => c.json({ status: 'ok', service: 'familyapp-api' }));

app.use('/api/auth/*', async (c, next) => {
  const allowedOrigins = getTrustedOrigins(c.env);
  return cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : ''),
    credentials: true
  })(c, next);
});

app.all('/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));

app.get('/me', sessionMiddleware, (c) => {
  const session = c.get('session');

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return c.json({
    user: session.user,
    session: session.session
  });
});

export default app;
