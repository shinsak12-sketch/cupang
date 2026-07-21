/**
 * 폼 로그인용 세션 토큰. Edge(middleware)·Node(route) 양쪽에서 동작하도록 Web Crypto 사용.
 * 토큰 = SHA-256(고정 prefix + 비밀번호). 비밀번호를 노출하지 않으면서 세션 검증 가능.
 */
export async function sessionToken(pass: string): Promise<string> {
  const data = new TextEncoder().encode("cupang.session.v1:" + pass);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const SESSION_COOKIE = "cupang_session";
