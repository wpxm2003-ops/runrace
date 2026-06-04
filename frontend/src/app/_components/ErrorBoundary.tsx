"use client";

import { reportClientError } from "@/lib/api";
import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    void reportClientError({
      message: error.message,
      stack: `${error.stack ?? ""}\n\n--- componentStack ---${info.componentStack ?? ""}`,
      kind: "react",
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    // i18n 컨텍스트 없이 렌더될 수 있으므로 하드코딩 유지
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="text-lg font-semibold text-zinc-900">
          Something went wrong · 문제가 발생했어요
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          Please refresh and try again · 새로고침 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 h-11 rounded-xl bg-zinc-900 px-6 text-sm text-white hover:bg-zinc-800"
        >
          Refresh · 새로고침
        </button>
      </div>
    );
  }
}
