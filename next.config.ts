import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Strip console.log/info/debug in production builds (keep error + warn)
  compiler: {
    removeConsole: isDev ? false : { exclude: ["error", "warn"] },
  },
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
    // P1 — durci: retrait d'unsafe-eval (plus requis avec Next 16 turbopack prod build).
    // unsafe-inline conserve pour les inline scripts Clerk/Vercel Analytics et les
    // style inline Tailwind. La migration vers un CSP nonce-based necessite un
    // middleware dedie + injection de nonce dans le layout (suivi P2).
    if (!isDev) {
      securityHeaders.push({
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://*.clerk.dev https://*.clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https: blob:",
          "font-src 'self' data:",
          "connect-src 'self' https://*.clerk.dev https://*.clerk.com https://*.clerk.accounts.dev https://*.sentry.io https://openrouter.ai https://api.openrouter.ai wss://*.clerk.dev wss://*.ably.io https://*.ably.io https://api.inngest.com https://inn.gs",
          "frame-src 'self' https://*.clerk.dev https://*.clerk.com https://challenges.cloudflare.com",
          "frame-ancestors 'none'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      });
    }

    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // Cache immutable assets (Next.js hashed files)
      {
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Cache fonts
      {
        source: "/fonts/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  // Optimize barrel imports - reduces cold start by 200-800ms
  // See: https://vercel.com/blog/how-we-optimized-package-imports-in-next-js
  serverExternalPackages: ["mammoth", "xlsx", "canvas", "pdf-to-img", "@react-pdf/renderer"],
  // ARC-LIGHT Phase 2: ship the vendored Poppler bundle into every Lambda
  // function that needs to rasterize PDFs. Paths are relative to repo root.
  // See vendor/poppler/al2023-x64/MANIFEST for contents and THIRD_PARTY_NOTICES.md
  // for license + rebuild procedure.
  outputFileTracingIncludes: {
    "/api/documents/upload": ["./vendor/poppler/al2023-x64/**"],
    "/api/documents/[documentId]/process": ["./vendor/poppler/al2023-x64/**"],
    "/api/documents/[documentId]/ocr": ["./vendor/poppler/al2023-x64/**"],
    "/api/documents/[documentId]/extraction-pages/[pageNumber]/retry": [
      "./vendor/poppler/al2023-x64/**",
    ],
    "/api/documents/[documentId]/preview-pages/[pageNumber]": [
      "./vendor/poppler/al2023-x64/**",
    ],
  },
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
