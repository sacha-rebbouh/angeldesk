// Custom hooks barrel file
// Note: This is safe because we only export our own hooks (small bundle impact)
// For external packages, use direct imports or optimizePackageImports in next.config.ts

export { useErrorHandler, withErrorHandling, parseApiError, fetchWithErrorHandling } from "./use-error-handler";
export type { default as UseErrorHandler } from "./use-error-handler";
