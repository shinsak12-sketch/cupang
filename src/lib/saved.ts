"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** 상품찾기에서 "아이템 저장"한 후보 (Neon DB 저장 → 기기 간 동기화). */
export type SavedItem = {
  keyword: string;
  verdict?: string | null;
  margin?: string | null;
  reason?: string | null;
  caution?: string | null;
  monthlyVolume?: number | null;
  comp?: string | null;
};

const KEY = ["saved"] as const;

async function fetchSaved(): Promise<SavedItem[]> {
  const r = await fetch("/api/saved");
  if (!r.ok) return [];
  const j = (await r.json()) as { items?: SavedItem[] };
  return j.items ?? [];
}

export function useSaved() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: KEY, queryFn: fetchSaved, staleTime: 30_000 });

  const addM = useMutation({
    mutationFn: async (item: SavedItem) => {
      await fetch("/api/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
    },
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<SavedItem[]>(KEY) ?? [];
      qc.setQueryData<SavedItem[]>(KEY, [item, ...prev.filter((x) => x.keyword !== item.keyword)]);
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(KEY, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const removeM = useMutation({
    mutationFn: async (keyword: string) => {
      await fetch(`/api/saved?keyword=${encodeURIComponent(keyword)}`, { method: "DELETE" });
    },
    onMutate: async (keyword) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<SavedItem[]>(KEY) ?? [];
      qc.setQueryData<SavedItem[]>(KEY, prev.filter((x) => x.keyword !== keyword));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(KEY, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const has = (keyword: string) => data.some((x) => x.keyword === keyword);
  const toggle = (item: SavedItem) => (has(item.keyword) ? removeM.mutate(item.keyword) : addM.mutate(item));
  const remove = (keyword: string) => removeM.mutate(keyword);

  return { items: data, has, toggle, remove };
}
