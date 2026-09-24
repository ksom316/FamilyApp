import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDatabase } from '@familyapp/db';

import { createAuth, getTrustedOrigins } from './auth';
import { acceptFamilyInvitation, createFamily, createFamilyInvitation, FamilyServiceError, listFamilyMembers, listFamilyMemberships } from './family-service';
import { createEvent, createTask, deleteEvent, deleteTask, listPlans, PlanServiceError, setTaskCompletion, updateEvent, updateTask } from './plans-service';
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

app.use('/families/*', async (c, next) => {
  const allowedOrigins = getTrustedOrigins(c.env);
  return cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : ''),
    credentials: true
  })(c, next);
});

app.use('/families', async (c, next) => {
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

app.get('/families/:familyId/members', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const members = await listFamilyMembers(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId')
    );
    return c.json({ members });
  } catch (error) {
    if (error instanceof FamilyServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 409 | 410);
    }
    throw error;
  }
});

app.get('/families/:familyId/plans', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    return c.json(await listPlans(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId')));
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PlanServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.post('/families/:familyId/events', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const event = await createEvent(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json({ event }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PlanServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.patch('/families/:familyId/events/:eventId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const event = await updateEvent(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('eventId'), await c.req.json());
    return c.json({ event });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PlanServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.delete('/families/:familyId/events/:eventId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await deleteEvent(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('eventId'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PlanServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.post('/families/:familyId/tasks', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const task = await createTask(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json({ task }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PlanServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.patch('/families/:familyId/tasks/:taskId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const task = await updateTask(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('taskId'), await c.req.json());
    return c.json({ task });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PlanServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.patch('/families/:familyId/tasks/:taskId/completion', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json<{ completed?: unknown }>();
    const task = await setTaskCompletion(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('taskId'), body.completed);
    return c.json({ task });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PlanServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.delete('/families/:familyId/tasks/:taskId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await deleteTask(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('taskId'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PlanServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
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

app.post('/families/:familyId/invitations', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const body = await c.req.json<{ role?: unknown }>();
    const invitation = await createFamilyInvitation(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      body.role
    );
    return c.json({ invitation }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 409 | 410);
    }
    throw error;
  }
});

export default app;
