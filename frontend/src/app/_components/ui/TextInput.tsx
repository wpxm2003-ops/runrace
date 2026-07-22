"use client";

import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const FIELD_BASE =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";

/** 폭·여백(w-*, mt-*)은 콜사이트마다 달라 className으로 그대로 이어붙인다. */
export function TextInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${FIELD_BASE} ${className}`} />;
}

export function TextArea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`${FIELD_BASE} resize-none ${className}`} />;
}
