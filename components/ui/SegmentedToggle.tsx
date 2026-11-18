"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

type SegmentedToggleOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

/** value がどの選択肢にも当たらないとき（シェアカードの自由配置など）は、どれも選ばれていない表示にする */
export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled = false,
  className = "",
  buttonClassName = "",
}: {
  value: T;
  options: SegmentedToggleOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const clickedValueRef = useRef<T | null>(null);
  // options は呼び出し側で毎回作り直されるため、中身が変わったときだけ測り直す
  // 参照で判定すると切り替え直後の再描画で測り直しが走り、スライド中のトランジションが打ち消される
  const optionsKey = options.map((option) => `${option.value}:${option.label}`).join("|");

  useLayoutEffect(() => {
    const activeButton = buttonRefs.current[value];
    const indicator = indicatorRef.current;
    if (!indicator) return;
    if (!activeButton) {
      indicator.style.opacity = "0";
      return;
    }
    const shouldAnimate = clickedValueRef.current === value && indicator.style.opacity === "1";
    clickedValueRef.current = null;
    // 初回や測り直しではトランジションを止めて、その場に置く
    if (!shouldAnimate) indicator.style.transition = "none";
    indicator.style.left = `${activeButton.offsetLeft}px`;
    indicator.style.width = `${activeButton.offsetWidth}px`;
    indicator.style.opacity = "1";
    if (!shouldAnimate) {
      // 強制的にレイアウトを確定させてから、クラスのトランジションに戻す
      void indicator.offsetWidth;
      indicator.style.transition = "";
    }
  }, [value, optionsKey]);

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`relative inline-flex items-center rounded-full bg-muted p-[3px] ${disabled ? "opacity-50" : ""} ${className}`}
    >
      <span
        ref={indicatorRef}
        aria-hidden
        className="pointer-events-none absolute bottom-[3px] top-[3px] rounded-full bg-background opacity-0 shadow-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] dark:bg-neutral-600"
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttonRefs.current[option.value] = element;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => {
              if (!active) clickedValueRef.current = option.value;
              onChange(option.value);
            }}
            className={`relative z-10 flex items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-colors disabled:cursor-not-allowed ${
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            } ${buttonClassName}`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
