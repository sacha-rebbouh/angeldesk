"use client";

import { memo, useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, SignOutButton } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  BarChart3,
  FolderKanban,
  Home,
  Settings,
  Plus,
  Coins,
  Shield,
  Users,
  DollarSign,
  LogOut,
  Check,
  Lock,
  Menu,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { queryKeys } from "@/lib/query-keys";
import { CreditPurchaseModal } from "@/components/credits/credit-purchase-modal";
import { CREDIT_COSTS, type CreditBalanceInfo } from "@/services/credits/types";

const sidebarNavItems = [
  {
    title: "Tableau de bord",
    href: "/dashboard",
    icon: Home,
  },
  {
    title: "Tous les deals",
    href: "/deals",
    icon: FolderKanban,
  },
  {
    title: "Paramètres",
    href: "/settings",
    icon: Settings,
  },
];

const adminNavItems = [
  {
    title: "Analytiques",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    title: "Utilisateurs",
    href: "/admin/users",
    icon: Users,
  },
  {
    title: "Coûts",
    href: "/admin/costs",
    icon: DollarSign,
  },
];

interface CreditApiResponse {
  data: CreditBalanceInfo & {
    costs: Record<string, number>;
  };
}

async function fetchCredits(): Promise<CreditApiResponse> {
  const response = await fetch("/api/credits");
  if (!response.ok) throw new Error("Failed to fetch credits");
  return response.json();
}

// ============================================================================
// CREDIT CARD — Shared between desktop sidebar and mobile nav
// ============================================================================

const FEATURES: ReadonlyArray<{
  label: string;
  minBalance: number;
  costLabel: string;
}> = [
  { label: "Quick Scan", minBalance: CREDIT_COSTS.QUICK_SCAN, costLabel: `${CREDIT_COSTS.QUICK_SCAN} cr` },
  { label: "Deep Dive", minBalance: CREDIT_COSTS.DEEP_DIVE, costLabel: `${CREDIT_COSTS.DEEP_DIVE} cr` },
  { label: "AI Board", minBalance: CREDIT_COSTS.AI_BOARD, costLabel: `${CREDIT_COSTS.AI_BOARD} cr` },
  { label: "Live Coaching", minBalance: CREDIT_COSTS.LIVE_COACHING, costLabel: `${CREDIT_COSTS.LIVE_COACHING} cr` },
];

