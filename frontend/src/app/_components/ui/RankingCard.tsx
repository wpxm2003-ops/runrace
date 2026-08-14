import type { ReactNode } from "react";
import { Card } from "./Card";
import { SectionHeader } from "./SectionHeader";

export type RankingCardRow = {
  id: string | number;
  rank: number;
  label: ReactNode;
  value: ReactNode;
  isMe?: boolean;
};

export function RankingCard({
  title,
  action,
  rows,
}: {
  title: ReactNode;
  action?: ReactNode;
  rows: RankingCardRow[];
}) {
  return (
    <Card>
      <SectionHeader title={title} action={action} />
      <ol className="mt-4 divide-y divide-line">
        {rows.map((row) => (
          <li key={row.id} className="flex min-h-12 items-center gap-3 py-2.5">
            <span className={`rr-number w-6 text-center text-sm font-bold ${row.isMe ? "text-brand" : "text-muted"}`}>
              {row.rank}
            </span>
            <span className={`min-w-0 flex-1 truncate text-sm ${row.isMe ? "font-bold text-ink" : "font-medium text-ink"}`}>
              {row.label}
            </span>
            <span className="rr-number shrink-0 text-sm font-bold text-ink">{row.value}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
