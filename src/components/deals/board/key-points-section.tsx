"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";

interface KeyPointsSectionProps {
  consensusPoints: string[];
  frictionPoints: string[];
  questionsForFounder: string[];
}

export function KeyPointsSection({
  consensusPoints,
  frictionPoints,
  questionsForFounder,
}: KeyPointsSectionProps) {
  const hasContent =
    consensusPoints.length > 0 ||
    frictionPoints.length > 0 ||
    questionsForFounder.length > 0;

  if (!hasContent) return null;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Consensus Points */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Points de Consensus
          </CardTitle>
        </CardHeader>
        <CardContent>
          {consensusPoints.length > 0 ? (
            <ul className="space-y-2">
              {consensusPoints.map((point, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucun point de consensus identifie
            </p>
          )}
        </CardContent>
      </Card>

      {/* Friction Points */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Points de Friction
          </CardTitle>
        </CardHeader>
        <CardContent>
          {frictionPoints.length > 0 ? (
            <ul className="space-y-2">
              {frictionPoints.map((point, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucun desaccord majeur
            </p>
          )}
        </CardContent>
      </Card>

      {/* Questions for Founder */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <HelpCircle className="h-5 w-5 text-blue-500" />
            Questions pour le Fondateur
          </CardTitle>
        </CardHeader>
        <CardContent>
          {questionsForFounder.length > 0 ? (
            <ul className="space-y-2">
              {questionsForFounder.map((question, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="mt-0.5 shrink-0 text-blue-500">
                    {index + 1}.
                  </span>
                  <span>{question}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pas de questions supplementaires
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
