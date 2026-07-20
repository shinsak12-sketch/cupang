import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { TopBar, BottomNav } from "@/components/app-nav";

export const metadata: Metadata = {
  title: "마진계산기 — 쿠팡 로켓그로스",
  description: "사입 원가부터 입력해 이 상품 팔면 얼마 남는지 계산·관리",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <TopBar />
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-28 md:pb-8">
              {children}
            </main>
            <BottomNav />
          </div>
        </Providers>
      </body>
    </html>
  );
}
