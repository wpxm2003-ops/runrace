import { PageLayout } from "@/app/_components/PageLayout";

export default function Home() {
  return (
    <PageLayout title="RunRace">
      <p className="text-zinc-600">
        로그인/친구/대결/순위를 연결하는 MVP를 구현 중입니다.
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        KPI 이벤트는 로그인 후 `/api/analytics/events`로 기록됩니다.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <a
          href="/login"
          className="rounded-2xl bg-white p-5 shadow-sm hover:bg-zinc-50"
        >
          <div className="text-lg font-semibold">로그인</div>
          <div className="mt-1 text-sm text-zinc-600">
            Google / Apple 로그인
          </div>
        </a>
        <a
          href="/friends"
          className="rounded-2xl bg-white p-5 shadow-sm hover:bg-zinc-50"
        >
          <div className="text-lg font-semibold">친구</div>
          <div className="mt-1 text-sm text-zinc-600">
            초대 링크 생성 / 수락 / 친구 목록
          </div>
        </a>
        <a
          href="/challenges"
          className="rounded-2xl bg-white p-5 shadow-sm hover:bg-zinc-50"
        >
          <div className="text-lg font-semibold">대결</div>
          <div className="mt-1 text-sm text-zinc-600">
            50km 대결 생성 / 순위 보기
          </div>
        </a>
        <a
          href="/workout"
          className="rounded-2xl bg-white p-5 shadow-sm hover:bg-zinc-50"
        >
          <div className="text-lg font-semibold">운동하기</div>
          <div className="mt-1 text-sm text-zinc-600">
            GPS로 실시간 경로 기록
          </div>
        </a>
        <a
          href="/fitness"
          className="rounded-2xl bg-white p-5 shadow-sm hover:bg-zinc-50"
        >
          <div className="text-lg font-semibold">오늘 거리 동기화</div>
          <div className="mt-1 text-sm text-zinc-600">
            헬스 합산 거리 업로드(대결 누적 반영)
          </div>
        </a>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="text-lg font-semibold">다음 단계</div>
          <div className="mt-1 text-sm text-zinc-600">
            친구 초대 → 50km 대결 생성 → 오늘 거리 동기화
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
