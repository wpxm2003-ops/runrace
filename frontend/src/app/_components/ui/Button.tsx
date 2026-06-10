import type { ComponentPropsWithoutRef } from "react";

const VARIANT_CLASSES = {
  primary:
    "rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed",
  secondary:
    "rounded-xl border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50",
  destructive:
    "rounded-xl border border-red-200 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50",
} as const;

type ButtonVariant = keyof typeof VARIANT_CLASSES;

type Props = ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
};

export function Button({ variant = "primary", className = "", children, ...rest }: Props) {
  return (
    <button
      type="button"
      className={`${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
