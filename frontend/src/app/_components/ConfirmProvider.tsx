"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

/** 단일 버튼 안내(알림) — 컨펌 모달 UI를 재사용하되 취소 버튼이 없다. */
export type AlertOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
};

type DialogState = ConfirmOptions & { open: true; alertMode: boolean };

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

function ConfirmDialogUi({
  state,
  onConfirm,
  onCancel,
}: {
  state: DialogState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmLabel = state.confirmLabel ?? "확인";
  const cancelLabel = state.cancelLabel ?? "취소";
  const title = state.title ?? "확인";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-6 backdrop-blur-[2px]"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold text-zinc-900"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-message"
          className="mt-2 text-sm leading-relaxed text-zinc-600"
        >
          {state.message}
        </p>
        <div className="mt-6 flex gap-3">
          {state.alertMode ? null : (
            <button
              type="button"
              onClick={onCancel}
              className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`h-11 flex-1 rounded-xl text-sm font-medium text-white ${
              state.destructive
                ? "bg-red-600 hover:bg-red-700"
                : "bg-zinc-900 hover:bg-zinc-800"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const close = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...options, open: true, alertMode: false });
    });
  }, []);

  const alert = useCallback((options: AlertOptions) => {
    return new Promise<void>((resolve) => {
      resolveRef.current = () => resolve();
      setState({ ...options, open: true, alertMode: true });
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      {state ? (
        <ConfirmDialogUi
          state={state}
          onConfirm={() => close(true)}
          onCancel={() => close(state.alertMode ? true : false)}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx.confirm;
}

export function useAlert() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useAlert must be used within ConfirmProvider");
  }
  return ctx.alert;
}
