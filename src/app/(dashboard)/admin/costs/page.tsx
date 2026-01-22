"use client";

import { CostsDashboardV2 } from "@/components/admin/costs-dashboard-v2";

export default function AdminCostsPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cost Administration</h1>
        <p className="text-muted-foreground">
          Monitor costs, API usage, and spending across users and deals
        </p>
      </div>

      <CostsDashboardV2 />
    </div>
  );
}
