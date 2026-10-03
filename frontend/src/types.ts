export type Page =
  | "home"
  | "studies"
  | "report"
  | "create"
  | "run"
  | "runs"
  | "participants"
  | "data"
  | "settings";

export type ReportTab = "overview" | "report" | "participants" | "setup" | "run";
export type Navigate = (page: Page) => void;

export interface Study {
  id: number | string;
  name: string;
  desc: string;
  version: string;
  status: string;
  updated: string;
  ai: number;
  real: number;
  tone: "complete" | "running" | "draft";
  integrated?: boolean;
  plan?: string;
  product?: Product;
  figmaUrl?: string;
  generation?: number;
  screens?: Screen[];
  task?: string;
  goal?: string;
  panel?: Panel;
  personas?: Persona[];
  run?: RunData | null;
}

export type OpenReport = (study: Study) => void;

export interface Product {
  name: string;
  description: string;
  features: string[];
  price: string;
}

export interface Screen {
  id: string;
  label: string;
  description: string;
  fields: number;
  image: string | null;
  elements: { text: string; to: string }[];
  linksDraft?: string;
}

export interface Panel {
  count: number;
  occupation: string;
  age: number[];
  app_usage: number[];
  price_sensitivity: number[];
  digital_adoption: number[];
}

export interface Persona {
  persona_id: string;
  age: number;
  occupation: string;
  app_usage_freq: number;
  price_sensitivity: number;
  digital_adoption: number;
  existing_tool: string;
  traits: string[];
}

export interface IntegratedStudy extends Study {
  integrated: true;
  plan: string;
  product: Product;
  figmaUrl: string;
  generation: number;
  screens: Screen[];
  task: string;
  goal: string;
  panel: Panel;
  personas: Persona[];
  run: RunData | null;
}

export interface AskResult {
  usage_intention: number;
  willingness_to_pay: number;
  concern: string;
  needed_features: string[];
  unneeded_features: string[];
  reason: string;
}

export interface ActEvent {
  turn: number;
  screen: string;
  action: "click" | "abandon";
  target: string | null;
  reason: string;
  to?: string;
  drop_reason?: string;
}

export interface ActResult {
  events: ActEvent[];
  path: string[];
  end: { result: "complete" | "drop"; screen: string | undefined; drop_reason?: string };
}

export interface PersonaResult {
  persona_id: string;
  ask: AskResult;
  act: ActResult;
}

export type RunFrame =
  | { type: "ask-start"; id: string }
  | { type: "ask-done"; id: string; ask: AskResult }
  | { type: "act-start"; id: string; screen: string | undefined }
  | { type: "turn"; id: string; event: ActEvent }
  | { type: "act-end"; id: string; act: ActResult };

export interface RunData {
  results: PersonaResult[];
  frames?: RunFrame[];
}

export interface DraftMeta {
  version: number;
  name: string;
  step: number;
  updatedAt: number;
}

export function isIntegratedStudy(study: Study): study is IntegratedStudy {
  return study.integrated === true && Boolean(study.product && study.panel && Array.isArray(study.screens) && Array.isArray(study.personas));
}
