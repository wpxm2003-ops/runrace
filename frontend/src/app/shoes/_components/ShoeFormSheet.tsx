"use client";

import { useState } from "react";
import type { ShoeFormBody, ShoeRow } from "@/lib/api/types";
import { BottomSheet } from "@/app/_components/ui/BottomSheet";
import { SelectSheet } from "@/app/_components/ui/SelectSheet";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { goalInputFromKm, metersFromInput } from "@/lib/units";
import { handleAuthFailure } from "@/lib/auth";
import { toDisplayError, mapErrorMessage } from "@/lib/api";
import { useLocale } from "@/lib/i18n";

/** 브랜드 프리셋(고유명사라 비번역). 그 외는 직접 입력. */
const BRANDS = [
  "Nike", "Adidas", "Asics", "Hoka", "New Balance", "Brooks",
  "Saucony", "On", "Salomon", "Mizuno", "Puma", "Under Armour",
];
const OTHER = "__other__";

function brandSelectValue(brand: string): string {
  return BRANDS.includes(brand) ? brand : OTHER;
}

/**
 * 신발 등록/수정 바텀시트.
 * 부모가 열 때마다 remount(key)하므로 초기값은 useState 초기화로 채운다.
 */
export function ShoeFormSheet({
  shoe,
  unit,
  onSave,
  onClose,
}: {
  /** 수정 대상. null이면 신규 등록. */
  shoe: ShoeRow | null;
  unit: "km" | "mi";
  /** 저장 처리(생성/수정 + 캐시 갱신 + 토스트). 실패 시 throw. */
  onSave: (body: ShoeFormBody) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const editing = shoe != null;

  const [brandSel, setBrandSel] = useState(shoe ? brandSelectValue(shoe.brand) : BRANDS[0]);
  const [brandOpen, setBrandOpen] = useState(false);
  const [customBrand, setCustomBrand] = useState(
    shoe && !BRANDS.includes(shoe.brand) ? shoe.brand : "",
  );
  const [model, setModel] = useState(shoe?.model ?? "");
  const [nickname, setNickname] = useState(shoe?.nickname ?? "");
  const [target, setTarget] = useState(
    shoe?.targetDistanceM && shoe.targetDistanceM > 0
      ? goalInputFromKm(shoe.targetDistanceM / 1000, unit)
      : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 백버튼은 두 BottomSheet가 각자 소유 — 인터셉터가 LIFO 스택이라 브랜드 시트(나중 마운트)가 먼저 닫힌다(폼 유지).

  function mapError(e: unknown): string {
    return mapErrorMessage(
      e,
      [{ codes: ["shoe_limit_reached"], message: t.shoe_error_limit }],
      () => toDisplayError(e) ?? t.error_occurred,
    );
  }

  async function onSubmit() {
    if (submitting) return;
    const brand = (brandSel === OTHER ? customBrand : brandSel).trim();
    const modelV = model.trim();
    if (!brand) {
      setError(t.shoe_error_brand);
      return;
    }
    if (!modelV) {
      setError(t.shoe_error_model);
      return;
    }
    const targetM = target.trim() ? metersFromInput(target.trim(), unit) : null;
    const body: ShoeFormBody = {
      brand,
      model: modelV,
      nickname: nickname.trim() || null,
      targetDistanceM: targetM && targetM > 0 ? targetM : null,
    };

    setSubmitting(true);
    setError(null);
    try {
      await onSave(body);
      onClose();
    } catch (e) {
      if (!handleAuthFailure(e, "/shoes")) setError(mapError(e));
    } finally {
      setSubmitting(false);
    }
  }

  const brandOptions = [...BRANDS, OTHER];

  return (
    <>
    <BottomSheet
      onClose={onClose}
      panelClassName="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
    >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">
            {editing ? t.shoe_edit_heading : t.shoe_add_heading}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.shoe_cancel_edit}
            className="-mr-1 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
          <div className="block">
            <span className="text-xs font-medium text-zinc-600">{t.shoe_brand_label}</span>
            <button
              type="button"
              onClick={() => setBrandOpen(true)}
              className="mt-1 flex w-full items-center justify-between rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-sm focus:border-zinc-500 focus:outline-none"
            >
              <span>{brandSel === OTHER ? t.shoe_brand_other : brandSel}</span>
              <span className="ml-2 text-zinc-400">▾</span>
            </button>
          </div>

          {brandSel === OTHER ? (
            <input
              type="text"
              value={customBrand}
              onChange={(e) => setCustomBrand(stripForbiddenText(e.target.value).slice(0, 40))}
              placeholder={t.shoe_brand_custom_ph}
              maxLength={40}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          ) : null}

          <label className="block">
            <span className="text-xs font-medium text-zinc-600">{t.shoe_model_label}</span>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(stripForbiddenText(e.target.value).slice(0, 60))}
              placeholder={t.shoe_model_ph}
              maxLength={60}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-zinc-600">{t.shoe_nickname_label}</span>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(stripForbiddenText(e.target.value).slice(0, 40))}
              placeholder={t.shoe_nickname_ph}
              maxLength={40}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-zinc-600">{t.shoe_target_label}</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="500"
                className="w-32 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
              <span className="text-sm text-zinc-500">{unit}</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{t.shoe_target_hint}</p>
          </label>

          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>

        <div className="border-t border-zinc-100 px-5 py-4">
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm text-white disabled:opacity-50"
          >
            {submitting
              ? editing ? t.shoe_saving : t.shoe_adding
              : editing ? t.shoe_save_button : t.shoe_add_button}
          </button>
        </div>
    </BottomSheet>

    {brandOpen ? (
      <SelectSheet
        value={brandSel}
        options={brandOptions.map((b) => ({ value: b, label: b === OTHER ? t.shoe_brand_other : b }))}
        onSelect={setBrandSel}
        onClose={() => setBrandOpen(false)}
        zIndexClass="z-[110]"
        panelClassName="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white py-2 shadow-xl sm:rounded-2xl"
      />
    ) : null}
    </>
  );
}
