"use client";

import {
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  XCircle,
  HelpCircle,
  FileWarning,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ExtractionWarning {
  code: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  suggestion: string;
}

interface ExtractionQualityBadgeProps {
  quality: number | null;
  warnings: ExtractionWarning[] | null;
  requiresOCR: boolean;
  processingStatus: string;
}

export function ExtractionQualityBadge({
  quality,
  warnings,
  requiresOCR,
  processingStatus,
}: ExtractionQualityBadgeProps) {
  // Processing states
  if (processingStatus === "PENDING") {
    return (
      <Badge variant="secondary" className="bg-gray-100 text-gray-600">
        En attente
      </Badge>
    );
  }

  if (processingStatus === "PROCESSING") {
    return (
      <Badge variant="secondary" className="bg-blue-100 text-blue-700">
        Traitement...
      </Badge>
    );
  }

  if (processingStatus === "FAILED") {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Echec
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p>L&apos;extraction du PDF a echoue</p>
          {warnings?.[0]?.suggestion && (
            <p className="mt-1 text-xs opacity-80">
              {warnings[0].suggestion}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Quality-based display for completed extractions
  const warningList = warnings ?? [];
  const hasWarnings = warningList.length > 0;
  const criticalWarnings = warningList.filter(
    (w) => w.severity === "critical" || w.severity === "high"
  );

  // Determine badge variant based on quality
  if (quality === null) {
    return (
      <Badge variant="secondary">
        <HelpCircle className="mr-1 h-3 w-3" />
        Non evalue
      </Badge>
    );
  }

  if (quality >= 70) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant="secondary"
            className="flex items-center gap-1 bg-green-100 text-green-700"
          >
            <CheckCircle className="h-3 w-3" />
            {quality}%
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Extraction de qualite ({quality}%)</p>
          <p className="text-xs opacity-80">
            Contenu bien extrait, analyse fiable
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (quality >= 40) {
    return (
      <ExtractionWarningDialog
        quality={quality}
        warnings={warningList}
        requiresOCR={requiresOCR}
      >
        <Badge
          variant="secondary"
          className="flex cursor-pointer items-center gap-1 bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
        >
          <AlertTriangle className="h-3 w-3" />
          {quality}%
          {hasWarnings && (
            <span className="ml-1 text-xs">({warningList.length})</span>
          )}
        </Badge>
      </ExtractionWarningDialog>
    );
  }

  // Low quality - show critical warning
  return (
    <ExtractionWarningDialog
      quality={quality}
      warnings={warningList}
      requiresOCR={requiresOCR}
    >
      <Badge
        variant="destructive"
        className="flex cursor-pointer items-center gap-1 hover:bg-red-600"
      >
        <AlertCircle className="h-3 w-3" />
        {quality}%
        {criticalWarnings.length > 0 && (
          <span className="ml-1 text-xs">
            ({criticalWarnings.length} critique
            {criticalWarnings.length > 1 ? "s" : ""})
          </span>
        )}
      </Badge>
    </ExtractionWarningDialog>
  );
}

interface ExtractionWarningDialogProps {
  quality: number;
  warnings: ExtractionWarning[];
  requiresOCR: boolean;
  children: React.ReactNode;
}

function ExtractionWarningDialog({
  quality,
  warnings,
  requiresOCR,
  children,
}: ExtractionWarningDialogProps) {
  const getSeverityIcon = (severity: ExtractionWarning["severity"]) => {
    switch (severity) {
      case "critical":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "high":
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case "medium":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "low":
        return <HelpCircle className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityLabel = (severity: ExtractionWarning["severity"]) => {
    switch (severity) {
      case "critical":
        return "Critique";
      case "high":
        return "Important";
      case "medium":
        return "Attention";
      case "low":
        return "Info";
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-yellow-500" />
            Qualite d&apos;extraction: {quality}%
          </DialogTitle>
          <DialogDescription>
            L&apos;extraction du PDF a rencontre des problemes qui peuvent affecter
            la qualite de l&apos;analyse.
          </DialogDescription>
        </DialogHeader>

        {requiresOCR && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
              <div>
                <p className="font-medium text-orange-800">OCR recommande</p>
                <p className="text-sm text-orange-700">
                  Ce PDF semble contenir principalement des images. L&apos;OCR
                  permettrait d&apos;extraire le texte des images pour une analyse
                  plus complete.
                </p>
              </div>
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              Problemes detectes ({warnings.length})
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {warnings.map((warning, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border p-3 bg-muted/30"
                >
                  <div className="flex items-start gap-2">
                    {getSeverityIcon(warning.severity)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {warning.message}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {getSeverityLabel(warning.severity)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {warning.suggestion}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm">
            Reessayer l&apos;extraction
          </Button>
          {requiresOCR && (
            <Button size="sm">
              Activer OCR
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Inline warning banner for critical extraction issues
 * Use this above the analysis panel when extraction quality is too low
 */
interface ExtractionWarningBannerProps {
  quality: number | null;
  warnings: ExtractionWarning[] | null;
  documentName: string;
}

export function ExtractionWarningBanner({
  quality,
  warnings,
  documentName,
}: ExtractionWarningBannerProps) {
  if (quality === null || quality >= 40) return null;

  const criticalWarnings =
    warnings?.filter(
      (w) => w.severity === "critical" || w.severity === "high"
    ) ?? [];

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-medium text-red-800">
            Extraction de faible qualite ({quality}%)
          </h4>
          <p className="mt-1 text-sm text-red-700">
            Le document &quot;{documentName}&quot; n&apos;a pas pu etre correctement
            extrait. L&apos;analyse risque d&apos;etre incomplete ou erronee.
          </p>
          {criticalWarnings.length > 0 && (
            <ul className="mt-2 text-sm text-red-600 list-disc list-inside">
              {criticalWarnings.slice(0, 2).map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" className="text-red-700 border-red-300 hover:bg-red-100">
              Re-uploader un PDF textuel
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700">
              Tenter l&apos;OCR
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
