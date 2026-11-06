import type { ReactNode } from "react";

// 見た目は40pxの丸ボタンのまま、押せる範囲は疑似要素で外側に広げる
export const iconButtonClass =
  "relative flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all after:absolute after:-inset-1.5 after:rounded-full after:content-[''] hover:text-foreground active:scale-90";

type Props = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
};

export function IconButton({ label, onClick, disabled = false, className = "", children }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`${iconButtonClass} disabled:pointer-events-none disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}
