"use client";

import React, { memo, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ResponseStatus = "answered" | "not_applicable" | "refused" | "pending";

interface FounderResponseInputProps {
  questionId: string;
  answer: string;
  status: ResponseStatus;
  disabled?: boolean;
  onChange: (questionId: string, answer: string, status: ResponseStatus) => void;
}

export const FounderResponseInput = memo(function FounderResponseInput({
  questionId,
  answer,
  status,
  disabled = false,
  onChange,
}: FounderResponseInputProps) {
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newAnswer = e.target.value;
      const newStatus =
        status === "pending" && newAnswer
          ? "answered"
          : status === "answered" && !newAnswer
            ? "pending"
            : status;
      onChange(questionId, newAnswer, newStatus);
    },
    [questionId, status, onChange],
  );

  const handleStatusChange = useCallback(
    (v: string) => {
      onChange(questionId, answer, v as ResponseStatus);
    },
    [questionId, answer, onChange],
  );

  return (
    <div className="flex gap-2 items-start">
      <Textarea
        placeholder="Reponse du fondateur..."
        className="min-h-[50px] text-sm flex-1"
        value={answer}
        disabled={disabled}
        onChange={handleTextChange}
      />
      <Select value={status} disabled={disabled} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">En attente</SelectItem>
          <SelectItem value="answered">Repondu</SelectItem>
          <SelectItem value="not_applicable">N/A</SelectItem>
          <SelectItem value="refused">Refuse</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
});
