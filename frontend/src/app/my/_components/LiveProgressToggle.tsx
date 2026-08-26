"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import { useLiveProgressSetting, setLiveProgressSetting } from "@/lib/api";
import type { LiveProgressSetting } from "@/lib/api/types";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

/**
 * 실시간 진행률 공유 토글 — 공개 레이스·크루 레이스를 각각 켜고 끈다.
 * 기본값이 다른 것은 의도다(공개=꺼짐/동의 후 시작, 크루=켜짐/폐쇄 로스터). 다만 "끌 수
 * 있어야 한다"는 원칙은 두 축이 같아서, 크루도 토글을 준다.
 */
export function LiveProgressToggle({ user }: { user: User }) {
  const { t } = useLocale();
  const { data, isLoading, mutate } = useLiveProgressSetting(user);
  const [saving, setSaving] = useState<keyof LiveProgressSetting | null>(null);

  const current: LiveProgressSetting = {
    publicEnabled: data?.publicEnabled ?? false,
    crewEnabled: data?.crewEnabled ?? true,
  };

  async function onToggle(key: keyof LiveProgressSetting) {
    if (isLoading || saving) return;
    const next = !current[key];
    setSaving(key);
    void mutate({ ...current, [key]: next }, { revalidate: false }); // 낙관적 업데이트
    try {
      // 누른 축만 보낸다 — 두 필드를 함께 보내면 다른 축의 낡은 값까지 덮어쓴다.
      await setLiveProgressSetting(user, { [key]: next });
      void track("live_progress_toggle", { scope: key, enabled: next });
    } catch {
      void mutate(); // 실패 시 서버 값으로 되돌림
      toast.error(t.error_occurred);
    } finally {
      setSaving(null);
    }
  }

  const rows: { key: keyof LiveProgressSetting; label: string; desc: string }[] = [
    {
      key: "publicEnabled",
      label: t.my_live_sharing_public_label,
      desc: t.my_live_sharing_public_desc,
    },
    {
      key: "crewEnabled",
      label: t.my_live_sharing_crew_label,
      desc: t.my_live_sharing_crew_desc,
    },
  ];

  return (
    <Card className="mt-4">
      <div className="text-sm font-medium text-zinc-900">{t.my_live_sharing_title}</div>
      <div className="mt-3 flex flex-col gap-4">
        {rows.map(({ key, label, desc }) => {
          const enabled = current[key];
          return (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-zinc-900">{label}</div>
                <p className="mt-0.5 text-xs text-zinc-500">{desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={label}
                disabled={isLoading || saving != null}
                onClick={() => onToggle(key)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                  enabled ? "bg-brand" : "bg-zinc-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    enabled ? "left-[1.375rem]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
