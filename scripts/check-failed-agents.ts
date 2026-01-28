import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const analysis = await prisma.analysis.findFirst({
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      summary: true,
      results: true,
    },
  });

  if (!analysis) {
    console.log("No analysis found");
    return;
  }

  console.log("Analysis ID:", analysis.id);
  console.log("Status:", analysis.status);
  console.log("Summary:", analysis.summary?.slice(0, 300));

  const results = analysis.results as Record<string, { success: boolean; error?: string; data?: unknown }> | null;
  if (results) {
    const failed = Object.entries(results).filter(([, v]) => v && !v.success);
    console.log("\nFailed agents:", failed.length);
    for (const [name, result] of failed) {
      console.log(`- ${name}:`, result.error?.slice(0, 200) || "unknown error");
    }

    // Check contradiction-detector specifically
    const cd = results["contradiction-detector"];
    if (cd) {
      console.log("\n--- contradiction-detector ---");
      console.log("Success:", cd.success);
      if (!cd.success) {
        console.log("Error:", cd.error);
      } else if (cd.data) {
        const data = cd.data as Record<string, unknown>;
        console.log("Has redFlagConvergence:", !!data.redFlagConvergence);
        if (data.redFlagConvergence) {
          console.log("redFlagConvergence length:", (data.redFlagConvergence as unknown[]).length);
        }
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
