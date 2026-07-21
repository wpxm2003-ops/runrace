"use client";

import { useState, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n";
import { Button } from "@/app/_components/ui/Button";

type Props = {
  onShare: () => Promise<"shared" | "copied" | void> | Promise<void>;
  className?: string;
  variant?: "primary" | "secondary" | "destructive";
  children?: ReactNode;
  ariaLabel?: string;
};

const DEFAULT_CLASS =
  "inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

export function ShareButton({ onShare, className, variant, children, ariaLabel }: Props) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const result = await onShare();
      if (result === "copied") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (e) {
      console.error("share failed", e);
    } finally {
      setBusy(false);
    }
  }

  const label = busy ? t.share_busy : copied ? t.share_copied : t.share_btn;
  const accessibleLabel = ariaLabel ?? t.share_btn;

  if (variant) {
    return (
      <Button
        variant={variant}
        disabled={busy}
        onClick={handleClick}
        className={className}
        aria-label={accessibleLabel}
        title={accessibleLabel}
      >
        {children ?? label}
      </Button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={handleClick}
      className={className ?? DEFAULT_CLASS}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      {children ?? label}
    </button>
  );
}
