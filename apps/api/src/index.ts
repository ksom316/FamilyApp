import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDatabase } from '@familyapp/db';

import { createAuth, getTrustedOrigins } from './auth';
import { acceptFamilyInvitation, createFamily, FamilyServiceError, listFamilyMemberships } from './family-service';
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

app.get('/families/memberships', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const memberships = await listFamilyMemberships(createDatabase(c.env.DATABASE_URL), session.user.id);
  return c.json({ memberships });
});

app.post('/families', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const body = await c.req.json<{ name?: unknown }>();
    if (typeof body.name !== 'string') {
      throw new FamilyServiceError('invalid_name', 'Family name is required.');
    }

    const result = await createFamily(createDatabase(c.env.DATABASE_URL), session.user.id, body.name);
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 409 | 410);
    throw error;
  }
});

app.post('/families/invitations/accept', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const body = await c.req.json<{ token?: unknown }>();
    if (typeof body.token !== 'string') {
      throw new FamilyServiceError('invalid_invitation', 'Invitation code is required.');
    }

    const result = await acceptFamilyInvitation(createDatabase(c.env.DATABASE_URL), session.user.id, body.token);
    return c.json(result);
  } catch (error) {
    if (error instanceof FamilyServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 409 | 410);
    throw error;
  }
});

export default app;
