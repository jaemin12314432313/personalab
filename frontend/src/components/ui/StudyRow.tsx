import { ChevronRight, FlaskConical } from "lucide-react";
import Pill from "./Pill";
import type { Study } from "../../types";

export default function StudyRow({ s, onClick }: { s: Study; onClick: () => void }) {
  return (
    <button className="study-row" onClick={onClick}>
      <span className={`study-icon ${s.tone}`}>
        <FlaskConical size={19} />
      </span>
      <span className="study-name">
        <span>
          <b>{s.name}</b>
          <Pill
            tone={
              s.tone === "complete"
                ? "green"
                : s.tone === "running"
                  ? "purple"
                  : "gray"
            }
            dot
          >
            {s.status}
          </Pill>
        </span>
        <small>{s.desc}</small>
      </span>
      <span>
        <small>버전</small>
        <b>{s.version}</b>
      </span>
      <span>
        <small>AI / Real</small>
        <b>
          {s.ai} / {s.real}
        </b>
      </span>
      <span className="updated">
        <small>최근 업데이트</small>
        <b>{s.updated}</b>
      </span>
      <ChevronRight size={17} />
    </button>
  );
}
