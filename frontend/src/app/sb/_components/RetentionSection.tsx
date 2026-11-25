"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  getAdminRetention,
  type AdminActiveUsers,
  type AdminRetention,
  type AdminRetentionCell,
} from "@/lib/api";
import {
  averageLabel,
  cohortWeekLabel,
  isWindowPartial,
  retentionRateLabel,
  visitCollectionDay,
} from "@/lib/adminRetention";

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-4 py-3">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-950">{value}</p>
      {note ? <p className="mt-0.5 text-[11px] text-zinc-400">{note}</p> : null}
    </div>
  );
}

function ActiveUsersPanel({
  title,
  description,
  stats,
  partialWeek,
  partialMonth,
}: {
  title: string;
  description: string;
  stats: AdminActiveUsers;
  /** WAU 7일 창에 수집이 완결되지 않은 날이 섞여 부분값인지. */
  partialWeek?: boolean;
  /** MAU 30일 창에 수집이 완결되지 않은 날이 섞여 부분값인지. */
  partialMonth?: boolean;
}) {
  const average = averageLabel(stats.avgDau7d);
  return (
    <div className="rounded-2xl border border-zinc-200 p-4">
      <h3 className="font-semibold text-zinc-900">{title}</h3>
      <p className="mt-1 text-xs text-zinc-400">{description}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="오늘 DAU" value={String(stats.dau)} note="오늘은 진행 중" />
        <Stat
          label="최근 7일 평균 DAU"
          value={average ?? "—"}
          note={average == null ? "집계할 날이 아직 없음" : `어제까지 ${stats.avgDauDays}일 평균`}
        />
        <Stat label="WAU (7일)" value={String(stats.wau)} note={partialWeek ? "7일 창에 수집 전 날 포함 — 부분값" : undefined} />
        <Stat label="MAU (30일)" value={String(stats.mau)} note={partialMonth ? "30일 창에 수집 전 날 포함 — 부분값" : undefined} />
      </div>
    </div>
  );
}

function RateCell({ cell }: { cell: AdminRetentionCell }) {
  const label = retentionRateLabel(cell);
  return (
    <td
      className={`whitespace-nowrap px-3 py-2.5 tabular-nums ${label ? "text-zinc-800" : "text-zinc-300"}`}
      title={label ? undefined : "판정할 수 있는 가입자가 아직 없음"}
    >
      {label ?? "—"}
    </td>
  );
}

/**
 * 재방문 지표 카드 — 방문 기준(배포 이후 쌓임)과 달리기 기준(과거 데이터로 바로 계산)을 나란히.
 * 대시보드 목록과 다른 엔드포인트라 따로 불러오고, 실패해도 목록 화면은 그대로 둔다.
 */
