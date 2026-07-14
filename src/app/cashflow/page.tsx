"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { won } from "@/lib/utils";

type CashEvent = { date: string; label: string; amount: number; balance: number };
type Result = {
  timeline: CashEvent[];
  maxCashLocked: number;
  recoveryDays: number | null;
  cccDays: number | null;
  fullyRecovered: boolean;
};

export default function CashflowPage() {
  const [f, setF] = useState({
    investmentKrw: "3000000",
    orderQty: "300",
    paidDate: "2026-07-01",
    inboundDate: "2026-08-15",
    monthlySalesQty: "80",
    settlementPerUnit: "7000",
    settlementLagDays: "15",
  });
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function run() {
    setBusy(true);
    const r = await fetch("/api/cashflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        investmentKrw: Number(f.investmentKrw),
        orderQty: Number(f.orderQty),
        paidDate: f.paidDate,
        inboundDate: f.inboundDate || null,
        monthlySalesQty: Number(f.monthlySalesQty),
        settlementPerUnit: Number(f.settlementPerUnit),
        settlementLagDays: Number(f.settlementLagDays),
      }),
    });
    setRes(await r.json());
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">캐시플로우</h1>
        <p className="text-sm text-muted-foreground">
          🔴 초보 실패 1순위는 마진이 아니라 현금순환. 1688 결제 → 정산까지 2~3개월 묶입니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">입력</CardTitle>
          <CardDescription>정산 1개당 실입금 ≈ 결제가 − 쿠팡수수료</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="투입원가(₩)" value={f.investmentKrw} onChange={set("investmentKrw")} />
          <Field label="주문수량" value={f.orderQty} onChange={set("orderQty")} />
          <Field label="결제일" value={f.paidDate} onChange={set("paidDate")} type="date" />
          <Field label="입고일" value={f.inboundDate} onChange={set("inboundDate")} type="date" />
          <Field label="월판매량" value={f.monthlySalesQty} onChange={set("monthlySalesQty")} />
          <Field label="정산/개(₩)" value={f.settlementPerUnit} onChange={set("settlementPerUnit")} />
          <Field label="정산지연(일)" value={f.settlementLagDays} onChange={set("settlementLagDays")} />
          <div className="flex items-end">
            <Button onClick={run} disabled={busy} className="w-full">
              계산
            </Button>
          </div>
        </CardContent>
      </Card>

      {res && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat title="🔴 최대 묶이는 현금" value={won(res.maxCashLocked)} />
            <Stat title="현금 회수" value={res.recoveryDays === null ? "미회수" : `D+${res.recoveryDays}`} />
            <Stat title="CCC (자본순환일)" value={res.cccDays === null ? "—" : `${res.cccDays}일`} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">타임라인</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>이벤트</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead className="text-right">누적잔고</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {res.timeline.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="tabular-nums">{e.date}</TableCell>
                      <TableCell>{e.label}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${e.amount < 0 ? "text-red-600" : "text-emerald-600"}`}
                      >
                        {e.amount < 0 ? "−" : "+"}
                        {won(Math.abs(e.amount)).replace("₩", "₩")}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${e.balance < 0 ? "text-red-600" : ""}`}
                      >
                        {won(e.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input value={value} onChange={onChange} type={type} inputMode={type === "date" ? undefined : "numeric"} />
    </div>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
