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

/**
 * Devin screenshot-verification may loop internally at ~1px (pixel-exact
 * region match). Harness Gate B does **not** use that budget: CI screen
 * grade is region maxDriftPx, default 8, so antialias / font rasterization
 * does not false-fail. Pixel-exact is Devin’s region loop, not this grade.
 */
export const DEVIN_SCREENSHOT_INTERNAL_PX = 1;

export const DEFAULT_RETRIES = 3;
export const DEFAULT_OUT_DIR = ".ds-loop";
/** Preferred dump from @udx/lib (Jackson’s api-inventory.json hose). */
export const DEFAULT_CATALOG_PATH = "catalog/udx/api-inventory.json";
/** Historical skills path; still accepted when the preferred file is missing or catalog.path overrides. */
export const LEGACY_CATALOG_PATH = "catalog/udx/components.json";
export const DEFAULT_FORBIDDEN: ForbiddenCode[] = [...FORBIDDEN_CODES];

export const MASK_SELECTORS = [
  "[data-dynamic]",
  "[data-ds-mask]",
  "[data-mask]",
] as const;
export const REGION_ATTR = "data-region";

export const INTENT_CONFIDENCE = ["explicit", "inferred", "none"] as const;
export type IntentConfidence = (typeof INTENT_CONFIDENCE)[number];

export const SKILL_ORCHESTRATION = [
  "conversion-preflight",
  "conversion-inventory",
  "udx-api-verify",
  "angular-implementation",
  "behavior-verification",
  "screenshot-verification",
  "conversion-evidence-audit",
] as const;

export type SkillName = (typeof SKILL_ORCHESTRATION)[number];

export interface FrameSize {
  w: number;
  h: number;
}

/** React facts from the Magic Patterns export (inventory v1 `react` alias). */
export interface SourceLayer {
  name: string;
  variant?: string;
  size?: string;
  tag?: string;
  file?: string;
  props?: Record<string, string | number | boolean>;
  [key: string]: unknown;
}

export type ReactMapping = SourceLayer;

/**
 * Intent from Magic Patterns / `data-udx`.
 * `explicit` = written `data-udx` on the MP prototype.
 * `inferred` = derived from React name/variant (no attribute).
 * `none` = no signal.
 *
 * The Devin pack only *consumes* `data-udx`. A Magic Patterns skill that
 * WRITES the attribute is not in this repo.
 */
export interface IntentLayer {
  intentConfidence: IntentConfidence;
  dataUdx?: string;
  component?: string;
  variant?: string;
  notes?: string;
  [key: string]: unknown;
}

/**
 * Catalog-backed Angular target. `todo: true` until selector/inputs are
 * verified against `catalog/udx/api-inventory.json` (legacy
 * `catalog/udx/components.json`, or `catalog.path`).
 */
export interface AngularTargetLayer {
  selector?: string;
  inputs?: Record<string, string | number | boolean>;
  todo?: boolean;
  [key: string]: unknown;
}

export type AngularMapping = {
  selector: string;
  inputs: Record<string, string | number | boolean>;
};

export interface MappingLayer {
  transforms?: Array<string | Record<string, unknown>>;
  evidence?: Array<string | Record<string, unknown>> | Record<string, unknown>;
  from?: string;
  to?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface InventoryComponent {
  id: string;
  /** @deprecated inventory v1; prefer `source`. */
  react?: ReactMapping;
  /** @deprecated inventory v1; prefer `angularTarget`. */
  angular?: AngularMapping;
  source?: SourceLayer;
  intent?: IntentLayer;
  angularTarget?: AngularTargetLayer;
  mapping?: MappingLayer;
  required: boolean;
  tokens?: string[];
  /**
   * Placeholder UDX mapping (no catalog row yet). Inventory v1 row flag.
   * On v2 rows this lives on `angularTarget.todo`.
   */
  todo?: boolean;
  /**
   * Set by the loader when the drop included `angularTarget` (v2).
   * Gate A fail-on-todo applies to those rows only, so v1 samples still pass.
   */
  angularTargetSpecified?: boolean;
}

export interface LayoutCheck {
  region: string;
  maxDriftPx?: number;
}

export interface Viewport {
  id?: string;
  name?: string;
  w: number;
  h: number;
}

export interface CatalogRef {
  path?: string;
}

export interface Inventory {
  designSystem: "udx";
  screenId: string;
  referencePng: string;
  frameSize: FrameSize;
  components: InventoryComponent[];
  forbidden?: string[];
  layoutChecks?: LayoutCheck[];
  rubric: string[];
  states?: Array<string | Record<string, unknown>>;
  viewports?: Viewport[];
  evidence?: Record<string, unknown>;
  catalog?: CatalogRef;
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
  name: "A" | "B" | "preflight" | "catalog" | "audit" | "matrix";
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

export interface UdxCatalogComponent {
  /**
   * Angular custom-element selector. Null on source-only APIs (hotkeys,
   * date helpers, close-on-scroll, …) — those rows must not be angularTarget.
   */
  selector?: string | null;
  /** `verified` (eligible) or `source-only` (not an angularTarget). */
  status?: string;
  name?: string;
  id?: string;
  react?: string;
  inputs?: Record<string, Array<string | number | boolean>> | string[];
  variants?: Record<string, Array<string | number | boolean>>;
  tokens?: string[];
  [key: string]: unknown;
}

export interface UdxCatalog {
  designSystem: "udx";
  components: UdxCatalogComponent[];
  [key: string]: unknown;
}
