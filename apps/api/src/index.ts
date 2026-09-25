import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDatabase } from '@familyapp/db';

import { createAiProvider } from './ai-provider';
import { createAuth, getTrustedOrigins } from './auth';
import { BrainServiceError, respondToBrainMessage } from './brain-service';
import { ChatServiceError, createFamilyMessage, listFamilyMessages } from './chat-service';
import { acceptFamilyInvitation, createFamily, createFamilyInvitation, FamilyServiceError, listFamilyMembers, listFamilyMemberships } from './family-service';
import {
  cancelOutgoingFindMeRequest,
  createFindMeRequest,
  getOutgoingFindMeRequest,
  listActiveShares,
  listIncomingFindMeRequests,
  LocationServiceError,
  respondToFindMeRequest,
  startShare,
  stopShare,
  updateShare
} from './location-service';
import {
  createMemory,
  deleteMemory,
  favoriteMemory,
  getMemory,
  getMemoryMedia,
  listMemories,
  MemoriesServiceError,
  unfavoriteMemory,
  updateMemory
} from './memories-service';
import { createEvent, createTask, deleteEvent, deleteTask, listPlans, PlanServiceError, setTaskCompletion, updateEvent, updateTask } from './plans-service';
import { sessionMiddleware, type ApiEnv } from './session-middleware';
import {
  createTimeCapsule,
  deleteTimeCapsule,
  getTimeCapsule,
  listTimeCapsules,
  TimeCapsuleServiceError,
  updateTimeCapsule
} from './time-capsules-service';

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

app.get('/families/:familyId/messages', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const messages = await listFamilyMessages(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId')
    );
    return c.json({ messages });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ChatServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403);
    }
    throw error;
  }
});

app.post('/families/:familyId/messages', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const body = await c.req.json<{ text?: unknown }>();
    const message = await createFamilyMessage(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      body
    );
    return c.json({ message }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ChatServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403);
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

app.get('/families/:familyId/memories', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const memories = await listMemories(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json({ memories });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MemoriesServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 413 | 415 | 502 | 503);
    throw error;
  }
});

app.get('/families/:familyId/memories/:memoryId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const memory = await getMemory(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('memoryId'));
    return c.json({ memory });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MemoriesServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 413 | 415 | 502 | 503);
    throw error;
  }
});

app.get('/families/:familyId/memories/:memoryId/media', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const { objectKey, mimeType } = await getMemoryMedia(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('memoryId'));
    if (!c.env.MEMORIES_BUCKET) return c.json({ error: 'Photo storage is not configured yet.', code: 'storage_unavailable' }, 503);
    const object = await c.env.MEMORIES_BUCKET.get(objectKey);
    if (!object) return c.json({ error: 'Memory photo not found.', code: 'memory_not_found' }, 404);
    return c.body(object.body, 200, {
      'Content-Type': mimeType,
      'Cache-Control': 'private, max-age=31536000, immutable'
    });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MemoriesServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 413 | 415 | 502 | 503);
    throw error;
  }
});

app.post('/families/:familyId/memories', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new MemoriesServiceError('invalid_media', 'Choose a photo to upload.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const memory = await createMemory(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      { title: form.get('title'), memoryDate: form.get('memoryDate'), bytes },
      c.env.MEMORIES_BUCKET
    );
    return c.json({ memory }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MemoriesServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 413 | 415 | 502 | 503);
    throw error;
  }
});

app.patch('/families/:familyId/memories/:memoryId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const memory = await updateMemory(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('memoryId'), await c.req.json());
    return c.json({ memory });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MemoriesServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 413 | 415 | 502 | 503);
    throw error;
  }
});

app.delete('/families/:familyId/memories/:memoryId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await deleteMemory(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('memoryId'), c.env.MEMORIES_BUCKET);
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MemoriesServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 413 | 415 | 502 | 503);
    throw error;
  }
});

app.post('/families/:familyId/memories/:memoryId/favorite', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await favoriteMemory(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('memoryId'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MemoriesServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 413 | 415 | 502 | 503);
    throw error;
  }
});

app.delete('/families/:familyId/memories/:memoryId/favorite', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await unfavoriteMemory(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('memoryId'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MemoriesServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 413 | 415 | 502 | 503);
    throw error;
  }
});

app.get('/families/:familyId/time-capsules', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    return c.json(await listTimeCapsules(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId')));
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof TimeCapsuleServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    }
    throw error;
  }
});

app.get('/families/:familyId/time-capsules/:capsuleId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    return c.json(await getTimeCapsule(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      c.req.param('capsuleId')
    ));
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof TimeCapsuleServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    }
    throw error;
  }
});

app.post('/families/:familyId/time-capsules', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    return c.json(await createTimeCapsule(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      await c.req.json()
    ), 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof TimeCapsuleServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    }
    throw error;
  }
});

app.patch('/families/:familyId/time-capsules/:capsuleId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    return c.json(await updateTimeCapsule(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      c.req.param('capsuleId'),
      await c.req.json()
    ));
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof TimeCapsuleServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    }
    throw error;
  }
});

app.delete('/families/:familyId/time-capsules/:capsuleId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await deleteTimeCapsule(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      c.req.param('capsuleId')
    );
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof TimeCapsuleServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    }
    throw error;
  }
});

app.get('/families/:familyId/location/shares', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const shares = await listActiveShares(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json({ shares });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof LocationServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/location/shares/me/start', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const share = await startShare(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json({ share });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof LocationServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.patch('/families/:familyId/location/shares/me', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const share = await updateShare(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json({ share });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof LocationServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/location/shares/me/stop', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await stopShare(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof LocationServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/find-me', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const request = await createFindMeRequest(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json({ request }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof LocationServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.get('/families/:familyId/find-me/incoming', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const requests = await listIncomingFindMeRequests(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json({ requests });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof LocationServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.get('/families/:familyId/find-me/outgoing', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const request = await getOutgoingFindMeRequest(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json({ request });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof LocationServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.patch('/families/:familyId/find-me/:requestId/respond', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json<{ response?: unknown }>();
    await respondToFindMeRequest(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('requestId'), body.response);
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof LocationServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.delete('/families/:familyId/find-me/me', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await cancelOutgoingFindMeRequest(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof LocationServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/brain', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const provider = createAiProvider({ apiKey: c.env.OPENROUTER_API_KEY, model: c.env.OPENROUTER_MODEL });
    const result = await respondToBrainMessage(
      createDatabase(c.env.DATABASE_URL),
      provider,
      session.user.id,
      session.user.name,
      c.req.param('familyId'),
      await c.req.json()
    );
    return c.json(result);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof BrainServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 502 | 503);
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
