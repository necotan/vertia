import ja from "@/messages/ja.json";
import en from "@/messages/en.json";

export const locales = ["ja", "en"] as const;
export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "ja";
export const LOCALE_STORAGE_KEY = "vertia.locale";
export const LOCALE_CHANGE_EVENT = "vertia:locale-change";

export const messagesByLocale = { ja, en } as const;

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function detectLocale(): AppLocale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isAppLocale(stored)) return stored;
  } catch {
  }
  const languages = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  for (const lang of languages) {
    const base = lang.toLowerCase().split("-")[0];
    if (isAppLocale(base)) return base;
  }
  return defaultLocale;
}

export function saveLocale(locale: AppLocale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
  }
  document.documentElement.lang = locale;
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT));
}

// 描画前に <html lang> を設定するためのインラインスクリプト
export const localeInitScript = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  LOCALE_STORAGE_KEY,
)});var l=${JSON.stringify(locales)};var v=l.indexOf(s)>=0?s:null;if(!v){var n=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language]);for(var i=0;i<n.length;i++){var b=String(n[i]).toLowerCase().split("-")[0];if(l.indexOf(b)>=0){v=b;break;}}}document.documentElement.lang=v||${JSON.stringify(
  defaultLocale,
)};}catch(e){}})();`;
