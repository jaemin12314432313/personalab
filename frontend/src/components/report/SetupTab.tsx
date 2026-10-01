import { ChevronRight } from "lucide-react";
import Pill from "../ui/Pill";

export default function Setup() {
  return (
    <div className="setup">
      {[
        ["제품 정보", "캠퍼스 생활을 한곳에서 관리하는 대학생용 일정 관리 앱"],
        ["프로토타입", "5개 화면 · 8개 연결 · 수동 재생 화면"],
        ["과제와 문항", "회원가입 완료 · 공통 문항 6개"],
        ["AI 패널", "한국 20대 대학생 · 100명"],
      ].map((x, i) => (
        <section className="card" key={x[0]}>
          <small>0{i + 1}</small>
          <div>
            <b>{x[0]}</b>
            <p>{x[1]}</p>
          </div>
          <Pill tone={i === 2 ? "purple" : "green"}>
            {i === 2 ? "잠금됨" : "완료"}
          </Pill>
          <ChevronRight size={16} />
        </section>
      ))}
    </div>
  );
}
