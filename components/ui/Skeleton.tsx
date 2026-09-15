import type { ComponentProps } from "react";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={`skeleton rounded ${className ?? ""}`} {...props} />;
}

type SkeletonTextSize = "xs" | "sm" | "base" | "lg" | "xl" | "2xl";

// Tailwind はソースを走査して使用クラスを判定するため、クラス名は文字列リテラルで列挙する
const TEXT_SIZE_CLASS: Record<SkeletonTextSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
};

// 文字1行分のプレースホルダ（実要素と同じ text-* を当てて高さをフォントサイズと行間に追従させる）
export function SkeletonText({
  size,
  className,
  ...props
}: ComponentProps<"div"> & { size: SkeletonTextSize }) {
  return (
    <Skeleton className={`${TEXT_SIZE_CLASS[size]} rounded-md ${className ?? ""}`} {...props}>
      {/* 行ボックスを作るためのゼロ幅スペース */}
      &#8203;
    </Skeleton>
  );
}
