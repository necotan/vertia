"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ToastKind = "error" | "info";

type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
};

type ToastApi = {
  error: (message: string) => void;
  info: (message: string) => void;
};

const TOAST_DURATION_MS = 4000;

const ToastContext = createContext<ToastApi | null>(null);

const kindClasses: Record<ToastKind, string> = {
  error: "text-red-600 dark:text-red-400",
  info: "text-foreground",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, kind, message }]);
      timers.current.set(id, setTimeout(() => dismiss(id), TOAST_DURATION_MS));
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({ error: (message) => show("error", message), info: (message) => show("info", message) }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* iOS のステータスバーは直下のコンテンツの色を取り込むため、セーフエリアから 40px 以上離す */}
      <div
        aria-live="polite"
        className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)+40px)] z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-2"
      >
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismiss(toast.id)}
            className={`pointer-events-auto animate-toast-in rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm shadow-lg ${kindClasses[toast.kind]}`}
          >
            {toast.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
