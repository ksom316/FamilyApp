import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDatabase } from '@familyapp/db';

import { createAiProvider } from './ai-provider';
import { createAuth, getTrustedOrigins, type AuthBindings } from './auth';
import { BrainServiceError, respondToBrainMessage } from './brain-service';
import {
  CalendarServiceError,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent
} from './calendar-service';
import { CheckInServiceError, createCheckIn, listRecentCheckIns } from './check-ins-service';
import {
  acknowledgeEmergency,
  createEmergency,
  EmergencyServiceError,
  getEmergency,
  listEmergencies,
  resolveEmergency
} from './emergency-service';
import { ChatServiceError, createFamilyMessage, getGroupChatUnreadCount, listFamilyMessages, markGroupChatRead } from './chat-service';
import { getCalendarTimeline } from './calendar-timeline-service';
import { getDailyBriefing } from './daily-briefing-service';
import { getWeeklyRecap } from './weekly-recap-service';
import {
  ChoreServiceError,
  createChore,
  deleteChore,
  getChore,
  listChores,
  setChoreCompletion,
  updateChore
} from './chores-service';
import {
  acceptFamilyInvitation,
  createFamily,
  createFamilyInvitation,
  FamilyServiceError,
  leaveFamily,
  listFamilyMembers,
  listFamilyMemberships,
  transferFamilyOwnership
} from './family-service';
import { AccountServiceError, deleteAccount } from './account-service';
import {
  addHouseholdMember,
  createHousehold,
  deleteHousehold,
  getHousehold,
  HouseholdServiceError,
  listHouseholds,
  removeHouseholdMember,
  updateHousehold
} from './households-service';
import {
  cancelOutgoingFindMeRequest,
  createFindMeRequest,
  getActiveShare,
  getOutgoingFindMeRequest,
  listActiveShares,
  listIncomingFindMeRequests,
  LocationServiceError,
  respondToFindMeRequest,
  startComeFindMe,
  startShare,
  stopShare,
  updateComeFindMeAudience,
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
import {
  closePoll,
  createPoll,
  deletePoll,
  getPoll,
  listPolls,
  PollServiceError,
  voteOnPoll
} from './polls-service';
import {
  createPrivateMessage,
  listPrivateConversations,
  listPrivateMessages,
  markPrivateConversationRead,
  PrivateChatServiceError,
  startPrivateConversation
} from './private-chat-service';
import {
  clearMeal,
  copyPreviousWeek,
  createMenu,
  createShoppingListFromMenu,
  deleteMenu,
  getMenu,
  getMenuForTarget,
  MenuServiceError,
  setMeal,
  updateMenu
} from './menus-service';
import {
  applySavedMenuToWeek,
  clearSavedMenuMeal,
  createSavedMenu,
  createShoppingListFromSavedMenu,
  deleteSavedMenu,
  duplicateSavedMenu,
  getMenuHome,
  getSavedMenu,
  listSavedMenus,
  SavedMenuServiceError,
  setSavedMenuActive,
  setSavedMenuMeal,
  updateSavedMenu
} from './saved-menus-service';
import { listNotifications, markAllNotificationsRead, markNotificationRead, NotificationServiceError } from './notifications-service';
import { runAllNotificationSweeps } from './notification-sweep';
import { createObjectStorage } from './object-storage';
import {
  PushDeviceServiceError,
  registerPushDevice,
  unregisterPushDevice
} from './push-devices-service';
import {
  getMemberProfilePhotoMedia,
  getMyProfileIdentity,
  getMyProfilePhotoMedia,
  ProfileServiceError,
  removeMyProfilePhoto,
  updateMyIdentity,
  uploadMyProfilePhoto
} from './profile-service';
import { sessionMiddleware, type ApiEnv } from './session-middleware';
import {
  addShoppingItem,
  clearPurchasedItems,
  completeShoppingList,
  createShoppingList,
  deleteShoppingItem,
  deleteShoppingList,
  getShoppingList,
  listShoppingLists,
  setShoppingItemPurchased,
  ShoppingServiceError,
  updateShoppingItem,
  updateShoppingList
} from './shopping-service';
import {
  createTimeCapsule,
  deleteTimeCapsule,
  getTimeCapsule,
  getTimeCapsuleAttachmentMedia,
  listTimeCapsules,
  type PrivateCapsulePhotoInput,
  TimeCapsuleServiceError,
  updateTimeCapsule
} from './time-capsules-service';

const app = new Hono<ApiEnv>();

async function readTimeCapsuleRequest(request: Request, isUpdate: boolean) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return {
      input: await request.json(),
      privatePhotos: isUpdate ? undefined : [] as PrivateCapsulePhotoInput[]
    };
  }

  const form = await request.formData();
  const rawMemoryIds = form.get('memoryIds');
  let memoryIds: unknown = undefined;
  if (typeof rawMemoryIds === 'string') {
    try {
      memoryIds = JSON.parse(rawMemoryIds);
    } catch {
      memoryIds = rawMemoryIds;
    }
  }
  const replacePrivatePhotos = !isUpdate || form.get('replacePrivatePhotos') === 'true';
  const privatePhotos = replacePrivatePhotos
    ? await Promise.all(form.getAll('privatePhotos').map(async (value) => {
      if (!(value instanceof File)) {
        throw new TimeCapsuleServiceError('invalid_private_attachments', 'Choose a photo to upload.');
      }
      return { bytes: new Uint8Array(await value.arrayBuffer()) };
    }))
    : undefined;

  return {
    input: {
      title: form.get('title') ?? undefined,
      message: form.has('message') ? form.get('message') : undefined,
      unlockAt: form.get('unlockAt') ?? undefined,
      memoryIds
    },
    privatePhotos
  };
}

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

