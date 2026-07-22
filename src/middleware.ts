import { NextRequest, NextResponse } from "next/server";
import { sessionToken, SESSION_COOKIE } from "@/lib/auth";

/**
 * 폼 로그인(쿠키 세션) 인증.
 * - /login, /api/login, /api/logout : 공개 (로그인 흐름)
 * - /api/ingest : 북마클릿 → 세션 제외, 자체 토큰 검증
 * - 그 외 : 세션 쿠키 없으면 페이지는 /login 리다이렉트, API는 401
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg).*)"],
};

const PUBLIC = ["/login", "/api/login", "/api/logout"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 북마클릿(외부 origin) → 세션 제외, 각 라우트가 토큰 검증
  if (pathname.startsWith("/api/ingest")) return NextResponse.next();
  // 쿠팡 북마클릿 POST(수집)만 세션 제외. GET(조회)은 로그인 필요.
  if (pathname.startsWith("/api/coupang-research") && (req.method === "POST" || req.method === "OPTIONS")) {
    return NextResponse.next();
  }
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  const pass = process.env.BASIC_AUTH_PASS;
  if (!pass) {
    return new NextResponse("서버 비밀번호(BASIC_AUTH_PASS)가 설정되지 않았습니다.", { status: 500 });
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const expected = await sessionToken(pass);
  if (cookie && cookie === expected) return NextResponse.next();

  // 미인증
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}
