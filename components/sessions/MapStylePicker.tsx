"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { MAP_STYLES, type MapStyleId, type MapStyleSwatch, mapStyleIds } from "@/lib/mapStyles";

type Props = {
  value: MapStyleId;
  onChange: (style: MapStyleId) => void;
};

function StyleSwatch({ swatch }: { swatch: MapStyleSwatch }) {
  return (
    <svg viewBox="0 0 80 60" className="size-full" aria-hidden>
      <rect width="80" height="60" fill={swatch.background} />
      <path d="M0 38 C14 34 22 44 34 60 L0 60 Z" fill={swatch.water} />
      <path d="M50 4 H74 V22 H56 Z" fill={swatch.park} />
      <path d="M-4 20 L84 48" stroke={swatch.roadCasing} strokeWidth="7" />
      <path d="M44 -4 L32 64" stroke={swatch.roadCasing} strokeWidth="6" />
      <path d="M-4 20 L84 48" stroke={swatch.road} strokeWidth="4" />
      <path d="M44 -4 L32 64" stroke={swatch.road} strokeWidth="3" />
      {swatch.building && (
        <g stroke={swatch.roadCasing} strokeWidth="0.6" strokeLinejoin="round">
          <path d="M52 30 L60 34 L60 50 L52 46 Z" fill={swatch.building} />
          <path d="M60 34 L68 30 L68 46 L60 50 Z" fill={swatch.roadCasing} />
          <path d="M52 30 L60 26 L68 30 L60 34 Z" fill={swatch.building} />
          <path d="M8 10 L14 13 L14 25 L8 22 Z" fill={swatch.building} />
          <path d="M14 13 L20 10 L20 22 L14 25 Z" fill={swatch.roadCasing} />
          <path d="M8 10 L14 7 L20 10 L14 13 Z" fill={swatch.building} />
        </g>
      )}
    </svg>
  );
}

export function MapStylePicker({ value, onChange }: Props) {
  const t = useTranslations("sessions.detail.map.styles");

  return (
    <div role="radiogroup" aria-label={t("title")} className="grid grid-cols-3 gap-3">
      {mapStyleIds.map((id) => {
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className="flex flex-col items-center gap-1.5"
          >
            <span
              className={`relative block aspect-[4/3] w-full overflow-hidden rounded-xl border-2 transition-colors ${
                selected ? "border-foreground" : "border-border"
              }`}
            >
              <StyleSwatch swatch={MAP_STYLES[id].swatch} />
              {selected && (
                <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-foreground text-background">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className={`text-xs ${selected ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {t(`names.${id}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
