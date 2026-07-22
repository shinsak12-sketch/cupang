"use client";

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    setInstalled(standalone);
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone);
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  // 설치 프롬프트 사용 가능(안드로이드 크롬 등)
  if (deferred) {
    return (
      <button
        onClick={async () => {
          await deferred.prompt();
          await deferred.userChoice.catch(() => {});
          setDeferred(null);
        }}
        className="flex w-full items-center gap-4 rounded-2xl border-2 border-primary/30 bg-accent p-4 shadow-card transition-all active:scale-[0.99]"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-pop">
          <Download className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block font-bold">홈 화면에 앱으로 추가</span>
          <span className="block text-sm text-muted-foreground">주소창 없이 앱처럼 바로 실행</span>
        </span>
      </button>
    );
  }

  // iOS Safari — beforeinstallprompt 미지원 → 수동 안내
  if (isIOS) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-card">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
          <Share className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">홈 화면에 앱으로 추가</span>
          <span className="block text-sm text-muted-foreground">
            사파리 <b>공유</b> 버튼 → <b>홈 화면에 추가</b>
          </span>
        </span>
      </div>
    );
  }

  // 그 외(설치 조건 미충족/데스크톱 등)
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-card">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
        <Download className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">홈 화면에 앱으로 추가</span>
        <span className="block text-sm text-muted-foreground">
          브라우저 메뉴(⋮) → <b>앱 설치</b> / <b>홈 화면에 추가</b>
        </span>
      </span>
    </div>
  );
}
