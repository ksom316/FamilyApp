export const MEMBER_CARD_STACK_BREAKPOINT = 520;
export const CHAT_EMPTY_COMPACT_BREAKPOINT = 600;

export function isStackedMemberCard(width: number) {
  return width < MEMBER_CARD_STACK_BREAKPOINT;
}

export function isCompactChatEmptyState(width: number) {
  return width < CHAT_EMPTY_COMPACT_BREAKPOINT;
}

type FamilyRole = 'owner' | 'guardian' | 'member';

export function canShowRemoveMember(
  actorId: string,
  actorRole: FamilyRole,
  targetId: string,
  targetRole: FamilyRole
) {
  if (actorId === targetId || targetRole === 'owner') return false;
  return actorRole === 'owner' || (actorRole === 'guardian' && targetRole === 'member');
}
