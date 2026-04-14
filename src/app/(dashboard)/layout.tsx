import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { DisclaimerBanner } from "@/components/shared/disclaimer-banner";
import { CguGate } from "@/components/shared/cgu-gate";
import { getAuthUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  const needsCguConsent = user ? !user.cguAcceptedAt : false;

  return (
    <CguGate needsConsent={needsCguConsent}>
      <div className="flex min-h-screen flex-col bg-muted/30 md:flex-row">
        <MobileNav />
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 overflow-y-auto">
            <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
          </main>
          <DisclaimerBanner />
        </div>
      </div>
    </CguGate>
  );
}
