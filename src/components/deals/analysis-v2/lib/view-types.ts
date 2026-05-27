import type { StatusPillSeverity } from "../atoms/status-pill";

export type RankRowItem = {
  id: string;
  title: string;
  description?: string | null;
  severity: StatusPillSeverity;
  severityLabel: string;
  source?: string | null;
  tags?: Array<{ label: string; tone?: "neutral" | "favorable" | "vigilance" | "alert" | "info" }>;
};

export type SignalWithSource = {
  text: string;
  source: string;
};

export type ThesisCard = {
  key: string;
  title: string;
  body: string;
};

export type LoadBearingClaim = {
  id: string;
  statement: string;
  status: "declared" | "verified" | "contradicted";
  impact: string | null;
  validationPath: string | null;
};

export type ThesisAlert = {
  id: string;
  title: string;
  detail: string | null;
  category: string | null;
  severity: StatusPillSeverity;
  severityLabel: string;
};
