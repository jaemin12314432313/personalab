export default function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return <header className="topbar">
    <div className="topbar-title"><span className="topbar-eyebrow">PERSONALAB / WORKSPACE</span><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    <div className="topbar-context"><span className="context-dot" /> AI RESEARCH PLATFORM</div>
  </header>;
}
