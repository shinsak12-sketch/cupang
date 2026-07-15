import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "cupang — 로켓그로스 수익계산기",
  description: "1688 사입 → 쿠팡 로켓그로스 판매 개인 셀러용 수익 계산·관리",
};

const NAV = [
  { href: "/", label: "대시보드" },
  { href: "/products", label: "SKU" },
  { href: "/compare", label: "비교" },
  { href: "/cashflow", label: "캐시플로우" },
  { href: "/settings/fees", label: "수수료" },
  { href: "/settings/assumptions", label: "가정값" },
  { href: "/settings/promotions", label: "프로모션" },
  { href: "/settings/fx", label: "환율" },
  { href: "/settings/bookmarklet", label: "북마클릿" },
  { href: "/settings/setup", label: "셋업" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <header className="border-b">
              <div className="container flex h-14 items-center gap-6">
                <Link href="/" className="font-bold tracking-tight">
                  🚀 cupang
                </Link>
                <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {NAV.map((n) => (
                    <Link key={n.href} href={n.href} className="hover:text-foreground">
                      {n.label}
                    </Link>
                  ))}
                </nav>
              </div>
            </header>
            <main className="container flex-1 py-6">{children}</main>
            <footer className="border-t py-4 text-center text-xs text-muted-foreground">
              추정치는 <span className="font-semibold text-warn">노란 배지</span>로 표시됩니다 · 윙 실측 확인 후 교체하세요
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
