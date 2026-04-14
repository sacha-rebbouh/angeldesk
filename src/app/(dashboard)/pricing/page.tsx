import { requireAuth } from "@/lib/auth";
import { getCreditBalance } from "@/services/credits";
import { PricingContent } from "./pricing-content";

export default async function PricingPage() {
  const user = await requireAuth();
  const balance = await getCreditBalance(user.id);

  return <PricingContent balance={balance} />;
}
