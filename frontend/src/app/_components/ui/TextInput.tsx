"use client";

import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const FIELD_BASE =
  "rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink shadow-sm placeholder:text-zinc-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

/** 폭·여백(w-*, mt-*)은 콜사이트마다 달라 className으로 그대로 이어붙인다. */
export function TextInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${FIELD_BASE} ${className}`} />;
}

export function TextArea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`${FIELD_BASE} resize-none ${className}`} />;
}
