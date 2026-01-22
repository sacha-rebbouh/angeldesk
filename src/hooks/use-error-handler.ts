"use client";

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";

// =============================================================================
// TYPES
// =============================================================================

interface ErrorState {
  error: Error | null;
  isError: boolean;
  retryCount: number;
}

interface UseErrorHandlerOptions {
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelay?: number;
  /** Show toast on error (default: true) */
  showToast?: boolean;
  /** Custom error message for toast */
  toastMessage?: string;
  /** Called on each error */
  onError?: (error: Error, retryCount: number) => void;
  /** Called when all retries are exhausted */
  onMaxRetriesReached?: (error: Error) => void;
}

interface UseErrorHandlerReturn<T> {
  /** Current error state */
  error: Error | null;
  /** Whether an error occurred */
  isError: boolean;
  /** Current retry count */
  retryCount: number;
  /** Whether currently retrying */
  isRetrying: boolean;
  /** Execute an async function with error handling */
  execute: (fn: () => Promise<T>) => Promise<T | null>;
  /** Manually retry the last operation */
  retry: () => Promise<T | null>;
  /** Reset error state */
  reset: () => void;
  /** Manually set an error */
  setError: (error: Error) => void;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

export function useErrorHandler<T = unknown>(
  options: UseErrorHandlerOptions = {}
): UseErrorHandlerReturn<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    showToast = true,
    toastMessage,
    onError,
    onMaxRetriesReached,
  } = options;

  const [state, setState] = useState<ErrorState>({
    error: null,
    isError: false,
    retryCount: 0,
  });
  const [isRetrying, setIsRetrying] = useState(false);

  // Store the last operation for retry
  const lastOperationRef = useRef<(() => Promise<T>) | null>(null);

  const reset = useCallback(() => {
    setState({ error: null, isError: false, retryCount: 0 });
    setIsRetrying(false);
  }, []);

  const setError = useCallback((error: Error) => {
    setState(prev => ({ ...prev, error, isError: true }));
    if (showToast) {
      toast.error(toastMessage ?? error.message ?? "Une erreur est survenue");
    }
  }, [showToast, toastMessage]);

  const execute = useCallback(
    async (fn: () => Promise<T>): Promise<T | null> => {
      // Store for potential retry
      lastOperationRef.current = fn;

      try {
        const result = await fn();
        // Success - reset error state
        reset();
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        setState(prev => ({
          error,
          isError: true,
          retryCount: prev.retryCount + 1,
        }));

        onError?.(error, state.retryCount + 1);

        if (showToast) {
          toast.error(toastMessage ?? error.message ?? "Une erreur est survenue");
        }

        return null;
      }
    },
    [reset, state.retryCount, onError, showToast, toastMessage]
  );

  const retry = useCallback(async (): Promise<T | null> => {
    const operation = lastOperationRef.current;
    if (!operation) {
      console.warn("useErrorHandler: No operation to retry");
      return null;
    }

    if (state.retryCount >= maxRetries) {
      if (state.error) {
        onMaxRetriesReached?.(state.error);
      }
      toast.error("Nombre maximum de tentatives atteint");
      return null;
    }

    setIsRetrying(true);

    // Exponential backoff: baseDelay * 2^retryCount
    const delay = baseDelay * Math.pow(2, state.retryCount);
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const result = await operation();
      reset();
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      const newRetryCount = state.retryCount + 1;
      setState({
        error,
        isError: true,
        retryCount: newRetryCount,
      });

      onError?.(error, newRetryCount);

      if (newRetryCount >= maxRetries) {
        onMaxRetriesReached?.(error);
        toast.error("Nombre maximum de tentatives atteint");
      } else if (showToast) {
        toast.error(`Erreur - Tentative ${newRetryCount}/${maxRetries}`);
      }

      return null;
    } finally {
      setIsRetrying(false);
    }
  }, [
    state.retryCount,
    state.error,
    maxRetries,
    baseDelay,
    reset,
    onError,
    onMaxRetriesReached,
    showToast,
  ]);

  return {
    error: state.error,
    isError: state.isError,
    retryCount: state.retryCount,
    isRetrying,
    execute,
    retry,
    reset,
    setError,
  };
}

// =============================================================================
// ASYNC ERROR WRAPPER
// For use with React Query mutations
// =============================================================================

interface AsyncErrorOptions {
  showToast?: boolean;
  toastMessage?: string;
  onError?: (error: Error) => void;
}

/**
 * Wraps an async function with error handling
 * Useful for React Query mutations
 */
export function withErrorHandling<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options: AsyncErrorOptions = {}
): (...args: TArgs) => Promise<TReturn> {
  const { showToast = true, toastMessage, onError } = options;

  return async (...args: TArgs): Promise<TReturn> => {
    try {
      return await fn(...args);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      onError?.(error);

      if (showToast) {
        toast.error(toastMessage ?? error.message ?? "Une erreur est survenue");
      }

      throw error; // Re-throw for React Query to handle
    }
  };
}

// =============================================================================
// API ERROR HANDLER
// For API route responses
// =============================================================================

interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}

/**
 * Parse API error response
 */
export function parseApiError(response: Response, body?: unknown): ApiError {
  if (body && typeof body === "object" && "error" in body) {
    const apiBody = body as { error: string; code?: string; details?: unknown };
    return {
      message: apiBody.error,
      code: apiBody.code,
      details: apiBody.details,
    };
  }

  // Fallback based on status code
  const statusMessages: Record<number, string> = {
    400: "Requete invalide",
    401: "Non authentifie",
    403: "Acces refuse",
    404: "Ressource non trouvee",
    409: "Conflit - operation deja en cours",
    429: "Trop de requetes - reessayez plus tard",
    500: "Erreur serveur",
    502: "Service temporairement indisponible",
    503: "Service en maintenance",
  };

  return {
    message: statusMessages[response.status] ?? `Erreur ${response.status}`,
    code: `HTTP_${response.status}`,
  };
}

/**
 * Handle API fetch with proper error handling
 */
export async function fetchWithErrorHandling<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // Response body is not JSON
    }

    const apiError = parseApiError(response, body);
    throw new Error(apiError.message);
  }

  return response.json();
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default useErrorHandler;
