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

  // 링크(/vp/products/{id}) 기반 휴리스틱 수집 → PC/모바일 쿠팡 DOM 모두 대응.
  const code = `javascript:(function(){
var t=${JSON.stringify(token)},b=${JSON.stringify(base)},PB=${JSON.stringify(PB)};
var p=new URLSearchParams(location.search);
var kw=p.get('q')||p.get('keyword')||p.get('searchKeyword')||'';
if(!kw){var mp=location.pathname.match(/search\\/([^/?#]+)/);if(mp)kw=decodeURIComponent(mp[1]);}
if(!kw){kw=prompt('검색 키워드를 입력하세요');}
if(!kw){return;}
kw=kw.trim();
var anchors=document.querySelectorAll('a[href*="/vp/products/"],a[href*="/products/"]');
var seen={},items=[],rank=0;
anchors.forEach(function(a){
 var href=a.getAttribute('href')||'';
 var m=href.match(/products\\/(\\d+)/);if(!m)return;
 var pid=m[1];if(seen[pid])return;
 var box=a.closest('li')||a.closest('[class*="ProductUnit"],[class*="product"],[class*="Product"]')||a.parentElement;
 if(!box)return;
 var txt=(box.textContent||'').replace(/\\s+/g,' ').trim();
 var name='';
 var ne=box.querySelector('.name,[class*="name"],[class*="Name"],.title,[class*="title"]');
 if(ne)name=(ne.textContent||'').trim();
 if(!name){var img=box.querySelector('img[alt]');if(img)name=(img.getAttribute('alt')||'').trim();}
 if(!name)name=(a.getAttribute('title')||a.textContent||'').trim();
 if(!name)return;
 name=name.replace(/\\s+/g,' ').slice(0,200);
 seen[pid]=1;rank++;
 var price=null;
 var pe=box.querySelector('.price-value,strong.price-value,[class*="priceValue"],[class*="price"],[class*="Price"]');
 if(pe){var pv=parseInt((pe.textContent||'').replace(/[^0-9]/g,''),10);if(!isNaN(pv)&&pv>0)price=pv;}
 if(price==null){var pm=txt.match(/([0-9][0-9,]{2,})\\s*원/);if(pm)price=parseInt(pm[1].replace(/,/g,''),10);}
 var reviews=null;
 var rc=box.querySelector('.rating-total-count,[class*="ratingCount"],[class*="reviewCount"],[class*="RatingCount"]');
 if(rc){var rv=parseInt((rc.textContent||'').replace(/[^0-9]/g,''),10);if(!isNaN(rv))reviews=rv;}
 if(reviews==null){var rm=txt.match(/\\(\\s*([0-9][0-9,]*)\\s*\\)/);if(rm)reviews=parseInt(rm[1].replace(/,/g,''),10);}
 var rocket=!!box.querySelector('img[alt*="로켓"],[class*="rocket"],[class*="Rocket"]')||/로켓/.test(txt);
 var isPb=PB.some(function(x){return name.indexOf(x)>-1;});
 items.push({productId:pid,name:name,price:price,reviewCount:reviews,isRocket:rocket,isPb:isPb,rank:rank});
});
if(items.length===0){alert('상품을 못 찾았어요.\\n· 쿠팡 앱이 아니라 브라우저인지\\n· 검색 결과 화면인지 확인 후 다시 눌러주세요.');return;}
fetch(b+'/api/coupang-research?token='+t,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:kw,items:items})}).then(function(r){return r.json();}).then(function(d){alert('저장 완료: "'+kw+'" '+(d.saved||items.length)+'개 수집');}).catch(function(e){alert('수집 실패('+e+'). 잠시 후 재시도하세요.');});
})();`
    .replace(/\n/g, "")
    .replace(/ /g, "%20") // 삼성 인터넷: URL 공백 불가 → 인코딩(실행 시 브라우저가 복원)
    .replace(/#/g, "%23"); // # 는 URL 프래그먼트로 잘리므로 인코딩

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
            <br />
            <b>모바일 쿠팡(m.coupang.com)도 이제 그대로 인식</b>해요. 데스크톱 모드 전환 불필요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CopyBookmarklet code={code} />

          <div className="rounded-xl bg-muted p-3 text-sm">
            <p className="font-semibold">📱 삼성 인터넷 등록 (최초 1회)</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">
              <li>위 <b>복사</b> 탭</li>
              <li>아무 페이지나 <b>북마크 추가</b>(주소창 별)</li>
              <li>북마크 <b>길게 눌러 → 편집</b></li>
              <li>주소(URL) 지우고 <b>붙여넣기</b>, 이름 <b>쿠팡수집</b></li>
            </ol>
            <p className="mt-2 font-semibold">사용할 때</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">
              <li>브라우저로 <b>coupang.com</b> 접속(앱 ❌) → 검색</li>
              <li>검색 결과 화면에서 <b>북마크 목록 → 쿠팡수집</b> 탭</li>
              <li>&quot;저장 완료 N개&quot; 뜨면 성공 → 상품 찾기에서 조회</li>
            </ol>
          </div>

          <div className="rounded-xl bg-muted p-3 text-sm">
            <p className="font-semibold">📱 크롬(안드로이드)</p>
            <p className="mt-1 text-muted-foreground">
              크롬은 북마크를 목록에서 못 눌러요. 위처럼 북마크 만들고 이름을 <b>쿠팡수집</b>으로 저장한 뒤,
              쿠팡 검색 결과 페이지에서 <b>주소창에 “쿠팡수집” 입력 → 뜨는 제안 탭</b>.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            💡 키워드는 자동 인식돼요. 혹시 못 잡으면 입력창이 떠서 직접 넣으면 됩니다.
          </p>
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
