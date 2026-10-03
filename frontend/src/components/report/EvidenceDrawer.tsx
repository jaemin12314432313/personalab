import { Info, X } from "lucide-react";
import Pill from "../ui/Pill";

export default function Drawer({ title, close }: { title: string; close: () => void }) {
  return (
    <div
      className="drawer-bg"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <aside>
        <header>
          <div>
            <small>근거 상세</small>
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" onClick={close}>
            <X size={18} />
          </button>
        </header>
        <main>
          <section className="evidence-meta">
            <span>
              <small>분자 / 분모</small>
              <b>39 / 95</b>
            </span>
            <span>
              <small>프로토타입</small>
              <b>v2</b>
            </span>
            <span>
              <small>실행 ID</small>
              <b>RUN-ACT-0922</b>
            </span>
          </section>
          <h3>세션 근거</h3>
          {[1, 2, 3, 4, 5].map((n) => (
            <div className="evidence-row" key={n}>
              <span>P{n}</span>
              <div>
                <b>AI Persona P0{20 + n}</b>
                <small>
                  시작 → 기본 정보 → 학교 입력 {n < 4 ? "→ 중단" : ""}
                </small>
              </div>
              <Pill tone={n < 4 ? "orange" : "green"}>
                {n < 4 ? "중단" : "완료"}
              </Pill>
            </div>
          ))}
          <p className="raw">
            <Info size={15} />
            <span>
              AI 생성 응답 · Synthetic User Response
              <br />
              <small>
                원시 경로와 응답은 실행 당시 버전 그대로 보존됩니다.
              </small>
            </span>
          </p>
        </main>
      </aside>
    </div>
  );
}
