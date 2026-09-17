"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
};

// iOS のホーム画面アプリでは fixed や dialog の位置がずれるため、position: relative などを持つ親の中に absolute で重ねる
export function BottomSheet({ open, title, closeLabel, onClose, children }: Props) {
  return (
    <>
      {open && <div aria-hidden className="absolute inset-0 z-30" onClick={onClose} />}
      <section
        role="dialog"
        aria-label={title}
        aria-hidden={!open}
        inert={!open}
        className={`absolute inset-x-0 bottom-0 z-40 mx-auto w-full max-w-lg rounded-t-3xl border-x border-t border-border bg-background/90 pb-[calc(env(safe-area-inset-bottom)+20px)] text-foreground shadow-lg backdrop-blur-md transition-[translate,visibility] duration-300 ease-out sm:bottom-4 sm:w-[calc(100%-2rem)] sm:rounded-3xl sm:border sm:pb-5 ${
          open ? "visible translate-y-0" : "invisible translate-y-[calc(100%+2rem)]"
        }`}
      >
        <div className="flex items-center justify-between gap-4 px-5 pb-3 pt-4">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-border"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="px-5">{children}</div>
      </section>
    </>
  );
}
