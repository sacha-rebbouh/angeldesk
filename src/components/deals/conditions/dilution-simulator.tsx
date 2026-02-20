"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TrendingDown, Calculator, PieChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { simulateDilution, type DilutionInput, type DilutionResult } from "@/services/waterfall-simulator/index";

interface DilutionSimulatorProps {
  dealId: string;
  initialPreMoney?: number | null;
  initialInvestment?: number | null;
  initialEsop?: number | null;
}

interface ChartItem {
  name: string;
  percent: number;
  type: string;
}

const COLORS: Record<string, string> = {
  founder: "#6366f1",
  investor: "#8b5cf6",
  esop: "#a78bfa",
  new_investor: "#22c55e",
};

function formatEUR(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M EUR`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K EUR`;
  return `${n.toLocaleString("fr-FR")} EUR`;
}

export const DilutionSimulator = React.memo(function DilutionSimulator({
  initialPreMoney,
  initialInvestment,
  initialEsop,
}: DilutionSimulatorProps) {
  const [preMoney, setPreMoney] = useState(initialPreMoney ?? 2_000_000);
  const [investment, setInvestment] = useState(initialInvestment ?? 200_000);
  const [esop, setEsop] = useState(initialEsop ?? 10);

  const result: DilutionResult = useMemo(() => {
    return simulateDilution({
      preMoneyValuation: Math.max(preMoney, 1),
      investmentAmount: Math.max(investment, 1),
      esopPercent: esop,
    });
  }, [preMoney, investment, esop]);

  // Scenario comparison: 3 scenarios with different pre-money
  type CapTableEntry = DilutionResult["capTable"][number];
  const scenarios = useMemo(() => {
    const optimistic = simulateDilution({
      preMoneyValuation: Math.max(preMoney * 0.7, 1),
      investmentAmount: investment,
      esopPercent: esop,
    });
    const baseResult = result;
    const pessimistic = simulateDilution({
      preMoneyValuation: Math.max(preMoney * 1.5, 1),
      investmentAmount: investment,
      esopPercent: esop,
    });

    return [
      {
        name: "Optimiste",
        desc: `Pre-money ${formatEUR(preMoney * 0.7)}`,
        ownershipBA: optimistic.newInvestorPercent,
        founderPercent: optimistic.capTable.find((c: CapTableEntry) => c.type === "founder")?.percent ?? 0,
        postMoney: optimistic.postMoneyValuation,
      },
      {
        name: "Base",
        desc: `Pre-money ${formatEUR(preMoney)}`,
        ownershipBA: baseResult.newInvestorPercent,
        founderPercent: baseResult.capTable.find((c: CapTableEntry) => c.type === "founder")?.percent ?? 0,
        postMoney: baseResult.postMoneyValuation,
      },
      {
        name: "Pessimiste",
        desc: `Pre-money ${formatEUR(preMoney * 1.5)}`,
        ownershipBA: pessimistic.newInvestorPercent,
        founderPercent: pessimistic.capTable.find((c: CapTableEntry) => c.type === "founder")?.percent ?? 0,
        postMoney: pessimistic.postMoneyValuation,
      },
    ];
  }, [preMoney, investment, esop, result]);

  // Chart data for cap table stacked bar
  const chartData: ChartItem[] = useMemo(() => {
    return result.capTable.map((c: CapTableEntry) => ({
      name: c.name,
      percent: Math.round(c.percent * 100) / 100,
      type: c.type,
    }));
  }, [result]);

  return (
    <div className="space-y-6">
      {/* Sliders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Parametres de la simulation
          </CardTitle>
          <CardDescription>
            Ajustez les curseurs pour voir l&apos;impact sur la dilution en temps reel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pre-money */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Valorisation pre-money</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="w-32 h-8 text-right text-sm"
                  value={preMoney}
                  onChange={e => setPreMoney(Number(e.target.value) || 0)}
                />
                <span className="text-xs text-muted-foreground">EUR</span>
              </div>
            </div>
            <Slider
              value={[preMoney]}
              onValueChange={([v]) => setPreMoney(v)}
              min={100_000}
              max={50_000_000}
              step={100_000}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>100K</span>
              <span>50M</span>
            </div>
          </div>

          {/* Investment amount */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Montant investi</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="w-32 h-8 text-right text-sm"
                  value={investment}
                  onChange={e => setInvestment(Number(e.target.value) || 0)}
                />
                <span className="text-xs text-muted-foreground">EUR</span>
              </div>
            </div>
            <Slider
              value={[investment]}
              onValueChange={([v]) => setInvestment(v)}
              min={5_000}
              max={5_000_000}
              step={5_000}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5K</span>
              <span>5M</span>
            </div>
          </div>

          {/* ESOP */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Pool ESOP</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="w-20 h-8 text-right text-sm"
                  value={esop}
                  min={0}
                  max={30}
                  onChange={e => setEsop(Number(e.target.value) || 0)}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
            <Slider
              value={[esop]}
              onValueChange={([v]) => setEsop(v)}
              min={0}
              max={30}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>30%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Key metrics */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Resultats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
              <span className="text-sm text-muted-foreground">Valo post-money</span>
              <span className="font-semibold">{formatEUR(result.postMoneyValuation)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
              <span className="text-sm text-muted-foreground">Votre part</span>
              <span className="font-semibold text-green-600">
                {result.newInvestorPercent.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
              <span className="text-sm text-muted-foreground">Dilution fondateurs</span>
              <span className="font-semibold text-orange-600">
                {result.founderDilution.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
              <span className="text-sm text-muted-foreground">Multiple pour 10x exit</span>
              <span className="font-semibold">
                {((result.postMoneyValuation * 10 * result.newInvestorPercent / 100) / investment).toFixed(1)}x
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Cap Table Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              Cap table post-investissement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" barSize={24}>
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} fontSize={11} />
                  <YAxis type="category" dataKey="name" width={120} fontSize={11} />
                  <Tooltip
                    formatter={(value) => [`${Number(value ?? 0).toFixed(2)}%`, "Participation"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="percent" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry: ChartItem, idx: number) => (
                      <Cell key={idx} fill={COLORS[entry.type] ?? "#94a3b8"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-3 text-xs">
              {chartData.map((c: ChartItem) => (
                <div key={c.name} className="flex items-center gap-1.5">
                  <div
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: COLORS[c.type] ?? "#94a3b8" }}
                  />
                  <span className="text-muted-foreground">{c.name}: {c.percent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scenario comparison */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Comparaison de scenarios</CardTitle>
          <CardDescription>
            Impact de differentes valorisations sur votre participation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {scenarios.map((s, idx) => (
              <div
                key={s.name}
                className={cn(
                  "rounded-lg border p-4 text-center space-y-2",
                  idx === 0 && "border-green-200 bg-green-50/50 dark:bg-green-950/20",
                  idx === 1 && "border-primary/30 bg-primary/5",
                  idx === 2 && "border-orange-200 bg-orange-50/50 dark:bg-orange-950/20",
                )}
              >
                <Badge variant={idx === 1 ? "default" : "outline"} className="text-xs">
                  {s.name}
                </Badge>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
                <p className="text-xl font-bold">{s.ownershipBA.toFixed(2)}%</p>
                <p className="text-xs text-muted-foreground">
                  Post-money: {formatEUR(s.postMoney)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
