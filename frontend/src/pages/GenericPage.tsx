import { Activity, ChevronRight, Users } from "lucide-react";
import Header from "../components/layout/Header";
import Pill from "../components/ui/Pill";
import { studies } from "../data/demoData";
import type { Page } from "../types";

export default function Generic({ type }: { type: Page }) {
  const options: Partial<Record<Page, [string, string]>> = {
    runs: ["실행 기록", "AI 패널 실행과 처리 상태를 확인하세요."],
    participants: ["참가자", "실제 참가자의 초대와 진행 상태를 관리하세요."],
    data: ["데이터 소스", "페르소나 생성에 사용하는 출처를 관리하세요."],
    settings: ["설정", "워크스페이스와 팀 설정을 관리하세요."],
  };
  const c = options[type] ?? options.settings!;
  return (
    <>
      <Header title={c[0]} subtitle={c[1]} />
      <main className="page generic">
        {type === "runs" ? (
          studies.slice(0, 2).map((s, i) => (
            <section className="card run" key={s.id}>
              <i>
                <Activity size={18} />
              </i>
              <div>
                <span>
                  <b>{s.name}</b>
                  <Pill tone={i ? "purple" : "green"}>
                    {i ? "running" : "succeeded"}
                  </Pill>
                </span>
                <p>ACT · 100 personas · model-pl-02</p>
              </div>
              <section>
                <i>
                  <em style={{ width: i ? "72%" : "100%" }} />
                </i>
                <small>{i ? "72 / 100 처리" : "100 / 100 완료"}</small>
              </section>
              <b>₩{i ? "6,840" : "9,210"}</b>
              <ChevronRight size={16} />
            </section>
          ))
        ) : (
          <section className="card empty">
            <span>
              <Users size={27} />
            </span>
            <h2>{c[0]} 관리 화면</h2>
            <p>현재 데모에서는 대표 데이터만 표시합니다.</p>
            <button className="primary">새 항목 추가</button>
          </section>
        )}
      </main>
    </>
  );
}
