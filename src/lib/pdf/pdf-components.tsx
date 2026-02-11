/**
 * Shared PDF Components — @react-pdf/renderer
 *
 * Reusable building blocks for the Due Diligence PDF report.
 * All components use the Inter font and the Angel Desk design system.
 */

import React from "react";
import { Page, View, Text, Svg, Circle, Path } from "@react-pdf/renderer";
import { colors, spacing, styles } from "./pdf-theme";
import { formatValue, scoreColor, severityColor, severityBgColor } from "./pdf-helpers";

// ---------------------------------------------------------------------------
// PdfPage — Wrapper with header/footer
// ---------------------------------------------------------------------------

export function PdfPage({
  children,
  dealName,
}: {
  children: React.ReactNode;
  dealName: string;
}) {
  return (
    <Page size="A4" style={styles.page}>
      {children}
      <View style={styles.footer} fixed>
        <Text>Angel Desk — {dealName}</Text>
        <Text style={styles.footerCenter}>CONFIDENTIEL</Text>
        <Text
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} / ${totalPages}`
          }
        />
      </View>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// SectionTitle — Blue left bar + title + divider
// ---------------------------------------------------------------------------

export function SectionTitle({ children }: { children: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginBottom: spacing.md,
        marginTop: spacing.sm,
      }}
      minPresenceAhead={40}
    >
      <View
        style={{
          width: 3,
          height: 22,
          backgroundColor: colors.primary,
          borderRadius: 1.5,
          marginRight: spacing.md,
        }}
      />
      <Text style={styles.h1}>{children}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SubsectionTitle
// ---------------------------------------------------------------------------

export function SubsectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text style={styles.h2} minPresenceAhead={30}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// H3
// ---------------------------------------------------------------------------

export function H3({ children }: { children: React.ReactNode }) {
  return (
    <Text style={styles.h3} minPresenceAhead={20}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------

export function Divider() {
  return <View style={styles.divider} />;
}

// ---------------------------------------------------------------------------
// Spacer
// ---------------------------------------------------------------------------

export function Spacer({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const h =
    size === "sm" ? spacing.sm : size === "lg" ? spacing.lg : spacing.md;
  return <View style={{ height: h }} />;
}

// ---------------------------------------------------------------------------
// BodyText
// ---------------------------------------------------------------------------

export function BodyText({
  children,
  bold,
  italic,
}: {
  children: React.ReactNode;
  bold?: boolean;
  italic?: boolean;
}) {
  // Safety: if children is an object (e.g. LLM returned {assessment: "..."}), convert to string
  const content =
    typeof children === "object" && children !== null && !Array.isArray(children) && !(children as unknown as Record<string, unknown>).$$typeof
      ? formatValue(children)
      : children;
  return (
    <Text
      style={[
        styles.body,
        bold && { fontWeight: 600 },
        italic && { color: colors.muted },
      ].filter(Boolean) as import("@react-pdf/types").Style[]}
    >
      {content}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// LabelValue — Label (muted) + Value pair
// ---------------------------------------------------------------------------

export function LabelValue({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  const str = typeof value === "string" ? value : formatValue(value);
  if (!str || str === "N/A") return null;
  return (
    <View
      style={{
        flexDirection: "row",
        marginBottom: 3,
      }}
    >
      <Text
        style={[styles.label, { width: 120, paddingTop: 1 }]}
      >
        {label}
      </Text>
      <Text style={[styles.body, { flex: 1 }]}>{str}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// BulletList
// ---------------------------------------------------------------------------

export function BulletList({
  items,
  indent = 0,
}: {
  items: string[];
  indent?: number;
}) {
  if (!items || items.length === 0) return null;
  return (
    <View style={{ marginLeft: indent, marginBottom: spacing.sm }}>
      {items.map((item, i) => (
        <View
          key={i}
          style={{ flexDirection: "row", marginBottom: 2 }}
        >
          <Text
            style={[styles.body, { width: 10, color: colors.muted }]}
          >
            •
          </Text>
          <Text style={[styles.body, { flex: 1 }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// PdfTable — Flexbox-based table with header, alternating rows
// ---------------------------------------------------------------------------

interface TableColumn {
  header: string;
  width?: number; // flex basis percentage (e.g., 30 = 30%)
  align?: "left" | "center" | "right";
}

export function PdfTable({
  columns,
  rows,
}: {
  columns: TableColumn[];
  rows: string[][];
}) {
  if (rows.length === 0) return null;

  const cellPad = { paddingVertical: 4, paddingHorizontal: 5 };

  return (
    <View style={{ marginBottom: spacing.md }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: colors.primary,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
        }}
      >
        {columns.map((col, i) => (
          <View
            key={i}
            style={[
              cellPad,
              {
                flex: col.width ?? 1,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 8,
                fontWeight: 600,
                color: colors.white,
                textAlign: col.align ?? "left",
              }}
            >
              {col.header}
            </Text>
          </View>
        ))}
      </View>
      {/* Rows */}
      {rows.map((row, ri) => (
        <View
          key={ri}
          style={{
            flexDirection: "row",
            backgroundColor: ri % 2 === 0 ? colors.white : colors.bgLight,
            borderBottomWidth: 0.5,
            borderBottomColor: colors.border,
          }}
          wrap={false}
        >
          {columns.map((col, ci) => (
            <View
              key={ci}
              style={[
                cellPad,
                {
                  flex: col.width ?? 1,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 8,
                  color: colors.text,
                  textAlign: col.align ?? "left",
                }}
              >
                {row[ci] ?? ""}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// SeverityBadge — Colored rectangle with severity text
// ---------------------------------------------------------------------------

export function SeverityBadge({ severity }: { severity: string }) {
  const bg = severityBgColor(severity);
  const fg = severityColor(severity);
  const label =
    severity?.toUpperCase() === "CRITICAL"
      ? "CRITIQUE"
      : severity?.toUpperCase() === "HIGH"
        ? "HAUT"
        : severity?.toUpperCase() === "MEDIUM"
          ? "MOYEN"
          : severity?.toUpperCase() ?? severity;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 3,
        paddingVertical: 2,
        paddingHorizontal: 6,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ fontSize: 7, fontWeight: 600, color: fg }}>
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ScoreCircle — SVG circle with colored arc + score center
// ---------------------------------------------------------------------------

export function ScoreCircle({
  score,
  size = 60,
}: {
  score: number;
  size?: number;
}) {
  const r = (size - 6) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.min(Math.max(score, 0), 100) / 100;
  const dashArray = circumference * progress;
  const dashOffset = 0;
  const color = scoreColor(score);

  // Build SVG arc path for the progress
  const startAngle = -90;
  const endAngle = startAngle + 360 * progress;
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const largeArc = progress > 0.5 ? 1 : 0;

  return (
    <View style={{ width: size, height: size + 14, alignItems: "center" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={colors.border}
          strokeWidth={3}
          fill="none"
        />
        {/* Progress arc */}
        {progress > 0 && (
          <Path
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
          />
        )}
      </Svg>
      {/* Score text overlay */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size,
          height: size,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: size * 0.35,
            fontWeight: 700,
            color,
          }}
        >
          {score}
        </Text>
        <Text style={{ fontSize: size * 0.13, color: colors.muted }}>
          /100
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ScoreBar — Horizontal progress bar
// ---------------------------------------------------------------------------

export function ScoreBar({
  score,
  label,
  showValue = true,
}: {
  score: number;
  label?: string;
  showValue?: boolean;
}) {
  const color = scoreColor(score);
  const pct = Math.min(Math.max(score, 0), 100);

  return (
    <View style={{ marginBottom: 4 }}>
      {label && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 2,
          }}
        >
          <Text style={{ fontSize: 8, color: colors.text }}>{label}</Text>
          {showValue && (
            <Text style={{ fontSize: 8, fontWeight: 600, color }}>
              {score}/100
            </Text>
          )}
        </View>
      )}
      <View
        style={{
          height: 6,
          backgroundColor: colors.bgLight,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: 6,
            backgroundColor: color,
            borderRadius: 3,
          }}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// KpiBox — Metric + label in a card
// ---------------------------------------------------------------------------

export function KpiBox({
  label,
  value,
  flex = 1,
}: {
  label: string;
  value: string;
  flex?: number;
}) {
  return (
    <View
      style={{
        flex,
        backgroundColor: colors.bgLight,
        borderRadius: 4,
        paddingVertical: 10,
        paddingHorizontal: 10,
        marginRight: 6,
        marginBottom: 6,
      }}
    >
      <Text style={styles.label}>{label}</Text>
      <Text
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: colors.dark,
          marginTop: 3,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// RedFlagCard — Red-tinted card with severity + content
// ---------------------------------------------------------------------------

export function RedFlagCard({
  title,
  severity,
  children,
}: {
  title: string;
  severity: string;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.dangerLight,
        borderLeftWidth: 3,
        borderLeftColor: severityColor(severity),
        borderRadius: 3,
        padding: 8,
        marginBottom: spacing.sm,
      }}
      wrap={false}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <Text style={{ fontSize: 9, fontWeight: 600, color: colors.dark }}>
          {title}
        </Text>
        <SeverityBadge severity={severity} />
      </View>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// InfoCard — Light background card for grouping related info
// ---------------------------------------------------------------------------

export function InfoCard({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.bgLight,
        borderRadius: 4,
        padding: 10,
        marginBottom: spacing.md,
        borderWidth: 0.5,
        borderColor: colors.border,
      }}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// TwoColumn — Side-by-side layout
// ---------------------------------------------------------------------------

export function TwoColumn({
  left,
  right,
  leftFlex = 1,
  rightFlex = 1,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  leftFlex?: number;
  rightFlex?: number;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <View style={{ flex: leftFlex }}>{left}</View>
      <View style={{ flex: rightFlex }}>{right}</View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// RecommendationBadge — Large colored badge for invest/pass/etc.
// ---------------------------------------------------------------------------

export function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const rec = recommendation?.toLowerCase();
  const bg =
    rec === "invest" || rec === "investir"
      ? colors.successLight
      : rec === "pass" || rec === "passer"
        ? colors.dangerLight
        : colors.warningLight;
  const fg =
    rec === "invest" || rec === "investir"
      ? colors.success
      : rec === "pass" || rec === "passer"
        ? colors.danger
        : colors.warning;
  const label =
    rec === "invest" || rec === "investir"
      ? "INVESTIR"
      : rec === "pass" || rec === "passer"
        ? "PASSER"
        : rec === "negotiate" || rec === "negocier"
          ? "NEGOCIER"
          : "DD COMPLEMENTAIRE";

  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 4,
        paddingVertical: 4,
        paddingHorizontal: 12,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: 700, color: fg }}>
        {label}
      </Text>
    </View>
  );
}
