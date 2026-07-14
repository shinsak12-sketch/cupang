import { headers } from "next/headers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyBookmarklet } from "./BookmarkletClient";

export const dynamic = "force-dynamic";

/**
 * 1688 수집 북마클릿 (스펙 §6). 전 앱이 Basic Auth 뒤이므로 토큰을 서버에서 주입해 렌더.
 * 🔴 파서 실패시 조용히 죽지 말고 폴백(URL 수동등록) 안내.
 */
export default async function BookmarkletPage() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = `${proto}://${host}`;
  const token = process.env.INGEST_TOKEN ?? "INGEST_TOKEN_미설정";

  const code = `javascript:(function(){var t=${JSON.stringify(token)},b=${JSON.stringify(
    base
  )};function q(s){var e=document.querySelector(s);return e?e.textContent.trim():null;}var m=location.href.match(/offer\\/(\\d+)\\.html/);var payload={offerId:m?m[1]:null,url:location.href,name:q('h1')||document.title,images:[].slice.call(document.querySelectorAll('img')).map(function(i){return i.src;}).filter(function(s){return s&&s.indexOf('alicdn')>-1;}).slice(0,5),supplier:q('.company-name'),raw:{title:document.title}};fetch(b+'/api/ingest?token='+t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json();}).then(function(d){alert('cupang 저장 완료: product #'+(d.productId||'?'));}).catch(function(e){alert('수집 실패 ('+e+').\\nURL을 복사해 SKU 등록에서 수동 입력하세요(폴백).');});})();`;

  const tokenMissing = !process.env.INGEST_TOKEN;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">1688 수집 북마클릿</h1>
        <p className="text-sm text-muted-foreground">
          서버 fetch는 1688이 차단하므로, 로그인 세션 DOM을 긁는 북마클릿 방식을 씁니다.
        </p>
      </div>

      {tokenMissing && (
        <Card className="border-warn">
          <CardHeader>
            <CardTitle className="text-warn text-base">INGEST_TOKEN 미설정</CardTitle>
            <CardDescription>
              <code>.env</code> 에 <code>INGEST_TOKEN</code> 을 설정하면 실제 동작하는 코드가 생성됩니다.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">설치</CardTitle>
          <CardDescription>
            아래 코드를 복사 → 브라우저 북마크 새로 만들기 → URL 칸에 붙여넣기. 1688 상품
            페이지에서 북마크 클릭.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyBookmarklet code={code} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">폴백 2종 (파서 실패시)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            ① <b>URL 붙여넣기</b> — SKU 등록 폼에 상품 URL만 넣어도 <code>offer_id</code>가
            자동 파싱됩니다. 나머지는 수동 입력.
          </p>
          <p>
            ② <b>수집 실패 안내</b> — 북마클릿이 DOM에서 값을 못 찾으면 알림으로 폴백 방법을
            안내합니다(조용히 죽지 않음).
          </p>
          <p className="text-xs">
            🔴 1688 DOM 구조는 언제든 바뀝니다. 파서가 자주 실패하면 셀렉터를 업데이트하세요.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
