"use client";

import { useCallback, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { extractEmailMetadata } from "@/components/deals/corpus/extract-email-metadata";
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

function toDateTimeLocal(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toIsoOrUndefined(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function deriveSubject(body: string): string {
  return body
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 120) ?? "Email ajouté au corpus";
}

export function EmailForm({
  dealId,
  onCreated,
  onError,
}: {
  dealId: string;
  onCreated: (document: UploadedDocumentSummary) => void;
  onError: (message: string) => void;
}) {
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sentAt, setSentAt] = useState(toDateTimeLocal(new Date()));
  const [receivedAt, setReceivedAt] = useState("");
  const [type, setType] = useState<DocumentType>("OTHER");
  const [linkedQuestion, setLinkedQuestion] = useState<LinkedQuestionInput | null>(null);
  const [attachments, setAttachments] = useState<CorpusAttachmentDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applyExtraction = useCallback((raw: string) => {
    const extracted = extractEmailMetadata(raw);
    setBody(extracted.body || raw.trim());
    setSubject(extracted.subject ?? deriveSubject(extracted.body || raw));
    setFrom(extracted.from ?? "");
    setTo(extracted.to ?? "");
    setSentAt(toDateTimeLocal(extracted.sentAt ?? new Date()));
  }, []);

  const submit = useCallback(async () => {
    if (!body.trim()) {
      onError("Collez le contenu de l'email avant d'ajouter au corpus");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/documents/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          sourceKind: "EMAIL",
          type,
          subject: subject.trim() || deriveSubject(body),
          from: from.trim() || undefined,
          to: to.trim() || undefined,
          sentAt: toIsoOrUndefined(sentAt),
          receivedAt: toIsoOrUndefined(receivedAt),
          body,
          bodyFormat: "text",
          linkedQuestion: linkedQuestion ?? undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Impossible d'ajouter l'email au corpus");
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

      setBody("");
      setSubject("");
      setFrom("");
      setTo("");
      setSentAt(toDateTimeLocal(new Date()));
      setReceivedAt("");
      setType("OTHER");
      setLinkedQuestion(null);
      setAttachments([]);

      if (attachmentErrors.length > 0) {
        onError(`Email ajouté, mais certaines pièces jointes ont échoué: ${attachmentErrors.join(" ; ")}`);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Impossible d'ajouter l'email au corpus");
    } finally {
      setIsSubmitting(false);
    }
  }, [attachments, body, dealId, from, linkedQuestion, onCreated, onError, receivedAt, sentAt, subject, to, type]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email-body">Email</Label>
        <Textarea
          id="email-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onPaste={(event) => {
            const html = event.clipboardData.getData("text/html");
            const text = event.clipboardData.getData("text/plain");
            const raw = html || text;
            if (!raw.trim()) return;
            event.preventDefault();
            applyExtraction(raw);
          }}
          placeholder="Collez ici un email Gmail, Outlook, Apple Mail ou simplement le corps du message..."
          className="min-h-40"
        />
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyExtraction(body)}
            disabled={!body.trim()}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Re-tenter l&apos;extraction
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email-subject">Sujet</Label>
          <Input id="email-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email-from">De</Label>
          <Input id="email-from" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email-sent-at">Date du mail</Label>
          <Input
            id="email-sent-at"
            type="datetime-local"
            value={sentAt}
            onChange={(event) => setSentAt(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email-received-at">Reçu le (optionnel)</Label>
          <Input
            id="email-received-at"
            type="datetime-local"
            value={receivedAt}
            onChange={(event) => setReceivedAt(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email-to">À</Label>
          <Input id="email-to" value={to} onChange={(event) => setTo(event.target.value)} />
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

      <QuestionPicker dealId={dealId} value={linkedQuestion} onChange={setLinkedQuestion} />

      <AttachmentInput value={attachments} onChange={setAttachments} disabled={isSubmitting} />

      <Button onClick={submit} disabled={isSubmitting || !body.trim()} className="w-full">
        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Ajouter l&apos;email{attachments.length > 0 ? ` et ${attachments.length} fichier${attachments.length > 1 ? "s" : ""}` : ""} au corpus
      </Button>
    </div>
  );
}
