const WORKOUT_ID_PATTERN = /^\d+$/;

export function parseWorkoutId(value: string | null | undefined): number | null {
  if (!value || !WORKOUT_ID_PATTERN.test(value)) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

export function workoutStaticParamIds(): { id: string }[] {
  return Array.from({ length: 500 }, (_, i) => ({ id: String(i + 1) }));
}
