"use client";

import { useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { useNativeBack } from "@/lib/useNativeBack";

/**
 * 이미지 탭 시 전체 화면으로 크게 본다. 배경 탭·✕·Android 백버튼으로 닫힘.
 * 이미지가 여러 장이면 좌우 화살표/스와이프로 넘기고 장수 카운터를 보여준다(단일 이미지면 자동으로 숨김).
 */
export function ImageLightbox({
  imageUrls,
  initialIndex = 0,
  alt = "",
  onClose,
}: {
  imageUrls: string[];
  initialIndex?: number;
  alt?: string;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [index, setIndex] = useState(initialIndex);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  useNativeBack(onClose);
  const imageUrl = imageUrls[index] ?? imageUrls[0];
  const hasMany = imageUrls.length > 1;
  const showPrevious = () => setIndex((cur) => (cur - 1 + imageUrls.length) % imageUrls.length);
  const showNext = () => setIndex((cur) => (cur + 1) % imageUrls.length);

  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (!hasMany || !touchStartRef.current) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx > 0) showPrevious();
    else showNext();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl touch-pan-y"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="absolute right-2 top-2 z-10 rounded-full bg-black/50 px-3 py-1.5 text-sm font-medium text-white"
        >
          {t.close}
        </button>
        <img
          src={imageUrl}
          alt={alt}
          className="max-h-[85vh] w-full rounded-2xl object-contain"
        />
        {hasMany ? (
          <>
            <button
              type="button"
              onClick={showPrevious}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-xl text-white"
            >
              {"<"}
            </button>
            <button
              type="button"
              onClick={showNext}
              aria-label="Next image"
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-xl text-white"
            >
              {">"}
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
              {index + 1} / {imageUrls.length}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
