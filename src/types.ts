export const CHECKLIST_CODES = [
  "wrong-component",
  "missing-variant",
  "token-drift",
  "gap-drift",
] as const;

export type ChecklistCode = (typeof CHECKLIST_CODES)[number];

export const FORBIDDEN_CODES = [
  "raw-button",
  "inline-hex",
  "inline-px-spacing",
] as const;

export type ForbiddenCode = (typeof FORBIDDEN_CODES)[number];

export const DEFAULT_MAX_DRIFT_PX = 8;
export const DEFAULT_RETRIES = 3;
export const DEFAULT_OUT_DIR = ".ds-loop";
export const MASK_SELECTORS = [
  "[data-dynamic]",
  "[data-ds-mask]",
  "[data-mask]",
] as const;
export const REGION_ATTR = "data-region";

export interface FrameSize {
  w: number;
  h: number;
}

export interface ReactMapping {
  name: string;
  variant?: string;
  size?: string;
}

export interface AngularMapping {
  selector: string;
  inputs: Record<string, string | number | boolean>;
}

export interface InventoryComponent {
  id: string;
  react: ReactMapping;
  angular: AngularMapping;
  required: boolean;
  tokens: string[];
}

export interface LayoutCheck {
  region: string;
  maxDriftPx?: number;
}

export interface Inventory {
  screenId: string;
  referencePng: string;
  frameSize: FrameSize;
  components: InventoryComponent[];
  forbidden: string[];
  layoutChecks: LayoutCheck[];
  rubric: string[];
}

export type FindingCode = ChecklistCode | "preflight";

export interface Finding {
  code: FindingCode;
  detail: string;
  componentId?: string;
  region?: string;
  forbidden?: ForbiddenCode | string;
}

export interface GateResult {
  name: "A" | "B" | "preflight";
  passed: boolean;
  skipped?: boolean;
  findings: Finding[];
}

export interface LoopReport {
  screenId: string;
  passed: boolean;
  attempt: number;
  retriesCap: number;
  preflight: GateResult;
  gateA: GateResult;
  gateB: GateResult;
  checklist: Finding[];
  nextPromptPath?: string;
  candidatePng?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionDrift {
  region: string;
  dx: number;
  dy: number;
  driftPx: number;
  maxDriftPx: number;
  passed: boolean;
  box?: Rect;
  reason?: string;
}
