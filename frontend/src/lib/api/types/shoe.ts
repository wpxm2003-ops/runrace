export type ShoeRow = {
  id: number;
  brand: string;
  model: string;
  nickname: string | null;
  targetDistanceM: number | null;
  active: boolean;
  totalDistanceM: number;
};

export type ShoeFormBody = {
  brand: string;
  model: string;
  nickname?: string | null;
  targetDistanceM?: number | null;
  active?: boolean;
};
