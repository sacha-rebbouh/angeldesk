"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function DealError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DealPage] Error:", error);
  }, [error]);

  return (
    <div className="container max-w-4xl py-12">
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="py-8 text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-semibold">Erreur lors du chargement du deal</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {error.message || "Une erreur inattendue s'est produite."}
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <Button variant="outline" size="sm" onClick={reset}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Reessayer
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/deals">Retour aux deals</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