// The profile identity endpoints (/me, /me/identity, /me/photo) live outside the
// /families/* prefix, so they never matched either of the CORS middlewares above — the API
// still answered them correctly, but with no Access-Control-Allow-Origin/-Credentials
// headers, so a cross-origin browser (e.g. the web dev server on :8081 calling the API on
// :8787) silently discarded the response. Same allowlist/credentials handling as the other
// authenticated routes, just matched against this prefix too.
app.use('/me', async (c, next) => {
  const allowedOrigins = getTrustedOrigins(c.env);
  return cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : ''),
    credentials: true
  })(c, next);
});

app.post('/me/push-devices', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json<{ expoPushToken?: unknown; platform?: unknown }>();
    await registerPushDevice(createDatabase(c.env.DATABASE_URL), session.user.id, body);
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof PushDeviceServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400);
    }
    throw error;
  }
});

app.delete('/me/push-devices', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json<{ expoPushToken?: unknown }>();
    await unregisterPushDevice(createDatabase(c.env.DATABASE_URL), session.user.id, body.expoPushToken);
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof PushDeviceServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400);
    }
    throw error;
  }
});

app.use('/me/*', async (c, next) => {
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

app.get('/me/identity', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const identity = await getMyProfileIdentity(createDatabase(c.env.DATABASE_URL), session.user.id);
    return c.json({ identity });
  } catch (error) {
    if (error instanceof ProfileServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 404 | 413 | 415 | 502 | 503);
    throw error;
  }
});

app.patch('/me/identity', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const identity = await updateMyIdentity(createDatabase(c.env.DATABASE_URL), session.user.id, await c.req.json());
    return c.json({ identity });
  } catch (error) {
    if (error instanceof ProfileServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 404 | 413 | 415 | 502 | 503);
    throw error;
  }
});

app.get('/me/photo', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const { objectKey, mimeType } = await getMyProfilePhotoMedia(createDatabase(c.env.DATABASE_URL), session.user.id);
    const storage = createObjectStorage(c.env);
    if (!storage) return c.json({ error: 'Photo storage is not configured yet.', code: 'storage_unavailable' }, 503);
    const object = await storage.get(objectKey);
    if (!object) return c.json({ error: 'No profile photo is set.', code: 'photo_not_found' }, 404);
    return c.body(object.body, 200, { 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=3600' });
  } catch (error) {
    if (error instanceof ProfileServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 404 | 413 | 415 | 502 | 503);
    throw error;
  }
});

