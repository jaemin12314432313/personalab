import { ArrowRight, CheckCircle2, FolderKanban, MousePointer2, Sparkles, Zap } from "lucide-react";
import Header from "../components/layout/Header";
import Metric from "../components/ui/Metric";
import StudyRow from "../components/ui/StudyRow";
import { studies } from "../data/demoData";
import { reportFor } from "../data/studyEngine";
import type { DraftMeta, Navigate, OpenReport, Study } from "../types";

export default function HomePage({ goReport, setPage, studyList = studies, draftMeta }: { goReport: OpenReport; setPage: Navigate; studyList?: Study[]; draftMeta: DraftMeta | null }) {
  const created = studyList.filter(s => s.integrated);
  const latestCompleted = created.find(s => s.run);
  const report = latestCompleted ? reportFor(latestCompleted) : null;
  const waiting = created.filter(s => !s.run).length;
  return <>
    <Header title="PersonaLab 워크스페이스" subtitle="테스트 준비부터 AI 행동 근거까지 한곳에서 살펴보세요." />
    <main className="page home-page">
      {draftMeta && <section className="setup-resume-banner"><div><small>작성 중인 테스트 · {draftMeta.step + 1}/4단계</small><b>{draftMeta.name}</b><p>이 브라우저에 저장된 설정을 이어서 작성할 수 있습니다.</p></div><button className="primary" onClick={() => setPage("create")}>이어서 작성 <ArrowRight size={16} /></button></section>}
      <section className="hero">
        <div>
          <span className="eyebrow"><Sparkles size={13} /> PERSONA → ASK → ACT → REPORT</span>
          <h2>제품에 대한 말과<br />프로토타입 과제 행동을 함께 보세요.</h2>
          <p>제품과 프로토타입을 설정하고 AI Persona의 평가, 화면 이동, 이탈 이유를 한 흐름에서 확인하세요.</p>
          <button onClick={() => setPage("create")}>+ 새 테스트 <ArrowRight size={16} /></button>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="hero-process"><small>HOW A TEST WORKS</small><div><span>01</span><b>제품과 과제 설정</b><em>Product / Prototype</em></div><div><span>02</span><b>AI Persona 실행</b><em>Ask / Act</em></div><div><span>03</span><b>결과와 근거 확인</b><em>Report / Evidence</em></div></div></div>
      </section>
      <section className="metrics">
        <Metric icon={FolderKanban} label="전체 테스트" value={String(studyList.length)} sub="예시 데이터 포함" />
        <Metric icon={CheckCircle2} label="분석 완료" value={String(created.filter(s => s.run).length)} sub="직접 생성한 테스트" />
        <Metric icon={Zap} label="실행 준비" value={String(waiting)} sub="AI 패널 설정 완료" />
        <Metric icon={MousePointer2} label="최근 AI 패널" value={latestCompleted ? `${latestCompleted.personas?.length ?? 0}명` : "—"} sub={latestCompleted?.name || "완료된 실행 없음"} green />
      </section>
      <div className="section-head"><div><h2>최근 테스트</h2><p>테스트를 선택하면 설정과 실행, 결과를 함께 볼 수 있습니다.</p></div><button onClick={() => setPage("studies")}>전체 보기 <ArrowRight size={14} /></button></div>
      <div className="study-list">{studyList.slice(0, 4).map(s => <StudyRow key={s.id} s={s} onClick={() => goReport(s)} />)}</div>
      <div className="insight"><span><MousePointer2 size={19} /></span><div><small>{latestCompleted ? "최근 분석 결과" : "다음 단계"}</small><b>{latestCompleted && report ? `${latestCompleted.name} · Ask 긍정 ${report.positive}명 / 과제 완료 ${report.complete}명` : "새 테스트에서 AI 사용자의 말과 행동을 연결해 보세요."}</b><p>{latestCompleted ? "동일한 Persona의 판단, 화면 경로, 표현된 이유를 결과에서 확인할 수 있습니다. 데모 AI 결과입니다." : "제품 정보와 프로토타입, 과제를 정한 뒤 AI 패널을 만들면 실행할 수 있습니다."}</p></div><button onClick={() => latestCompleted ? goReport(latestCompleted) : setPage("create")}>{latestCompleted ? "테스트 열기" : "새 테스트"} <ArrowRight size={15} /></button></div>
    </main>
  </>;
}
