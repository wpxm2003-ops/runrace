const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isRecordDateKey(value: string | null | undefined): value is string {
  if (!value || !DATE_KEY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function recordsDayHref(dateKey: string): string {
  return `/records/day?date=${encodeURIComponent(dateKey)}`;
}
