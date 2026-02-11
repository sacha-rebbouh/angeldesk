import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  async headers() {
    // Security headers for all environments
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "X-XSS-Protection", value: "1; mode=block" },
    ];

    // CSP only in production (Turbopack HMR scripts break CSP in dev)
    if (!isDev) {
      securityHeaders.push({
        key: "Content-Security-Policy",
        value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.dev https://*.clerk.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://*.clerk.dev https://*.clerk.com https://*.sentry.io https://openrouter.ai wss://*.clerk.dev; frame-src 'self' https://*.clerk.dev https://*.clerk.com; frame-ancestors 'none';",
      });
    }

    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  // Optimize barrel imports - reduces cold start by 200-800ms
  // See: https://vercel.com/blog/how-we-optimized-package-imports-in-next-js
  serverExternalPackages: ["mammoth", "xlsx", "canvas", "pdf-to-img", "@react-pdf/renderer"],
  experimental: {
    middlewareClientMaxBodySize: "50mb",
    optimizePackageImports: [
      // Icon library - 1583 modules without optimization
      "lucide-react",
      // Radix UI components
      "@radix-ui/react-avatar",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-select",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      // Data fetching
      "@tanstack/react-query",
      // Date utilities
      "date-fns",
      // Charts
      "recharts",
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // Suppresses source map upload logs during build
  silent: true,
});
