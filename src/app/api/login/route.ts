import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sessionToken, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "비밀번호를 입력하세요" }, { status: 400 });

  const pass = process.env.BASIC_AUTH_PASS;
  if (!pass) return NextResponse.json({ error: "서버 비밀번호 미설정" }, { status: 500 });

  if (parsed.data.password !== pass) {
    return NextResponse.json({ error: "비밀번호가 틀렸습니다" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionToken(pass), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30일
  });
  return res;
}
