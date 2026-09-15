# vertia

スマートフォンをダッシュボードに固定し、GPS と加速度センサーで速度と加速度（G）をリアルタイムに表示する、個人利用メインのWebアプリケーションです。

## クイックスタート
セットアップ不要で、ブラウザからすぐに試せます。走行画面は、GPS とモーションセンサーを備えた端末（主にスマートフォン）で開いてください。

**[vertia-app.vercel.app](https://vertia-app.vercel.app)**

## 機能
走行画面には、速度表示と円形の G メーターを中心に、平均・中央値・最高速度と GPS の誤差を並べています。走行中に画面が消えないよう、Screen Wake Lock でスリープを止めます。

記録は手動で開始・終了します。GPS は端末が返すおおむね 1Hz、加速度と角速度は 50〜60Hz のまま間引かずに保存します。記録中にアプリが終了しても、次に開いたときに保存済みのデータから集計し直して復旧します。

走り終えたら、記録ごとに走行ルートの地図と速度の推移グラフを描画します。距離・時間・速度・G の集計も同じ画面に出ます。記録 1 件を gzip 圧縮した JSON（`vertia-YYYYMMDD-HHmm.json.gz`）にエクスポートすることで、別の端末にインポートできます。

データはすべて端末の IndexedDB に保存し、サーバーには送りません。表示は日本語と English、テーマはライト / ダーク / システムから選べます。

## 対応端末

| 端末 | 対応 |
| --- | --- |
| iOS Safari | 優先対応 |
| Android Chrome | 対応 |
| PC | 記録の閲覧は可能 |

走行画面を使用できるかは、画面幅ではなくセンサー API の有無で判定します。GPS とモーションセンサーを備えた PC なら走行画面も開けますが、多くの PC はこれらのセンサーを持たないため、インポートした記録の閲覧用となります。

### ホーム画面に追加
スマートフォンではホーム画面に追加すると、アドレスバーなどのブラウザUIが消え、ネイティブアプリのように使用できます。

- **iOS（Safari）**: 共有ボタンから「ホーム画面に追加」
- **Android（Chrome）**: メニューから「ホーム画面に追加」

## ローカル起動方法
サーバーやデータベースは不要で、Next.js の開発サーバーで動作します。

### 前提条件
- Node.js 20.9 以上
- 実機で走行画面を試す場合は、HTTPS で配信できる環境（Vercel の Preview など）

### 手順

1. リポジトリのクローン
   ```bash
   git clone https://github.com/necotan/vertia.git
   cd vertia
   ```
2. 依存関係のインストール
   ```bash
   npm install
   ```
3. 開発サーバーの起動
   ```bash
   npm run dev
   ```
   起動前に MapLibre の Worker を `public/maplibre/` へ自動でコピーします。
4. ブラウザで `http://localhost:3000` にアクセスします。

### 注意点
- 位置情報とモーションセンサーは HTTPS か localhost でしか動きません。スマートフォンの実機では、HTTPS の URL で開いてください。
- iOS はタップ操作の中でしかモーションセンサーの許可ダイアログを出せません。そのため「測定を開始」ボタンを押したときに許可を求めます。
- Service Worker の登録は本番ビルド（`npm run build` から `npm run start`）のときだけ行います。

### npm スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバーを起動（先に `copy:maplibre-worker` が走る） |
| `npm run build` | 本番ビルド（先に `copy:maplibre-worker` が走る） |
| `npm run start` | ビルド結果を起動 |
| `npm run lint` | ESLint を実行 |
| `npm run copy:maplibre-worker` | MapLibre の Worker を `public/maplibre/` にコピーする |
| `npm run generate:icons` | `assets/vertia-icon.png` からファビコン・Apple 用・PWA 用のアイコンを生成する |

### MapLibre の Worker について
Turbopack は MapLibre GL JS v6 の Worker の URL を解決できません。そこで Worker と共有チャンクを `public/maplibre/` にコピーして配信し、`setWorkerUrl` でその URL を渡しています。`public/maplibre/` は `.gitignore` に入っています。

### アイコンの更新
`assets/vertia-icon.png` を差し替えて `npm run generate:icons` を実行すると、次のファイルを白背景付きで生成し直します。

- `app/favicon.ico`、`app/icon.png`、`app/apple-icon.png`
- `public/icons/icon-192.png`、`icon-512.png`、`icon-maskable-512.png`

### ディレクトリ構成

```
app/                  ページ（App Router）、manifest、アイコン
components/
  drive/              走行画面
  home/               ホーム
  sessions/           記録一覧・詳細・地図・速度グラフ
  settings/           設定
  layout/             下部ナビ、Provider
  pwa/                Service Worker の登録
  ui/                 ボタン、確認ダイアログ
lib/
  db/                 IndexedDB のスキーマ、記録の保存・削除、エクスポート / インポート
  drive/              走行画面の制御、記録、集計、G の計算
  drive/renderer/     Canvas の描画
  sensors/            位置情報、モーションセンサー、Wake Lock
  i18n/               言語設定
  fonts.ts            フォントの定義
  format.ts           経過時間の表示フォーマット
  geo.ts              2 点間の距離計算、m/s から km/h 変換
messages/             翻訳（ja.json / en.json）
scripts/              アイコン生成、MapLibre の Worker のコピー
public/               Service Worker、PWA 用アイコン
```

## 技術スタック・クレジット (Tech Stack & Credits)
このプロジェクトは以下の技術およびオープンソースライブラリを使用しています。

- **Framework**: [Next.js](https://nextjs.org/) (App Router) / [React](https://react.dev/) / [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) (v4) 
- **Rendering**: Canvas API
- **Storage**: IndexedDB / [Dexie.js](https://dexie.org/)
- **Map**: [MapLibre GL JS](https://maplibre.org/) / [OpenFreeMap](https://openfreemap.org/)
- **Charts**: [Recharts](https://recharts.org/)
- **i18n & Theme**: [next-intl](https://next-intl.dev/) / [next-themes](https://github.com/pacocoursey/next-themes)
- **Icons**: [Lucide React](https://lucide.dev/) (Licensed under ISC)
- **Hosting**: [Vercel](https://vercel.com/)

地図データは © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors、タイルは OpenFreeMap / [OpenMapTiles](https://openmaptiles.org/) を利用しています。地図上にも出典を表示しています。

## 免責事項 (Disclaimer)

**1. 走行中の利用について**
運転者は走行中に画面を注視したり操作したりしないでください。記録の開始・終了は停車中に行い、スマートフォンは視界や運転操作を妨げない位置に固定してください。本アプリケーションの利用中に起きた事故・違反について、開発者は一切の責任を負いません。

**2. 計測値の精度**
速度・G・距離などの表示値は、スマートフォンの GPS とセンサーから算出した参考値です。端末の性能、電波状況、固定方法によって誤差が出ます。車両のスピードメーターや計測機器の代わりには使わないでください。

**3. データの取り扱いとプライバシー**
走行ログ（位置情報を含む）は端末内の IndexedDB にのみ保存し、開発者のサーバーへは送信しません。ただし地図を表示するとき、ブラウザは表示範囲の地図タイルを OpenFreeMap から取得します。エクスポートしたファイルには走行ルートの位置情報が含まれるため、共有する際はご注意ください。

**4. データの損失について**
本ソフトウェアは個人開発による成果物です。ブラウザのサイトデータの削除、端末の変更、予期せぬ不具合などにより、記録が消える可能性があります。残したい記録はエクスポート機能でバックアップを取ってください。

**5. 動作の保証範囲**
iOS Safari を優先対応し、Android Chrome を対応としていますが、すべてのデバイスや OS 環境での動作を保証するものではありません。

**6. 免責と責任の制限**
本ソフトウェアは「現状有姿（As-Is）」で提供されます。本アプリケーションの導入、利用、またはデータの消失等により生じた損害（金銭的損失、精神的苦痛などを含む）について、開発者は一切の責任を負いません。ご自身の責任においてご利用ください。

**7. 外部環境の変化**
使用している技術スタック（Next.js, MapLibre GL JS, OpenFreeMap 等）のアップデートや仕様変更、ブラウザのセンサー API の変更により、予告なく一部機能が使えなくなる可能性があります。開発者はこれらに対する恒久的なメンテナンスやアップデートの義務を負いません。

**8. ライセンス**
本プロジェクトのソースコードは [MIT License](LICENSE) の下で公開されています。商用・非商用を問わず、ライセンス条項の範囲内で自由にご利用いただけます。
