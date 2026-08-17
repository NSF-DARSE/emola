import type { Category, Status } from './taxonomy';
import type { NormalizedWindow } from './time';

export type Route = 'auto_send' | 'human_review';
export type ReviewState = 'pending' | 'approved' | 'rejected';
export type Decision = 'approve' | 'reject';

export interface FlaggedSpan {
  kind: 'ip_address' | 'server_name' | 'unknown_term' | 'phone' | 'email';
  text: string;
  start: number;
  end: number;
  note: string;
}

export interface SafetyReport {
  /** 0 = nothing found, 1 = maximum concern. */
  score: number;
  clean: boolean;
  spans: FlaggedSpan[];
}

/** Structured fields shared by the infographic and the executive summary. */
export interface ExtractedFields {
  eventType: string;
  affectedSystems: string[];
  window: NormalizedWindow | null;
  subWindows: NormalizedWindow[];
  scheduleConfidence: number;
  scheduleNotes: string[];
  impact: string;
  requiredAction: string;
  contact: string | null;
  isProduction: boolean;
  /** "unstated" means the notice never said — treated as risk, not as safe. */
  productionScope: 'production' | 'non_production' | 'unstated';
  isPlanned: boolean;
}

/** Everything the model produces. Displayed to a reviewer only after they
 *  submit their own call, and never written to the precedent table. */
export interface ModelAssessment {
  primary: Category;
  secondary: Category[];
  status: Status;
  confidence: number;
  reasoning: string;
  /** Which engine produced this — "stub" today, a trained model later. */
  engine: string;
}

export interface NotificationRecord {
  id: string;
  receivedAt: string;
  body: string;
  synthetic: boolean;
  syntheticReason: string | null;
  goldPrimary: Category | null;
  goldSecondary: Category[];
  goldStatus: Status | null;
  holdout: boolean;

  model: ModelAssessment;
  extracted: ExtractedFields;
  safety: SafetyReport;

  route: Route;
  routeReasons: string[];
  reviewState: ReviewState;
  /** Set when this notice is an update threaded onto an earlier one. */
  threadParentId: string | null;
}

export interface DecisionRecord {
  id: number;
  notificationId: string;
  decision: Decision;
  /** The human's own classification, captured before they see the model's. */
  humanPrimary: Category;
  humanSecondary: Category[];
  humanStatus: Status;
  reason: string;
  reviewer: string;
  createdAt: string;
  /** Snapshot of what the model had said, for override-rate reporting only. */
  modelPrimaryAtDecision: Category;
  modelStatusAtDecision: Status;
  modelConfidenceAtDecision: number;
}

export interface PrecedentRecord {
  id: number;
  notificationId: string | null;
  /** The phrase or case the ruling is about. */
  phrase: string;
  humanPrimary: Category;
  humanStatus: Status;
  decision: Decision;
  reason: string;
  reviewer: string;
  createdAt: string;
  seeded: boolean;
}

export interface PrecedentMatch {
  precedent: PrecedentRecord;
  similarity: number;
}

export type ArtifactKind = 'infographic' | 'exec_summary';

export interface ArtifactRecord {
  id: number;
  notificationId: string;
  kind: ArtifactKind;
  payload: string;
  approvalState: 'draft' | 'approved' | 'rejected';
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}
