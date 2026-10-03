import type { ReactNode } from "react";

export default function Pill({ children, tone = "gray", dot = false }: { children: ReactNode; tone?: string; dot?: boolean }) {
  return (
    <span className={`pill ${tone}`}>
      {dot && <i />}
      {children}
    </span>
  );
}
