import { createContext, useContext } from 'react';

import type { FamilyMembership } from './families';

export const FamilyContext = createContext<FamilyMembership | null>(null);

export function useCurrentFamily() {
  const family = useContext(FamilyContext);
  if (!family) throw new Error('useCurrentFamily must be used inside an authenticated family route.');
  return family;
}
