"use client";

type Props = {
  src: string;
  alt?: string;
  onClose: () => void;
};

/** 이미지 탭 시 전체 화면으로 크게 본다. 배경 탭하면 닫힘. */
export function ImageLightbox({ src, alt = "", onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      role="presentation"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className="max-h-[85dvh] max-w-full rounded-lg object-contain shadow-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
