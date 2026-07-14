"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { formatDistance } from "@/lib/units";
import type { DistanceUnit } from "@/lib/units";
import { track } from "@/lib/analytics";
import { CARD_W, CARD_H, captureAndSaveCard } from "@/lib/storyCard";
import type { CrewRecap } from "@/lib/api/types";
import type { Translations } from "@/lib/i18n/translations";

/**
 * 크루 주간 결산 인스타 스토리 카드(1080×1920) — 오카방 공유용.
 * 캡처/저장은 lib/storyCard 공용 로직(MonthlyRecapCard와 동일 패턴).
 * 크루 합계 히어로 + MVP·횟수·1인당 보조 스탯.
 */
const COLOR = {
  gray: "#7E828B",
  green: "#34D399",
  divider: "#1F2127",
  footer: "#5C606A",
};

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

/** "2026-07-06" → "7.6" — 카드에 쓰는 짧은 날짜. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}.${Number(d)}`;
}

export function CrewRecapCard({
  crewName,
  memberCount,
  recap,
  unit,
  t,
}: {
  crewName: string;
  memberCount: number;
  recap: CrewRecap;
  unit: DistanceUnit;
  t: Translations;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const [distVal, distUnit] = formatDistance(recap.totalDistanceM, unit).split(" ");
  const stats: [string, string][] = [
    [t.crew_recap_mvp, recap.mvpNickname ?? "-"],
    [t.crew_recap_total_distance, formatDistance(recap.totalDistanceM, unit)],
    [t.crew_recap_participants, String(recap.participantCount)],
  ];

  async function onSave() {
    const node = cardRef.current;
    if (!node) return;
    setBusy(true);
    try {
      const result = await captureAndSaveCard(node, "runrace-crew-recap");
      if (result === "saved") void track("crew_recap_card_saved");
    } catch (e) {
      if ((e as { name?: string })?.name !== "AbortError") {
        toast.error(t.share_card_error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {busy ? t.share_card_busy : t.recap_share}
      </button>

      {/* 캡처 전용 오프스크린 카드 (1080×1920) */}
      <div
        aria-hidden="true"
        style={{ position: "fixed", left: "-99999px", top: 0, pointerEvents: "none" }}
      >
        <div
          ref={cardRef}
          style={{
            width: CARD_W,
            height: CARD_H,
            boxSizing: "border-box",
            padding: "120px 100px 90px",
            background: "linear-gradient(180deg, #0B0C10 0%, #17191F 100%)",
            color: "#FFFFFF",
            fontFamily: FONT,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* 크루명 + 주간 범위 */}
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -1 }}>
            {t.crew_recap_card_title(crewName)}
          </div>
          <div style={{ marginTop: 20, fontSize: 42, color: COLOR.gray }}>
            {shortDate(recap.weekStartDate)} – {shortDate(recap.weekEndDate)} ·{" "}
            {t.crew_recap_card_members(memberCount)}
          </div>

          {/* 크루 합계 히어로 */}
          <div style={{ marginTop: 110 }}>
            <div style={{ fontSize: 42, color: COLOR.gray, letterSpacing: 1 }}>
              {t.crew_week_total_label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginTop: 14 }}>
              <div style={{ fontSize: 230, fontWeight: 800, lineHeight: 1, letterSpacing: -4 }}>
                {distVal}
              </div>
              <div style={{ fontSize: 96, fontWeight: 700, color: COLOR.green }}>{distUnit}</div>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* MVP 하이라이트 */}
          {recap.mvpNickname ? (
            <div
              style={{
                borderRadius: 32,
                background: "#14161B",
                padding: "56px 64px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: 40, color: COLOR.green, fontWeight: 700 }}>
                  {t.crew_recap_mvp}
                </div>
                <div style={{ fontSize: 76, fontWeight: 700, marginTop: 12 }}>
                  {recap.mvpNickname}
                </div>
              </div>
              <div style={{ fontSize: 68, fontWeight: 600, color: COLOR.gray }}>
                {formatDistance(recap.mvpDistanceM, unit)}
              </div>
            </div>
          ) : null}

          {recap.leaders.length > 0 ? (
            <div
              style={{
                marginTop: 32,
                borderRadius: 32,
                background: "#101216",
                padding: "28px 40px",
              }}
            >
              {recap.leaders.map((leader, index) => (
                <div
                  key={`${leader.rank}-${leader.nickname ?? "unknown"}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 24,
                    padding: index === 0 ? "0 0 20px" : "20px 0 20px",
                    borderTop: index === 0 ? "none" : `1px solid ${COLOR.divider}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 20, minWidth: 0 }}>
                    <div
                      style={{
                        minWidth: 96,
                        fontSize: 34,
                        fontWeight: 700,
                        color: index === 0 ? COLOR.green : COLOR.gray,
                      }}
                    >
                      {t.prize_rank_label(leader.rank)}
                    </div>
                    <div
                      style={{
                        fontSize: 46,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {leader.nickname ?? t.no_name}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 40,
                      fontWeight: 600,
                      color: index === 0 ? COLOR.green : "#FFFFFF",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDistance(leader.distanceM, unit)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ flex: 1 }} />

          {/* 보조 스탯 — MVP / 총 거리 / 참여 인원 */}
          <div
            style={{
              paddingTop: 70,
              borderTop: `1px solid ${COLOR.divider}`,
              display: "flex",
            }}
          >
            {stats.map(([label, value]) => (
              <div key={label} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 40, color: COLOR.gray }}>{label}</div>
                <div style={{ fontSize: 72, fontWeight: 600, marginTop: 18 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* 푸터 */}
          <div style={{ marginTop: 90, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: COLOR.green }} />
            <div style={{ fontSize: 40, color: COLOR.footer }}>runrace.co.kr</div>
          </div>
        </div>
      </div>
    </>
  );
}
