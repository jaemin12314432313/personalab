import { ChevronRight, FlaskConical } from "lucide-react";
import Pill from "./Pill";
import type { Study } from "../../types";

export default function StudyRow({ s, onClick }: { s: Study; onClick: () => void }) {
  const status = s.integrated ? (s.run ? "분석 완료" : s.status === "실행 중" ? "실행 중" : "실행 준비") : "예시 데이터";
  return <button className="study-row" onClick={onClick}>
    <span className={`study-icon ${s.tone}`}><FlaskConical size={19} /></span>
    <span className="study-name"><span><b>{s.name}</b><Pill tone={s.integrated && s.run ? "green" : s.integrated ? "purple" : "gray"} dot>{status}</Pill></span><small>{s.desc}</small></span>
    <span><small>버전</small><b>{s.version}</b></span>
    <span><small>AI 패널</small><b>{s.integrated ? s.personas?.length ?? 0 : "예시"}</b></span>
    <span className="updated"><small>최근 업데이트</small><b>{s.updated}</b></span>
    <ChevronRight size={17} />
  </button>;
}
