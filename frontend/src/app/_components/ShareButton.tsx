"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n";

type Props = {
  /** 이미지 카드를 만들어 공유까지 수행하는 비동기 함수 */
  onShare: () => Promise<void>;
  className?: string;
};

const DEFAULT_CLASS =
  "inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

export function ShareButton({ onShare, className }: Props) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onShare();
        } catch (e) {
          console.error("share failed", e);
        } finally {
          setBusy(false);
        }
      }}
      className={className ?? DEFAULT_CLASS}
    >
      {busy ? t.share_busy : `📤 ${t.share_btn}`}
    </button>
  );
}
