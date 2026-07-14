/** YYYY-MM-DD 문자열 하루 전 (버전 마감용). 타임존 영향 없이 순수 계산. */
export function prevDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** 오늘(UTC) YYYY-MM-DD */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** asOf 시점에 유효한 버전인지 (effective_from <= asOf < effective_to 또는 to=null) */
export function isEffective(
  row: { effectiveFrom: string; effectiveTo: string | null },
  asOf: string
): boolean {
  if (row.effectiveFrom > asOf) return false;
  if (row.effectiveTo && row.effectiveTo <= asOf) return false;
  return true;
}
