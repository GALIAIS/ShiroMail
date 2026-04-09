import { BarChart3, BookOpenText, LogIn } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SiteBrandMark } from "@/components/brand/site-brand-mark";
import { LoginModal } from "../../../components/auth/login-modal";
import { composePageTitle, usePageTitle } from "@/hooks/use-page-title";
import { HeaderPreferences } from "@/components/preferences/header-preferences";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createRoutePrefetchHandlers } from "@/app/prefetch-route";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { fetchPublicSiteSettings } from "../api";
import { resolveSiteIconUrl } from "@/hooks/use-site-branding";

const publicNavItems = [
  { labelKey: "nav.public.features", href: "/#features", match: "/" },
  { labelKey: "nav.public.updates", href: "/updates", match: "/updates" },
  { labelKey: "nav.public.docs", href: "/docs", match: "/docs" },
  { labelKey: "nav.public.faq", href: "/faq", match: "/faq" },
  { labelKey: "nav.public.stats", href: "/stats", match: "/stats" },
];

type PublicShellHeroRenderer = (controls: { openLogin: () => void }) => ReactNode;

type PublicShellProps = {
  children: ReactNode;
  hero?: ReactNode | PublicShellHeroRenderer;
  pageClassName?: string;
};

function isHeroRenderer(hero: PublicShellProps["hero"]): hero is PublicShellHeroRenderer {
  return typeof hero === "function";
}

export function PublicShell({ children, hero, pageClassName }: PublicShellProps) {
  const location = useLocation();
  const [loginOpen, setLoginOpen] = useState(false);
  const { t } = useTranslation();
  const homePrefetchHandlers = createRoutePrefetchHandlers("/");
  const docsPrefetchHandlers = createRoutePrefetchHandlers("/docs");
  const statsPrefetchHandlers = createRoutePrefetchHandlers("/stats");
  const siteSettingsQuery = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: fetchPublicSiteSettings,
    staleTime: 60_000,
  });

  const siteSettings = siteSettingsQuery.data;
  const siteName = siteSettings?.identity?.siteName || "Shiro Email";
  const siteIconUrl = resolveSiteIconUrl(siteSettings?.identity?.siteIconUrl);
  const pageTitle = (() => {
    if (location.pathname === "/") {
      return siteName;
    }
    if (location.pathname === "/updates") {
      return composePageTitle("功能更新", siteName);
    }
    if (location.pathname === "/docs") {
      return composePageTitle("文档", siteName);
    }
    if (location.pathname === "/faq") {
      return composePageTitle("常见问题", siteName);
    }
    if (location.pathname === "/stats") {
      return composePageTitle("统计说明", siteName);
    }
    return siteName;
  })();
  usePageTitle(pageTitle);

  const resolvedHero = isHeroRenderer(hero) ? hero({ openLogin: () => setLoginOpen(true) }) : hero;

  useEffect(() => {
    if (!location.hash) {
      return;
    }

    const target = document.getElementById(location.hash.slice(1));
    if (!target) {
      return;
    }

    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [location.hash, location.pathname]);

  return (
    <div className={cn("brand-app-shell brand-public-shell min-h-screen bg-background text-foreground", pageClassName)}>
      <div aria-hidden className="brand-backdrop" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1240px] flex-col px-4 pb-8 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-40 mb-3 rounded-b-2xl border border-border/60 border-t-transparent bg-background/78 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/72">
          <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
            <Link {...homePrefetchHandlers} className="flex min-w-0 items-center gap-3" to="/">
              <div className="flex size-9 items-center justify-center rounded-xl border border-border/60 bg-card/88 shadow-[0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur">
                <SiteBrandMark iconUrl={siteIconUrl} imageClassName="size-5" siteName={siteName} />
              </div>
              <div className="grid min-w-0 gap-0.5">
                <span className="truncate text-sm font-semibold">
                  {siteName}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {t("publicShell.subtitle")}
                </span>
              </div>
            </Link>

            <nav aria-label="公开站主导航" className="mx-auto hidden items-center gap-1 md:flex">
              {publicNavItems.map((item) => {
                const active = location.pathname === item.match;
                const label = t(item.labelKey);
                const prefetchHandlers = createRoutePrefetchHandlers(item.href);
                return (
                  <Button asChild className="rounded-full px-3" key={item.href} size="sm" variant={active ? "secondary" : "ghost"}>
                    <Link {...prefetchHandlers} to={item.href}>
                      {label}
                    </Link>
                  </Button>
                );
              })}
            </nav>

            <div className="ml-auto flex items-center gap-1.5">
              <HeaderPreferences />
              <Button
                asChild
                aria-label={t("publicShell.apiDocs")}
                size="icon-sm"
                title={t("publicShell.apiDocs")}
                variant="ghost"
              >
                <Link {...docsPrefetchHandlers} to="/docs">
                  <BookOpenText className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                aria-label={t("publicShell.stats")}
                size="icon-sm"
                title={t("publicShell.stats")}
                variant="ghost"
              >
                <Link {...statsPrefetchHandlers} to="/stats">
                  <BarChart3 className="size-4" />
                </Link>
              </Button>
              <Button className="h-8 rounded-full px-3" onClick={() => setLoginOpen(true)} size="sm">
                <LogIn className="size-4" />
                {t("publicShell.login")}
              </Button>
            </div>
          </div>

          <nav aria-label="公开站移动导航" className="flex gap-2 overflow-x-auto border-t border-border/60 px-3 py-2 md:hidden sm:px-4">
            {publicNavItems.map((item) => {
              const active = location.pathname === item.match;
              const label = t(item.labelKey);
              const prefetchHandlers = createRoutePrefetchHandlers(item.href);
              return (
                <Button asChild className="rounded-full px-3" key={item.href} size="sm" variant={active ? "secondary" : "ghost"}>
                  <Link {...prefetchHandlers} to={item.href}>
                    {label}
                  </Link>
                </Button>
              );
            })}
          </nav>
        </header>

        <main className="flex-1 space-y-8 py-6">
          {resolvedHero}
          {children}
        </main>
      </div>

      <LoginModal onOpenChange={setLoginOpen} open={loginOpen} />
    </div>
  );
}

type PublicPageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
};

export function PublicPageHero({ eyebrow, title, description, aside }: PublicPageHeroProps) {
  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="space-y-4">
        <Badge className="rounded-full" variant="outline">
          {eyebrow}
        </Badge>
        <div className="space-y-2">
          <h1 className="max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>

      {aside ? (
        <Card className="border-border/60 bg-card shadow-none" size="sm">
          <CardContent className="py-3">{aside}</CardContent>
        </Card>
      ) : null}
    </section>
  );
}

export function PublicBottomCta() {
  const { t } = useTranslation();
  const homePrefetchHandlers = createRoutePrefetchHandlers("/");

  return (
    <Card className="border-border/60 bg-card shadow-none" size="sm">
      <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Badge className="rounded-full" variant="outline">
            {t("publicShell.continueBadge")}
          </Badge>
          <p className="text-sm font-medium tracking-tight">{t("publicShell.continueTitle")}</p>
          <p className="max-w-2xl text-[11px] leading-5 text-muted-foreground">
            {t("publicShell.continueDescription")}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link {...homePrefetchHandlers} to="/">
            {t("publicShell.backHome")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
