"use client";

import { useCallback, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  QuestionPicker,
  type LinkedQuestionInput,
} from "@/components/deals/corpus/question-picker";
import {
  AttachmentInput,
  type CorpusAttachmentDraft,
  uploadCorpusAttachment,
} from "@/components/deals/corpus/attachment-input";
import {
  DOCUMENT_TYPES,
  type DocumentType,
  type UploadedDocumentSummary,
} from "@/components/deals/file-upload";
import { clerkFetch } from "@/lib/clerk-fetch";

type NoteType = "call" | "meeting" | "founder_answer" | "internal";

function toDateTimeLocal(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

/**
 * B12.2.b — submit state surfaced to the parent dialog (mirror of
 * EmailForm). The submit button itself has moved from the bottom of
 * the scroll container into the dialog's sticky footer.
 */
export interface NoteFormState {
  canSubmit: boolean;
  isSubmitting: boolean;
  attachmentCount: number;
}

export const UPLOAD_NOTE_FORM_ID = "upload-note-form";

export function NoteForm({
  dealId,
  onCreated,
  onError,
  onStateChange,
}: {
  dealId: string;
  onCreated: (document: UploadedDocumentSummary) => void;
  onError: (message: string) => void;
  /**
   * B12.2.b — emitted on every relevant state change so the parent
   * dialog can render the sticky-footer submit button with the right
   * disabled state + label. Optional for back-compat.
   */
  onStateChange?: (state: NoteFormState) => void;
}) {
  const [title, setTitle] = useState("");
  const [occurredAt, setOccurredAt] = useState(toDateTimeLocal(new Date()));
  const [participants, setParticipants] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("call");
  const [body, setBody] = useState("");
  const [type, setType] = useState<DocumentType>("OTHER");
  const [linkedQuestion, setLinkedQuestion] = useState<LinkedQuestionInput | null>(null);
  const [attachments, setAttachments] = useState<CorpusAttachmentDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // B12.2.b — surface submit-readiness to the parent dialog.
  // canSubmit mirrors the legacy `disabled={isSubmitting || !body.trim()}`.
  useEffect(() => {
    onStateChange?.({
      canSubmit: !isSubmitting && body.trim().length > 0,
      isSubmitting,
      attachmentCount: attachments.length,
    });
  }, [attachments.length, body, isSubmitting, onStateChange]);

  const submit = useCallback(async () => {
    if (!body.trim()) {
      onError("Renseignez la note avant d'ajouter au corpus");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await clerkFetch("/api/documents/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          sourceKind: "NOTE",
          type,
          title: title.trim() || undefined,
          occurredAt: toIso(occurredAt),
          participants: participants.trim() || undefined,
          noteType,
          body,
          linkedQuestion: linkedQuestion ?? undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Impossible d'ajouter la note au corpus");
      }

      const parentDocument = payload.data as UploadedDocumentSummary;
      onCreated(parentDocument);

      const attachmentErrors: string[] = [];
      for (const attachment of attachments) {
        setAttachments((current) => current.map((item) => (
          item.id === attachment.id ? { ...item, status: "uploading", error: undefined } : item
        )));
        try {
          const uploadedAttachment = await uploadCorpusAttachment({
            dealId,
            corpusParentDocumentId: parentDocument.id,
            attachment,
          });
          onCreated({
            ...uploadedAttachment,
            corpusParentDocumentId: parentDocument.id,
            corpusParentDocument: { id: parentDocument.id, name: parentDocument.name },
          });
          setAttachments((current) => current.map((item) => (
            item.id === attachment.id ? { ...item, status: "success" } : item
          )));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload échoué";
          attachmentErrors.push(`${attachment.file.name}: ${message}`);
          setAttachments((current) => current.map((item) => (
            item.id === attachment.id ? { ...item, status: "error", error: message } : item
          )));
        }
      }

      setTitle("");
      setOccurredAt(toDateTimeLocal(new Date()));
      setParticipants("");
      setNoteType("call");
      setBody("");
      setType("OTHER");
      setLinkedQuestion(null);
      setAttachments([]);

      if (attachmentErrors.length > 0) {
        onError(`Note ajoutée, mais certaines pièces jointes ont échoué: ${attachmentErrors.join(" ; ")}`);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Impossible d'ajouter la note au corpus");
    } finally {
      setIsSubmitting(false);
    }
  }, [attachments, body, dealId, linkedQuestion, noteType, occurredAt, onCreated, onError, participants, title, type]);

  // B12.2.b — the submit button lives in the dialog's sticky footer
  // now. preventDefault stops the browser's default page reload;
  // submit() drives the async POST identically to the pre-B12.2.b
  // onClick path.
  const handleFormSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submit();
    },
    [submit]
  );

  return (
    <form
      id={UPLOAD_NOTE_FORM_ID}
      onSubmit={handleFormSubmit}
      className="space-y-4"
      aria-label="Ajouter une note au corpus"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="note-title">Titre</Label>
          <Input
            id="note-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Call CFO, réponse churn, note interne..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="note-date">Date de l&apos;échange</Label>
          <Input
            id="note-date"
            type="datetime-local"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Nature</Label>
          <Select value={noteType} onValueChange={(value: NoteType) => setNoteType(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="call">Call</SelectItem>
              <SelectItem value="meeting">Rendez-vous</SelectItem>
              <SelectItem value="founder_answer">Réponse fondateur</SelectItem>
              <SelectItem value="internal">Note interne</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Type métier</Label>
          <Select value={type} onValueChange={(value: DocumentType) => setType(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((documentType) => (
                <SelectItem key={documentType.value} value={documentType.value}>
                  {documentType.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note-participants">Participants</Label>
        <Input
          id="note-participants"
          value={participants}
          onChange={(event) => setParticipants(event.target.value)}
          placeholder="Jean CFO, Sarah CEO, Sacha..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="note-body">Note</Label>
        <Textarea
          id="note-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Collez les notes de call, la réponse orale, ou le mémo interne..."
          className="min-h-44"
        />
      </div>

      <QuestionPicker dealId={dealId} value={linkedQuestion} onChange={setLinkedQuestion} />

      <AttachmentInput value={attachments} onChange={setAttachments} disabled={isSubmitting} />
    </form>
  );
}
