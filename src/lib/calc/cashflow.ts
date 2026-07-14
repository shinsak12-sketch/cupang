export interface CashflowInput {
  investmentKrw: number; // 총 투입 원가 (착지원가 로트 총액)
  orderQty: number;
  paidDate: string; // 🔴 현금 유출일 (1688 결제)
  inboundDate: string | null; // 입고일
  sellStartOffsetDays?: number; // 입고 후 판매개시까지 (기본 7)
  monthlySalesQty: number;
  settlementPerUnit: number; // 판매 1개당 실입금(정산)액 ≈ 결제가 - 쿠팡수수료
  settlementLagDays?: number; // 판매→정산입금 지연 (기본 15)
}

export interface CashEvent {
  date: string;
  label: string;
  amount: number; // +유입 / -유출
  balance: number; // 누적 현금
}

export interface CashflowResult {
  timeline: CashEvent[];
  maxCashLocked: number; // 🔴 이 로트에 묶이는 현금 최대치
  recoveryDays: number | null; // 결제일 대비 현금 회수 D+
  cccDays: number | null; // Cash Conversion Cycle (결제→투자원금 회수)
  fullyRecovered: boolean;
}

const DAY = 86_400_000;
function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10);
}
function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);
}

/**
 * 캐시플로우 (스펙 §4 cashflow.ts).
 * 🔴 초보 실패 1순위는 마진이 아니라 현금순환. 1688결제→정산까지 2~3개월.
 */
export function calcCashflow(input: CashflowInput): CashflowResult {
  const lag = input.settlementLagDays ?? 15;
  const sellStart = addDays(
    input.inboundDate ?? input.paidDate,
    input.sellStartOffsetDays ?? 7
  );

  const raw: { date: string; label: string; amount: number }[] = [];
  raw.push({ date: input.paidDate, label: "1688 결제 (현금 유출)", amount: -input.investmentKrw });

  let remaining = input.orderQty;
  let m = 0;
  while (remaining > 0 && m < 120) {
    const qty = Math.min(input.monthlySalesQty, remaining);
    const saleDate = addDays(sellStart, m * 30);
    const settleDate = addDays(saleDate, lag);
    raw.push({
      date: settleDate,
      label: `정산 입금 (${qty}개 판매분)`,
      amount: qty * input.settlementPerUnit,
    });
    remaining -= qty;
    m++;
  }

  raw.sort((a, b) => a.date.localeCompare(b.date));

  let balance = 0;
  let minBalance = 0;
  let recoveryDate: string | null = null;
  const timeline: CashEvent[] = raw.map((e) => {
    balance += e.amount;
    if (balance < minBalance) minBalance = balance;
    if (recoveryDate === null && balance >= 0 && e.amount > 0) recoveryDate = e.date;
    return { ...e, balance: Math.round(balance) };
  });

  const fullyRecovered = balance >= 0 && recoveryDate !== null;

  return {
    timeline,
    maxCashLocked: Math.round(-minBalance),
    recoveryDays: recoveryDate ? diffDays(input.paidDate, recoveryDate) : null,
    cccDays: recoveryDate ? diffDays(input.paidDate, recoveryDate) : null,
    fullyRecovered,
  };
}
