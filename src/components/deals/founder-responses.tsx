"use client";

import { useState, useCallback, useMemo, memo } from "react";
import { ChevronDown, ChevronUp, Loader2, MessageSquare, StickyNote, AlertTriangle, CheckCircle2, XCircle, HelpCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAgentName } from "@/lib/format-utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// =============================================================================
// Types
// =============================================================================

export type QuestionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type QuestionCategory = "FINANCIAL" | "TEAM" | "MARKET" | "PRODUCT" | "LEGAL" | "TRACTION" | "OTHER";
export type ResponseStatus = "answered" | "not_applicable" | "refused" | "pending";

export interface AgentQuestion {
  id: string;
  question: string;
  category: QuestionCategory;
  priority: QuestionPriority;
  agentSource: string;
}

export interface QuestionResponse {
  questionId: string;
  answer: string;
  status: ResponseStatus;
}

interface FounderResponsesProps {
  dealId: string;
  questions: AgentQuestion[];
  existingResponses?: QuestionResponse[];
  onSubmitAndReanalyze: (responses: QuestionResponse[], freeNotes: string) => Promise<void>;
  onSaveOnly?: (responses: QuestionResponse[], freeNotes: string) => Promise<void>;
  isSubmitting?: boolean;
  isReanalyzing?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const PRIORITY_ORDER: QuestionPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const PRIORITY_CONFIG: Record<QuestionPriority, {
  label: string;
  labelFr: string;
  className: string;
  bgClass: string;
  isRequired: boolean;
  description: string;
}> = {
  CRITICAL: {
    label: "Critical",
    labelFr: "Critique",
    className: "bg-red-600 text-white border-transparent",
    bgClass: "bg-red-50 border-red-200",
    isRequired: true,
    description: "Question essentielle - reponse obligatoire avant re-analyse"
  },
  HIGH: {
    label: "High",
    labelFr: "Haute",
    className: "bg-orange-500 text-white border-transparent",
    bgClass: "bg-orange-50 border-orange-200",
    isRequired: true,
    description: "Question importante - reponse obligatoire"
  },
  MEDIUM: {
    label: "Medium",
    labelFr: "Moyenne",
    className: "bg-amber-500 text-white border-transparent",
    bgClass: "bg-amber-50/50 border-amber-200",
    isRequired: false,
    description: "Question utile - optionnelle"
  },
  LOW: {
    label: "Low",
    labelFr: "Basse",
    className: "bg-gray-400 text-white border-transparent",
    bgClass: "bg-gray-50 border-gray-200",
    isRequired: false,
    description: "Question complementaire - optionnelle"
  },
};

const CATEGORY_CONFIG: Record<QuestionCategory, { label: string; color: string }> = {
  FINANCIAL: { label: "Finances", color: "bg-emerald-100 text-emerald-800" },
  TEAM: { label: "Equipe", color: "bg-blue-100 text-blue-800" },
  MARKET: { label: "Marche", color: "bg-purple-100 text-purple-800" },
  PRODUCT: { label: "Produit", color: "bg-orange-100 text-orange-800" },
  LEGAL: { label: "Legal", color: "bg-slate-100 text-slate-800" },
  TRACTION: { label: "Traction", color: "bg-cyan-100 text-cyan-800" },
  OTHER: { label: "Autre", color: "bg-gray-100 text-gray-800" },
};

const STATUS_CONFIG: Record<ResponseStatus, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: "En attente", icon: HelpCircle },
  answered: { label: "Repondu", icon: CheckCircle2 },
  not_applicable: { label: "Non applicable", icon: XCircle },
  refused: { label: "Refus de repondre", icon: AlertTriangle },
};

// =============================================================================
// Sub-components
// =============================================================================

