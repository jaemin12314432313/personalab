// 체험용 샘플 사이트. 에이전트(AI 연결) 없이도 화면 연결 → 실행 → 결과까지 끝까지 돌려 볼 수 있다.
// 서버에는 일반 HTML 업로드와 똑같이 올라가므로 별도 경로가 없다. 링크로만 이동하고 데이터를 보내지 않는다.

const page = (title: string, body: string) =>
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
  `<style>body{margin:0;font-family:system-ui,'Malgun Gothic',sans-serif;color:#1d1b18;background:#faf8f4}header{display:flex;gap:20px;align-items:center;padding:18px 48px;border-bottom:1px solid #e6e0d6;background:#fff}` +
  `header b{font-size:20px;margin-right:auto}header a{color:#5b5348;text-decoration:none;font-size:15px}main{max-width:880px;margin:0 auto;padding:56px 24px}h1{font-size:34px;margin:0 0 14px}p{line-height:1.7;color:#4a443b}` +
  `.btn{display:inline-block;margin-top:18px;padding:13px 24px;border-radius:10px;background:#1d1b18;color:#fff;text-decoration:none;font-size:16px}` +
  `.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin-top:28px}.card{padding:22px;border:1px solid #e6e0d6;border-radius:14px;background:#fff}.card h3{margin:0 0 8px}` +
  `.card a{color:#1d1b18;font-weight:600}label{display:block;margin:16px 0 6px;font-weight:600}input{width:100%;max-width:420px;padding:12px;border:1px solid #cfc7ba;border-radius:8px;font-size:15px}</style></head><body>` +
  `<header><b>모아북</b><a href="/index.html">홈</a><a href="/books.html">책 둘러보기</a><a href="/plans.html">요금 안내</a><a href="/signup.html">시작하기</a></header><main>${body}</main></body></html>`;

export const SAMPLE_SITE = {
  name: '모아북 (샘플)',
  description: '읽은 책을 기록하고 이번 달 독서 목표를 관리하는 앱·웹 서비스 샘플입니다.',
  entry: 'index.html',
  files: {
    'index.html': page('모아북 — 읽은 책을 모아 두는 곳',
      '<h1>읽은 책을 한곳에 모아 두세요</h1><p>모아북은 읽은 책과 느낀 점을 간단히 기록하고, 이번 달 독서 목표를 알려 주는 서비스예요.</p>' +
      '<a class="btn" href="/signup.html">무료로 시작하기</a> <a class="btn" style="background:#8a7f6c" href="/books.html">책 둘러보기</a>' +
      '<div class="grid"><div class="card"><h3>간단한 기록</h3><p>제목과 한 줄 감상만 적으면 끝나요.</p></div><div class="card"><h3>월간 목표</h3><p>이번 달에 몇 권 읽었는지 한눈에 봐요.</p></div><div class="card"><h3>추천</h3><p>비슷한 책을 골라 드려요. <a href="/books.html">지금 보기</a></p></div></div>'),
    'books.html': page('책 둘러보기 — 모아북',
      '<h1>이번 주 인기 책</h1><p>눌러서 자세한 소개를 확인해 보세요.</p><div class="grid">' +
      '<div class="card"><h3>느리게 읽는 하루</h3><p>바쁜 일상에서 독서 시간을 만드는 법.</p><a href="/book-1.html">자세히 보기</a></div>' +
      '<div class="card"><h3>작은 습관의 힘</h3><p>하루 10분으로 시작하는 기록.</p><a href="/book-2.html">자세히 보기</a></div>' +
      '<div class="card"><h3>밤의 도서관</h3><p>잠들기 전 읽기 좋은 짧은 소설.</p><a href="/book-1.html">자세히 보기</a></div></div>'),
    'book-1.html': page('느리게 읽는 하루 — 모아북',
      '<h1>느리게 읽는 하루</h1><p>바쁜 일상에서도 하루 15분 독서 시간을 만드는 방법을 다룬 에세이예요. 읽은 뒤 모아북에 기록하면 월간 목표에 반영돼요.</p>' +
      '<a class="btn" href="/signup.html">이 책 기록하러 시작하기</a> <a class="btn" style="background:#8a7f6c" href="/books.html">목록으로</a>'),
    'book-2.html': page('작은 습관의 힘 — 모아북',
      '<h1>작은 습관의 힘</h1><p>거창한 목표 대신 하루 10분 기록으로 시작하는 독서 습관 이야기예요.</p>' +
      '<a class="btn" href="/plans.html">요금 안내 보기</a> <a class="btn" style="background:#8a7f6c" href="/books.html">목록으로</a>'),
    'plans.html': page('요금 안내 — 모아북',
      '<h1>요금 안내</h1><p>기본 기능은 무료이고, 더 많은 기록이 필요하면 월 구독을 선택할 수 있어요.</p><div class="grid">' +
      '<div class="card"><h3>무료</h3><p>월 5권까지 기록</p></div><div class="card"><h3>플러스 · 월 3,900원</h3><p>무제한 기록, 추천 책 목록</p></div></div><a class="btn" href="/signup.html">가입 화면으로 이동</a>'),
    'signup.html': page('시작하기 — 모아북',
      '<h1>모아북 시작하기</h1><p>이메일과 닉네임만 있으면 돼요.</p><label for="e">이메일</label><input id="e" type="email" placeholder="you@example.com">' +
      '<label for="n">닉네임</label><input id="n" type="text" placeholder="책벌레"><br><a class="btn" href="/welcome.html">가입 완료하기</a>'),
    'welcome.html': page('환영해요 — 모아북',
      '<h1>가입을 환영해요!</h1><p>첫 책을 기록하고 이번 달 목표를 정해 보세요.</p><a class="btn" href="/books.html">첫 책 고르러 가기</a>'),
  } as Record<string, string>,
};

/** 서버 업로드 형식(경로 + base64)으로 바꾼다. 한글이 있어 UTF-8 바이트 기준으로 인코딩한다. */
export function sampleSitePayload() {
  const enc = new TextEncoder();
  const files = Object.entries(SAMPLE_SITE.files).map(([path, text]) => {
    let binary = '';
    for (const byte of enc.encode(text)) binary += String.fromCharCode(byte);
    return { path, data: btoa(binary) };
  });
  return { files, entry: SAMPLE_SITE.entry };
}
