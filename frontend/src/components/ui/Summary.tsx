import type { LucideIcon } from "lucide-react";

export default function Summary({ label, value, sub, icon: I, warn }: { label: string; value: string | number; sub: string; icon: LucideIcon; warn?: boolean }) {
  return (
    <div className="summary">
      <div>
        <small>{label}</small>
        <b className={warn ? "warn" : ""}>{value}</b>
        <em>{sub}</em>
      </div>
      <span>
        <I size={17} />
      </span>
    </div>
  );
}
