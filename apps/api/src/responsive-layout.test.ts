import { describe, expect, it } from 'vitest';

import {
  canShowRemoveMember,
  isCompactChatEmptyState,
  isStackedMemberCard
} from '../../mobile/lib/responsive-layout';

describe('narrow-screen responsive decisions', () => {
  it('stacks member controls on phone widths without changing tablet or desktop cards', () => {
    expect(isStackedMemberCard(390)).toBe(true);
    expect(isStackedMemberCard(519)).toBe(true);
    expect(isStackedMemberCard(520)).toBe(false);
    expect(isStackedMemberCard(1200)).toBe(false);
  });

  it('compacts empty chats only where vertical phone space is constrained', () => {
    expect(isCompactChatEmptyState(390)).toBe(true);
    expect(isCompactChatEmptyState(599)).toBe(true);
    expect(isCompactChatEmptyState(600)).toBe(false);
    expect(isCompactChatEmptyState(1200)).toBe(false);
  });

  it('preserves owner, guardian, member, self, and non-removable controls', () => {
    expect(canShowRemoveMember('owner', 'owner', 'guardian', 'guardian')).toBe(true);
    expect(canShowRemoveMember('owner', 'owner', 'member', 'member')).toBe(true);
    expect(canShowRemoveMember('guardian', 'guardian', 'member', 'member')).toBe(true);
    expect(canShowRemoveMember('guardian', 'guardian', 'owner', 'owner')).toBe(false);
    expect(canShowRemoveMember('member-a', 'member', 'member-b', 'member')).toBe(false);
    expect(canShowRemoveMember('same', 'owner', 'same', 'owner')).toBe(false);
  });
});
