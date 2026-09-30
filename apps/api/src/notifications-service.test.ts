import { describe, expect, it } from 'vitest';
import { isNull } from 'drizzle-orm';

import { familyMembers } from '@familyapp/db/schema';
import { familyMemberIds } from './notifications-service';

const familyId = '11111111-1111-4111-8111-111111111111';
const activeA = '22222222-2222-4222-8222-222222222222';
const activeB = '33333333-3333-4333-8333-333333333333';
const departed = '44444444-4444-4444-8444-444444444444';

// Recursively check whether a captured Drizzle condition references a specific column
// object, without depending on Drizzle's internal SQL-chunk shape beyond "it's a plain
// nested structure". Used so the fake db only excludes departed rows when the real query
// actually asked for isNull(leftAt) — if that filter is ever removed, this check (and so
// the exclusion) stops applying, rather than the test silently asserting a fixed answer.
function referencesColumn(value: unknown, column: unknown, seen = new Set<unknown>()): boolean {
  if (value === column) return true;
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value as object).some((child) => referencesColumn(child, column, seen));
}

function familyMembersDb(rows: { id: string; leftAt: Date | null }[]) {
  return {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          const filtered = referencesColumn(condition, familyMembers.leftAt)
            ? rows.filter((row) => row.leftAt === null)
            : rows;
          return Promise.resolve(filtered.map((row) => ({ id: row.id })));
        }
      })
    })
  };
}

describe('familyMemberIds', () => {
  it('excludes a member who has left the family', async () => {
    const db = familyMembersDb([
      { id: activeA, leftAt: null },
      { id: activeB, leftAt: null },
      { id: departed, leftAt: new Date('2026-01-01') }
    ]);

    const ids = await familyMemberIds(db as never, familyId);

    expect(ids.sort()).toEqual([activeA, activeB].sort());
    expect(ids).not.toContain(departed);
  });

  it('queries with a filter that genuinely references familyMembers.leftAt', async () => {
    let captured: unknown;
    const db = {
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            captured = condition;
            return Promise.resolve([]);
          }
        })
      })
    };
    await familyMemberIds(db as never, familyId);
    expect(referencesColumn(captured, familyMembers.leftAt)).toBe(true);
    expect(referencesColumn(isNull(familyMembers.leftAt), familyMembers.leftAt)).toBe(true);
  });

  it('returns an empty list when every member has left', async () => {
    const db = familyMembersDb([{ id: departed, leftAt: new Date() }]);
    expect(await familyMemberIds(db as never, familyId)).toEqual([]);
  });
});
