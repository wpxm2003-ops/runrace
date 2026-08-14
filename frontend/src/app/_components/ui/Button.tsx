import type { ComponentPropsWithoutRef } from "react";

const VARIANT_CLASSES = {
  primary:
    "bg-brand text-night shadow-[0_8px_20px_rgb(255_90_22/0.2)] hover:bg-brand-hover active:bg-brand-pressed disabled:bg-zinc-300 disabled:shadow-none",
  secondary:
    "border border-line bg-panel text-ink hover:bg-panel-muted disabled:opacity-45",
  dark:
    "bg-night text-white hover:bg-zinc-800 active:bg-black disabled:bg-zinc-300",
  ghost:
    "bg-transparent text-muted hover:bg-panel-muted hover:text-ink disabled:opacity-45",
  destructive:
    "border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-45",
} as const;

type ButtonVariant = keyof typeof VARIANT_CLASSES;
type ButtonSize = "default" | "icon";

type Props = ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "default",
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-control text-sm font-semibold transition-[background-color,color,border-color,box-shadow,transform] active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0 ${size === "icon" ? "h-10 w-10 shrink-0 p-0" : "min-h-11 px-5"} ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Named wrappers keep primary and secondary CTAs visually consistent. */
export function PrimaryButton(props: Omit<Props, "variant">) {
  return <Button {...props} variant="primary" className={`h-button ${props.className ?? ""}`} />;
}

export function SecondaryButton(props: Omit<Props, "variant">) {
  return <Button {...props} variant="secondary" className={`h-button ${props.className ?? ""}`} />;
}
