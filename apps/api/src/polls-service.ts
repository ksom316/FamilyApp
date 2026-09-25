import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import {
  familyMembers,
  familyPollOptions,
  familyPolls,
  familyPollVotes,
  householdMembers,
  households,
  users
} from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 10;

export type PollErrorCode =
  | 'invalid_poll'
  | 'invalid_option'
  | 'invalid_options'
  | 'invalid_question'
  | 'invalid_description'
  | 'invalid_closes_at'
  | 'invalid_household'
  | 'household_not_eligible'
  | 'poll_not_found'
  | 'poll_closed'
  | 'poll_has_votes'
  | 'forbidden_poll_action';

export class PollServiceError extends Error {
  constructor(public readonly code: PollErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'PollServiceError';
  }
}

function assertUuid(value: string, kind: 'poll' | 'option' | 'household' = 'poll') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    const code = kind === 'poll' ? 'invalid_poll' : kind === 'option' ? 'invalid_option' : 'invalid_household';
    throw new PollServiceError(code, `The ${kind} identifier is not valid.`);
  }
}

function readQuestion(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 200) {
    throw new PollServiceError('invalid_question', 'Question must be between 1 and 200 characters.');
  }
  return value.trim();
}

function readPollDescription(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 1000) {
    throw new PollServiceError('invalid_description', 'Description must be 1,000 characters or fewer.');
  }
  return value.trim() || null;
}

function readOptions(value: unknown) {
  if (!Array.isArray(value) || value.length < MIN_OPTIONS || value.length > MAX_OPTIONS) {
    throw new PollServiceError('invalid_options', `Choose between ${MIN_OPTIONS} and ${MAX_OPTIONS} options.`);
  }
  return value.map((option) => {
    if (typeof option !== 'string' || option.trim().length < 1 || option.trim().length > 140) {
      throw new PollServiceError('invalid_options', 'Each option must be between 1 and 140 characters.');
    }
    return option.trim();
  });
}

function readClosesAt(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new PollServiceError('invalid_closes_at', 'Choose a valid closing date and time.');
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    throw new PollServiceError('invalid_closes_at', 'Choose a closing date and time in the future.');
  }
  return date;
}

function isPollClosed(poll: { closedAt: Date | null; closesAt: Date | null }) {
  return Boolean(poll.closedAt) || Boolean(poll.closesAt && poll.closesAt.getTime() <= Date.now());
}

// A household poll may only be created by someone who currently belongs to that
// household. Since household_members rows are themselves family-scoped, this single
// lookup also confirms the household belongs to this family — no separate check needed.
async function assertHouseholdEligible(db: Database, familyId: string, householdId: string, memberId: string) {
  const [row] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, memberId)))
    .limit(1);
  if (!row) throw new PollServiceError('household_not_eligible', 'You can only create a poll for a group you belong to.', 403);
}

const pollBaseSelection = {
  id: familyPolls.id,
  familyId: familyPolls.familyId,
  householdId: familyPolls.householdId,
  householdName: households.name,
  question: familyPolls.question,
  description: familyPolls.description,
  closesAt: familyPolls.closesAt,
  closedAt: familyPolls.closedAt,
  createdByMemberId: familyPolls.createdByMemberId,
  createdAt: familyPolls.createdAt,
  updatedAt: familyPolls.updatedAt,
  createdBy: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image
  }
};

