import { ArrowRight } from "lucide-react";
import { WorkspacePreview } from "./StudyWorkspace";

export default function ProductLanding({ create, openDemo, openWorkspace }: { create: () => void; openDemo: () => void; openWorkspace: () => void }) {
  return <div className="v2-landing clean-landing">
    <section className="clean-hero">
      <div className="clean-hero-copy">
        <p className="clean-kicker">제품을 만드는 팀을 위한 AI 리서치</p>
        <h1>묻지 않고,<br />직접 써보게 합니다.</h1>
        <p className="clean-hero-description">AI 페르소나가 제품을 살펴보고, 프로토타입을 탐색합니다.<br className="clean-desktop-break" />어디서 막히고 왜 멈추는지 확인해, 다음 수정을 결정하세요.</p>
        <div className="clean-hero-actions"><button className="v2-button primary" onClick={create}>내 제품으로 시작하기 <ArrowRight size={18} /></button><button className="v2-button" onClick={openDemo}>샘플 리포트 보기</button></div>
        <p className="clean-hero-footnote">제품 설명과 프로토타입으로 시작할 수 있습니다.</p>
      </div>

      <WorkspacePreview open={openWorkspace} />
      <p className="clean-preview-bridge">제품 소개부터 프로토타입 탐색, 개별 응답까지. 하나의 테스트에서 이어집니다.</p>
    </section>

    <section className="clean-process" id="how" aria-labelledby="process-title"><div className="clean-section-heading"><span>이용 방법</span><h2 id="process-title">제품을 이해하는 과정이<br />더 짧고, 더 분명해집니다.</h2><p>하나의 테스트 안에서 기획과 탐색, 결과 확인을 이어갑니다.</p></div><div className="clean-process-grid">{[
      { title: "제품과 과제를 정합니다", text: "제품 소개와 프로토타입을 준비하고, 확인할 과제를 정합니다." },
      { title: "페르소나를 구성합니다", text: "공개 데이터의 분포와 조사 자료를 반영해 패널을 샘플링합니다." },
      { title: "답변과 경로를 봅니다", text: "같은 패널이 제품을 평가하고 화면을 탐색하며 기록을 남깁니다." },
      { title: "다음 수정을 결정합니다", text: "전체 결과와 개별 응답을 확인하고, 수정한 화면을 다시 살펴봅니다." },
    ].map((item, i) => <article key={item.title}><span className="clean-process-number">0{i + 1}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>

    <section className="clean-reason-section"><div className="clean-section-heading"><span>결과를 읽는 방법</span><h2>숫자 다음에,<br />그 이유가 있습니다.</h2><p>물었을 때의 걱정과 탐색 중 멈춘 이유는 다를 수 있습니다. 같은 페르소나의 응답을 연결해 보세요.</p><button className="v2-text-button" onClick={openDemo}>샘플 리포트 살펴보기 <ArrowRight size={18} /></button></div><div className="clean-reason-example"><div className="clean-reason-person"><strong>P563</strong><span>34세 직장인 · 저장된 데모</span></div><article><span className="clean-reason-mode">제품 설명을 읽었을 때 · Ask</span><h3>가격이 부담스러워요.</h3><p>“지금 쓰는 네이버 캘린더로도 충분하거든요.”</p></article><article><span className="clean-reason-mode act">회원가입에서 멈췄을 때 · Act</span><h3>휴대폰 인증까지 필요한가요?</h3><p>“개인정보 털릴 것 같아서 그냥 찜찜하네.”</p></article><footer>AI 생성 응답 · 위 제목은 기록의 요약이며 인용문은 저장된 응답의 일부입니다.</footer></div></section>
    <section className="clean-evidence-note"><h2>근거와 한계를<br />함께 보여드립니다.</h2><div><p>화면별 도달, 클릭 경로, 완료 여부와 이탈 이유처럼 기록으로 확인할 수 있는 정보를 담습니다.</p><p>AI 결과는 가설을 살펴보는 자료입니다. 실제 사용자 데이터가 없을 때 실측 오차나 신뢰도를 만들어 표시하지 않습니다.</p></div></section>
    <section className="clean-closing"><div><span>다음 제품의 결정을 위해</span><h2>내 제품으로<br />직접 확인해 보세요.</h2></div><div><p>작은 과제 하나부터 시작할 수 있습니다.</p><button className="v2-button primary" onClick={create}>테스트 시작하기 <ArrowRight size={18} /></button></div></section>
    <footer className="clean-footer"><strong>PersonaLab</strong><span>제품을 이해하는 또 하나의 시선.</span><span>© 2026 PersonaLab</span></footer>
  </div>;
}
