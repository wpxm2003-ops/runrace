import type { ReactNode } from "react";

type PageLayoutProps = {
  title?: string;
  /** 제목 텍스트 바로 오른쪽에 붙는 요소(아이콘 버튼 등). 우측 끝 배치는 actions 사용. */
  titleSuffix?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  maxWidth?: "max-w-2xl" | "max-w-md";
  className?: string;
};

export function PageLayout({
  title,
  titleSuffix,
  actions,
  children,
  maxWidth = "max-w-2xl",
  className,
}: PageLayoutProps) {
  return (
    <div
      className={`mx-auto w-full px-6 py-8 ${maxWidth}${className ? ` ${className}` : ""}`}
    >
      {(title || actions) ? (
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-1">
            <h1 className="text-xl font-semibold">{title}</h1>
            {titleSuffix}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
