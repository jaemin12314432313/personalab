import { useCallback, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./components/layout/Sidebar";
import { studies } from "./data/demoData";
import IntegratedCreatePage from "./pages/IntegratedCreatePage";
import GenericPage from "./pages/GenericPage";
import HomePage from "./pages/HomePage";
import ReportPage from "./pages/ReportPage";
import StudiesPage from "./pages/StudiesPage";
import RunPage from "./pages/RunPage";
import { getSetupDraftMeta } from "./data/setupDraft";
import { isIntegratedStudy, type DraftMeta, type Page, type ReportTab, type Study } from "./types";

function initialStudies() {
  try {
    const saved = JSON.parse(localStorage.getItem("personalab-integrated-studies") || "[]") as Study[];
    return [...saved.filter(s => s?.integrated), ...studies];
  } catch { return [...studies]; }
}

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [studyList, setStudyList] = useState<Study[]>(initialStudies);
  const [studyId, setStudyId] = useState(studies[0].id);
  const [focusPersonaId, setFocusPersonaId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<ReportTab>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [draftMeta, setDraftMeta] = useState<DraftMeta | null>(getSetupDraftMeta);

  const study = studyList.find(s => s.id === studyId) || studyList[0];
  useEffect(() => {
    try { localStorage.setItem("personalab-integrated-studies", JSON.stringify(studyList.filter(s => s.integrated))); }
    catch { /* 파일 이미지가 브라우저 저장 용량을 넘으면 현재 세션에서 계속 사용 */ }
  }, [studyList]);
  const updateStudy = useCallback((id: Study["id"], changes: Partial<Study>) => setStudyList(list => list.map(s => s.id === id ? { ...s, ...changes } : s)), []);
  const goReport = (selectedStudy: Study) => {
    setStudyId(selectedStudy.id);
    setDetailTab("overview");
    setPage("report");
  };
  const openResult = () => { setDetailTab("report"); setPage("report"); };
  const goRun = (selectedStudy: Study = study, personaId: string | null = null) => {
    setStudyId(selectedStudy.id);
    setFocusPersonaId(personaId);
    setPage("run");
  };
  const finishCreate = (newStudy: Study) => {
    setStudyList(list => [newStudy, ...list]);
    goRun(newStudy);
  };

  const changePage = (nextPage: Page) => {
    setPage(nextPage);
    setMobile(false);
  };

  const views: Partial<Record<Page, React.ReactNode>> = {
    home: <HomePage goReport={goReport} setPage={setPage} studyList={studyList} draftMeta={draftMeta} />,
    studies: <StudiesPage goReport={goReport} setPage={setPage} studyList={studyList} draftMeta={draftMeta} />,
    report: <ReportPage key={study.id} study={study} setPage={setPage} goRun={goRun} initialTab={detailTab} />,
    create: <IntegratedCreatePage setPage={setPage} finish={finishCreate} onDraftMetaChange={setDraftMeta} />,
    run: isIntegratedStudy(study) ? <RunPage key={study.id} study={study} onUpdate={updateStudy} setPage={setPage} openReport={openResult} focusPersonaId={focusPersonaId} /> : <GenericPage type="runs" studyList={studyList} goReport={goReport} />,
  };

  return (
    <div
      className={`shell ${collapsed ? "collapsed" : ""} ${mobile ? "mobile-open" : ""}`}
    >
      <Sidebar
        page={page}
        setPage={changePage}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />
      <button
        className="global-mobile icon-btn"
        onClick={() => setMobile(true)}
        aria-label="메뉴 열기"
      >
        <Menu size={20} />
      </button>
      <div className="overlay" onClick={() => setMobile(false)} />
      <section className="main">
        {views[page] ?? <GenericPage type={page} studyList={studyList} goReport={goReport} />}
      </section>
    </div>
  );
}
