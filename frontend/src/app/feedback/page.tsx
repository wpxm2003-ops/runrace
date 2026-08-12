"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PageLayout } from "@/app/_components/PageLayout";
import {
  createFeedback,
  uploadFeedbackImage,
  type FeedbackType,
} from "@/lib/api";
import { redirectToLogin } from "@/lib/auth";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { useLocale } from "@/lib/i18n";
import type { Translations } from "@/lib/i18n/translations";
import { useAuthUser } from "@/lib/useAuthUser";
import { toast } from "sonner";

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FEEDBACK_TYPES: FeedbackType[] = ["IDEA", "INCONVENIENCE", "BUG", "ETC"];

/** 아직 업로드하지 않은 첨부 사진 — 전송 시점에만 S3로 올린다. */
type PendingImage = { file: File; previewUrl: string };

function feedbackTypeLabel(value: FeedbackType, t: Translations): string {
  switch (value) {
    case "IDEA": return t.feedback_type_idea;
    case "INCONVENIENCE": return t.feedback_type_inconvenience;
    case "BUG": return t.feedback_type_bug;
    case "ETC": return t.feedback_type_etc;
  }
}

export default function FeedbackPage() {
  const { t } = useLocale();
  const { user, loading } = useAuthUser();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<FeedbackType | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 만들어 둔 미리보기 objectURL은 언마운트 시 해제(메모리 누수 방지).
  const previewsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const previews = previewsRef.current;
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!loading && !user) redirectToLogin("/feedback");
  }, [loading, user]);

  /**
   * 고른 사진은 업로드하지 않고 메모리에만 담는다(미리보기는 로컬 objectURL).
   * 실제 업로드는 전송 시점에만 — 작성 중 사진을 지우거나 폼을 이탈해도 S3에 고아 객체가 남지 않는다.
   */
  function addImages(files: FileList | null) {
    if (!files || submitting) return;
    const selected = Array.from(files);
    if (selected.length > MAX_IMAGES - images.length) {
      toast.error(t.feedback_err_image_count);
      return;
    }
    if (selected.some((file) => !ALLOWED_IMAGE_TYPES.has(file.type))) {
      toast.error(t.feedback_err_image_type);
      return;
    }
    if (selected.some((file) => file.size > MAX_IMAGE_BYTES)) {
      toast.error(t.feedback_err_image_size);
      return;
    }

    setFormError(null);
    setImages((current) =>
      [
        ...current,
        ...selected.map((file) => {
          const previewUrl = URL.createObjectURL(file);
          previewsRef.current.add(previewUrl);
          return { file, previewUrl };
        }),
      ].slice(0, MAX_IMAGES),
    );
  }

  function removeImage(index: number) {
    setImages((current) => {
      const target = current[index];
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        previewsRef.current.delete(target.previewUrl);
      }
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  async function submit() {
    if (!user || submitting) return;
    if (!type || !title.trim() || !content.trim()) {
      setFormError(t.feedback_err_required);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      // 사진 업로드는 여기서 한 번에 — 업로드가 실패하면 피드백 자체를 보내지 않는다.
      const imageUrls: string[] = [];
      try {
        for (const image of images) {
          imageUrls.push(await uploadFeedbackImage(image.file, user));
        }
      } catch {
        setFormError(t.feedback_err_upload);
        return;
      }

      await createFeedback(
        {
          type,
          title: title.trim(),
          content: content.trim(),
          imageUrls,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
          appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
        },
        user,
      );
      toast.success(t.feedback_success);
      router.replace("/");
    } catch {
      setFormError(t.feedback_err_submit);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <PageLayout maxWidth="max-w-md">
        <div className="py-20 text-center text-sm text-zinc-400">...</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t.feedback_title} maxWidth="max-w-md" className="pb-24">
      {/* 아이디어 초대와 문제 제보는 성격이 달라 문단을 나눈다 — 한 덩어리면 셋 다 흘려 읽힌다. */}
      <div className="mb-7 space-y-2 text-sm leading-6 text-zinc-600">
        <p>{t.feedback_desc}</p>
        <p>{t.feedback_desc_issue}</p>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-zinc-900">{t.feedback_type_label}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {FEEDBACK_TYPES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              aria-pressed={type === value}
              className={`h-11 rounded-lg border text-sm font-medium ${
                type === value
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700"
              }`}
            >
              {feedbackTypeLabel(value, t)}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-6 block text-sm font-semibold text-zinc-900" htmlFor="feedback-title">
        {t.feedback_title_label}
      </label>
      <input
        id="feedback-title"
        value={title}
        onChange={(event) =>
          setTitle(stripForbiddenText(event.target.value).slice(0, 120))
        }
        maxLength={120}
        placeholder={t.feedback_title_placeholder}
        className="mt-2 h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-500"
      />
      <div className="mt-1 text-right text-xs tabular-nums text-zinc-400">
        {title.length}/120
      </div>

      <label className="mt-5 block text-sm font-semibold text-zinc-900" htmlFor="feedback-content">
        {t.feedback_content_label}
      </label>
      <textarea
        id="feedback-content"
        value={content}
        onChange={(event) =>
          setContent(stripForbiddenText(event.target.value).slice(0, 5000))
        }
        maxLength={5000}
        rows={7}
        placeholder={t.feedback_content_placeholder}
        className="mt-2 w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-zinc-500"
      />
      <div className="mt-1 text-right text-xs tabular-nums text-zinc-400">
        {content.length}/5000
      </div>

      <div className="mt-5">
        <div className="text-sm font-semibold text-zinc-900">{t.feedback_image_label}</div>
        <p className="mt-1 text-xs text-zinc-400">{t.feedback_image_hint}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(event) => {
            void addImages(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {images.map((image, index) => (
            <div
              key={image.previewUrl}
              className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100"
            >
              <img src={image.previewUrl} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={t.feedback_image_remove}
                disabled={submitting}
                onClick={() => removeImage(index)}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-lg leading-none text-white disabled:opacity-50"
              >
                ×
              </button>
            </div>
          ))}
          {images.length < MAX_IMAGES ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-zinc-500 disabled:opacity-50"
            >
              <span className="text-2xl leading-none">+</span>
              <span className="mt-1 text-xs">{t.feedback_image_add}</span>
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs tabular-nums text-zinc-400">
          {images.length}/{MAX_IMAGES}
        </p>
      </div>

      {formError ? <p className="mt-5 text-sm text-red-600">{formError}</p> : null}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitting || !type || !title.trim() || !content.trim()}
        className="mt-6 h-12 w-full rounded-lg bg-zinc-900 text-sm font-semibold text-white disabled:bg-zinc-300"
      >
        {submitting ? t.feedback_submitting : t.feedback_submit}
      </button>
    </PageLayout>
  );
}
