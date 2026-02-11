/**
 * PDF Design System — Angel Desk Due Diligence Reports
 *
 * Tech/VC modern style (a16z / Sequoia inspired).
 * Font: Inter (Regular 400, Medium 500, SemiBold 600, Bold 700)
 */

import { Font, StyleSheet } from "@react-pdf/renderer";
import path from "path";

// ---------------------------------------------------------------------------
// Font Registration (Inter TTF, bundled in public/fonts/)
// ---------------------------------------------------------------------------

const fontsDir = path.join(process.cwd(), "public", "fonts");

Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(fontsDir, "Inter-Regular.ttf"), fontWeight: 400 },
    { src: path.join(fontsDir, "Inter-Medium.ttf"), fontWeight: 500 },
    { src: path.join(fontsDir, "Inter-SemiBold.ttf"), fontWeight: 600 },
    { src: path.join(fontsDir, "Inter-Bold.ttf"), fontWeight: 700 },
  ],
});

// Disable hyphenation (French text doesn't hyphenate well)
Font.registerHyphenationCallback((word) => [word]);

// ---------------------------------------------------------------------------
// Color Palette
// ---------------------------------------------------------------------------

export const colors = {
  primary: "#2563EB",
  primaryLight: "#DBEAFE",
  primaryDark: "#1D4ED8",
  dark: "#0F172A",
  text: "#334155",
  muted: "#94A3B8",
  success: "#16A34A",
  successLight: "#DCFCE7",
  warning: "#D97706",
  warningLight: "#FEF3C7",
  danger: "#DC2626",
  dangerLight: "#FEE2E2",
  bgLight: "#F8FAFC",
  border: "#E2E8F0",
  white: "#FFFFFF",
} as const;

// ---------------------------------------------------------------------------
// Spacing & Layout
// ---------------------------------------------------------------------------

export const spacing = {
  page: { paddingTop: 50, paddingBottom: 50, paddingHorizontal: 40 },
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
} as const;

// ---------------------------------------------------------------------------
// Global StyleSheet
// ---------------------------------------------------------------------------

export const styles = StyleSheet.create({
  // --- Page ---
  page: {
    fontFamily: "Inter",
    fontSize: 9.5,
    color: colors.text,
    backgroundColor: colors.white,
    paddingTop: spacing.page.paddingTop,
    paddingBottom: spacing.page.paddingBottom,
    paddingHorizontal: spacing.page.paddingHorizontal,
  },
  coverPage: {
    fontFamily: "Inter",
    fontSize: 9.5,
    color: colors.text,
    backgroundColor: colors.white,
    padding: 0,
  },

  // --- Typography ---
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: colors.dark,
    marginBottom: spacing.sm,
  },
  h1: {
    fontSize: 16,
    fontWeight: 600,
    color: colors.dark,
    marginBottom: spacing.md,
  },
  h2: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.primary,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  h3: {
    fontSize: 10.5,
    fontWeight: 600,
    color: colors.dark,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  body: {
    fontSize: 9.5,
    fontWeight: 400,
    color: colors.text,
    lineHeight: 1.5,
  },
  bodyBold: {
    fontSize: 9.5,
    fontWeight: 600,
    color: colors.text,
    lineHeight: 1.5,
  },
  small: {
    fontSize: 8,
    fontWeight: 400,
    color: colors.muted,
    lineHeight: 1.4,
  },
  label: {
    fontSize: 8,
    fontWeight: 500,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  meta: {
    fontSize: 7,
    fontWeight: 400,
    color: colors.muted,
  },

  // --- Layout ---
  row: {
    flexDirection: "row",
  },
  col: {
    flexDirection: "column",
  },
  spacer: {
    height: spacing.md,
  },
  spacerSm: {
    height: spacing.sm,
  },
  spacerLg: {
    height: spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },

  // --- Footer ---
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: colors.muted,
  },
  footerCenter: {
    fontSize: 7,
    color: colors.muted,
    textAlign: "center",
  },
});
