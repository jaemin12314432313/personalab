import { ArrowRight, Check, Sparkles } from "lucide-react";
import CardHead from "../ui/CardHead";

export default function Overview({ setTab }: { setTab: (tab: "report") => void }) {
  return (
    <div className="overview">
      <section className="card">
        <CardHead
          title="검증 진행 현황"
          sub="모든 데이터 수집 단계가 완료되었습니다."
        />
        <div className="steps">
          {[
            "제품·과제 설정",
            "AI Ask · Act",
            "실제 참가자 조사",
            "통합 분석",
          ].map((x, i) => (
            <div key={x}>
              <span>
                <Check size={13} />
              </span>
              <b>{x}</b>
              <small>9월 {17 + i * 2}일</small>
              {i < 3 && <i />}
            </div>
          ))}
        </div>
      </section>
      <section className="card config">
        <CardHead title="스터디 조건" sub="고정된 실행 설정" />
        <dl>
          {[
            ["AI 패널", "대학생 100명"],
            ["성공 조건", "목표 화면 도달"],
            ["가격 노출", "Q6 이전 숨김"],
            ["최대 이동", "20회"],
          ].map((x) => (
            <div key={x[0]}>
              <dt>{x[0]}</dt>
              <dd>{x[1]}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="callout">
        <Sparkles size={19} />
        <div>
          <b>분석 결과가 준비됐어요</b>
          <small>AI와 실제 참가자의 행동 차이를 확인해보세요.</small>
        </div>
        <button onClick={() => setTab("report")}>
          리포트 보기 <ArrowRight size={15} />
        </button>
      </section>
    </div>
  );
}
