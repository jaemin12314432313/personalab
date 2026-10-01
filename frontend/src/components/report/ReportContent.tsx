import {
  ArrowDownRight,
  ArrowRight,
  CheckCircle2,
  Info,
  Layers3,
  MousePointer2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { funnel, reasons } from "../../data/demoData";
import CardHead from "../ui/CardHead";
import Pill from "../ui/Pill";
import Summary from "../ui/Summary";

export default function ReportContent({ open }: { open: (title: string) => void }) {
  return (
    <div className="report-content">
      <section className="report-hero">
        <div>
          <span className="eyebrow">KEY FINDING</span>
          <h2>
            학교 정보 입력 단계가
            <br />
            가장 먼저 개선할 지점이에요.
          </h2>
          <p>
            AI와 실제 참가자 모두 이 화면에서 가장 많이 이탈했습니다. 필수
            입력을 가입 이후로 옮기는 실험을 권장합니다.
          </p>
        </div>
        <div>
          <small>최다 이탈 화면</small>
          <b>학교 정보 입력</b>
          <span>
            <i>AI 24명</i>
            <i>Real 3명</i>
          </span>
        </div>
      </section>
      <div className="quality">
        <div>
          <ShieldCheck size={17} />
          <span>
            <b>데이터 품질 양호</b>
            <small>AI 95/100 유효 · Real 15/15 유효</small>
          </span>
        </div>
        <p>프로토타입 v2　·　패널 PL-2026-09　·　생성 2026.09.22</p>
      </div>
      <section className="summaries">
        <Summary
          label="Ask 긍정 의향"
          value="76.0%"
          sub="76/100 · 4~5점"
          icon={Sparkles}
        />
        <Summary
          label="AI 행동 완료율"
          value="41.1%"
          sub="39/95 유효 세션"
          icon={MousePointer2}
        />
        <Summary
          label="실제 행동 완료율"
          value="53.3%"
          sub="8/15 유효 세션"
          icon={Users}
        />
        <Summary
          label="완료율 차이"
          value="-12.2%p"
          sub="AI가 실제보다 낮음"
          icon={ArrowDownRight}
          warn
        />
      </section>
      <div className="report-grid">
        <section className="card">
          <CardHead
            title="가입 퍼널 비교"
            sub="단계별 1회 이상 도달한 유효 세션 기준"
            action={() => open("가입 퍼널 근거")}
          />
          <div className="legend">
            <span>
              <i className="ai" />
              AI 소비자 (n=95)
            </span>
            <span>
              <i className="real" />
              실제 참가자 (n=15)
            </span>
          </div>
          <div className="funnel">
            {funnel.map(([n, a, r], i) => (
              <div key={n}>
                <span>
                  <b>{n}</b>
                  {i === 2 && <small>최다 이탈 구간</small>}
                </span>
                <section>
                  <i>
                    <em className="ai" style={{ width: `${a}%` }} />
                    <b>{a}%</b>
                  </i>
                  <i>
                    <em className="real" style={{ width: `${r}%` }} />
                    <b>{r}%</b>
                  </i>
                </section>
              </div>
            ))}
          </div>
        </section>
        <section className="card gap-card">
          <CardHead
            title="의향과 행동의 격차"
            sub="같은 AI 패널의 유효 쌍 n=95"
          />
          <div className="gap">
            <div className="donut">
              <span>
                <b>34.9</b>
                <small>%p 격차</small>
              </span>
            </div>
            <div>
              <span>
                <small>긍정 의향</small>
                <b>76.0%</b>
              </span>
              <ArrowDownRight size={18} />
              <span>
                <small>행동 완료</small>
                <b>41.1%</b>
              </span>
            </div>
          </div>
          <p className="note">
            <Info size={13} />
            행동 예측 정확도가 아닌 의향과 행동의 관측 차이입니다.
          </p>
        </section>
        <section className="card">
          <CardHead
            title="주요 이탈 이유"
            sub="명시적으로 중단하고 이유에 응답한 세션 기준"
            action={() => open("이탈 이유 응답")}
          />
          <div className="reason-table">
            <header>
              <span>이유</span>
              <span>AI</span>
              <span>Real</span>
            </header>
            {reasons.map(([l, c, a, r], i) => (
              <div key={c}>
                <span>
                  <b>{i + 1}</b>
                  <label>
                    <strong>{l}</strong>
                    <small>{c}</small>
                  </label>
                </span>
                <span>
                  <i style={{ width: a }} />
                  {a}%
                </span>
                <span>
                  <i className="real" style={{ width: r }} />
                  {r}%
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <CardHead title="비교 해석" sub="이 결과에서 말할 수 있는 범위" />
          <div className="interpret">
            <div>
              <CheckCircle2 size={16} />
              <span>
                <b>최다 이탈 화면 일치</b>
                <small>학교 정보 입력</small>
              </span>
            </div>
            <div>
              <CheckCircle2 size={16} />
              <span>
                <b>이탈 이유 Top-3 일치</b>
                <small>3개 중 3개 겹침</small>
              </span>
            </div>
            <div className="caution">
              <TriangleAlert size={16} />
              <span>
                <b>탐색적 조사 결과</b>
                <small>실제 참가자 n=15. 일반화에 주의하세요.</small>
              </span>
            </div>
          </div>
        </section>
      </div>
      <section className="version">
        <div>
          <i>
            <Layers3 size={19} />
          </i>
          <span>
            <b>수정 전후 비교</b>
            <small>동일한 AI 패널로 실행한 v1과 v2의 행동 변화</small>
          </span>
        </div>
        <section>
          <span>
            <small>v1 완료율</small>
            <b>39.0%</b>
          </span>
          <ArrowRight size={17} />
          <span>
            <small>v2 완료율</small>
            <b>41.1%</b>
          </span>
          <Pill tone="green">+2.1%p</Pill>
        </section>
        <button className="secondary">
          버전 비교 <ArrowRight size={14} />
        </button>
      </section>
      <p className="disclaimer">
        <Info size={13} />
        AI 결과는 실제 시장 성과를 보장하지 않습니다. 가설 탐색과 수정 우선순위
        선정에 활용하세요.
      </p>
    </div>
  );
}
