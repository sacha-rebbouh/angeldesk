"use client";

import { memo, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, SignOutButton } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  FolderKanban,
  Home,
  Settings,
  Plus,
  Crown,
  Shield,
  Users,
  DollarSign,
  LogOut,
  CheckCircle,
  Menu,
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
    title: "Analytiques",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    title: "Paramètres",
    href: "/settings",
    icon: Settings,
  },
];

const adminNavItems = [
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

interface QuotaData {
  plan: "FREE" | "PRO";
  analyses: { used: number; limit: number };
}

async function fetchQuota(): Promise<{ data: QuotaData }> {
  const response = await fetch("/api/credits");
  if (!response.ok) throw new Error("Failed to fetch quota");
  return response.json();
}

export const Sidebar = memo(function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  // Fetch plan from DB (source of truth) instead of Clerk publicMetadata
  const { data: quotaData } = useQuery({
    queryKey: queryKeys.quota.all,
    queryFn: fetchQuota,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  const isAdmin = user?.publicMetadata?.role === "admin";
  // Use DB subscription status as source of truth
  const isPro = quotaData?.data?.plan === "PRO" || isAdmin;

  return (
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
        {/* Plan Card - Only show for free users */}
        {!isPro && (
          <div className="rounded-xl bg-gradient-to-br from-sidebar-accent to-sidebar-accent/50 p-4 border border-sidebar-border">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="h-4 w-4 text-amber-400" />
              <p className="text-sm font-semibold">Plan Gratuit</p>
            </div>
            <p className="text-xs text-sidebar-foreground/70 mb-3">
              {quotaData?.data?.analyses
                ? `${quotaData.data.analyses.limit - quotaData.data.analyses.used} analyses restantes ce mois`
                : "Chargement..."}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="w-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
              asChild
            >
              <Link href="/pricing">
                Passer au Pro
              </Link>
            </Button>
          </div>
        )}

        {/* Pro Badge - Only show for pro users */}
        {isPro && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Plan Pro</span>
          </div>
        )}

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
            <SignOutButton>
              <button
                className="p-1.5 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                title="Se déconnecter"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </SignOutButton>
          </div>
        )}
      </div>
    </aside>
  );
});

// ============================================================================
// MOBILE NAVIGATION
// ============================================================================

export const MobileNav = memo(function MobileNav() {
  const pathname = usePathname();
  const { user } = useUser();
  const [open, setOpen] = useState(false);

  const { data: quotaData } = useQuery({
    queryKey: queryKeys.quota.all,
    queryFn: fetchQuota,
    staleTime: 5 * 60 * 1000,
  });

  const isAdmin = user?.publicMetadata?.role === "admin";
  const isPro = quotaData?.data?.plan === "PRO" || isAdmin;

  // Close sheet on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleLinkClick = useCallback(() => {
    setOpen(false);
  }, []);

  return (
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
              {!isPro && (
                <div className="rounded-xl bg-accent/50 p-4 border">
                  <div className="flex items-center gap-2 mb-2">
                    <Crown className="h-4 w-4 text-amber-400" />
                    <p className="text-sm font-semibold">Plan Gratuit</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {quotaData?.data?.analyses
                      ? `${quotaData.data.analyses.limit - quotaData.data.analyses.used} analyses restantes`
                      : "Chargement..."}
                  </p>
                  <Button variant="secondary" size="sm" className="w-full" asChild>
                    <Link href="/pricing" onClick={handleLinkClick}>Passer au Pro</Link>
                  </Button>
                </div>
              )}
              {isPro && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Plan Pro</span>
                </div>
              )}
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
  );
});
