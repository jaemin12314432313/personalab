export type Page =
  | "home"
  | "studies"
  | "report"
  | "create"
  | "runs"
  | "participants"
  | "data"
  | "settings";

export type ReportTab = "overview" | "report" | "participants" | "setup";
export type Navigate = (page: Page) => void;

export interface Study {
  id: number;
  name: string;
  desc: string;
  version: string;
  status: string;
  updated: string;
  ai: number;
  real: number;
  tone: "complete" | "running" | "draft";
}

export type OpenReport = (study: Study) => void;
