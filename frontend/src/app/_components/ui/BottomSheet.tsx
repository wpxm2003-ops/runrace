"use client";

import type { ReactNode } from "react";
import { useNativeBack } from "@/lib/useNativeBack";

/**
 * 바텀시트 공통 오버레이 — 배경 오버레이·패널·바깥탭 닫기(stopPropagation)·Android
 * 백버튼(useNativeBack)을 소유한다. 헤더/바디/푸터 레이아웃은 화면마다 달라 강제하지
 * 않고 children으로 그대로 둔다.
 *
 * zIndexClass/panelClassName은 중첩 시트(z-[110])나 헤더+스크롤바디+푸터 레이아웃처럼
 * 화면별로 다른 값을 그대로 넘기기 위한 것 — Tailwind JIT가 인식하도록 리터럴 클래스
 * 문자열로 호출부에서 넘긴다(동적 조합 금지).
 */
export function BottomSheet({
  onClose,
  zIndexClass = "z-[100]",
  panelClassName = "w-full max-w-md rounded-t-2xl bg-white shadow-xl sm:rounded-2xl",
  children,
}: {
  onClose: () => void;
  zIndexClass?: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  useNativeBack(onClose);

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center`}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={panelClassName}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
