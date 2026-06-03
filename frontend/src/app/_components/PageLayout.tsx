import type { ReactNode } from "react";

type PageLayoutProps = {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  maxWidth?: "max-w-2xl" | "max-w-md";
  className?: string;
};

export function PageLayout({
  title,
  actions,
  children,
  maxWidth = "max-w-2xl",
  className,
}: PageLayoutProps) {
  return (
    <div
      className={`mx-auto w-full px-6 py-8 ${maxWidth}${className ? ` ${className}` : ""}`}
    >
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