app.post('/me/photo', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ProfileServiceError('invalid_photo', 'Choose a photo to upload.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const identity = await uploadMyProfilePhoto(createDatabase(c.env.DATABASE_URL), session.user.id, bytes, createObjectStorage(c.env));
    return c.json({ identity }, 201);
  } catch (error) {
    if (error instanceof ProfileServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 404 | 413 | 415 | 502 | 503);
    throw error;
  }
});

app.delete('/me/photo', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const identity = await removeMyProfilePhoto(createDatabase(c.env.DATABASE_URL), session.user.id, createObjectStorage(c.env));
    return c.json({ identity });
  } catch (error) {
    if (error instanceof ProfileServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 404 | 413 | 415 | 502 | 503);
    throw error;
  }
});

// Deletes the account per account-service.ts's documented semantics (never a raw `users`
// row delete) — see that file for exactly what is removed vs. anonymized vs. preserved.
app.delete('/me', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await deleteAccount(createDatabase(c.env.DATABASE_URL), session.user.id, createObjectStorage(c.env));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof AccountServiceError) return c.json({ error: error.message, code: error.code }, error.status as 409);
    if (error instanceof FamilyServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 409 | 410);
    throw error;
  }
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

app.post('/families/:familyId/leave', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const result = await leaveFamily(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json(result);
  } catch (error) {
    if (error instanceof FamilyServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409 | 410);
    }
    throw error;
  }
});

app.post('/families/:familyId/ownership/transfer', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json().catch(() => ({}));
    await transferFamilyOwnership(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      (body as { newOwnerMemberId?: unknown }).newOwnerMemberId
    );
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409 | 410);
    }
    throw error;
  }
});

app.get('/families/:familyId/members/:memberId/photo', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const { objectKey, mimeType } = await getMemberProfilePhotoMedia(
      createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('memberId')
    );
    const storage = createObjectStorage(c.env);
    if (!storage) return c.json({ error: 'Photo storage is not configured yet.', code: 'storage_unavailable' }, 503);
    const object = await storage.get(objectKey);
    if (!object) return c.json({ error: 'No profile photo is set.', code: 'photo_not_found' }, 404);
    return c.body(object.body, 200, { 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=3600' });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ProfileServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    }
    throw error;
  }
});