interface PrioritySectionProps {
  priority: QuestionPriority;
  questions: AgentQuestion[];
  responses: Record<string, { answer: string; status: ResponseStatus }>;
  onResponseChange: (questionId: string, answer: string, status: ResponseStatus) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

function PrioritySection({
  priority,
  questions,
  responses,
  onResponseChange,
  isExpanded,
  onToggle,
}: PrioritySectionProps) {
  const config = PRIORITY_CONFIG[priority];
  const answeredCount = questions.filter((q) => {
    const r = responses[q.id];
    return r && (r.status === "answered" || r.status === "not_applicable" || r.status === "refused");
  }).length;

  const isComplete = answeredCount === questions.length;

  return (
    <div className={cn("border rounded-lg overflow-hidden", config.bgClass)}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-black/5 transition-colors text-left"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3">
          <Badge className={cn("text-xs font-semibold", config.className)}>
            {config.labelFr}
          </Badge>
          <span className="text-sm font-medium">
            {questions.length} question{questions.length > 1 ? "s" : ""}
          </span>
          {config.isRequired && (
            <span className="text-xs text-red-600 font-medium">
              (obligatoire)
            </span>
          )}
          <span className={cn(
            "text-xs font-medium",
            isComplete ? "text-green-600" : "text-muted-foreground"
          )}>
            {answeredCount}/{questions.length} traitee{answeredCount > 1 ? "s" : ""}
          </span>
          {isComplete && <CheckCircle2 className="h-4 w-4 text-green-600" />}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t bg-white p-4 space-y-6">
          {questions.map((question) => (
            <QuestionItem
              key={question.id}
              question={question}
              response={responses[question.id] || { answer: "", status: "pending" }}
              onChange={(answer, status) => onResponseChange(question.id, answer, status)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface QuestionItemProps {
  question: AgentQuestion;
  response: { answer: string; status: ResponseStatus };
  onChange: (answer: string, status: ResponseStatus) => void;
}

function QuestionItem({ question, response, onChange }: QuestionItemProps) {
  const categoryConfig = CATEGORY_CONFIG[question.category];
  const textareaId = `question-${question.id}`;
  const isRequired = PRIORITY_CONFIG[question.priority].isRequired;

  const handleStatusChange = (newStatus: ResponseStatus) => {
    onChange(response.answer, newStatus);
  };

  const handleAnswerChange = (newAnswer: string) => {
    // Auto-set status to "answered" if user types something
    const newStatus = newAnswer.trim() ? "answered" : response.status === "answered" ? "pending" : response.status;
    onChange(newAnswer, newStatus);
  };

  return (
    <div className="space-y-3 p-4 border rounded-lg bg-white">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <Label
            htmlFor={textareaId}
            className="text-sm font-medium leading-relaxed cursor-pointer"
          >
            {question.question}
            {isRequired && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <div className="flex items-center gap-2">
            <Badge className={cn("text-xs", categoryConfig.color)}>
              {categoryConfig.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Source: {formatAgentName(question.agentSource)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Statut:</Label>
        <Select
          value={response.status}
          onValueChange={(value: ResponseStatus) => handleStatusChange(value)}
        >
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(STATUS_CONFIG) as [ResponseStatus, typeof STATUS_CONFIG[ResponseStatus]][]).map(([status, config]) => {
              const Icon = config.icon;
              return (
                <SelectItem key={status} value={status} className="text-xs">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3 w-3" />
                    {config.label}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {(response.status === "answered" || response.status === "pending") && (
        <Textarea
          id={textareaId}
          value={response.answer}
          onChange={(e) => handleAnswerChange(e.target.value)}
          placeholder="Saisissez la reponse du fondateur..."
          className="min-h-[80px] resize-y"
          disabled={response.status !== "answered" && response.status !== "pending"}
        />
      )}

      {response.status === "refused" && (
        <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Le fondateur a refuse de repondre - ceci sera pris en compte dans l&apos;analyse.
        </div>
      )}

      {response.status === "not_applicable" && (
        <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded flex items-center gap-2">
          <XCircle className="h-4 w-4" />
          Question non applicable a ce deal.
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function groupQuestionsByPriority(
  questions: AgentQuestion[]
): Map<QuestionPriority, AgentQuestion[]> {
  const grouped = new Map<QuestionPriority, AgentQuestion[]>();

  // Initialize all priorities in order
  for (const priority of PRIORITY_ORDER) {
    grouped.set(priority, []);
  }

  // Group questions
  for (const question of questions) {
    const priorityQuestions = grouped.get(question.priority) || [];
    priorityQuestions.push(question);
    grouped.set(question.priority, priorityQuestions);
  }

  // Remove empty priorities
  for (const priority of PRIORITY_ORDER) {
    if (grouped.get(priority)?.length === 0) {
      grouped.delete(priority);
    }
  }

  return grouped;
}

// =============================================================================
// Main Component
// =============================================================================

export const FounderResponses = memo(function FounderResponses({
  dealId,
  questions,
  existingResponses = [],
  onSubmitAndReanalyze,
  onSaveOnly,
  isSubmitting = false,
  isReanalyzing = false,
}: FounderResponsesProps) {
  // dealId is available for future use (e.g., saving responses)
  void dealId;
  // Initialize responses from existing data
  const initialResponses = useMemo(() => {
    const map: Record<string, { answer: string; status: ResponseStatus }> = {};
    for (const response of existingResponses) {
      map[response.questionId] = {
        answer: response.answer,
        status: response.status || (response.answer ? "answered" : "pending"),
      };
    }
    return map;
  }, [existingResponses]);

  const [responses, setResponses] = useState<Record<string, { answer: string; status: ResponseStatus }>>(initialResponses);
  const [freeNotes, setFreeNotes] = useState("");
  const [expandedPriorities, setExpandedPriorities] = useState<Set<string>>(() => {
    // Start with CRITICAL and HIGH expanded
    return new Set(["CRITICAL", "HIGH"]);
  });

  // Group questions by priority
  const groupedQuestions = useMemo(
    () => groupQuestionsByPriority(questions),
    [questions]
  );

  // Handle response change
  const handleResponseChange = useCallback((questionId: string, answer: string, status: ResponseStatus) => {
    setResponses((prev) => ({
      ...prev,
      [questionId]: { answer, status },
    }));
  }, []);

  // Handle priority toggle
  const handlePriorityToggle = useCallback((priority: string) => {
    setExpandedPriorities((prev) => {
      const next = new Set(prev);
      if (next.has(priority)) {
        next.delete(priority);
      } else {
        next.add(priority);
      }
      return next;
    });
  }, []);

  // Convert responses to array format
  const getResponsesArray = useCallback((): QuestionResponse[] => {
    return Object.entries(responses)
      .filter(([, r]) => r.status !== "pending")
      .map(([questionId, r]) => ({
        questionId,
        answer: r.answer.trim(),
        status: r.status,
      }));
  }, [responses]);

  // Handle re-analyze
  const handleReanalyze = useCallback(async () => {
    await onSubmitAndReanalyze(getResponsesArray(), freeNotes.trim());
  }, [getResponsesArray, freeNotes, onSubmitAndReanalyze]);

  // Handle save only
  const handleSaveOnly = useCallback(async () => {
    if (onSaveOnly) {
      await onSaveOnly(getResponsesArray(), freeNotes.trim());
    }
  }, [getResponsesArray, freeNotes, onSaveOnly]);

  // Calculate stats
  const stats = useMemo(() => {
    const criticalQuestions = questions.filter(q => q.priority === "CRITICAL");
    const highQuestions = questions.filter(q => q.priority === "HIGH");
    const requiredQuestions = [...criticalQuestions, ...highQuestions];

    const answeredRequired = requiredQuestions.filter(q => {
      const r = responses[q.id];
      return r && (r.status === "answered" || r.status === "not_applicable" || r.status === "refused");
    });

    const totalAnswered = questions.filter(q => {
      const r = responses[q.id];
      return r && (r.status === "answered" || r.status === "not_applicable" || r.status === "refused");
    });

    return {
      totalQuestions: questions.length,
      requiredCount: requiredQuestions.length,
      requiredAnswered: answeredRequired.length,
      totalAnswered: totalAnswered.length,
      canReanalyze: answeredRequired.length === requiredQuestions.length,
      criticalCount: criticalQuestions.length,
      highCount: highQuestions.length,
    };
  }, [questions, responses]);

  // Empty state
  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Aucune question generee</p>
            <p className="text-sm mt-1">
              Lancez une analyse pour generer des questions a poser au fondateur.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Questions fondateur
        </CardTitle>
        <CardDescription className="space-y-2">
          <div>
            {stats.totalQuestions} question{stats.totalQuestions > 1 ? "s" : ""} a poser
            {stats.requiredCount > 0 && (
              <span className="text-red-600 font-medium">
                {" "}- {stats.requiredCount} obligatoire{stats.requiredCount > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-4 text-sm">
            <div className={cn(
              "flex items-center gap-1",
              stats.canReanalyze ? "text-green-600" : "text-amber-600"
            )}>
              {stats.canReanalyze ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <span>
                {stats.requiredAnswered}/{stats.requiredCount} questions obligatoires traitees
              </span>
            </div>
            <span className="text-muted-foreground">
              ({stats.totalAnswered}/{stats.totalQuestions} total)
            </span>
          </div>

        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Questions by Priority */}
        <div className="space-y-3">
          {Array.from(groupedQuestions.entries()).map(([priority, priorityQuestions]) => (
            <PrioritySection
              key={priority}
              priority={priority}
              questions={priorityQuestions}
              responses={responses}
              onResponseChange={handleResponseChange}
              isExpanded={expandedPriorities.has(priority)}
              onToggle={() => handlePriorityToggle(priority)}
            />
          ))}
        </div>

        {/* Free Notes Section */}
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="free-notes" className="font-medium">
              Notes libres (optionnel)
            </Label>
          </div>
          <Textarea
            id="free-notes"
            value={freeNotes}
            onChange={(e) => setFreeNotes(e.target.value)}
            placeholder="Collez vos notes de call, emails, messages..."
            className="min-h-[120px] resize-y"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm">
            {!stats.canReanalyze && (
              <p className="text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Repondez aux {stats.requiredCount - stats.requiredAnswered} question{stats.requiredCount - stats.requiredAnswered > 1 ? "s" : ""} obligatoire{stats.requiredCount - stats.requiredAnswered > 1 ? "s" : ""} restante{stats.requiredCount - stats.requiredAnswered > 1 ? "s" : ""} pour re-analyser
              </p>
            )}
            {stats.canReanalyze && (
              <p className="text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                Pret pour la re-analyse
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onSaveOnly && (
              <Button
                variant="outline"
                onClick={handleSaveOnly}
                disabled={isSubmitting || isReanalyzing}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sauvegarde...
                  </>
                ) : (
                  "Sauvegarder"
                )}
              </Button>
            )}
            <Button
              onClick={handleReanalyze}
              disabled={!stats.canReanalyze || isReanalyzing || isSubmitting}
              className="min-w-[200px]"
            >
              {isReanalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Re-analyse en cours...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-analyser avec les reponses
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
