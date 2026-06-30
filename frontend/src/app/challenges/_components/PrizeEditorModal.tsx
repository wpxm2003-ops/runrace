"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { PrizeFormItem } from "@/lib/api/types";
import { uploadPrivateImage } from "@/lib/api/prizes";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { useLocale } from "@/lib/i18n";
import { useNativeBack } from "@/lib/useNativeBack";

const NAME_MAX = 60;

/** 모달 내부 작업용 행 — rank는 배열 순서(0→1등)로 도출. */
type Row = {
  name: string;
  /** 업로드 완료된 비공개 키. 이미지 없으면 null. */
  imageKey: string | null;
  /** 새로 올린 파일의 미리보기 object URL(있으면 표시). */
  previewUrl: string | null;
  /** 기존 이미지(수정 진입)인데 미리보기 없음 — '이미지 있음'만 표시. */
  hasExistingImage: boolean;
  uploading: boolean;
  error: string | null;
};

function toRow(p: PrizeFormItem): Row {
  return {
    name: p.name,
    imageKey: p.imageKey,
    previewUrl: null,
    hasExistingImage: p.imageKey != null,
    uploading: false,
    error: null,
  };
}

/**
 * 경품 추가/편집 모달("새 창"). N개의 경품을 위→아래 순서대로 1등·2등…으로 등록.
 * 각 경품: 경품명(필수) + 이미지(선택, 기프티콘 비공개 업로드).
 */
export function PrizeEditorModal({
  prizes,
  maxRank,
  user,
  onSave,
  onClose,
}: {
  prizes: PrizeFormItem[];
  /** 등록 가능한 최대 등수(= min(정원, 10)). */
  maxRank: number;
  user: User;
  onSave: (prizes: PrizeFormItem[]) => void;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [rows, setRows] = useState<Row[]>(() =>
    prizes.length ? prizes.map(toRow) : [{ name: "", imageKey: null, previewUrl: null, hasExistingImage: false, uploading: false, error: null }],
  );
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

  useNativeBack(onClose);

  // 새로 만든 object URL은 언마운트 시 해제(메모리 누수 방지).
  const previewsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const set = previewsRef.current;
    return () => set.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const cap = Math.max(1, Math.min(maxRank, 10));

  function patch(i: number, next: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...next } : r)));
  }

  function addRow() {
    setFormError(null);
    setRows((rs) =>
      rs.length >= cap
        ? rs
        : [...rs, { name: "", imageKey: null, previewUrl: null, hasExistingImage: false, uploading: false, error: null }],
    );
  }

  function removeRow(i: number) {
    setRows((rs) => {
      const target = rs[i];
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        previewsRef.current.delete(target.previewUrl);
      }
      return rs.filter((_, idx) => idx !== i);
    });
  }

  async function onPickImage(i: number, file: File | undefined) {
    if (!file) return;
    patch(i, { uploading: true, error: null });
    try {
      const key = await uploadPrivateImage(file, user);
      const preview = URL.createObjectURL(file);
      previewsRef.current.add(preview);
      // 기존 미리보기가 있으면 교체 전 해제.
      setRows((rs) =>
        rs.map((r, idx) => {
          if (idx !== i) return r;
          if (r.previewUrl) {
            URL.revokeObjectURL(r.previewUrl);
            previewsRef.current.delete(r.previewUrl);
          }
          return { ...r, imageKey: key, previewUrl: preview, hasExistingImage: false, uploading: false, error: null };
        }),
      );
    } catch (e) {
      const msg = String(e);
      patch(i, {
        uploading: false,
        error: msg.includes("upload_too_large") ? t.prize_err_too_large : t.prize_err_upload,
      });
    }
  }

  function clearImage(i: number) {
    setRows((rs) =>
      rs.map((r, idx) => {
        if (idx !== i) return r;
        if (r.previewUrl) {
          URL.revokeObjectURL(r.previewUrl);
          previewsRef.current.delete(r.previewUrl);
        }
        return { ...r, imageKey: null, previewUrl: null, hasExistingImage: false };
      }),
    );
  }

  function save() {
    const cleaned = rows.map((r) => ({ ...r, name: r.name.trim() }));
    if (cleaned.some((r) => r.uploading)) {
      setFormError(t.prize_err_wait_upload);
      return;
    }
    if (cleaned.length === 0) {
      // 빈 목록 저장 = 경품 없음.
      onSave([]);
      onClose();
      return;
    }
    if (cleaned.some((r) => !r.name)) {
      setFormError(t.prize_err_name_required);
      return;
    }
    const items: PrizeFormItem[] = cleaned.map((r, idx) => ({
      rank: idx + 1,
      name: r.name,
      imageKey: r.imageKey,
    }));
    onSave(items);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">{t.prize_modal_title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.prize_close}
            className="-mr-1 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
          <p className="text-[12px] leading-relaxed text-zinc-500">{t.prize_modal_hint}</p>

          {rows.map((r, i) => (
            <div key={i} className="rounded-xl border border-zinc-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-900">{t.prize_rank_label(i + 1)}</span>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="text-xs text-zinc-400 hover:text-red-500"
                >
                  {t.prize_remove}
                </button>
              </div>

              <input
                type="text"
                value={r.name}
                onChange={(e) => patch(i, { name: stripForbiddenText(e.target.value).slice(0, NAME_MAX), error: null })}
                placeholder={t.prize_name_placeholder}
                maxLength={NAME_MAX}
                className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />

              <div className="mt-2 flex items-center gap-3">
                {r.previewUrl ? (
                  <img src={r.previewUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
                ) : r.hasExistingImage ? (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-zinc-100 text-[10px] text-zinc-500">
                    {t.prize_image_existing}
                  </div>
                ) : null}

                <div className="flex flex-col gap-1">
                  <input
                    ref={(el) => {
                      fileInputs.current[i] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void onPickImage(i, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    disabled={r.uploading}
                    onClick={() => fileInputs.current[i]?.click()}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {r.uploading
                      ? t.prize_uploading
                      : r.imageKey || r.hasExistingImage
                        ? t.prize_image_replace
                        : t.prize_image_add}
                  </button>
                  {(r.imageKey || r.hasExistingImage) && !r.uploading ? (
                    <button
                      type="button"
                      onClick={() => clearImage(i)}
                      className="text-left text-[11px] text-zinc-400 hover:text-red-500"
                    >
                      {t.prize_image_remove}
                    </button>
                  ) : null}
                </div>
              </div>
              {r.error ? <p className="mt-1 text-[11px] text-red-600">{r.error}</p> : null}
            </div>
          ))}

          {rows.length < cap ? (
            <button
              type="button"
              onClick={addRow}
              className="rounded-xl border border-dashed border-zinc-300 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              {t.prize_add_row}
            </button>
          ) : (
            <p className="text-center text-[11px] text-zinc-400">{t.prize_max_hint(cap)}</p>
          )}

          {formError ? <p className="text-xs text-red-600">{formError}</p> : null}
        </div>

        <div className="border-t border-zinc-100 px-5 py-4">
          <button
            type="button"
            onClick={save}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm text-white"
          >
            {t.prize_done}
          </button>
        </div>
      </div>
    </div>
  );
}
