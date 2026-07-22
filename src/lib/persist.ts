"use client";

import { useEffect, useState } from "react";

/**
 * 화면 전환(클라이언트 네비게이션) 사이에 상태를 유지하는 훅.
 * 엑셀 시트 여러 개 켜둔 것처럼, 탭을 왔다갔다 해도 입력값이 살아있다.
 * (모듈 레벨 Map은 SPA 내비게이션 동안 유지됨. 하드 새로고침 시에는 초기화.)
 */
const store = new Map<string, unknown>();

export function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial));
  useEffect(() => {
    store.set(key, state);
  }, [key, state]);
  return [state, setState] as const;
}

/** 훅 밖에서 저장 상태를 직접 세팅(다음에 그 화면이 마운트될 때 반영). */
export function setPersisted(key: string, value: unknown) {
  store.set(key, value);
}

/** 특정 prefix(예: "calc.")로 시작하는 저장 상태 제거. */
export function clearPersisted(prefix: string) {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}
