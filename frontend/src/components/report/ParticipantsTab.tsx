import { ChevronRight, UserRound } from "lucide-react";
import CardHead from "../ui/CardHead";
import Pill from "../ui/Pill";

export default function Participants() {
  const rows = [
    ["실제 참가자 01", "완료", "53초"],
    ["실제 참가자 02", "중단", "1분 42초"],
    ["실제 참가자 03", "완료", "1분 08초"],
    ["실제 참가자 04", "미완료", "—"],
  ];
  return (
    <section className="card participants">
      <CardHead
        title="실제 참가자"
        sub="개인정보를 수집하지 않는 익명 세션입니다."
      />
      <div className="participant-stats">
        {[
          ["15", "초대"],
          ["15", "시작"],
          ["8", "과제 완료"],
          ["6", "명시적 중단"],
          ["1", "미완료"],
        ].map((x) => (
          <span key={x[1]}>
            <b>{x[0]}</b>
            <small>{x[1]}</small>
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div className="participant-row" key={r[0]}>
          <span>
            <i>
              <UserRound size={13} />
            </i>
            {r[0]}
          </span>
          <Pill
            tone={
              r[1] === "완료" ? "green" : r[1] === "중단" ? "orange" : "gray"
            }
          >
            {r[1]}
          </Pill>
          <span>{r[2]}</span>
          <ChevronRight size={15} />
        </div>
      ))}
    </section>
  );
}
