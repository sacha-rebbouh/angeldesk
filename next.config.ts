import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimize barrel imports - reduces cold start by 200-800ms
  // See: https://vercel.com/blog/how-we-optimized-package-imports-in-next-js
  experimental: {
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

export default nextConfig;
