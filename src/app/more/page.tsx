import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { InstallButton } from "@/components/install-button";
import {
  Percent,
  SlidersHorizontal,
  Ticket,
  DollarSign,
  Bookmark,
  DatabaseZap,
  Store,
  ChevronRight,
} from "lucide-react";

const ITEMS = [
  { href: "/settings/coupang-bookmarklet", icon: Store, title: "쿠팡 경쟁 북마클릿", desc: "검색결과 리뷰·PB·가격 수집" },
  { href: "/settings/setup", icon: DatabaseZap, title: "DB 셋업", desc: "최초 1회 · 스키마 생성 + 시딩" },
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
        <h1 className="text-2xl font-extrabold tracking-tight">설정</h1>
        <p className="text-sm text-muted-foreground">데이터 · 수수료 · 환율 관리</p>
      </div>

      <InstallButton />

      <div className="space-y-3">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-card transition-all hover:border-primary/30 active:scale-[0.99]"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
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

      <LogoutButton />
    </div>
  );
}
