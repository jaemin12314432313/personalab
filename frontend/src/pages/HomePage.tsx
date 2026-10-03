import type { Navigate, OpenReport } from "../types";
import {
  ArrowRight,
  Clock3,
  FolderKanban,
  MousePointer2,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import Header from "../components/layout/Header";
import Metric from "../components/ui/Metric";
import StudyRow from "../components/ui/StudyRow";
import { studies } from "../data/demoData";

export default function HomePage({ goReport, setPage }: { goReport: OpenReport; setPage: Navigate }) {
  return (
    <>
      <Header
        title="좋은 오후예요, Persona Team"
        subtitle="진행 중인 제품 검증 현황을 확인하세요."
      />
      <main className="page">
        <section className="hero">
          <div>
            <span className="eyebrow">
              <Sparkles size={13} /> QUICK START
            </span>
            <h2>
              제품 아이디어, 출시 전에
              <br />
              행동으로 검증하세요.
            </h2>
            <p>
              AI 소비자 100명의 의향과 행동을 비교하고
              <br />
              실제 사용자 조사로 근거를 확인하세요.
            </p>
            <button onClick={() => setPage("create")}>
              첫 스터디 만들기 <ArrowRight size={16} />
            </button>
          </div>
          <div className="hero-art">
            <div className="ring r1" />
            <div className="ring r2" />
            <span className="person p1">
              <b>민</b>“가입 단계가 길어요”
            </span>
            <span className="person p2">
              <b>준</b>목표 화면 도달
            </span>
            <div className="panel-ball">
              <MousePointer2 size={21} />
              <b>100</b>
              <small>AI 패널</small>
            </div>
          </div>
        </section>
        <section className="metrics">
          <Metric
            icon={FolderKanban}
            label="전체 스터디"
            value="3"
            sub="이번 주 +1"
          />
          <Metric
            icon={Zap}
            label="AI 실행"
            value="248"
            sub="유효 결과 95.2%"
          />
          <Metric
            icon={Users}
            label="실제 참가자"
            value="24"
            sub="진행 중 6명"
          />
          <Metric
            icon={Clock3}
            label="평균 결과 시간"
            value="4분 18초"
            sub="지난주보다 12% 단축"
            green
          />
        </section>
        <div className="section-head">
          <div>
            <h2>최근 스터디</h2>
            <p>최근 업데이트 순으로 표시합니다.</p>
          </div>
          <button onClick={() => setPage("studies")}>
            전체 보기 <ArrowRight size={14} />
          </button>
        </div>
        <div className="study-list">
          {studies.map((s) => (
            <StudyRow key={s.id} s={s} onClick={() => goReport(s)} />
          ))}
        </div>
        <div className="insight">
          <span>
            <TrendingUp size={19} />
          </span>
          <div>
            <small>이번 주 인사이트</small>
            <b>AI와 실제 사용자의 최다 이탈 화면이 일치했어요.</b>
            <p>
              ‘대학생 일정 관리 앱’ v2에서 두 집단 모두{" "}
              <strong>학교 정보 입력</strong> 화면에서 가장 많이 이탈했습니다.
            </p>
          </div>
          <button onClick={() => goReport(studies[0])}>
            결과 보기 <ArrowRight size={15} />
          </button>
        </div>
      </main>
    </>
  );
}
