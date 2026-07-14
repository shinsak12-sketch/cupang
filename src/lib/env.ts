import { z } from "zod";

/**
 * 환경변수 검증. 서버에서만 import 할 것 (DATABASE_URL 등 시크릿 포함).
 * 빌드시점이 아니라 런타임에 접근하도록 lazy getter 사용.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BASIC_AUTH_USER: z.string().min(1),
  BASIC_AUTH_PASS: z.string().min(1),
  INGEST_TOKEN: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`환경변수 설정 오류: ${missing}. .env.example 참고`);
  }
  cached = parsed.data;
  return cached;
}
