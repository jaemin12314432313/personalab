import { TrendingUp, type LucideIcon } from "lucide-react";

export default function Metric({ icon: I, label, value, sub, green }: { icon: LucideIcon; label: string; value: string | number; sub: string; green?: boolean }) {
  return (
    <div className="metric">
      <span>
        <I size={18} />
      </span>
      <div>
        <small>{label}</small>
        <b>{value}</b>
        <em className={green ? "green" : ""}>
          {green && <TrendingUp size={11} />} {sub}
        </em>
      </div>
    </div>
  );
}
