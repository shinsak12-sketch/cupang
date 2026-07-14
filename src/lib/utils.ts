import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 원화 포맷 */
export function won(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "-";
  const v = typeof n === "string" ? Number(n) : n;
  if (Number.isNaN(v)) return "-";
  return `₩${Math.round(v).toLocaleString("ko-KR")}`;
}

/** 퍼센트 포맷 */
export function pct(n: number | string | null | undefined, digits = 1): string {
  if (n === null || n === undefined || n === "") return "-";
  const v = typeof n === "string" ? Number(n) : n;
  if (Number.isNaN(v)) return "-";
  return `${v.toFixed(digits)}%`;
}
