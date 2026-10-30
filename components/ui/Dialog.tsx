"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { useDimmedPageBackground } from "@/lib/hooks/useDimmedPageBackground";
import { Button } from "./Button";
import { useOverlayContainer } from "./OverlayContainer";

// オーバーレイの backdrop-brightness-50 と同じ値
const OVERLAY_BRIGHTNESS = 50;

export function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  useDimmedPageBackground(props.open === true, OVERLAY_BRIGHTNESS);
  return <DialogPrimitive.Root {...props} />;
}

export function DialogContent({ className = "", children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  const container = useOverlayContainer();
  return (
    <DialogPrimitive.Portal container={container}>
      {/* iOS で上端の要素の背景色を上部バーに取り込み黒く見えるため、背景色ではなく backdrop の明るさで暗くする（上部バーの色は useDimmedPageBackground で合わせる） */}
      <DialogPrimitive.Overlay className="absolute inset-0 z-50 backdrop-brightness-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={`absolute left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-card p-6 text-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 ${className}`}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className = "", ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={`text-lg font-bold ${className}`} {...props} />;
}

export function DialogDescription({ className = "", ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={`text-sm text-muted-foreground ${className}`} {...props} />;
}

export function DialogFooter({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`mt-6 grid auto-cols-fr grid-flow-col gap-2 ${className}`} {...props} />;
}

// destructive は削除など取り消せない操作に使う
export function DialogActionButton({
  className = "",
  variant = "primary",
  destructive = false,
  ...props
}: ComponentProps<typeof Button> & { destructive?: boolean }) {
  return <Button variant={destructive ? "destructive" : variant} className={`w-full ${className}`} {...props} />;
}