export function RetentionSection({ user }: { user: User }) {
  const [data, setData] = useState<AdminRetention | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getAdminRetention(user)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const collectionDay = data ? visitCollectionDay(data.visitCollectionStartDate, data.referenceDate) : 0;

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-100 px-5 py-4">
        <div>
          <h2 className="font-semibold text-zinc-900">활성 사용자 · 재방문</h2>
          <p className="mt-1 text-xs text-zinc-400">
            {data
              ? `기준일 ${data.referenceDate} (${data.referenceTimeZone}) · 날짜는 각 사용자의 현지 날짜 · 운영자 제외`
              : "날짜는 각 사용자의 현지 날짜 · 운영자 제외"}
          </p>
        </div>
        {data ? (
          <div className="text-right">
            <p className="text-xs text-zinc-500">최근 7일 신규 가입</p>
            <p className="text-2xl font-bold tabular-nums text-zinc-950">{data.newSignups7d}명</p>
          </div>
        ) : null}
      </div>

      {failed ? (
        <div className="px-5 py-8 text-sm text-red-600">재방문 지표를 불러오지 못했습니다.</div>
      ) : !data ? (
        <div className="px-5 py-8 text-sm text-zinc-400">재방문 지표를 계산하는 중...</div>
      ) : (
        <div className="space-y-5 px-5 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <ActiveUsersPanel
              title="방문 기준"
              description={
                data.visitCollectionStartDate
                  ? `앱·웹을 연 날(로그인 사용자) · ${data.visitCollectionStartDate}부터 수집, ${collectionDay}일째`
                  : "앱·웹을 연 날(로그인 사용자) · 아직 수집된 방문 기록이 없음"
              }
              stats={data.visits}
              partialWeek={isWindowPartial(data.visitCompleteFromDate, data.referenceDate, 7)}
              partialMonth={isWindowPartial(data.visitCompleteFromDate, data.referenceDate, 30)}
            />
            <ActiveUsersPanel
              title="달리기 기준"
              description="운동 기록의 시작 날짜(기기 현지) · 과거 기록 포함"
              stats={data.runs}
            />
          </div>

          <div>
            <h3 className="font-semibold text-zinc-900">가입 주별 재방문율 (최근 8주)</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-medium text-zinc-500">
                  <tr>
                    <th className="px-3 py-2.5" rowSpan={2}>가입 주</th>
                    <th className="px-3 py-2.5" rowSpan={2}>가입자</th>
                    <th className="px-3 pt-2.5 text-center" colSpan={2}>D1</th>
                    <th className="px-3 pt-2.5 text-center" colSpan={2}>D7</th>
                    <th className="px-3 pt-2.5 text-center" colSpan={2}>D30</th>
                  </tr>
                  <tr>
                    {["D1", "D7", "D30"].flatMap((d) => [
                      <th key={`${d}-v`} className="px-3 pb-2.5 font-normal">방문</th>,
                      <th key={`${d}-r`} className="px-3 pb-2.5 font-normal">달리기</th>,
                    ])}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.cohorts.map((cohort) => (
                    <tr key={cohort.weekStart} className="hover:bg-zinc-50">
                      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-900">
                        {cohortWeekLabel(cohort.weekStart, cohort.weekEnd)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-zinc-700">{cohort.size}명</td>
                      <RateCell cell={cohort.visits.d1} />
                      <RateCell cell={cohort.runs.d1} />
                      <RateCell cell={cohort.visits.d7} />
                      <RateCell cell={cohort.runs.d7} />
                      <RateCell cell={cohort.visits.d30} />
                      <RateCell cell={cohort.runs.d30} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="list-disc space-y-1 rounded-xl bg-zinc-50 py-3 pl-8 pr-4 text-xs leading-5 text-zinc-500">
            <li>
              <b className="text-zinc-700">D-n 재방문율</b>: 가입 후 정확히 n일째(가입일 다음 날이 D1, 사용자 현지 날짜)에
              활동한 가입자 비율. 그 사이 다른 날의 활동은 세지 않는다. 괄호는 (활동한 사람/판정 가능한 사람).
            </li>
            <li>
              그 날이 사용자 현지 기준으로 아직 끝나지 않은 가입자는 분모에서 뺀다. 방문 기준은 수집 시작(첫 핑) 전
              시간이 섞인 날짜도 판정하지 않는다 — 보통 배포 당일까지, KST 19시 이후 배포면 다음 날까지. 판정할
              사람이 없으면 —.
            </li>
            <li>
              <b className="text-zinc-700">DAU</b>: 그 날 활동한 사용자 수. <b className="text-zinc-700">최근 7일 평균</b>은
              오늘을 뺀 어제까지 7일의 일평균(방문 기준은 수집 첫날 제외). <b className="text-zinc-700">WAU·MAU</b>는 오늘
              포함 최근 7일·30일 동안 한 번이라도 활동한 사용자 수.
            </li>
            <li>
              방문 기준은 로그인 상태로 앱·웹을 연 날(하루 1회 핑), 달리기 기준은 운동 기록이 시작된 날.
              코호트는 가입 주(월~일), 탈퇴 회원 포함 · 운영자 제외. 탈퇴하면 그 회원의 방문 기록은 지워져
              방문 기준 과거 수치가 소급해 조금 줄 수 있다.
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}