async function selectPollRows(db: Database, where: SQL) {
  return db
    .select(pollBaseSelection)
    .from(familyPolls)
    .innerJoin(familyMembers, and(eq(familyPolls.createdByMemberId, familyMembers.id), eq(familyPolls.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .leftJoin(households, and(eq(familyPolls.householdId, households.id), eq(familyPolls.familyId, households.familyId)))
    .where(where)
    .orderBy(desc(familyPolls.createdAt));
}

async function hydratePolls(db: Database, memberId: string, pollRows: Awaited<ReturnType<typeof selectPollRows>>) {
  if (pollRows.length === 0) return [];
  const pollIds = pollRows.map((row) => row.id);

  const [optionRows, voteCountRows, myVoteRows] = await Promise.all([
    db.select({ id: familyPollOptions.id, pollId: familyPollOptions.pollId, text: familyPollOptions.text })
      .from(familyPollOptions)
      .where(inArray(familyPollOptions.pollId, pollIds))
      .orderBy(asc(familyPollOptions.position)),
    db.select({ pollId: familyPollVotes.pollId, optionId: familyPollVotes.optionId, count: sql<number>`count(*)::int` })
      .from(familyPollVotes)
      .where(inArray(familyPollVotes.pollId, pollIds))
      .groupBy(familyPollVotes.pollId, familyPollVotes.optionId),
    db.select({ pollId: familyPollVotes.pollId, optionId: familyPollVotes.optionId })
      .from(familyPollVotes)
      .where(and(inArray(familyPollVotes.pollId, pollIds), eq(familyPollVotes.memberId, memberId)))
  ]);

  const optionsByPoll = new Map<string, { id: string; text: string }[]>();
  for (const option of optionRows) {
    const list = optionsByPoll.get(option.pollId) ?? [];
    list.push(option);
    optionsByPoll.set(option.pollId, list);
  }

  const countsByOption = new Map<string, number>();
  for (const row of voteCountRows) countsByOption.set(row.optionId, row.count);

  const myVoteByPoll = new Map(myVoteRows.map((row) => [row.pollId, row.optionId]));

  return pollRows.map((poll) => {
    const options = (optionsByPoll.get(poll.id) ?? []).map((option) => ({ id: option.id, text: option.text, votes: countsByOption.get(option.id) ?? 0 }));
    const totalVotes = options.reduce((sum, option) => sum + option.votes, 0);
    return {
      id: poll.id,
      familyId: poll.familyId,
      household: poll.householdId ? { id: poll.householdId, name: poll.householdName ?? 'Group' } : null,
      question: poll.question,
      description: poll.description,
      closesAt: poll.closesAt,
      closedAt: poll.closedAt,
      isClosed: isPollClosed(poll),
      createdByMemberId: poll.createdByMemberId,
      createdBy: poll.createdBy,
      createdAt: poll.createdAt,
      updatedAt: poll.updatedAt,
      totalVotes,
      myOptionId: myVoteByPoll.get(poll.id) ?? null,
      options: options.map((option) => ({
        ...option,
        percentage: totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0
      }))
    };
  });
}

export async function listPolls(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);

  const myHouseholds = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(and(eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, membership.id)));
  const myHouseholdIds = myHouseholds.map((row) => row.householdId);

  // Eligible polls are: whole-family polls (householdId null) plus polls targeted at any
  // household the caller currently belongs to. Owner/guardian status grants nothing extra
  // here — eligibility is membership-only.
  const eligibility = myHouseholdIds.length > 0
    ? or(isNull(familyPolls.householdId), inArray(familyPolls.householdId, myHouseholdIds))
    : isNull(familyPolls.householdId);

  const rows = await selectPollRows(db, and(eq(familyPolls.familyId, familyId), eligibility)!);
  return hydratePolls(db, membership.id, rows);
}

async function requireEligiblePoll(db: Database, userId: string, familyId: string, pollId: string) {
  assertUuid(pollId);
  const membership = await requireFamilyMembership(db, userId, familyId);

  const [poll] = await db.select().from(familyPolls).where(and(eq(familyPolls.id, pollId), eq(familyPolls.familyId, familyId))).limit(1);
  if (!poll) throw new PollServiceError('poll_not_found', 'Poll not found.', 404);

  if (poll.householdId) {
    const [membershipRow] = await db
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, poll.householdId), eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, membership.id)))
      .limit(1);
    // Deliberately the same not-found error as a genuinely missing poll: a guessed poll id
    // must never reveal that a household poll exists to someone outside that household.
    if (!membershipRow) throw new PollServiceError('poll_not_found', 'Poll not found.', 404);
  }

  return { membership, poll };
}

export async function getPoll(db: Database, userId: string, familyId: string, pollId: string) {
  const { membership } = await requireEligiblePoll(db, userId, familyId, pollId);
  const rows = await selectPollRows(db, and(eq(familyPolls.id, pollId), eq(familyPolls.familyId, familyId))!);
  const [hydrated] = await hydratePolls(db, membership.id, rows);
  if (!hydrated) throw new PollServiceError('poll_not_found', 'Poll not found.', 404);
  return hydrated;
}

