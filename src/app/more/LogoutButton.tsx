"use client";

import { LogOut } from "lucide-react";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button
      onClick={logout}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border/60 bg-card p-4 text-sm font-semibold text-muted-foreground shadow-card transition-all active:scale-[0.99]"
    >
      <LogOut className="h-4 w-4" /> 로그아웃
    </button>
  );
}
