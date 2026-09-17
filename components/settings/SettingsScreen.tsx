"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { locales, saveLocale } from "@/lib/i18n/config";
import { distanceUnits, saveDistanceUnit, useDistanceUnit } from "@/lib/units";

const themes = ["system", "light", "dark"] as const;

type Option = { value: string; label: string };

function SegmentedControl({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`min-h-11 rounded-full px-5 text-sm font-medium transition-colors ${
                selected
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SettingsScreen() {
  const t = useTranslations("settings");
  const tLanguage = useTranslations("languageOptions");
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const distanceUnit = useDistanceUnit();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+2.5rem)] sm:px-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <SegmentedControl
        label={t("language")}
        options={locales.map((value) => ({ value, label: tLanguage(value) }))}
        value={locale}
        onChange={(value) => {
          const next = locales.find((l) => l === value);
          if (next) saveLocale(next);
        }}
      />

      <SegmentedControl
        label={t("theme")}
        options={themes.map((value) => ({ value, label: t(`themeOptions.${value}`) }))}
        value={theme}
        onChange={setTheme}
      />

      <SegmentedControl
        label={t("distanceUnit")}
        options={distanceUnits.map((value) => ({ value, label: t(`distanceUnitOptions.${value}`) }))}
        value={distanceUnit}
        onChange={(value) => {
          const next = distanceUnits.find((u) => u === value);
          if (next) saveDistanceUnit(next);
        }}
      />
    </main>
  );
}
