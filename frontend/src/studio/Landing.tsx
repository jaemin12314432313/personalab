import { ArrowRight, ChevronRight } from "lucide-react";
import { DEMO, DROP_LABELS, statistics } from "./model";

export default function Landing({ create, openDemo }: { create: () => void; openDemo: () => void }) {
  const stats = statistics(DEMO.results);
  return <div className="v2-landing clean-landing">
    <div className="clean-hero">
      <div className="clean-hero-copy">
        <p className="clean-kicker">출시 전, 제품을 살펴보는 새로운 방법</p>
        <h1>묻지 않고,<br />직접 써보게 합니다.</h1>
        <p className="clean-hero-description">프로토타입을 AI 페르소나가 먼저 살펴봅니다.<br className="clean-desktop-break" />어디서 막히고 왜 멈췄는지, 기록을 따라 확인하세요.<br className="clean-desktop-break" />다음에 바꿀 화면이 조금 더 분명해집니다.</p>
        <div className="clean-hero-actions"><button className="v2-button primary" onClick={create}>테스트 시작하기 <ArrowRight size={15} /></button><button className="v2-button" onClick={openDemo}>샘플 결과 보기</button></div>
        <p className="clean-hero-footnote">제품 소개부터 프로토타입 탐색, 페르소나별 기록까지.</p>
      </div>

      <section className="clean-preview" aria-labelledby="preview-title">
        <header className="clean-preview-heading"><div><span>일정메이트 · 온보딩</span><h2 id="preview-title">프로토타입 탐색 기록</h2></div><span className="clean-sample-label">저장된 데모</span></header>
        <div className="clean-preview-context"><span>과제</span><strong>회원가입을 완료하세요</strong><span className="clean-preview-count">AI 페르소나 5명</span></div>
        <div className="clean-flow" aria-label="온보딩에서 회원가입으로 이동한 뒤 중단한 기록">{DEMO.screens.map((s, index) => <div className={index === 1 ? "is-stop" : index > 1 ? "is-unvisited" : ""} key={s.id}><span>{s.id}</span><strong>{s.label}</strong><i /></div>)}</div>
        <div className="clean-table-scroll"><table className="clean-preview-table"><thead><tr><th scope="col">페르소나</th><th scope="col">이동 경로</th><th scope="col">중단 이유</th><th scope="col"><span className="clean-visually-hidden">기록 보기</span></th></tr></thead><tbody>{DEMO.results.map((r, i) => <tr key={r.id}><td><button onClick={openDemo} aria-label={`${r.persona_id}의 리포트 보기`}>{r.persona_id}<small>{DEMO.personas[i].attributes.profile.age}세 직장인</small></button></td><td><span className="clean-table-path">S01 <span>→</span> <strong>S02</strong></span></td><td>{DROP_LABELS[r.act?.end.drop_reason || ""] || "—"}</td><td><button className="clean-row-link" onClick={openDemo} aria-label={`${r.persona_id}의 전체 기록 열기`}><ChevronRight size={14} /></button></td></tr>)}</tbody></table></div>
        <div className="clean-preview-summary"><span>가장 많이 멈춘 곳</span><strong>회원가입 <span>{stats.topScreens[0]?.[1] || 0}명</span></strong></div>
        <footer className="clean-preview-footer"><span>AI가 생성한 응답과 탐색 기록입니다.</span><button onClick={openDemo}>전체 리포트 보기 <ArrowRight size={13} /></button></footer>
      </section>
    </div>

    <section className="clean-process" id="how" aria-labelledby="process-title"><div className="clean-section-heading"><span>이용 방법</span><h2 id="process-title">기획부터 확인까지,<br />하나의 흐름으로.</h2><p>지금 만들고 있는 제품으로 시작할 수 있습니다.</p></div><div className="clean-process-grid">{[
      { title: "제품과 과제를 정합니다", text: "제품 소개와 프로토타입의 화면·버튼 연결을 준비하고, 확인할 과제를 정합니다." },
      { title: "페르소나 패널을 구성합니다", text: "공개 데이터의 분포와 조사 자료를 반영해 제품을 살펴볼 패널을 샘플링합니다." },
      { title: "의견과 탐색 기록을 봅니다", text: "같은 패널이 제품에 대해 답하고 화면을 탐색합니다. 멈춘 위치와 이유를 기록합니다." },
      { title: "다음 수정을 결정합니다", text: "전체 결과에서 개별 응답까지 살펴보고, 바꾼 화면은 새로운 테스트로 다시 확인합니다." },
    ].map((item, i) => <article key={item.title}><span className="clean-process-number">0{i + 1}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>

    <section className="clean-reason-section"><div className="clean-section-heading"><span>결과를 읽는 방법</span><h2>물었을 때의 걱정과,<br />멈췄을 때의 이유.</h2><p>같은 페르소나의 답과 기록을 나란히 봅니다.<br />전체 비율이 같아도, 개인의 이유는 달라질 수 있습니다.</p><button className="v2-text-button" onClick={openDemo}>샘플에서 확인하기 <ArrowRight size={14} /></button></div><div className="clean-reason-example"><div className="clean-reason-person"><strong>P563</strong><span>34세 직장인 · 저장된 데모</span></div><article><span className="clean-reason-mode">제품 설명을 읽었을 때 · Ask</span><h3>가격이 부담스러워요.</h3><p>“지금 쓰는 네이버 캘린더로도 충분하거든요.”</p></article><article><span className="clean-reason-mode act">회원가입에서 멈췄을 때 · Act</span><h3>휴대폰 인증까지 필요한가요?</h3><p>“개인정보 털릴 것 같아서 그냥 찜찜하네.”</p></article><footer>AI 생성 응답 · Synthetic User Response<br />위 제목은 기록을 요약한 문구이며, 인용문은 저장된 응답의 일부입니다.</footer></div></section>

    <section className="clean-evidence-note"><h2>근거와 한계를 함께 보여드립니다.</h2><div><p>리포트에는 화면별 도달, 클릭 경로, 완료 여부와 이탈 이유처럼 기록으로 확인할 수 있는 정보를 담습니다.</p><p>AI 결과는 가설을 살펴보는 자료입니다. 실제 사용자 데이터가 수집되기 전에는 실측 오차를 만들어 표시하지 않습니다.</p></div></section>
    <section className="clean-closing"><div><span>다음 제품의 결정을 위해</span><h2>먼저 확인하고,<br />다음 버전을 만드세요.</h2></div><div><p>작은 과제 하나부터 시작하세요.</p><button className="v2-button primary" onClick={create}>테스트 시작하기 <ArrowRight size={15} /></button></div></section>
    <footer className="clean-footer"><strong>PersonaLab</strong><span>제품을 이해하는 또 하나의 시선.</span><span>© 2026 PersonaLab</span></footer>
  </div>;
}
