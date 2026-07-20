import Link from "next/link";
import {
  Percent,
  SlidersHorizontal,
  Ticket,
  DollarSign,
  Bookmark,
  DatabaseZap,
  Wallet,
  BarChart3,
  ChevronRight,
} from "lucide-react";

const ITEMS = [
  { href: "/settings/setup", icon: DatabaseZap, title: "DB 셋업", desc: "최초 1회 · 스키마 생성 + 시딩", accent: true },
  { href: "/compare", icon: BarChart3, title: "비교 분석", desc: "저장 상품 마진 순 랭킹" },
  { href: "/cashflow", icon: Wallet, title: "캐시플로우", desc: "결제→정산 현금 묶임·회수일" },
  { href: "/settings/fees", icon: Percent, title: "수수료 테이블", desc: "카테고리 요율 · 물류비 · 업로드(diff)" },
  { href: "/settings/assumptions", icon: SlidersHorizontal, title: "가정값", desc: "반품률·ROAS·보관일 (추정치)" },
  { href: "/settings/promotions", icon: Ticket, title: "프로모션", desc: "신규 90일 · my_start_date 입력" },
  { href: "/settings/fx", icon: DollarSign, title: "환율", desc: "관세청 고시 / 대행 / 은행" },
  { href: "/settings/bookmarklet", icon: Bookmark, title: "1688 북마클릿", desc: "상품 수집 · 폴백 안내" },
];

export default function MorePage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">더보기</h1>
        <p className="text-sm text-muted-foreground">설정 · 데이터 관리</p>
      </div>

      <div className="space-y-3">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-4 rounded-2xl border p-4 shadow-card transition-all active:scale-[0.99] ${
                it.accent
                  ? "border-primary/30 bg-accent"
                  : "border-border/60 bg-card hover:border-primary/30"
              }`}
            >
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                  it.accent ? "bg-primary text-primary-foreground shadow-pop" : "bg-muted text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{it.title}</span>
                <span className="block truncate text-sm text-muted-foreground">{it.desc}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
