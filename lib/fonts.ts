import { Chivo_Mono, Geist, Noto_Sans_JP } from "next/font/google";

export const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  weight: ["400", "500", "700"],
});

export const chivoMono = Chivo_Mono({ variable: "--font-chivo-mono", subsets: ["latin"] });
