"use client";

import { useState, useCallback, useMemo } from "react";
import { ChevronDown, ChevronUp, Loader2, MessageSquare, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAgentName } from "@/lib/format-utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// =============================================================================
// Types
// =============================================================================

export interface AgentQuestion {
  id: string;
  question: string;
  category: "FINANCIAL" | "TEAM" | "MARKET" | "PRODUCT" | "LEGAL" | "TRACTION" | "OTHER";
  priority: "HIGH" | "MEDIUM" | "LOW";
  agentSource: string;
}

export interface QuestionResponse {
  questionId: string;
  answer: string;
}

interface FounderResponsesProps {
  dealId: string;
  questions: AgentQuestion[];
  existingResponses?: QuestionResponse[];
  onSubmit: (responses: QuestionResponse[], freeNotes: string) => Promise<void>;
  isSubmitting?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const CATEGORY_CONFIG: Record<
  AgentQuestion["category"],
  { label: string; color: string }
> = {
  FINANCIAL: { label: "Finances", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  TEAM: { label: "Equipe", color: "bg-blue-100 text-blue-800 border-blue-200" },
  MARKET: { label: "Marche", color: "bg-purple-100 text-purple-800 border-purple-200" },
  PRODUCT: { label: "Produit", color: "bg-orange-100 text-orange-800 border-orange-200" },
  LEGAL: { label: "Legal", color: "bg-slate-100 text-slate-800 border-slate-200" },
  TRACTION: { label: "Traction", color: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  OTHER: { label: "Autre", color: "bg-gray-100 text-gray-800 border-gray-200" },
};

const PRIORITY_CONFIG: Record<
  AgentQuestion["priority"],
  { label: string; className: string }
> = {
  HIGH: { label: "Haute", className: "bg-red-500 text-white border-transparent" },
  MEDIUM: { label: "Moyenne", className: "bg-amber-500 text-white border-transparent" },
  LOW: { label: "Basse", className: "bg-gray-400 text-white border-transparent" },
};

const CATEGORY_ORDER: AgentQuestion["category"][] = [
  "FINANCIAL",
  "TEAM",
  "MARKET",
  "PRODUCT",
  "LEGAL",
  "TRACTION",
  "OTHER",
];

// =============================================================================
// Sub-components
// =============================================================================

interface CategorySectionProps {
  category: AgentQuestion["category"];
  questions: AgentQuestion[];
  responses: Record<string, string>;
  onResponseChange: (questionId: string, answer: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

function CategorySection({
  category,
  questions,
  responses,
  onResponseChange,
  isExpanded,
  onToggle,
}: CategorySectionProps) {
  const config = CATEGORY_CONFIG[category];
  const answeredCount = questions.filter((q) => responses[q.id]?.trim()).length;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
        aria-expanded={isExpanded}
        aria-controls={`category-${category}-content`}
      >
        <div className="flex items-center gap-3">
          <Badge className={cn("text-xs", config.color)}>{config.label}</Badge>
          <span className="text-sm text-muted-foreground">
            {questions.length} question{questions.length > 1 ? "s" : ""}
          </span>
          {answeredCount > 0 && (
            <span className="text-xs text-green-600 font-medium">
              {answeredCount} repondue{answeredCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div
          id={`category-${category}-content`}
          className="border-t p-4 space-y-6"
        >
          {questions.map((question) => (
            <QuestionItem
              key={question.id}
              question={question}
              value={responses[question.id] || ""}
              onChange={(value) => onResponseChange(question.id, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface QuestionItemProps {
  question: AgentQuestion;
  value: string;
  onChange: (value: string) => void;
}

function QuestionItem({ question, value, onChange }: QuestionItemProps) {
  const priorityConfig = PRIORITY_CONFIG[question.priority];
  const textareaId = `question-${question.id}`;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <Label
          htmlFor={textareaId}
          className="text-sm font-medium leading-relaxed flex-1 cursor-pointer"
        >
          {question.question}
        </Label>
        <Badge className={cn("shrink-0 text-xs", priorityConfig.className)}>
          {priorityConfig.label}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Source: {formatAgentName(question.agentSource)}
      </p>

      <Textarea
        id={textareaId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Saisissez la reponse du fondateur..."
        className="min-h-[80px] resize-y"
        aria-label={`Reponse a la question: ${question.question}`}
      />
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function groupQuestionsByCategory(
  questions: AgentQuestion[]
): Map<AgentQuestion["category"], AgentQuestion[]> {
  const grouped = new Map<AgentQuestion["category"], AgentQuestion[]>();

  // Initialize all categories in order
  for (const category of CATEGORY_ORDER) {
    grouped.set(category, []);
  }

  // Group questions
  for (const question of questions) {
    const categoryQuestions = grouped.get(question.category) || [];
    categoryQuestions.push(question);
    grouped.set(question.category, categoryQuestions);
  }

  // Remove empty categories
  for (const category of CATEGORY_ORDER) {
    if (grouped.get(category)?.length === 0) {
      grouped.delete(category);
    }
  }

  return grouped;
}

// =============================================================================
// Main Component
// =============================================================================

export function FounderResponses({
  dealId,
  questions,
  existingResponses = [],
  onSubmit,
  isSubmitting = false,
}: FounderResponsesProps) {
  // Initialize responses from existing data
  const initialResponses = useMemo(() => {
    const map: Record<string, string> = {};
    for (const response of existingResponses) {
      map[response.questionId] = response.answer;
    }
    return map;
  }, [existingResponses]);

  const [responses, setResponses] = useState<Record<string, string>>(initialResponses);
  const [freeNotes, setFreeNotes] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => {
    // Start with first category expanded
    const grouped = groupQuestionsByCategory(questions);
    const firstCategory = grouped.keys().next().value;
    return firstCategory ? new Set([firstCategory]) : new Set();
  });

  // Group questions by category
  const groupedQuestions = useMemo(
    () => groupQuestionsByCategory(questions),
    [questions]
  );

  // Handle response change
  const handleResponseChange = useCallback((questionId: string, answer: string) => {
    setResponses((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
  }, []);

  // Handle category toggle
  const handleCategoryToggle = useCallback((category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    // Convert responses map to array format
    const responsesArray: QuestionResponse[] = Object.entries(responses)
      .filter(([, answer]) => answer.trim())
      .map(([questionId, answer]) => ({
        questionId,
        answer: answer.trim(),
      }));

    await onSubmit(responsesArray, freeNotes.trim());
  }, [responses, freeNotes, onSubmit]);

  // Validation: at least 1 response or free notes required
  const hasContent = useMemo(() => {
    const hasResponses = Object.values(responses).some((r) => r.trim());
    const hasNotes = freeNotes.trim().length > 0;
    return hasResponses || hasNotes;
  }, [responses, freeNotes]);

  // Stats
  const answeredCount = useMemo(
    () => Object.values(responses).filter((r) => r.trim()).length,
    [responses]
  );

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
          Reponses fondateur
        </CardTitle>
        <CardDescription>
          {questions.length} question{questions.length > 1 ? "s" : ""} a poser
          {answeredCount > 0 && (
            <span className="text-green-600">
              {" "}
              - {answeredCount} repondue{answeredCount > 1 ? "s" : ""}
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Questions by Category */}
        <div className="space-y-3">
          {Array.from(groupedQuestions.entries()).map(([category, categoryQuestions]) => (
            <CategorySection
              key={category}
              category={category}
              questions={categoryQuestions}
              responses={responses}
              onResponseChange={handleResponseChange}
              isExpanded={expandedCategories.has(category)}
              onToggle={() => handleCategoryToggle(category)}
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
            aria-label="Notes libres additionnelles"
          />
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            {!hasContent && "Au moins 1 reponse ou des notes libres requises"}
          </p>
          <Button
            onClick={handleSubmit}
            disabled={!hasContent || isSubmitting}
            className="min-w-[180px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              "Soumettre les reponses"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