type CreatePollInput = { question?: unknown; description?: unknown; options?: unknown; closesAt?: unknown; householdId?: unknown };

export async function createPoll(db: Database, userId: string, familyId: string, input: CreatePollInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const question = readQuestion(input.question);
  const description = readPollDescription(input.description);
  const options = readOptions(input.options);
  const closesAt = readClosesAt(input.closesAt);

  let householdId: string | null = null;
  if (input.householdId !== undefined && input.householdId !== null && input.householdId !== '') {
    if (typeof input.householdId !== 'string') throw new PollServiceError('invalid_household', 'Choose a valid group.');
    assertUuid(input.householdId, 'household');
    await assertHouseholdEligible(db, familyId, input.householdId, membership.id);
    householdId = input.householdId;
  }

  const pollId = crypto.randomUUID();
  const pollInsert = db.insert(familyPolls).values({ id: pollId, familyId, householdId, createdByMemberId: membership.id, question, description, closesAt });
  const optionsInsert = db.insert(familyPollOptions).values(options.map((text, index) => ({ familyId, pollId, text, position: index })));
  await db.batch([pollInsert, optionsInsert] as const);

  return getPoll(db, userId, familyId, pollId);
}

export async function voteOnPoll(db: Database, userId: string, familyId: string, pollId: string, rawOptionId: unknown) {
  const { membership, poll } = await requireEligiblePoll(db, userId, familyId, pollId);
  if (isPollClosed(poll)) throw new PollServiceError('poll_closed', 'This poll is closed.', 409);

  if (typeof rawOptionId !== 'string') throw new PollServiceError('invalid_option', 'Choose an option to vote for.');
  assertUuid(rawOptionId, 'option');
  const [option] = await db.select({ id: familyPollOptions.id }).from(familyPollOptions).where(and(eq(familyPollOptions.id, rawOptionId), eq(familyPollOptions.pollId, pollId))).limit(1);
  if (!option) throw new PollServiceError('invalid_option', 'That option is not part of this poll.');

  // One row per (poll, member): a repeat vote updates optionId in place rather than
  // inserting a second row, so changing your vote never creates a duplicate.
  await db
    .insert(familyPollVotes)
    .values({ familyId, pollId, memberId: membership.id, optionId: rawOptionId })
    .onConflictDoUpdate({
      target: [familyPollVotes.pollId, familyPollVotes.memberId],
      set: { optionId: rawOptionId, updatedAt: new Date() }
    });

  return getPoll(db, userId, familyId, pollId);
}

// Manual close is creator-only — owner/guardian role grants no special ability to close
// someone else's poll, per spec.
export async function closePoll(db: Database, userId: string, familyId: string, pollId: string) {
  const { membership, poll } = await requireEligiblePoll(db, userId, familyId, pollId);
  if (poll.createdByMemberId !== membership.id) {
    throw new PollServiceError('forbidden_poll_action', 'Only the poll creator can close it.', 403);
  }
  if (!poll.closedAt) {
    await db.update(familyPolls).set({ closedAt: new Date(), updatedAt: new Date() }).where(and(eq(familyPolls.id, pollId), eq(familyPolls.familyId, familyId)));
  }
  return getPoll(db, userId, familyId, pollId);
}

// Simple, conservative delete: creator-only, and only while the poll has zero votes.
// FK cascades handle removing its options; nothing else references a voteless poll.
export async function deletePoll(db: Database, userId: string, familyId: string, pollId: string) {
  const { membership, poll } = await requireEligiblePoll(db, userId, familyId, pollId);
  if (poll.createdByMemberId !== membership.id) {
    throw new PollServiceError('forbidden_poll_action', 'Only the poll creator can delete it.', 403);
  }
  const [existingVote] = await db.select({ id: familyPollVotes.id }).from(familyPollVotes).where(and(eq(familyPollVotes.pollId, pollId), eq(familyPollVotes.familyId, familyId))).limit(1);
  if (existingVote) throw new PollServiceError('poll_has_votes', 'This poll already has votes and cannot be deleted.', 409);

  await db.delete(familyPolls).where(and(eq(familyPolls.id, pollId), eq(familyPolls.familyId, familyId)));
}
