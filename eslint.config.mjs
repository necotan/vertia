import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const JAPANESE = "/[\\u3040-\\u30ff\\u4e00-\\u9fff]/";
const TRANSLATION_MESSAGE = "日本語の文言は messages/ に置き、翻訳キーで参照する";
const NETWORK_MESSAGE =
  "外部への通信は OpenFreeMap と Open-Meteo だけ。通信を足す場合は CLAUDE.md の Data and network を確認する";
const SCREEN_WIDTH_MESSAGE =
  "走行機能が使えるかは画面幅ではなく lib/sensors/capabilities.ts の機能検出で決める";

const japaneseText = [
  { selector: `Literal[value=${JAPANESE}]`, message: TRANSLATION_MESSAGE },
  { selector: `TemplateElement[value.raw=${JAPANESE}]`, message: TRANSLATION_MESSAGE },
  { selector: `JSXText[value=${JAPANESE}]`, message: TRANSLATION_MESSAGE },
];

const network = [
  { selector: "CallExpression[callee.name='fetch']", message: NETWORK_MESSAGE },
  { selector: "CallExpression[callee.property.name=/^(fetch|sendBeacon)$/]", message: NETWORK_MESSAGE },
];

const screenWidth = [
  { selector: "MemberExpression[property.name=/^(innerWidth|outerWidth)$/]", message: SCREEN_WIDTH_MESSAGE },
  {
    selector: "MemberExpression[object.name='screen'][property.name=/^(width|availWidth)$/]",
    message: SCREEN_WIDTH_MESSAGE,
  },
  {
    selector: "CallExpression[callee.property.name='matchMedia'] > Literal[value=/width/]",
    message: SCREEN_WIDTH_MESSAGE,
  },
];

const motionPermission = [
  {
    selector: "CallExpression[callee.property.name='requestPermission']",
    message: "lib/sensors/motion.ts の requestMotionPermission() を、タップ処理の最初に await より前で呼ぶ",
  },
];

const localeProvider = {
  name: "next-intl",
  importNames: ["NextIntlClientProvider"],
  message: "言語の読み込みと保存は lib/i18n/I18nProvider.tsx に集約する",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.tsx"],
    rules: {
      // 表示文言は翻訳キーを通す
      "react/jsx-no-literals": ["error", { ignoreProps: true, allowedStrings: ["&#8203;"] }],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...japaneseText, ...network, ...screenWidth, ...motionPermission],
      "no-restricted-globals": [
        "error",
        ...["XMLHttpRequest", "WebSocket", "EventSource"].map((name) => ({ name, message: NETWORK_MESSAGE })),
      ],
      "no-restricted-imports": ["error", { paths: [localeProvider] }],
    },
  },
  {
    // 天気 (Open-Meteo) と、同一オリジンの境界データの取得
    files: ["lib/weather/openMeteo.ts", "lib/regions.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...japaneseText, ...screenWidth, ...motionPermission],
    },
  },
  {
    files: ["lib/sensors/motion.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...japaneseText, ...network, ...screenWidth],
    },
  },
  {
    files: ["lib/i18n/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // GPS とモーションの更新を React の state に通すと再描画が続くため、走行中の処理は React から切り離す
    files: ["lib/drive/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            localeProvider,
            ...["react", "react-dom"].map((name) => ({
              name,
              message: "速度とGは Canvas に直接描く。React には DriveUiState だけを渡す",
            })),
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // scripts/copyMaplibreWorker.mjs が node_modules からコピーするファイル
    "public/maplibre/**",
  ]),
]);

export default eslintConfig;
