import type ja from "./messages/ja.json";
import type { AppLocale } from "./lib/i18n/config";

declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof ja;
  }
}
