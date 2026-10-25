import { ChevronLeft } from "lucide-react";
import Link from "next/link";

type Props = {
  href: string;
  label: string;
  className?: string;
};

// 見た目は40pxの丸ボタンのまま、押せる範囲は疑似要素で外側に広げる
export function BackLink({ href, label, className = "" }: Props) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={`relative flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-all after:absolute after:-inset-1.5 after:rounded-full after:content-[''] hover:text-slate-800 active:scale-90 dark:bg-card dark:text-muted-foreground dark:hover:text-foreground ${className}`}
    >
      <ChevronLeft size={22} className="-translate-x-px" />
    </Link>
  );
}
