import type { FamilyLocationShare } from '../lib/location';

export type FamilyMapProps = {
  shares: FamilyLocationShare[];
  selectedShareId: string | null;
  onSelect: (shareId: string) => void;
};
