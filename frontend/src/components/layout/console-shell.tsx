import { useTranslation } from "react-i18next";
import { SiteBrandMark } from "@/components/brand/site-brand-mark";
import { composePageTitle, usePageTitle } from "@/hooks/use-page-title";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HeaderPreferences } from "@/components/preferences/header-preferences";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSiteBranding } from "@/hooks/use-site-branding";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { createRoutePrefetchHandlers } from "@/app/prefetch-route";
import { cn } from "@/lib/utils";
import { LogOut, RefreshCw } from "lucide-react";
import { type CSSProperties, type ReactNode, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { ConsoleNavItem, ConsoleNavSection } from "../../lib/console-nav";

type ConsoleShellProps = {
  brand: string;
  role: "user" | "admin";
  username: string;
  topNav: ConsoleNavItem[];
  sections: ConsoleNavSection[];
  children: ReactNode;
  onLogout: () => void;
};

function isRouteActive(pathname: string, to: string) {
  if (to === "/dashboard" || to === "/admin") {
    return pathname === to;
  }

  return pathname === to || pathname.startsWith(`${to}/`);
}

export function ConsoleShell({
  brand,
  role,
  username,
  topNav,
  sections,
  children,
  onLogout,
}: ConsoleShellProps) {
  const location = useLocation();
  const { t } = useTranslation();
  const { siteIconUrl } = useSiteBranding();
  const roleLabel = t(role === "admin" ? "console.role.admin" : "console.role.user");
  const planLabel = t(role === "admin" ? "console.plan.admin" : "console.plan.user");
  const roleSubtitle = t(role === "admin" ? "console.subtitle.admin" : "console.subtitle.user");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const avatarLabel = username.slice(0, 1).toUpperCase();
  const currentLabel = useMemo(() => {
    const allItems = [...topNav, ...sections.flatMap((section) => section.items)];
    const activeItem = allItems.find((item) => isRouteActive(location.pathname, item.to));
    return activeItem ? t(activeItem.labelKey) : roleLabel;
  }, [location.pathname, roleLabel, sections, t, topNav]);
  usePageTitle(composePageTitle(currentLabel, brand));

  return (
    <SidebarProvider defaultOpen>
      <Sidebar
        className="border-r border-sidebar-border bg-sidebar"
        collapsible="icon"
        style={{ "--sidebar-width": "16.5rem" } as CSSProperties}
      >
        <SidebarHeader className="gap-3 px-3 py-3">
          <div className="flex items-center gap-3 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/30 px-3 py-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <SiteBrandMark iconUrl={siteIconUrl} imageClassName="size-5" siteName={brand} />
            </div>
            <div className="grid min-w-0 gap-0.5 group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">{brand}</span>
              <span className="text-xs text-sidebar-foreground/65">{roleSubtitle}</span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {sections.map((section, sectionIndex) => (
            <div key={section.title ?? sectionIndex}>
              {sectionIndex > 0 ? (
                <SidebarSeparator className="mx-auto my-2 w-[calc(100%-1.5rem)] group-data-[collapsible=icon]:w-6" />
              ) : null}
              <SidebarGroup className="px-2 py-2">
                {section.title ? (
                  <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/50">
                    {section.title}
                  </SidebarGroupLabel>
                ) : null}
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const active = isRouteActive(location.pathname, item.to);
                      const label = t(item.labelKey);
                      const prefetchHandlers = createRoutePrefetchHandlers(item.to);

                      return (
                        <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          asChild
                          className={cn(
                            "h-10 rounded-xl px-3 text-sm font-medium group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:[&_svg]:translate-x-[5px]",
                            active && "bg-sidebar-accent text-sidebar-accent-foreground shadow-none",
                          )}
                          isActive={active}
                          size="default"
                          tooltip={label}
                          >
                            <NavLink {...prefetchHandlers} to={item.to}>
                              <Icon className="size-4" />
                              <span className="truncate">{label}</span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </div>
          ))}
        </SidebarContent>

        <SidebarFooter className="gap-3 px-3 pb-4 pt-2">
          {role === "admin" ? (
            <Badge
              className="w-full justify-center rounded-full bg-sidebar-accent px-3 text-xs text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
              variant="secondary"
            >
              {planLabel}
            </Badge>
          ) : null}
          <div className="flex items-center gap-3 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/35 px-3 py-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
            <Avatar className="size-9 rounded-lg">
              <AvatarFallback className="rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
                {avatarLabel}
              </AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 gap-0.5 group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium text-sidebar-foreground">{username}</span>
              <span className="text-xs text-sidebar-foreground/65">{roleLabel}</span>
            </div>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="brand-app-shell brand-console-shell min-h-screen bg-background">
        <div aria-hidden className="brand-backdrop opacity-70" />
        <div className="relative min-h-screen bg-transparent">
          <header className="sticky top-0 z-30 mb-3 rounded-b-2xl border border-border/60 border-t-transparent bg-background/84 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/78">
            <div className="flex h-14 items-center gap-3 px-3 sm:px-4 lg:px-6">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <div className="min-w-0 md:hidden">
                  <p className="truncate text-[0.94rem] font-medium">{currentLabel}</p>
                  <p className="truncate text-[0.8rem] text-muted-foreground">{roleLabel}</p>
                </div>
              </div>

              <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{currentLabel}</p>
                  <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-1.5">
                <HeaderPreferences />
                <Button
                  aria-label={t("common.refresh")}
                  onClick={() => {
                    setIsRefreshing(true);
                    window.location.reload();
                  }}
                  size="icon-sm"
                  title={t("common.refresh")}
                  variant="ghost"
                >
                  <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
                </Button>
                <Button
                  aria-label={t("common.logout")}
                  onClick={onLogout}
                  size="icon-sm"
                  title={t("common.logout")}
                  variant="ghost"
                >
                  <LogOut className="size-4" />
                </Button>
              </div>
            </div>
          </header>

          <div className="mx-auto flex max-w-[1360px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
