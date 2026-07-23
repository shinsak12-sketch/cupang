"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { won } from "@/lib/utils";

/** 이번 달 목표 마진 진척 (기기 로컬 저장 + /api/stats의 이번 달 마진). */
export function MonthlyGoal() {
  const { data } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const r = await fetch("/api/stats");
      return r.ok ? r.json() : null;
    },
  });
  const current = data?.sales?.thisMonthMargin ?? 0;

  const [goal, setGoal] = useState(0);
  const [editing, setEditing] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  useEffect(() => {
    setGoal(Number(localStorage.getItem("cupang.monthlyGoal") || "0"));
  }, []);
  const saveGoal = () => {
    const g = Number(goalInput.replace(/[,\s]/g, "")) || 0;
    localStorage.setItem("cupang.monthlyGoal", String(g));
    setGoal(g);
    setEditing(false);
  };
  const progress = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;

  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-accent to-transparent shadow-pop">
      <CardContent className="p-5">
        <div className="mb-2 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="font-bold">이번 달 목표</span>
          {goal > 0 && !editing && (
            <button
              onClick={() => {
                setGoalInput(String(goal));
                setEditing(true);
              }}
              className="ml-auto text-muted-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>

        {goal <= 0 || editing ? (
          <div className="flex items-center gap-2">
            <Input
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              inputMode="numeric"
              placeholder="목표 마진 (원)"
              autoFocus
            />
            <Button size="sm" onClick={saveGoal}>
              저장
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-extrabold tabular-nums">{won(current)}</span>
              <span className="pb-0.5 text-sm text-muted-foreground">
                / {won(goal)} · <b className="text-foreground">{progress}%</b>
              </span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${progress >= 100 ? "bg-emerald-500" : "bg-primary"}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {current >= goal ? "🎉 목표 달성!" : `목표까지 ${won(goal - current)} 남음`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
