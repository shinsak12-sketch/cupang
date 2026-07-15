import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupButton } from "./SetupClient";

export const dynamic = "force-dynamic";

/**
 * 🔴 모바일/무CLI 셋업 화면. 전 앱이 Basic Auth 뒤이므로 INGEST_TOKEN 을 서버에서 주입.
 * db:push + db:seed 를 버튼 한 번으로.
 */
export default function SetupPage() {
  const token = process.env.INGEST_TOKEN ?? "";
  const missing = !process.env.INGEST_TOKEN;
  const noDb = !process.env.DATABASE_URL;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">DB 셋업 (모바일 전용)</h1>
        <p className="text-sm text-muted-foreground">
          CLI 없이 <b>스키마 생성 + 시딩</b>을 버튼 한 번으로. 배포 직후 최초 1회만 실행하세요.
        </p>
      </div>

      {(missing || noDb) && (
        <Card className="border-warn">
          <CardHeader>
            <CardTitle className="text-warn text-base">환경변수 필요</CardTitle>
            <CardDescription>
              {noDb && <>Vercel 프로젝트에 <code>DATABASE_URL</code>(Neon)이 필요합니다. </>}
              {missing && <><code>INGEST_TOKEN</code>이 있어야 셋업 버튼이 동작합니다. </>}
              배포 환경변수를 설정 후 재배포하세요.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">셋업 실행</CardTitle>
          <CardDescription>
            ① 16개 테이블 생성(재실행 안전) → ② 시드 CSV 5종 + 양말 데모 주입.
            <br />
            <span className="text-warn">fee_size_rule 은 비워둡니다 — 윙 확인 후 입력.</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {token ? (
            <SetupButton token={token} />
          ) : (
            <p className="text-sm text-muted-foreground">INGEST_TOKEN 설정 후 이용 가능합니다.</p>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        완료되면 <Link href="/" className="underline">대시보드</Link> 로 이동해 카테고리 125행 등이
        보이는지 확인하세요.
      </p>
    </div>
  );
}
