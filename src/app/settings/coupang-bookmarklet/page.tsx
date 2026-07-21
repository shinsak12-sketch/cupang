import { headers } from "next/headers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyBookmarklet } from "../bookmarklet/BookmarkletClient";

export const dynamic = "force-dynamic";

/**
 * 쿠팡 검색결과 경쟁분석 북마클릿 (서버 fetch는 쿠팡이 차단 → 로그인 브라우저 DOM 수집).
 */
export default async function CoupangBookmarkletPage() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = `${proto}://${host}`;
  const token = process.env.INGEST_TOKEN ?? "INGEST_TOKEN_미설정";
  const tokenMissing = !process.env.INGEST_TOKEN;

  // 쿠팡 PB 브랜드 감지용
  const PB = ["곰곰", "탐사", "코멧", "홈플래닛", "줌마트", "마케이토리", "베이스알파", "꼬리별", "이스트래빗", "코멧라이프"];

  const code = `javascript:(function(){
var t=${JSON.stringify(token)},b=${JSON.stringify(base)},PB=${JSON.stringify(PB)};
var kw=new URLSearchParams(location.search).get('q')||'';
if(!kw){alert('쿠팡 검색결과 페이지(np/search?q=키워드)에서 실행하세요.');return;}
var lis=document.querySelectorAll('li.search-product, li[data-product-id], ul#product-list>li, ul#productList>li');
var items=[],rank=0;
lis.forEach(function(li){
 var name=(li.querySelector('.name')||{}).textContent||'';
 if(!name)return; rank++;
 var pid=li.getAttribute('data-product-id')||'';
 if(!pid){var a=li.querySelector('a[href*="/vp/products/"]');if(a){var m=a.getAttribute('href').match(/products\\/(\\d+)/);if(m)pid=m[1];}}
 var pe=li.querySelector('.price-value, strong.price-value, .price');
 var price=pe?parseInt((pe.textContent||'').replace(/[^0-9]/g,''),10):null;
 var rc=li.querySelector('.rating-total-count');
 var reviews=rc?parseInt((rc.textContent||'').replace(/[^0-9]/g,''),10):null;
 var rocket=!!li.querySelector('.badge.rocket, img[alt*="로켓"], .badge-rocket');
 var isPb=PB.some(function(p){return name.indexOf(p)>-1;});
 items.push({productId:pid,name:name.trim(),price:isNaN(price)?null:price,reviewCount:isNaN(reviews)?null:reviews,isRocket:rocket,isPb:isPb,rank:rank});
});
if(items.length===0){alert('상품을 못 찾았습니다. 쿠팡 검색결과 페이지가 맞는지 확인하세요(폴백: 페이지 새로고침 후 재시도).');return;}
fetch(b+'/api/coupang-research?token='+t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:kw,items:items})}).then(function(r){return r.json();}).then(function(d){alert('저장 완료: "'+kw+'" '+(d.saved||0)+'개 상품 수집');}).catch(function(e){alert('수집 실패('+e+'). 잠시 후 재시도하세요.');});
})();`.replace(/\n/g, "");

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">쿠팡 경쟁분석 북마클릿</h1>
        <p className="text-sm text-muted-foreground">
          쿠팡 검색결과에서 상품명·가격·리뷰수·로켓·PB 여부를 수집합니다.
        </p>
      </div>

      {tokenMissing && (
        <Card className="border-warn">
          <CardHeader>
            <CardTitle className="text-warn text-base">INGEST_TOKEN 미설정</CardTitle>
            <CardDescription>환경변수에 INGEST_TOKEN 설정 후 동작합니다.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">설치 & 사용</CardTitle>
          <CardDescription>
            아래 코드 복사 → 북마크 새로 만들기 → URL에 붙여넣기.
            <br />쿠팡 앱/웹에서 <b>키워드 검색</b> 후 그 결과 페이지에서 북마크 클릭.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyBookmarklet code={code} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">🔴 판매량 추정 정확도 올리기</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>· 같은 키워드를 <b>3~7일 간격으로 2번 이상</b> 수집하면 리뷰 증가속도로 판매량을 추정합니다.</p>
          <p>· 1회만 수집하면 누적 리뷰수만 보이고 판매량은 &quot;재수집 필요&quot;로 표시돼요.</p>
          <p>· 결과는 <b>키워드 조사</b> 화면에서 확인합니다.</p>
        </CardContent>
      </Card>
    </div>
  );
}
