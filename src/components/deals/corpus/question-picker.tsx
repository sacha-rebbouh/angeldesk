"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export type LinkedQuestionInput = {
  source: "RED_FLAG" | "QUESTION_TO_ASK";
  redFlagId?: string;
  questionText: string;
};

type DealQuestionEntry =
  | {
      source: "RED_FLAG";
      redFlagId: string;
      questionText: string;
      severity: string;
      category: string;
    }
  | {
      source: "QUESTION_TO_ASK";
      redFlagId: string;
      questionText: string;
      severity: string;
      category: string;
      index: number;
    };

async function fetchDealQuestions(dealId: string): Promise<DealQuestionEntry[]> {
  const response = await fetch(`/api/deals/${dealId}/questions`);
  if (!response.ok) throw new Error("Failed to fetch deal questions");
  const payload = (await response.json()) as { data?: DealQuestionEntry[] };
  return payload.data ?? [];
}

function optionValue(entry: DealQuestionEntry, index: number): string {
  return `${entry.source}:${entry.redFlagId}:${"index" in entry ? entry.index : "flag"}:${index}`;
}

export function QuestionPicker({
  dealId,
  value,
  onChange,
}: {
  dealId: string;
  value: LinkedQuestionInput | null;
  onChange: (value: LinkedQuestionInput | null) => void;
}) {
  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["deal-questions", dealId],
    queryFn: () => fetchDealQuestions(dealId),
    staleTime: 30_000,
  });

  const options = useMemo(
    () =>
      questions.map((entry, index) => ({
        key: optionValue(entry, index),
        entry,
        label:
          entry.source === "RED_FLAG"
            ? `Red flag - ${entry.questionText}`
            : `Question - ${entry.questionText}`,
      })),
    [questions]
  );

  const selectedValue =
    value == null
      ? "none"
      : options.find((option) => (
          option.entry.source === value.source &&
          option.entry.redFlagId === value.redFlagId &&
          option.entry.questionText === value.questionText
        ))?.key ?? "none";

  return (
    <div className="space-y-2">
      <Label>Répond à une question (optionnel)</Label>
      <Select
        value={selectedValue}
        onValueChange={(nextValue) => {
          if (nextValue === "none") {
            onChange(null);
            return;
          }
          const selected = options.find((option) => option.key === nextValue)?.entry;
          if (!selected) return;
          onChange({
            source: selected.source,
            redFlagId: selected.redFlagId,
            questionText: selected.questionText,
          });
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? "Chargement..." : "Aucun lien"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Aucun lien</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.key} value={option.key}>
              <span className="block max-w-[420px] truncate">{option.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
