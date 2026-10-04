import { useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Database,
  Upload,
} from "lucide-react";
import Header from "../components/layout/Header";
import Pill from "../components/ui/Pill";
import { studies } from "../data/demoData";
import type { Navigate, OpenReport } from "../types";

export default function CreatePage({ setPage, finish }: { setPage: Navigate; finish: OpenReport }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("대학생 금융 습관 앱");
  const [done, setDone] = useState(false);
  const labels = ["제품 정보", "프로토타입", "과제 · 문항", "AI 패널"];
  const next = () => {
    if (step < 4) setStep(step + 1);
    else {
      setDone(true);
      setTimeout(() => finish({ ...studies[0], name }), 1100);
    }
  };
  return (
    <>
      <Header
        title="새 스터디 만들기"
        subtitle="검증할 제품과 과제를 설정하세요."
      />
      <main className="create">
        <div className="create-steps">
          {labels.map((l, i) => (
            <div
              className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""}
              key={l}
            >
              <span>{step > i + 1 ? <Check size={13} /> : i + 1}</span>
              <b>{l}</b>
              {i < 3 && <i />}
            </div>
          ))}
        </div>
        <section className="form-card">
          {done ? (
            <div className="success">
              <span>
                <Check size={27} />
              </span>
              <h2>스터디가 준비됐어요</h2>
              <p>잠긴 설정으로 첫 AI 실행을 시작할 수 있습니다.</p>
            </div>
          ) : (
            <>
              <header>
                <small>STEP 0{step}</small>
                <h2>{labels[step - 1]}</h2>
                <p>
                  {
                    [
                      "AI 소비자가 이해할 수 있도록 제품을 소개해주세요.",
                      "사용자가 이동할 화면과 연결을 등록해주세요.",
                      "참가자에게 제시할 목표와 질문을 정해주세요.",
                      "검증 대상과 같은 조건의 AI 소비자를 생성합니다.",
                    ][step - 1]
                  }
                </p>
              </header>
              {step === 1 && (
                <div className="fields">
                  <label>
                    스터디 이름 <em>*</em>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    제품 설명 <em>*</em>
                    <textarea defaultValue="대학생이 수입과 지출을 간편하게 기록하고 소비 습관을 확인하는 모바일 앱입니다." />
                  </label>
                  <div>
                    <label>
                      가격 유형
                      <select>
                        <option>무료</option>
                        <option>유료</option>
                      </select>
                    </label>
                    <label>
                      카테고리
                      <select>
                        <option>금융</option>
                        <option>생산성</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className="upload">
                  <span>
                    <Upload size={21} />
                  </span>
                  <h3>Figma 링크를 붙여넣으세요</h3>
                  <p>화면과 클릭 연결을 가져와 실행 가능 여부를 확인합니다.</p>
                  <div>
                    <input defaultValue="https://figma.com/proto/persona-demo" />
                    <button>연결 확인</button>
                  </div>
                  <section>
                    <CheckCircle2 size={15} />
                    <span>
                      <b>5개 화면과 8개 연결을 확인했어요.</b>
                      <small>
                        시작 화면에서 목표 화면까지 도달할 수 있습니다.
                      </small>
                    </span>
                  </section>
                </div>
              )}
              {step === 3 && (
                <div className="fields">
                  <label>
                    참가자 과제 <em>*</em>
                    <textarea defaultValue="처음 방문한 사용자라고 생각하고 회원가입을 완료해주세요." />
                  </label>
                  <div>
                    <label>
                      시작 화면
                      <select>
                        <option>01. 시작하기</option>
                      </select>
                    </label>
                    <label>
                      목표 화면
                      <select>
                        <option>05. 가입 완료</option>
                      </select>
                    </label>
                  </div>
                  <section className="question">
                    <span>
                      <b>공통 문항 6개</b>
                      <small>Act와 Real에 같은 문항이 사용됩니다.</small>
                    </span>
                    <Pill tone="green">
                      <Check size={11} /> 비교 가능
                    </Pill>
                  </section>
                </div>
              )}
              {step === 4 && (
                <div className="panel-setup">
                  <section>
                    <span>생성할 AI 소비자</span>
                    <b>
                      100<small>명</small>
                    </b>
                  </section>
                  <div className="fields">
                    <div>
                      <label>
                        연령
                        <select>
                          <option>20–29세</option>
                        </select>
                      </label>
                      <label>
                        소속
                        <select>
                          <option>대학생</option>
                        </select>
                      </label>
                    </div>
                    <article>
                      <h3>예상 패널 분포</h3>
                      <p>
                        <span>
                          20–24세 <b>62%</b>
                        </span>
                        <i>
                          <em style={{ width: "62%" }} />
                        </i>
                      </p>
                      <p>
                        <span>
                          25–29세 <b>38%</b>
                        </span>
                        <i>
                          <em style={{ width: "38%" }} />
                        </i>
                      </p>
                      <small>
                        <Database size={13} />
                        2025 청년사회경제실태조사 분포표 기반 · 추정 변수 포함
                      </small>
                    </article>
                  </div>
                </div>
              )}
              <footer>
                <button
                  className="secondary"
                  onClick={() =>
                    step === 1 ? setPage("studies") : setStep(step - 1)
                  }
                >
                  {step === 1 ? "취소" : "이전"}
                </button>
                <button className="primary" onClick={next}>
                  {step === 4 ? "스터디 만들기" : "다음"}{" "}
                  <ArrowRight size={15} />
                </button>
              </footer>
            </>
          )}
        </section>
      </main>
    </>
  );
}
