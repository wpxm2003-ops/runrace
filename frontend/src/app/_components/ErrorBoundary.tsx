"use client";

import { reportClientError } from "@/lib/api";
import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/**
 * 렌더 중 발생한 에러를 잡아 백엔드로 보고하고, 흰 화면 대신 폴백 UI를 보여준다.
 * (이벤트 핸들러·비동기 에러는 {@link ClientErrorReporter}가 담당.)
 */
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
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="text-lg font-semibold text-zinc-900">문제가 발생했어요</div>
        <p className="mt-2 text-sm text-zinc-600">
          잠시 후 다시 시도해 주세요. 문제가 계속되면 새로고침해 주세요.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 h-11 rounded-xl bg-zinc-900 px-6 text-sm text-white hover:bg-zinc-800"
        >
          새로고침
        </button>
      </div>
    );
  }
}
