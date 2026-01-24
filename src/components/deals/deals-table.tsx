"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Deal {
  id: string;
  name: string;
  sector: string | null;
  stage: string | null;
  valuationPre: number | string | null;
  status: string;
  website: string | null;
  updatedAt: Date;
  redFlags: { severity: string }[];
}

interface DealsTableProps {
  deals: Deal[];
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    SCREENING: "bg-blue-100 text-blue-800",
    ANALYZING: "bg-yellow-100 text-yellow-800",
    IN_DD: "bg-purple-100 text-purple-800",
    PASSED: "bg-gray-100 text-gray-800",
    INVESTED: "bg-green-100 text-green-800",
    ARCHIVED: "bg-gray-100 text-gray-800",
  };
  return colors[status] ?? "bg-gray-100 text-gray-800";
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    SCREENING: "Screening",
    ANALYZING: "En analyse",
    IN_DD: "Due Diligence",
    PASSED: "Passé",
    INVESTED: "Investi",
    ARCHIVED: "Archivé",
  };
  return labels[status] ?? status;
}

function getStageLabel(stage: string | null) {
  if (!stage) return "-";
  const labels: Record<string, string> = {
    PRE_SEED: "Pre-seed",
    SEED: "Seed",
    SERIES_A: "Série A",
    SERIES_B: "Série B",
    SERIES_C: "Série C",
    LATER: "Later Stage",
  };
  return labels[stage] ?? stage;
}

function formatCurrency(value: number | string | null | undefined) {
  if (value == null) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(num);
}

export function DealsTable({ deals }: DealsTableProps) {
  const router = useRouter();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nom</TableHead>
          <TableHead>Secteur</TableHead>
          <TableHead>Stade</TableHead>
          <TableHead>Valorisation</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Alerts</TableHead>
          <TableHead>Mis à jour</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deals.map((deal) => {
          const criticalFlags = deal.redFlags.filter(
            (f) => f.severity === "CRITICAL" || f.severity === "HIGH"
          ).length;

          return (
            <TableRow
              key={deal.id}
              className="cursor-pointer"
              onClick={() => router.push(`/deals/${deal.id}`)}
            >
              <TableCell className="font-medium">
                {deal.name}
                {deal.website && (
                  <a
                    href={deal.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 inline-flex"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </a>
                )}
              </TableCell>
              <TableCell>{deal.sector ?? "-"}</TableCell>
              <TableCell>{getStageLabel(deal.stage)}</TableCell>
              <TableCell>{formatCurrency(deal.valuationPre)}</TableCell>
              <TableCell>
                <Badge variant="secondary" className={getStatusColor(deal.status)}>
                  {getStatusLabel(deal.status)}
                </Badge>
              </TableCell>
              <TableCell>
                {criticalFlags > 0 ? (
                  <div className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{criticalFlags}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDistanceToNow(new Date(deal.updatedAt), {
                  addSuffix: true,
                  locale: fr,
                })}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