app.get('/families/:familyId/households', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const households = await listHouseholds(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json({ households });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof HouseholdServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.get('/families/:familyId/households/:householdId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    return c.json(await getHousehold(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('householdId')));
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof HouseholdServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/households', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const result = await createHousehold(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof HouseholdServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.patch('/families/:familyId/households/:householdId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    return c.json(await updateHousehold(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('householdId'), await c.req.json()));
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof HouseholdServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.delete('/families/:familyId/households/:householdId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await deleteHousehold(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('householdId'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof HouseholdServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/households/:householdId/members', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json<{ memberId?: unknown }>();
    return c.json(await addHouseholdMember(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('householdId'), body.memberId));
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof HouseholdServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.delete('/families/:familyId/households/:householdId/members/:memberId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    return c.json(await removeHouseholdMember(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('householdId'), c.req.param('memberId')));
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof HouseholdServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.get('/families/:familyId/polls', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const polls = await listPolls(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json({ polls });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PollServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.get('/families/:familyId/polls/:pollId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const poll = await getPoll(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('pollId'));
    return c.json({ poll });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PollServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/polls', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const poll = await createPoll(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json({ poll }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PollServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.delete('/families/:familyId/polls/:pollId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await deletePoll(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('pollId'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PollServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/polls/:pollId/vote', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json<{ optionId?: unknown }>();
    const poll = await voteOnPoll(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('pollId'), body.optionId);
    return c.json({ poll });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PollServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/polls/:pollId/close', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const poll = await closePoll(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('pollId'));
    return c.json({ poll });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PollServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.get('/families/:familyId/menus', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const result = await getMenuForTarget(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      c.req.query('householdId'),
      c.req.query('weekStartDate')
    );
    return c.json(result);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.get('/families/:familyId/menus/:menuId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const menu = await getMenu(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('menuId'));
    return c.json({ menu });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.post('/families/:familyId/menus', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const menu = await createMenu(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json({ menu }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.patch('/families/:familyId/menus/:menuId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const menu = await updateMenu(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('menuId'), await c.req.json());
    return c.json({ menu });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.delete('/families/:familyId/menus/:menuId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await deleteMenu(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('menuId'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.put('/families/:familyId/menus/:menuId/meals', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const menu = await setMeal(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('menuId'), await c.req.json());
    return c.json({ menu });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.delete('/families/:familyId/menus/:menuId/meals', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const menu = await clearMeal(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('menuId'), c.req.query('mealDate'), c.req.query('mealType'));
    return c.json({ menu });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.post('/families/:familyId/menus/:menuId/copy-previous-week', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const menu = await copyPreviousWeek(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('menuId'));
    return c.json({ menu });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.post('/families/:familyId/menus/:menuId/shopping-list', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const list = await createShoppingListFromMenu(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('menuId'));
    return c.json({ list }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof MenuServiceError || error instanceof ShoppingServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    }
    throw error;
  }
});

app.get('/families/:familyId/saved-menus/home', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const home = await getMenuHome(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json(home);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof SavedMenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.get('/families/:familyId/saved-menus', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const savedMenus = await listSavedMenus(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json({ savedMenus });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof SavedMenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.get('/families/:familyId/saved-menus/:savedMenuId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const savedMenu = await getSavedMenu(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('savedMenuId'));
    return c.json({ savedMenu });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof SavedMenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.post('/families/:familyId/saved-menus', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const savedMenu = await createSavedMenu(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json({ savedMenu }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof SavedMenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.patch('/families/:familyId/saved-menus/:savedMenuId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const savedMenu = await updateSavedMenu(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('savedMenuId'), await c.req.json());
    return c.json({ savedMenu });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof SavedMenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.delete('/families/:familyId/saved-menus/:savedMenuId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await deleteSavedMenu(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('savedMenuId'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof SavedMenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.post('/families/:familyId/saved-menus/:savedMenuId/duplicate', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const savedMenu = await duplicateSavedMenu(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('savedMenuId'));
    return c.json({ savedMenu }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof SavedMenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.patch('/families/:familyId/saved-menus/:savedMenuId/active', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json<{ active?: unknown }>();
    const savedMenu = await setSavedMenuActive(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('savedMenuId'), body.active);
    return c.json({ savedMenu });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof SavedMenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.put('/families/:familyId/saved-menus/:savedMenuId/meals', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const savedMenu = await setSavedMenuMeal(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('savedMenuId'), await c.req.json());
    return c.json({ savedMenu });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof SavedMenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.delete('/families/:familyId/saved-menus/:savedMenuId/meals', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const savedMenu = await clearSavedMenuMeal(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('savedMenuId'), c.req.query('dayOfWeek'), c.req.query('mealType'));
    return c.json({ savedMenu });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof SavedMenuServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.post('/families/:familyId/saved-menus/:savedMenuId/apply', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json<{ weekStartDate?: unknown }>();
    const menu = await applySavedMenuToWeek(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('savedMenuId'), body.weekStartDate);
    return c.json({ menu });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof SavedMenuServiceError || error instanceof MenuServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    }
    throw error;
  }
});

app.post('/families/:familyId/saved-menus/:savedMenuId/shopping-list', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const list = await createShoppingListFromSavedMenu(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('savedMenuId'));
    return c.json({ list }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof SavedMenuServiceError || error instanceof ShoppingServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    }
    throw error;
  }
});

app.get('/families/:familyId/shopping-lists', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const lists = await listShoppingLists(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json({ lists });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ShoppingServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.get('/families/:familyId/shopping-lists/:listId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const list = await getShoppingList(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('listId'));
    return c.json({ list });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ShoppingServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/shopping-lists', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const list = await createShoppingList(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json({ list }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ShoppingServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.patch('/families/:familyId/shopping-lists/:listId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const list = await updateShoppingList(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('listId'), await c.req.json());
    return c.json({ list });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ShoppingServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/shopping-lists/:listId/complete', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const list = await completeShoppingList(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('listId'));
    return c.json({ list });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ShoppingServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.delete('/families/:familyId/shopping-lists/:listId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await deleteShoppingList(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('listId'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ShoppingServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/shopping-lists/:listId/items', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const list = await addShoppingItem(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('listId'), await c.req.json());
    return c.json({ list }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ShoppingServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.patch('/families/:familyId/shopping-lists/:listId/items/:itemId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const list = await updateShoppingItem(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('listId'), c.req.param('itemId'), await c.req.json());
    return c.json({ list });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ShoppingServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.delete('/families/:familyId/shopping-lists/:listId/items/:itemId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const list = await deleteShoppingItem(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('listId'), c.req.param('itemId'));
    return c.json({ list });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ShoppingServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.patch('/families/:familyId/shopping-lists/:listId/items/:itemId/purchased', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json<{ purchased?: unknown }>();
    const list = await setShoppingItemPurchased(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('listId'), c.req.param('itemId'), body.purchased);
    return c.json({ list });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ShoppingServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/shopping-lists/:listId/items/clear-purchased', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const list = await clearPurchasedItems(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('listId'));
    return c.json({ list });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ShoppingServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
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

app.get('/families/:familyId/messages/unread-count', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const unreadCount = await getGroupChatUnreadCount(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId')
    );
    return c.json({ unreadCount });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ChatServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    }
    throw error;
  }
});

app.patch('/families/:familyId/messages/read', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json<{ messageId?: unknown }>();
    await markGroupChatRead(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      body.messageId
    );
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ChatServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    }
    throw error;
  }
});

app.get('/families/:familyId/private-conversations', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const conversations = await listPrivateConversations(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId')
    );
    return c.json({ conversations });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PrivateChatServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    }
    throw error;
  }
});

app.post('/families/:familyId/private-conversations', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json<{ recipientMemberId?: unknown }>();
    const conversation = await startPrivateConversation(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      body.recipientMemberId
    );
    return c.json({ conversation }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PrivateChatServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    }
    throw error;
  }
});

app.get('/families/:familyId/private-conversations/:conversationId/messages', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    return c.json(await listPrivateMessages(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      c.req.param('conversationId')
    ));
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PrivateChatServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    }
    throw error;
  }
});

app.post('/families/:familyId/private-conversations/:conversationId/messages', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const message = await createPrivateMessage(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      c.req.param('conversationId'),
      await c.req.json()
    );
    return c.json({ message }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ChatServiceError || error instanceof PrivateChatServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    }
    throw error;
  }
});

app.patch('/families/:familyId/private-conversations/:conversationId/read', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json<{ messageId?: unknown }>();
    await markPrivateConversationRead(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      c.req.param('conversationId'),
      body.messageId
    );
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof PrivateChatServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
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

app.post('/families/:familyId/plan-events', sessionMiddleware, async (c) => {
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

app.patch('/families/:familyId/plan-events/:eventId', sessionMiddleware, async (c) => {
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

app.delete('/families/:familyId/plan-events/:eventId', sessionMiddleware, async (c) => {
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

app.get('/families/:familyId/events', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const events = await listCalendarEvents(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      c.req.query('from'),
      c.req.query('to')
    );
    return c.json({ events });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof CalendarServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    }
    throw error;
  }
});

app.get('/families/:familyId/events/:eventId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const event = await getCalendarEvent(
      createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('eventId')
    );
    return c.json({ event });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof CalendarServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    }
    throw error;
  }
});

app.post('/families/:familyId/events', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const event = await createCalendarEvent(
      createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json()
    );
    return c.json({ event }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof CalendarServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    }
    throw error;
  }
});

app.patch('/families/:familyId/events/:eventId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const event = await updateCalendarEvent(
      createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('eventId'), await c.req.json()
    );
    return c.json({ event });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof CalendarServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    }
    throw error;
  }
});

app.delete('/families/:familyId/events/:eventId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await deleteCalendarEvent(
      createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('eventId')
    );
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof CalendarServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    }
    throw error;
  }
});

// F22 — the unified Family Calendar timeline: manual events (as above) plus a read-only,
// dynamically-aggregated view of other features' own dated items. See
// calendar-timeline-service.ts for why nothing is copied into a new table.
app.get('/families/:familyId/calendar/timeline', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const result = await getCalendarTimeline(
      createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.query('from'), c.req.query('to')
    );
    return c.json(result);
  } catch (error) {
    if (
      error instanceof FamilyServiceError ||
      error instanceof CalendarServiceError ||
      error instanceof ChoreServiceError ||
      error instanceof ShoppingServiceError ||
      error instanceof PollServiceError ||
      error instanceof TimeCapsuleServiceError
    ) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
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
    const storage = createObjectStorage(c.env);
    if (!storage) return c.json({ error: 'Photo storage is not configured yet.', code: 'storage_unavailable' }, 503);
    const object = await storage.get(objectKey);
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
      createObjectStorage(c.env)
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
    await deleteMemory(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('memoryId'), createObjectStorage(c.env));
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

app.get('/families/:familyId/time-capsules/:capsuleId/attachments/:attachmentId/media', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const { objectKey, mimeType } = await getTimeCapsuleAttachmentMedia(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      c.req.param('capsuleId'),
      c.req.param('attachmentId')
    );
    const storage = createObjectStorage(c.env);
    if (!storage) return c.json({ error: 'Photo storage is not configured yet.', code: 'storage_unavailable' }, 503);
    const object = await storage.get(objectKey);
    if (!object) return c.json({ error: 'Private capsule photo not found.', code: 'attachment_not_found' }, 404);
    return c.body(object.body, 200, {
      'Content-Type': mimeType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof TimeCapsuleServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409 | 413 | 415 | 502 | 503);
    }
    throw error;
  }
});

app.post('/families/:familyId/time-capsules', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const request = await readTimeCapsuleRequest(c.req.raw, false);
    return c.json(await createTimeCapsule(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      request.input,
      request.privatePhotos,
      createObjectStorage(c.env)
    ), 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof TimeCapsuleServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409 | 413 | 415 | 502 | 503);
    }
    throw error;
  }
});

app.patch('/families/:familyId/time-capsules/:capsuleId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const request = await readTimeCapsuleRequest(c.req.raw, true);
    return c.json(await updateTimeCapsule(
      createDatabase(c.env.DATABASE_URL),
      session.user.id,
      c.req.param('familyId'),
      c.req.param('capsuleId'),
      request.input,
      request.privatePhotos,
      createObjectStorage(c.env)
    ));
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof TimeCapsuleServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409 | 413 | 415 | 502 | 503);
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
      c.req.param('capsuleId'),
      createObjectStorage(c.env)
    );
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof TimeCapsuleServiceError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409 | 413 | 415 | 502 | 503);
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

app.get('/families/:familyId/location/shares/:shareId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const share = await getActiveShare(
      createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('shareId')
    );
    return c.json({ share });
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

app.post('/families/:familyId/location/come-find-me/start', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const share = await startComeFindMe(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json({ share }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof LocationServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.patch('/families/:familyId/location/come-find-me/me/audience', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const share = await updateComeFindMeAudience(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json({ share });
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

app.get('/families/:familyId/check-ins', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const checkIns = await listRecentCheckIns(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json({ checkIns });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof CheckInServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.post('/families/:familyId/check-ins', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const checkIn = await createCheckIn(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json({ checkIn }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof CheckInServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.get('/families/:familyId/emergencies', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const emergencies = await listEmergencies(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json(emergencies);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof EmergencyServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.get('/families/:familyId/emergencies/:incidentId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const incident = await getEmergency(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('incidentId'));
    return c.json({ incident });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof EmergencyServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/emergencies', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const incident = await createEmergency(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json({ incident }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof EmergencyServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/emergencies/:incidentId/acknowledge', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json().catch(() => ({}));
    const incident = await acknowledgeEmergency(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('incidentId'), body);
    return c.json({ incident });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof EmergencyServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.post('/families/:familyId/emergencies/:incidentId/resolve', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const incident = await resolveEmergency(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('incidentId'));
    return c.json({ incident });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof EmergencyServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404 | 409);
    throw error;
  }
});

app.get('/families/:familyId/notifications', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const result = await listNotifications(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json(result);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof NotificationServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.patch('/families/:familyId/notifications/:notificationId/read', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await markNotificationRead(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('notificationId'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof NotificationServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.post('/families/:familyId/notifications/read-all', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await markAllNotificationsRead(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof NotificationServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

// F20 — one aggregation endpoint over EXISTING per-feature list functions, each of which
// already re-derives eligibility itself; this route adds no privacy logic of its own.
app.get('/families/:familyId/daily-briefing', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const result = await getDailyBriefing(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json(result);
  } catch (error) {
    if (
      error instanceof FamilyServiceError ||
      error instanceof CalendarServiceError ||
      error instanceof ChoreServiceError ||
      error instanceof SavedMenuServiceError ||
      error instanceof ShoppingServiceError ||
      error instanceof PollServiceError ||
      error instanceof TimeCapsuleServiceError
    ) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

// F21 — same aggregation-over-existing-authorized-lists shape as daily-briefing above,
// just a broader (this-week + next-7-days) window.
app.get('/families/:familyId/weekly-recap', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const result = await getWeeklyRecap(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json(result);
  } catch (error) {
    if (
      error instanceof FamilyServiceError ||
      error instanceof CalendarServiceError ||
      error instanceof ChoreServiceError ||
      error instanceof SavedMenuServiceError ||
      error instanceof ShoppingServiceError ||
      error instanceof PollServiceError ||
      error instanceof TimeCapsuleServiceError ||
      error instanceof MemoriesServiceError
    ) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

// NOTE: this is intentionally "/chores", not "/tasks" — Plans already registers
// "/families/:familyId/tasks" (and its :taskId/completion sub-route) above for its own,
// unrelated single-assignee family_tasks feature. Reusing that path here silently shadowed
// every one of these handlers behind Plans' identical-looking routes (Hono matches the
// first-registered handler for an exact method+path), so every mutation from the F21 Tasks
// screen was actually hitting Plans' createTask/updateTask/deleteTask/setTaskCompletion —
// which is also why Plans' required due date ("Due date and time is required.") was
// surfacing on a form whose label says "optional". Only GETs were previously unaffected,
// since Plans never registered a matching GET path.
app.get('/families/:familyId/chores', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const tasks = await listChores(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'));
    return c.json({ tasks });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ChoreServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.get('/families/:familyId/chores/:taskId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const task = await getChore(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('taskId'));
    return c.json({ task });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ChoreServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.post('/families/:familyId/chores', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const task = await createChore(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), await c.req.json());
    return c.json({ task }, 201);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ChoreServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.patch('/families/:familyId/chores/:taskId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const task = await updateChore(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('taskId'), await c.req.json());
    return c.json({ task });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ChoreServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.delete('/families/:familyId/chores/:taskId', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await deleteChore(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('taskId'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ChoreServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
    throw error;
  }
});

app.patch('/families/:familyId/chores/:taskId/completion', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json<{ completed?: unknown }>();
    const task = await setChoreCompletion(createDatabase(c.env.DATABASE_URL), session.user.id, c.req.param('familyId'), c.req.param('taskId'), body.completed);
    return c.json({ task });
  } catch (error) {
    if (error instanceof FamilyServiceError || error instanceof ChoreServiceError) return c.json({ error: error.message, code: error.code }, error.status as 400 | 403 | 404);
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

export default {
  fetch: app.fetch,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runAllNotificationSweeps(createDatabase(env.DATABASE_URL)));
  }
} satisfies ExportedHandler<AuthBindings>;
