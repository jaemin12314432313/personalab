import { ChevronRight } from "lucide-react";

export default function CardHead({ title, sub, action }: { title: string; sub: string; action?: () => void }) {
  return (
    <div className="card-head">
      <div>
        <h3>{title}</h3>
        <p>{sub}</p>
      </div>
      {action && (
        <button onClick={action}>
          근거 보기 <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}
