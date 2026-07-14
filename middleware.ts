import { NextRequest, NextResponse } from "next/server";

/**
 * 전 경로 Basic Auth (CLAUDE_CODE_PROMPT §1 인증 규칙).
 * 🔴 단 /api/ingest 는 제외 — 북마클릿이 호출하므로 Basic Auth 불가.
 *    (해당 라우트 내부에서 ?token=INGEST_TOKEN 을 자체 검증)
 *
 * Edge 런타임에서 동작하므로 process.env 직접 접근 (getServerEnv 는 zod 의존 → node 전용).
 */
export const config = {
  // _next 정적 자산·파비콘 제외한 전 경로. /api/ingest 는 아래 로직에서 스킵.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

function unauthorized() {
  return new NextResponse("인증이 필요합니다.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="cupang", charset="UTF-8"' },
  });
}

// timing-safe 비교 (Edge 호환 — crypto.subtle 없이 상수시간 근사)
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 🔴 북마클릿 인제스트 엔드포인트는 Basic Auth 제외
  if (pathname.startsWith("/api/ingest")) {
    return NextResponse.next();
  }

  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;

  // 자격증명 미설정시 잠금 (기본 안전)
  if (!user || !pass) {
    return new NextResponse(
      "서버 인증 정보(BASIC_AUTH_USER/PASS)가 설정되지 않았습니다.",
      { status: 500 }
    );
  }

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const idx = decoded.indexOf(":");
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);
    if (safeEqual(u, user) && safeEqual(p, pass)) {
      return NextResponse.next();
    }
  }
  return unauthorized();
}
