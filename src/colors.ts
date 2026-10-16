export interface ColorTemplate {
  label: string;
  value: string; // CSS color or linear-gradient
  emoji: string;
}

// プレビューのセレクトメニューに出す色
// 追加するときは label / value / emoji を足すだけ
export const COLOR_LIST: ColorTemplate[] = [
  { label: "白", value: "#ffffff", emoji: "⚪" },
  { label: "ピンク", value: "#ff6eb4", emoji: "💗" },
  { label: "水色", value: "#5ac8fa", emoji: "💧" },
  { label: "赤", value: "#ff3b30", emoji: "🔴" },
  {
    label: "虹色",
    value:
      "linear-gradient(90deg, #ff3b30, #ff9500, #ffcc00, #34c759, #5ac8fa, #5856d6, #ff2d92)",
    emoji: "🌈",
  },
  { label: "エメラルドグリーン", value: "#50c878", emoji: "💚" },
];

export const DEFAULT_BACKGROUND = COLOR_LIST[0]!.value;

export function findColorIndex(background: string): number {
  const normalized = background.trim().toLowerCase();
  return COLOR_LIST.findIndex(
    (color) => color.value.toLowerCase() === normalized,
  );
}

export function formatColor(background: string): string {
  const index = findColorIndex(background);
  if (index >= 0) return COLOR_LIST[index]!.label;
  return `\`${background}\``;
}