const CreditCard = memo(function CreditCard({
  creditInfo,
  variant = "desktop",
  onBuyClick,
}: {
  creditInfo: CreditApiResponse["data"] | undefined;
  variant?: "desktop" | "mobile";
  onBuyClick: () => void;
}) {
  const balance = creditInfo?.balance ?? 0;
  const totalPurchased = creditInfo?.totalPurchased ?? 0;

  const barColor =
    balance <= 0
      ? "bg-red-500"
      : balance <= 3
      ? "bg-amber-500"
      : "bg-emerald-500";

  const isDesktop = variant === "desktop";

  return (
    <div
      className={cn(
        "rounded-xl p-4 border",
        isDesktop
          ? "bg-gradient-to-br from-sidebar-accent to-sidebar-accent/50 border-sidebar-border"
          : "bg-accent/50 border-border"
      )}
    >
      {/* Balance */}
      <div className="flex items-center gap-2 mb-3">
        <Coins className="size-4 text-amber-500" />
        <span className="text-sm font-semibold">{balance} crédit{balance !== 1 ? "s" : ""}</span>
      </div>

      {/* Balance bar (visual indicator) */}
      {creditInfo && (
        <div className="flex items-center gap-2 mb-3">
          <div
            className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuenow={balance}
            aria-valuemin={0}
            aria-valuemax={Math.max(totalPurchased || 10, 10)}
            aria-label={`Solde de crédits : ${balance} sur ${Math.max(totalPurchased || 10, 10)}`}
          >
            <div
              className={cn("h-full rounded-full transition-all", barColor)}
              style={{ width: `${Math.min(Math.max((balance / Math.max(totalPurchased || 10, 10)) * 100, 5), 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Feature access */}
      <div className="space-y-1 mb-3">
        {FEATURES.map(({ label, minBalance, costLabel }) => {
          const unlocked = balance >= minBalance;
          return (
            <div key={label} className="flex items-center gap-2 text-xs">
              {unlocked ? (
                <Check className="size-3 text-emerald-500 shrink-0" />
              ) : (
                <Lock className="size-3 text-muted-foreground shrink-0" />
              )}
              <span className={cn(unlocked ? "" : "text-muted-foreground")}>
                {label}
              </span>
              {!unlocked && (
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {costLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <Button
        variant="secondary"
        size="sm"
        className={cn(
          "w-full",
          isDesktop
            ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
            : ""
        )}
        onClick={onBuyClick}
      >
        <Coins className="mr-2 size-3.5" />
        Acheter des crédits
      </Button>
    </div>
  );
});

// ============================================================================
// DESKTOP SIDEBAR
// ============================================================================

export const Sidebar = memo(function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const { theme, setTheme } = useTheme();

  const { data: creditData } = useQuery({
    queryKey: queryKeys.quota.all,
    queryFn: fetchCredits,
    staleTime: 5 * 60 * 1000,
  });

  const isAdmin = user?.publicMetadata?.role === "admin";
  const creditInfo = creditData?.data;

  const handleBuyClick = useCallback(() => setShowPurchaseModal(true), []);
  const handleCloseModal = useCallback(() => setShowPurchaseModal(false), []);
  const toggleTheme = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex sticky top-0 h-screen">
        {/* Logo */}
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm transition-transform group-hover:scale-105">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Angel Desk</span>
          </Link>
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-6 p-4 overflow-y-auto">
          {/* New Deal Button */}
          <Button asChild className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-sm">
            <Link href="/deals/new">
              <Plus className="mr-2 h-4 w-4" />
              Nouveau deal
            </Link>
          </Button>

          {/* Navigation */}
          <nav className="flex flex-col space-y-1">
            {sidebarNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive && "text-sidebar-primary")} />
                  {item.title}
                </Link>
              );
            })}
          </nav>

          {/* Admin Section */}
          {isAdmin && (
            <div className="pt-4 border-t border-sidebar-border">
              <div className="flex items-center gap-2 px-3 mb-2">
                <Shield className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-semibold uppercase text-sidebar-foreground/50">
                  Admin
                </span>
              </div>
              <nav className="flex flex-col space-y-1">
                {adminNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href || pathname.startsWith(item.href + "/");

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      <Icon className={cn("h-4 w-4", isActive && "text-sidebar-primary")} />
                      {item.title}
                    </Link>
                  );
                })}
              </nav>
            </div>
          )}
        </div>

        {/* Bottom Section */}
        <div className="mt-auto p-4 space-y-3 border-t border-sidebar-border">
          <CreditCard
            creditInfo={creditInfo}
            variant="desktop"
            onBuyClick={handleBuyClick}
          />

          {/* User & Logout */}
          {user && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-sidebar-accent/30">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                  {user.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || "U"}
                </div>
                <span className="text-sm font-medium truncate">
                  {user.emailAddresses?.[0]?.emailAddress?.split("@")[0]}
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={toggleTheme}
                  className="p-1.5 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                  title={theme === "dark" ? "Mode clair" : "Mode sombre"}
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <SignOutButton>
                  <button
                    className="p-1.5 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                    title="Se déconnecter"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </SignOutButton>
              </div>
            </div>
          )}
        </div>
      </aside>

      <CreditPurchaseModal
        isOpen={showPurchaseModal}
        onClose={handleCloseModal}
        balance={creditInfo?.balance ?? 0}
        totalPurchased={creditInfo?.totalPurchased ?? 0}
      />
    </>
  );
});

// ============================================================================
// MOBILE NAVIGATION
// ============================================================================

export const MobileNav = memo(function MobileNav() {
  const pathname = usePathname();
  return <MobileNavContent key={pathname} pathname={pathname} />;
});

const MobileNavContent = memo(function MobileNavContent({
  pathname,
}: {
  pathname: string;
}) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  const { data: creditData } = useQuery({
    queryKey: queryKeys.quota.all,
    queryFn: fetchCredits,
    staleTime: 5 * 60 * 1000,
  });

  const isAdmin = user?.publicMetadata?.role === "admin";
  const creditInfo = creditData?.data;

  const handleLinkClick = useCallback(() => {
    setOpen(false);
  }, []);

  const handleBuyClick = useCallback(() => {
    setOpen(false);
    setShowPurchaseModal(true);
  }, []);

  const handleCloseModal = useCallback(() => setShowPurchaseModal(false), []);

  return (
    <>
      <div className="sticky top-0 z-50 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur px-4 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm">
            <BarChart3 className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">Angel Desk</span>
        </Link>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-full flex-col">
              {/* Logo */}
              <div className="flex h-14 items-center gap-2.5 border-b px-5">
                <Link href="/dashboard" className="flex items-center gap-2.5" onClick={handleLinkClick}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm">
                    <BarChart3 className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-lg font-bold tracking-tight">Angel Desk</span>
                </Link>
              </div>

              {/* Content */}
              <div className="flex-1 space-y-6 p-4 overflow-y-auto">
                <Button asChild className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-sm">
                  <Link href="/deals/new" onClick={handleLinkClick}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nouveau deal
                  </Link>
                </Button>

                <nav className="flex flex-col space-y-1">
                  {sidebarNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={handleLinkClick}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        )}
                      >
                        <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
                        {item.title}
                      </Link>
                    );
                  })}
                </nav>

                {isAdmin && (
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-2 px-3 mb-2">
                      <Shield className="h-4 w-4 text-blue-500" />
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Admin</span>
                    </div>
                    <nav className="flex flex-col space-y-1">
                      {adminNavItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={handleLinkClick}
                            aria-current={isActive ? "page" : undefined}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                              isActive
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            )}
                          >
                            <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
                            {item.title}
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                )}
              </div>

              {/* Bottom */}
              <div className="mt-auto p-4 space-y-3 border-t">
                <CreditCard
                  creditInfo={creditInfo}
                  variant="mobile"
                  onBuyClick={handleBuyClick}
                />
                {user && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-accent/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                        {user.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || "U"}
                      </div>
                      <span className="text-sm font-medium truncate">
                        {user.emailAddresses?.[0]?.emailAddress?.split("@")[0]}
                      </span>
                    </div>
                    <SignOutButton>
                      <button
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title="Se déconnecter"
                      >
                        <LogOut className="h-4 w-4" />
                      </button>
                    </SignOutButton>
                  </div>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <CreditPurchaseModal
        isOpen={showPurchaseModal}
        onClose={handleCloseModal}
        balance={creditInfo?.balance ?? 0}
        totalPurchased={creditInfo?.totalPurchased ?? 0}
      />
    </>
  );
});
