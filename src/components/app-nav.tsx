"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calculator, Package, ClipboardList, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { href: "/", label: "홈", icon: Home },
  { href: "/calc", label: "계산", icon: Calculator },
  { href: "/products", label: "목록", icon: Package },
  { href: "/manage", label: "관리", icon: ClipboardList },
  { href: "/more", label: "더보기", icon: LayoutGrid },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/more") return pathname.startsWith("/settings") || pathname === "/more" || pathname === "/compare" || pathname === "/cashflow";
  return pathname === href || pathname.startsWith(href + "/");
}

export function TopBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground shadow-pop">
            🧮
          </span>
          마진계산기
        </Link>
        {/* 데스크톱 전용 가로 내비 */}
        <nav className="hidden gap-1 md:flex">
          {PRIMARY.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                isActive(pathname, n.href)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-lg md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 px-2 pb-[env(safe-area-inset-bottom)]">
        {PRIMARY.map((n) => {
          const active = isActive(pathname, n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-12 place-items-center rounded-full transition-colors",
                  active && "bg-accent"
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              </span>
              {n.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
