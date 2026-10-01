import { useState } from "react";
import type { Navigate, ReportTab, Study } from "../types";
import {
  ArrowLeft,
  FlaskConical,
  LockKeyhole,
  Play,
  RefreshCw,
  SquareArrowOutUpRight,
} from "lucide-react";
import Header from "../components/layout/Header";
import EvidenceDrawer from "../components/report/EvidenceDrawer";
import OverviewTab from "../components/report/OverviewTab";
import ParticipantsTab from "../components/report/ParticipantsTab";
import ReportContent from "../components/report/ReportContent";
import SetupTab from "../components/report/SetupTab";
import Pill from "../components/ui/Pill";

export default function ReportPage({ study, setPage }: { study: Study; setPage: Navigate }) {
  const [tab, setTab] = useState<ReportTab>("report");
  const [drawer, setDrawer] = useState("");
  const [running, setRunning] = useState(false);
  const run = () => {
    setRunning(true);
    setTimeout(() => setRunning(false), 2200);
  };
  return (
    <>
      <Header title="스터디 상세" />
      <main className="page report">
        <button className="back" onClick={() => setPage("studies")}>
          <ArrowLeft size={15} />
          모든 스터디
        </button>
        <div className="study-title">
          <div>
            <span className="study-icon complete">
              <FlaskConical size={20} />
            </span>
            <section>
              <div>
                <h2>{study.name}</h2>
                <Pill tone="green" dot>
                  분석 완료
                </Pill>
              </div>
              <p>
                {study.desc} · v2 · 잠금됨 <LockKeyhole size={11} />
              </p>
            </section>
          </div>
          <div>
            <button className="secondary">
              <SquareArrowOutUpRight size={15} />
              참가자 링크
            </button>
            <button className="primary" onClick={run}>
              {running ? (
                <>
                  <RefreshCw className="spin" size={15} />
                  실행 중
                </>
              ) : (
                <>
                  <Play size={15} />
                  다시 실행
                </>
              )}
            </button>
          </div>
        </div>
        <div className="tabs">
          {[
            ["overview", "개요"],
            ["report", "결과 리포트"],
            ["participants", "참가자"],
            ["setup", "스터디 설정"],
          ].map(([k, l]) => (
            <button
              className={tab === k ? "active" : ""}
              onClick={() => setTab(k as ReportTab)}
              key={k}
            >
              {l}
              {k === "participants" && <em>15</em>}
            </button>
          ))}
        </div>
        {tab === "report" && <ReportContent open={setDrawer} />}{" "}
        {tab === "overview" && <OverviewTab setTab={setTab} />}{" "}
        {tab === "participants" && <ParticipantsTab />}{" "}
        {tab === "setup" && <SetupTab />}
        {drawer && <EvidenceDrawer title={drawer} close={() => setDrawer("")} />}
      </main>
    </>
  );
}
