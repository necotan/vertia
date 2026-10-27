"use client";

import { useTranslations } from "next-intl";
import { Dialog, DialogActionButton, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./Dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = true,
  loading = false,
  onConfirm,
}: Props) {
  const t = useTranslations("common");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!loading) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="mt-2 whitespace-pre-wrap">{message}</DialogDescription>
        <DialogFooter>
          <DialogActionButton variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel ?? t("cancel")}
          </DialogActionButton>
          <DialogActionButton destructive={destructive} onClick={onConfirm} disabled={loading}>
            {loading ? t("deleting") : (confirmLabel ?? t("delete"))}
          </DialogActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
