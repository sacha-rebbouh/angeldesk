"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Dashboard] Error:", error);
  }, [error]);

  return (
    <div className="container max-w-4xl py-12">
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="py-8 text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-semibold">Une erreur est survenue</h2>
          <p className="text-sm text-muted-foreground">
            {error.message || "Une erreur inattendue s'est produite."}
          </p>
          <Button variant="outline" size="sm" onClick={reset}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Reessayer
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
