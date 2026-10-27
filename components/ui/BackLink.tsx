import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { iconButtonClass } from "./IconButton";

type Props = {
  href: string;
  label: string;
  className?: string;
};

export function BackLink({ href, label, className = "" }: Props) {
  return (
    <Link href={href} aria-label={label} title={label} className={`${iconButtonClass} ${className}`}>
      <ChevronLeft size={22} className="-translate-x-px" />
    </Link>
  );
}
