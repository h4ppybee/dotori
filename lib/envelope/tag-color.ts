import { TAG_PRESETS } from "./presets";

// DESIGN.md donut-chart 팔레트 — 조각 색과 동일하게 맞춘다.
const PALETTE = ["#A87342", "#F04452", "#15803D", "#FF9800", "#8B5CF6", "#6B7684"];

/**
 * 태그 → DonutChart 팔레트 색.
 * 프리셋 태그는 순서대로 고정 배정하고, 커스텀 태그는 문자열 해시로 팔레트를 결정적으로 순환한다.
 */
export function tagColor(tag: string): string {
  const i = TAG_PRESETS.indexOf(tag as (typeof TAG_PRESETS)[number]);
  if (i >= 0) {
    return PALETTE[i % PALETTE.length];
  }
  let h = 0;
  for (const ch of tag) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}
