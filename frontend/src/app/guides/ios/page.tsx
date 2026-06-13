"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Card } from "@/app/_components/ui/Card";
import { ShareButton } from "@/app/_components/ShareButton";
import { GuideNotificationSection } from "@/app/guides/_components/GuideNotificationSection";
import { getAppUrl } from "@/lib/appUrl";
import { useLocale } from "@/lib/i18n";

function InstallScreenshot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="mx-auto block w-full max-w-sm" />
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
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

      <Section heading={t.guide_ios_safari_heading}>
        <p className="text-sm leading-relaxed text-zinc-700">{t.guide_ios_safari_body}</p>
        <InstallScreenshot src="/guides/ios/open-in-safari.png" alt={t.guide_ios_safari_img_alt} />
      </Section>

      <Section heading={t.guide_ios_install_heading}>
        <ol className="list-decimal space-y-4 pl-5 text-sm leading-relaxed text-zinc-700">
          {t.guide_ios_install_steps.map((step, i) => (
            <li key={i}>
              {step}
              {i === 0 ? (
                <InstallScreenshot
                  src="/guides/ios/share-button.png"
                  alt={step}
                />
              ) : null}
              {i === 1 ? (
                <InstallScreenshot
                  src="/guides/ios/add-to-home.png"
                  alt={step}
                />
              ) : null}
            </li>
          ))}
        </ol>
      </Section>

      <Section heading={t.guide_ios_run_heading}>
        <p className="text-sm leading-relaxed text-zinc-700">{t.guide_ios_run_body}</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">{t.guide_ios_run_temp_note}</p>
      </Section>

      <GuideNotificationSection />
    </PageLayout>
  );
}
