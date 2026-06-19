import { Card } from "@/app/_components/ui/Card";
import { type CalendarCell, localDateKey } from "@/lib/workoutStats";

type Props = {
  weekdays: string[];
  calendarCells: CalendarCell[];
  activeDateKeys: Set<string>;
  selectedDateKey: string | null;
  today: Date;
  onSelectDay: (dateKey: string) => void;
};

export function WorkoutCalendar({
  weekdays,
  calendarCells,
  activeDateKeys,
  selectedDateKey,
  today,
  onSelectDay,
}: Props) {
  const todayKey = localDateKey(today.toISOString());

  return (
    <Card>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
        {weekdays.map((w) => (
          <div key={w} className="py-1 font-medium">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {calendarCells.map((cell, i) => {
          if (cell.day == null || !cell.dateKey) {
            return <div key={`empty-${i}`} className="aspect-square" />;
          }
          const hasWorkout = activeDateKeys.has(cell.dateKey);
          const isSelected = selectedDateKey === cell.dateKey;
          const isToday = cell.dateKey === todayKey;

          return (
            <button
              key={cell.dateKey}
              type="button"
              disabled={!hasWorkout}
              onClick={() => cell.dateKey && onSelectDay(cell.dateKey)}
              className={`aspect-square rounded-lg text-sm tabular-nums transition-colors ${
                hasWorkout
                  ? "font-bold text-zinc-900 hover:bg-zinc-100"
                  : "font-normal text-zinc-400"
              } ${
                isSelected
                  ? "bg-zinc-100 font-bold text-zinc-900 ring-2 ring-zinc-900 ring-offset-1"
                  : ""
              } ${isToday && !isSelected ? "ring-1 ring-zinc-300" : ""} disabled:cursor-default disabled:opacity-40`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
