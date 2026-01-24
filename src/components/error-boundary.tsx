"use client";

import { Component, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// =============================================================================
// TYPES
// =============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback UI - if provided, replaces default error card */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Optional identifier for error reporting */
  boundaryName?: string;
  /** Show reset button (default: true) */
  showReset?: boolean;
  /** Show home link (default: true) */
  showHomeLink?: boolean;
  /** Show technical details in development (default: true) */
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

// =============================================================================
// ERROR BOUNDARY CLASS COMPONENT
// React Error Boundaries must be class components
// =============================================================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.group(`ErrorBoundary caught an error${this.props.boundaryName ? ` in ${this.props.boundaryName}` : ""}`);
      console.error("Error:", error);
      console.error("Component Stack:", errorInfo.componentStack);
      console.groupEnd();
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const {
      children,
      fallback,
      showReset = true,
      showHomeLink = true,
      showDetails = true
    } = this.props;

    if (!hasError || !error) {
      return children;
    }

    // Custom fallback
    if (fallback) {
      if (typeof fallback === "function") {
        return fallback(error, this.handleReset);
      }
      return fallback;
    }

    // Default error UI
    const isDev = process.env.NODE_ENV === "development";

    return (
      <Card className="border-red-200 bg-red-50/50 max-w-lg mx-auto my-8">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            Une erreur est survenue
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {error.message || "Une erreur inattendue s'est produite."}
          </p>

          {/* Technical details in dev mode */}
          {isDev && showDetails && errorInfo && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Bug className="h-3 w-3" />
                Details techniques (dev only)
              </summary>
              <pre className="mt-2 p-2 bg-muted rounded text-[10px] overflow-auto max-h-40">
                {error.stack}
              </pre>
              <pre className="mt-2 p-2 bg-muted rounded text-[10px] overflow-auto max-h-40">
                {errorInfo.componentStack}
              </pre>
            </details>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {showReset && (
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleReset}
                className="flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                Reessayer
              </Button>
            )}
            {showHomeLink && (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="flex items-center gap-1"
              >
                <Link href="/deals">
                  <Home className="h-3 w-3" />
                  Retour aux deals
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
}

// =============================================================================
// SPECIALIZED ERROR BOUNDARIES
// =============================================================================

interface AnalysisErrorBoundaryProps {
  children: ReactNode;
  dealId?: string;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/** Error boundary specifically for analysis panels */
export function AnalysisErrorBoundary({
  children,
  dealId,
  onError
}: AnalysisErrorBoundaryProps) {
  return (
    <ErrorBoundary
      boundaryName={`Analysis${dealId ? `-${dealId}` : ""}`}
      onError={onError}
      fallback={(error, reset) => (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="py-6 text-center">
            <AlertTriangle className="h-8 w-8 text-orange-500 mx-auto mb-2" />
            <p className="font-medium">Erreur lors du chargement de l&apos;analyse</p>
            <p className="text-sm text-muted-foreground mt-1">
              {error.message || "Impossible de charger les resultats d'analyse."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              className="mt-4"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Recharger
            </Button>
          </CardContent>
        </Card>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

interface BoardErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/** Error boundary specifically for AI Board panels */
export function BoardErrorBoundary({ children, onError }: BoardErrorBoundaryProps) {
  return (
    <ErrorBoundary
      boundaryName="AIBoard"
      onError={onError}
      fallback={(error, reset) => (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="py-6 text-center">
            <AlertTriangle className="h-8 w-8 text-purple-500 mx-auto mb-2" />
            <p className="font-medium">Erreur du AI Board</p>
            <p className="text-sm text-muted-foreground mt-1">
              {error.message || "Impossible de charger le board IA."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              className="mt-4"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Recharger le board
            </Button>
          </CardContent>
        </Card>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default ErrorBoundary;
