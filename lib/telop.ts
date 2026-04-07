import { TelopItem, TelopStyle } from "@/lib/types";

export const defaultTelop: TelopStyle = {
  text: "ここにテロップを入力",
  fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif",
  fontWeight: 900,
  fontSize: 52,
  x: 50,
  y: 90,
  maxWidth: 95,
  lineHeight: 1.15,
  color: "#fffdf6",
  strokeColor: "#1b1b1b",
  strokeWidth: 8,
  shadow: true,
  align: "center",
  preset: "impact"
};

export const telopPresets: Record<TelopStyle["preset"], Partial<TelopStyle>> = {
  impact: {
    color: "#fff8e8",
    strokeColor: "#111827",
    strokeWidth: 8
  },
  soft: {
    color: "#1f2937",
    strokeColor: "#fffaf0",
    strokeWidth: 5
  },
  editorial: {
    color: "#ffffff",
    strokeColor: "#0f172a",
    strokeWidth: 3
  }
};

export function createTelopItem(base?: Partial<TelopStyle>): TelopItem {
  return {
    id: crypto.randomUUID(),
    ...defaultTelop,
    ...base
  };
}
