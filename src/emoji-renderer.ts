import { createCanvas } from "@napi-rs/canvas";

const EMOJI_SIZE = 128;
const SCALE = 4; // 高解像度レンダリング用スケール
const RENDER_SIZE = EMOJI_SIZE * SCALE;

export interface EmojiRenderOptions {
  text: string;
  font: string;      // GlobalFontsに登録されたフォント名
  background: string; // CSS background値（テキストクリップとして適用）
}

/**
 * 各行を高解像度でレンダリングし、横幅がはみ出す場合は圧縮して
 * 最終的に128x128に縮小した絵文字画像を生成する
 */
export function renderEmoji(options: EmojiRenderOptions): Buffer {
  const { text, font, background } = options;
  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error("テキストが空です");
  }

  // 1. 高解像度でテキストを白で透明キャンバスに描画（マスク用）
  const textCanvas = createCanvas(RENDER_SIZE, RENDER_SIZE);
  const textCtx = textCanvas.getContext("2d");

  const lineCount = lines.length;
  const lineHeight = RENDER_SIZE / lineCount;
  const padding = Math.max(2, RENDER_SIZE * 0.04);
  const availableHeight = lineHeight - padding;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const yOffset = i * lineHeight;

    // テキスト幅を計測
    const measureCanvas = createCanvas(1, 1);
    const measureCtx = measureCanvas.getContext("2d");
    const fontSize = availableHeight;
    measureCtx.font = `${fontSize}px "${font}"`;
    const textWidth = measureCtx.measureText(line as string).width;

    // 十分な大きさの一時キャンバスにテキスト描画（上下左右にマージン）
    const margin = Math.ceil(fontSize * 0.3);
    const canvasWidth = Math.ceil(textWidth) + margin * 2;
    const canvasHeight = Math.ceil(fontSize * 2);
    const lineCanvas = createCanvas(canvasWidth, canvasHeight);
    const lineCtx = lineCanvas.getContext("2d");
    lineCtx.font = `${fontSize}px "${font}"`;
    lineCtx.textBaseline = "middle";
    lineCtx.fillStyle = "white";
    lineCtx.fillText(line as string, margin, canvasHeight / 2);

    // 実際に描画されたピクセルの境界を検出
    const imageData = lineCtx.getImageData(0, 0, canvasWidth, canvasHeight);
    const { top, bottom, left, right } = findBounds(
      imageData.data,
      canvasWidth,
      canvasHeight,
    );
    const actualHeight = bottom - top + 1;
    const actualWidth = right - left + 1;

    // 実際の描画高さを基準にlineHeightにフィットするようスケール
    const scale = lineHeight / actualHeight;
    const scaledWidth = actualWidth * scale;

    if (scaledWidth <= RENDER_SIZE) {
      // 収まる場合はセンタリング
      const xOffset = (RENDER_SIZE - scaledWidth) / 2;
      textCtx.drawImage(
        lineCanvas,
        left, top, actualWidth, actualHeight,
        xOffset, yOffset, scaledWidth, lineHeight,
      );
    } else {
      // はみ出す場合は横幅を圧縮
      textCtx.drawImage(
        lineCanvas,
        left, top, actualWidth, actualHeight,
        0, yOffset, RENDER_SIZE, lineHeight,
      );
    }
  }

  // 2. 高解像度キャンバスに背景を描画
  const hiResCanvas = createCanvas(RENDER_SIZE, RENDER_SIZE);
  const hiResCtx = hiResCanvas.getContext("2d");
  drawBackground(hiResCtx, background, RENDER_SIZE, RENDER_SIZE);

  // 3. テキスト形状でクリップ
  hiResCtx.globalCompositeOperation = "destination-in";
  hiResCtx.drawImage(textCanvas, 0, 0);
  hiResCtx.globalCompositeOperation = "source-over";

  // 4. 128x128に縮小（アンチエイリアスが効く）
  const canvas = createCanvas(EMOJI_SIZE, EMOJI_SIZE);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    hiResCanvas,
    0,
    0,
    RENDER_SIZE,
    RENDER_SIZE,
    0,
    0,
    EMOJI_SIZE,
    EMOJI_SIZE,
  );

  return Buffer.from(canvas.toBuffer("image/png"));
}

function findBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { top: number; bottom: number; left: number; right: number } {
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;

  // 上
  outer_top: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 0) { top = y; break outer_top; }
    }
  }
  // 下
  outer_bottom: for (let y = height - 1; y >= top; y--) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 0) { bottom = y; break outer_bottom; }
    }
  }
  // 左
  outer_left: for (let x = 0; x < width; x++) {
    for (let y = top; y <= bottom; y++) {
      if (data[(y * width + x) * 4 + 3]! > 0) { left = x; break outer_left; }
    }
  }
  // 右
  outer_right: for (let x = width - 1; x >= left; x--) {
    for (let y = top; y <= bottom; y++) {
      if (data[(y * width + x) * 4 + 3]! > 0) { right = x; break outer_right; }
    }
  }

  return { top, bottom, left, right };
}

function drawBackground(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  background: string,
  width: number,
  height: number,
) {
  const bg = background.trim();

  // linear-gradient パース
  const gradientMatch = bg.match(
    /linear-gradient\s*\(\s*(.+?)\s*,\s*((?:#|rgb|hsl|[a-z]).+)\s*\)/i,
  );
  if (gradientMatch) {
    const directionStr = gradientMatch[1]!.trim();
    const angle = parseDirection(directionStr);
    const colorStops = parseColorStops(gradientMatch[2]!);
    const { x0, y0, x1, y1 } = angleToCoords(angle, width, height);
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const stop of colorStops) {
      gradient.addColorStop(stop.offset, stop.color);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  // 単色
  ctx.fillStyle = bg || "#fff";
  ctx.fillRect(0, 0, width, height);
}

function parseColorStops(str: string): { offset: number; color: string }[] {
  // "red 0%, blue 100%" or "red, blue" のようなパターン
  const parts = str.split(",").map((s) => s.trim());
  const stops: { offset: number; color: string }[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const match = part.match(/^(.+?)\s+(\d+)%$/);
    if (match) {
      stops.push({
        color: match[1]!.trim(),
        offset: parseInt(match[2]!) / 100,
      });
    } else {
      stops.push({
        color: part.trim(),
        offset: parts.length === 1 ? 0 : i / (parts.length - 1),
      });
    }
  }
  return stops;
}

function parseDirection(dir: string): number {
  // "90deg" 等
  const degMatch = dir.match(/^(\d+)deg$/i);
  if (degMatch) return parseInt(degMatch[1]!);

  // キーワード → 角度
  const keywords: Record<string, number> = {
    "to top": 0,
    "to right": 90,
    "to bottom": 180,
    "to left": 270,
    "to top right": 45,
    "to right top": 45,
    "to bottom right": 135,
    "to right bottom": 135,
    "to bottom left": 225,
    "to left bottom": 225,
    "to top left": 315,
    "to left top": 315,
  };
  return keywords[dir.toLowerCase()] ?? 180; // デフォルトは to bottom
}

function angleToCoords(
  angle: number,
  w: number,
  h: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const rad = ((angle - 90) * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;
  const len = Math.max(w, h);
  return {
    x0: cx - Math.cos(rad) * len,
    y0: cy - Math.sin(rad) * len,
    x1: cx + Math.cos(rad) * len,
    y1: cy + Math.sin(rad) * len,
  };
}

