"use client";

import type { ReactNode } from "react";
import { PageLayout } from "@/app/_components/PageLayout";
import { Card } from "@/app/_components/ui/Card";
import { ShareButton } from "@/app/_components/ShareButton";
import { getAppUrl } from "@/lib/appUrl";
import { useLocale } from "@/lib/i18n";

/** "**볼드**" 마커가 들어간 번역문을 <strong>으로 렌더한다. */
function renderBold(text: string): ReactNode[] {
  return text.split("**").map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-zinc-900">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

/** iOS 공유 버튼 글리프(상자에서 위로 나가는 화살표). */
function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15V4" />
      <path d="M8 7l4-4 4 4" />
      <path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
    </svg>
  );
}

/** '홈 화면에 추가' 글리프(상자 안 +). */
function AddHomeGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function InstallVisual() {
  const { t } = useLocale();
  return (
    <div className="mb-4 flex items-center justify-center gap-4 rounded-xl bg-zinc-50 py-4">
      <div className="flex flex-col items-center gap-1.5 text-zinc-700">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-300 bg-white">
          <ShareGlyph />
        </span>
        <span className="text-[11px] text-zinc-500">{t.share_btn}</span>
      </div>
      <span aria-hidden className="text-lg text-zinc-400">
        →
      </span>
      <div className="flex flex-col items-center gap-1.5 text-zinc-700">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-300 bg-white">
          <AddHomeGlyph />
        </span>
        <span className="text-[11px] text-zinc-500">{t.ios_install_title}</span>
      </div>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{heading}</div>
      <div className="mt-2">{children}</div>
    </Card>
  );
}

export default function IosGuidePage() {
  const { t } = useLocale();

  async function onShare() {
    const { shareLink } = await import("@/lib/shareCard");
    return shareLink(`${getAppUrl()}/guides/ios`, t.guide_ios_title);
  }

  return (
    <PageLayout title={t.guide_ios_title} actions={<ShareButton onShare={onShare} />}>
      <Card>
        <p className="text-sm leading-relaxed text-zinc-700">{t.guide_ios_intro}</p>
      </Card>

      <Section heading={t.guide_ios_install_heading}>
        <InstallVisual />
        <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-700">
          {t.guide_ios_install_steps.map((step, i) => (
            <li key={i}>
              {step}
              {i === 0 ? (
                <div className="mt-1 text-xs text-zinc-500">
                  {t.guide_ios_install_safari_note}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </Section>

      <Section heading={t.guide_ios_run_heading}>
        <p className="text-sm leading-relaxed text-zinc-700">{t.guide_ios_run_body}</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">{t.guide_ios_run_temp_note}</p>
      </Section>

      <Section heading={t.guide_ios_noti_heading}>
        <p className="text-sm leading-relaxed text-zinc-700">
          {renderBold(t.guide_ios_noti_body)}
        </p>
        <p className="mt-3 text-base font-semibold text-zinc-900">
          {t.guide_ios_noti_emphasis}
        </p>
      </Section>
    </PageLayout>
  );
}
