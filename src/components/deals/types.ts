"use client";

export interface CanonicalDealListItem {
  id: string;
  name: string;
  companyName: string | null;
  sector: string | null;
  stage: string | null;
  valuationPre: number | string | null;
  status: string;
  website: string | null;
  updatedAt: Date;
  redFlags: { severity: string; title?: string }[];
  globalScore?: number | null;
  thesisVerdict?: string | null;
}

export function getDealDisplayName(deal: Pick<CanonicalDealListItem, "companyName" | "name">) {
  return deal.companyName?.trim() || deal.name;
}
