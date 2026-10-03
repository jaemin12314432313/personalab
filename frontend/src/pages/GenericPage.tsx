import { Activity, ChevronRight, Database, Settings } from "lucide-react";
import Header from "../components/layout/Header";
import Pill from "../components/ui/Pill";
import { studies } from "../data/demoData";
import type { OpenReport, Page, Study } from "../types";

export default function Generic({ type, studyList = studies, goReport }: { type: Page; studyList?: Study[]; goReport: OpenReport }) {
  const config = {
    runs: ["실행 기록", "테스트별 AI 실행 상태와 분석 결과를 확인하세요."],
    data: ["데이터 소스", "Persona 생성과 결과 해석에 사용하는 자료를 확인하세요."],
    settings: ["설정", "워크스페이스 설정을 관리하세요."],
  }[type as "runs" | "data" | "settings"] || ["준비 중", "현재 사용할 수 있는 화면이 없습니다."];
  const completed = studyList.filter(s => s.integrated && s.run);
  const ready = studyList.filter(s => s.integrated && !s.run);
  return <>
    <Header title={config[0]} subtitle={config[1]} />
    <main className="page generic">
      {type === "runs" ? <>
        <div className="run-list-heading"><b>직접 만든 테스트</b><small>완료 {completed.length}개 · 실행 준비 {ready.length}개</small></div>
        {studyList.filter(s => s.integrated).length ? studyList.filter(s => s.integrated).map(s => <button className="card run generic-run-button" key={s.id} onClick={() => goReport(s)}><i><Activity size={18} /></i><div><span><b>{s.name}</b><Pill tone={s.run ? "green" : "purple"}>{s.run ? "분석 완료" : "실행 준비"}</Pill></span><p>Ask → Act · AI Persona {s.personas?.length ?? 0}명 · {s.screens?.length ?? 0}개 화면</p></div><section><i><em style={{ width: s.run ? "100%" : "0%" }} /></i><small>{s.run ? "결과와 근거 확인 가능" : "실행 전"}</small></section><ChevronRight size={16} /></button>) : <section className="card empty"><span><Activity size={27} /></span><h2>아직 실행 기록이 없습니다</h2><p>새 테스트를 만들고 AI Persona를 실행하면 이곳에 표시됩니다.</p></section>}
      </> : <section className="card empty"><span>{type === "data" ? <Database size={27} /> : <Settings size={27} />}</span><h2>{config[0]}</h2><p>현재 체험 버전에서는 연결된 설정 항목이 없습니다.</p></section>}
    </main>
  </>;
}
