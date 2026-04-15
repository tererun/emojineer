import { GlobalFonts } from "@napi-rs/canvas";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

export interface FontEntry {
  family: string; // Google Fontsのファミリー名
  weight: number; // フォントウェイト (100-900)
  label: string;  // セレクトメニュー表示名 & GlobalFonts登録名
}

// ============================================================
// フォントリスト（最大25件 - Discordセレクトメニューの制限）
//
// 追加: { family: "ファミリー名", weight: 数値, label: "表示名" }
// 削除: 行を消すだけ（.fonts/のキャッシュは手動削除）
//
// 起動時にGoogle Fontsから自動ダウンロード＆キャッシュされる
// ============================================================
export const FONT_LIST: FontEntry[] = [
  // Noto Sans JP
  { family: "Noto Sans JP", weight: 400, label: "Noto Sans JP Regular" },
  { family: "Noto Sans JP", weight: 700, label: "Noto Sans JP Bold" },
  { family: "Noto Sans JP", weight: 900, label: "Noto Sans JP Black" },
  // Noto Serif JP
  { family: "Noto Serif JP", weight: 400, label: "Noto Serif JP Regular" },
  { family: "Noto Serif JP", weight: 900, label: "Noto Serif JP Black" },
  // M PLUS Rounded 1c
  { family: "M PLUS Rounded 1c", weight: 400, label: "M PLUS Rounded 1c Regular" },
  { family: "M PLUS Rounded 1c", weight: 800, label: "M PLUS Rounded 1c ExtraBold" },
  // M PLUS 1p
  { family: "M PLUS 1p", weight: 700, label: "M PLUS 1p Bold" },
  { family: "M PLUS 1p", weight: 900, label: "M PLUS 1p Black" },
  // Zen Maru Gothic
  { family: "Zen Maru Gothic", weight: 500, label: "Zen Maru Gothic Medium" },
  { family: "Zen Maru Gothic", weight: 900, label: "Zen Maru Gothic Black" },
  // Zen Kaku Gothic New
  { family: "Zen Kaku Gothic New", weight: 700, label: "Zen Kaku Gothic New Bold" },
  { family: "Zen Kaku Gothic New", weight: 900, label: "Zen Kaku Gothic New Black" },
  // 単一ウェイト
  { family: "Kosugi Maru", weight: 400, label: "Kosugi Maru" },
  { family: "Dela Gothic One", weight: 400, label: "Dela Gothic One" },
  { family: "Reggae One", weight: 400, label: "Reggae One" },
  { family: "RocknRoll One", weight: 400, label: "RocknRoll One" },
  { family: "Yusei Magic", weight: 400, label: "Yusei Magic" },
  { family: "Hachi Maru Pop", weight: 400, label: "Hachi Maru Pop" },
];

const CACHE_DIR = join(import.meta.dir, "../.fonts");

// 古いUser-AgentでリクエストするとサブセットなしのTTF 1ファイルが返る
const OLD_USER_AGENT = "Mozilla/4.0";

export async function initFonts(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });

  for (const entry of FONT_LIST) {
    const safeName = entry.label.replace(/[^a-zA-Z0-9]+/g, "_");
    const cacheFile = join(CACHE_DIR, `${safeName}.ttf`);

    if (!existsSync(cacheFile)) {
      console.log(`Downloading: ${entry.label}...`);
      try {
        const ttfUrl = await fetchFontUrl(entry.family, entry.weight);
        const res = await fetch(ttfUrl);
        if (!res.ok) throw new Error(`Font download failed: ${res.status}`);
        await Bun.write(cacheFile, Buffer.from(await res.arrayBuffer()));
      } catch (err) {
        console.warn(`Failed to download ${entry.label}:`, err);
        continue;
      }
    }

    GlobalFonts.registerFromPath(cacheFile, entry.label);
  }

  console.log(`${FONT_LIST.length} fonts loaded.`);
}

async function fetchFontUrl(family: string, weight: number): Promise<string> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`;
  const res = await fetch(cssUrl, {
    headers: { "User-Agent": OLD_USER_AGENT },
  });
  if (!res.ok)
    throw new Error(`Google Fonts CSS fetch failed: ${res.status}`);
  const css = await res.text();
  const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/);
  if (!match) throw new Error(`No TTF URL found for ${family} wght@${weight}`);
  return match[1]!;
}
