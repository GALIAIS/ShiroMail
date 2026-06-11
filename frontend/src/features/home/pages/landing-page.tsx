import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Globe,
  KeyRound,
  Mail,
  Route,
  ShieldCheck,
  TerminalSquare,
  Webhook,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useSiteName } from "@/hooks/use-site-name";
import { fetchPublicSiteSettings, fetchPublicSiteStats } from "../api";
import { PublicShell } from "../components/public-shell";

export function LandingPage() {
  const { t } = useTranslation();
  const siteSettingsQuery = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: fetchPublicSiteSettings,
    staleTime: 60_000,
  });
  const siteStatsQuery = useQuery({
    queryKey: ["public-site-stats"],
    queryFn: fetchPublicSiteStats,
    staleTime: 15_000,
  });

  const siteSettings = siteSettingsQuery.data;
  const siteStats = siteStatsQuery.data;
  const siteName = useSiteName();
  const sampleDomain =
    (siteSettings?.identity?.siteName || "shiro.email").toLowerCase().replace(/\s+/g, "-") || "shiro.email";
  const sampleAddress = `inbox@${sampleDomain}`;
  const formattedStatsUpdatedAt =
    typeof siteStats?.updatedAt === "string" && !Number.isNaN(Date.parse(siteStats.updatedAt))
      ? new Date(siteStats.updatedAt).toLocaleString()
      : null;

  const stats = [
    {
      label: t("landing.preview.domainPoolTitle"),
      value: siteStats ? `${(siteStats.activeDomainCount ?? 0).toLocaleString()}` : t("landing.preview.domainPoolBody"),
    },
    {
      label: t("landing.preview.realtimeTitle"),
      value: siteStats ? `${(siteStats.todayMessageCount ?? 0).toLocaleString()}` : t("landing.preview.realtimeBody"),
    },
    {
      label: t("landing.preview.permissionTitle"),
      value: siteStats ? `${(siteStats.totalUserCount ?? 0).toLocaleString()}` : t("landing.preview.permissionBody"),
    },
  ];
  const capabilities = [
    {
      title: t("landing.features.tempMailTitle"),
      body: t("landing.features.tempMailBody"),
      icon: Mail,
      tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    },
    {
      title: t("landing.features.customDomainTitle"),
      body: t("landing.features.customDomainBody"),
      icon: Globe,
      tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    {
      title: t("landing.features.apiTitle"),
      body: t("landing.features.apiBody"),
      icon: KeyRound,
      tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    },
    {
      title: t("landing.features.webhookTitle"),
      body: t("landing.features.webhookBody"),
      icon: Webhook,
      tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    },
  ];
  const workflowItems = [
    { title: t("landing.workflow.step1Title"), body: t("landing.workflow.item1") },
    { title: t("landing.workflow.step2Title"), body: t("landing.workflow.item2") },
    { title: t("landing.workflow.step3Title"), body: t("landing.workflow.item3") },
  ];
  const previewMessages = [
    {
      title: t("landing.preview.message1Title"),
      from: siteSettings?.identity?.supportEmail || "support@example.com",
      time: t("landing.preview.justNow"),
    },
    {
      title: t("landing.preview.message2Title"),
      from: `system@${sampleDomain}`,
      time: t("landing.preview.minutesAgo"),
    },
    {
      title: t("landing.preview.message3Title"),
      from: siteSettings?.identity?.supportEmail || "ops@shiro.email",
      time: t("landing.preview.today"),
    },
  ];
  const faqItems = [
    {
      id: "what-is",
      title: t("landing.faq.whatIsTitle"),
      body: t("landing.faq.whatIsBody"),
    },
    {
      id: "retention",
      title: t("landing.faq.retentionTitle"),
      body: t("landing.faq.retentionBody"),
    },
    {
      id: "api",
      title: t("landing.faq.apiTitle"),
      body: t("landing.faq.apiBody"),
    },
    {
      id: "privacy",
      title: t("landing.faq.privacyTitle"),
      body: t("landing.faq.privacyBody"),
    },
    {
      id: "custom-domain",
      title: t("landing.faq.customDomainTitle"),
      body: t("landing.faq.customDomainBody"),
    },
    {
      id: "pricing",
      title: t("landing.faq.pricingTitle"),
      body: t("landing.faq.pricingBody"),
    },
  ];

  return (
    <PublicShell
      pageClassName="selection:bg-foreground selection:text-background"
      hero={({ openLogin }) => (
        <section className="grid gap-8 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:items-center lg:py-8" id="hero">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/74 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
              <Route className="size-3.5" />
              {t("landing.heroBadge")}
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                {siteName}
                <span className="block text-muted-foreground">{t("landing.titleLine2")}</span>
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                {t("landing.description")}
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Button className="h-10 px-5" onClick={openLogin}>
                {t("landing.primaryCta")}
                <ArrowRight className="size-4" />
              </Button>
              <Button asChild className="h-10 px-5" variant="outline">
                <Link to="/docs">
                  <BookOpen className="size-4" />
                  {t("landing.secondaryCta")}
                </Link>
              </Button>
            </div>

            <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
              {stats.map((item) => (
                <div className="border-t border-border/70 pt-3" key={item.label}>
                  <div className="text-2xl font-semibold tracking-tight">{item.value}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          <HeroMailConsole
            formattedStatsUpdatedAt={formattedStatsUpdatedAt}
            isLoadingStats={siteStatsQuery.isLoading}
            messages={previewMessages}
            sampleAddress={sampleAddress}
            sampleDomain={sampleDomain}
          />
        </section>
      )}
    >
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1.1fr_0.9fr]" id="features">
        <div className="rounded-2xl border border-border/60 bg-card/88 p-5 shadow-sm">
          <div className="max-w-xl space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">{t("landing.sections.coreTitle")}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{t("landing.sections.coreDescription")}</p>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {capabilities.map((item) => {
              const Icon = item.icon;
              return (
                <div className="group rounded-xl border border-border/60 bg-background/72 p-4 transition-colors hover:border-border hover:bg-background" key={item.title}>
                  <div className={cn("flex size-9 items-center justify-center rounded-lg", item.tone)}>
                    <Icon className="size-4" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-2xl border border-border/60 bg-foreground p-5 text-background shadow-sm dark:bg-card dark:text-foreground">
            <TerminalSquare className="size-5 opacity-70" />
            <h2 className="mt-5 text-xl font-semibold tracking-tight">{t("landing.sections.demoTitle")}</h2>
            <p className="mt-2 text-sm leading-6 opacity-72">{t("landing.sections.demoDescription")}</p>
            <div className="mt-5 rounded-xl border border-background/15 bg-background/8 p-3 font-mono text-xs leading-6 dark:border-border/60 dark:bg-background/40">
              <div>POST /api/v1/mailboxes</div>
              <div className="text-background/60 dark:text-muted-foreground">domain={sampleDomain}</div>
              <div className="text-emerald-300 dark:text-emerald-400">202 Accepted · inbox ready</div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/88 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h3 className="text-sm font-semibold">{t("landing.sections.operationsTitle")}</h3>
                <p className="text-xs leading-5 text-muted-foreground">{t("landing.sections.operationsDescription")}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {previewMessages.map((item) => (
                <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2 first:border-t-0 first:pt-0" key={item.title}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{item.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{item.from}</div>
                  </div>
                  <Badge className="rounded-full" variant="secondary">
                    {item.time}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 rounded-2xl border border-border/60 bg-card/72 p-5 md:grid-cols-[0.85fr_1.15fr] md:p-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">{t("landing.sections.workflowTitle")}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{t("landing.sections.workflowDescription")}</p>
        </div>
        <div className="grid gap-3">
          {workflowItems.map((item, index) => (
            <div className="grid gap-3 rounded-xl border border-border/60 bg-background/70 p-4 sm:grid-cols-[36px_1fr]" key={item.title}>
              <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {index + 1}
              </div>
              <div>
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">{t("landing.sections.testimonialsTitle")}</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{t("landing.sections.testimonialsDescription")}</p>
          </div>
          <div className="grid gap-3">
            {[
              {
                initials: t("landing.testimonials.person1Initials"),
                name: t("landing.testimonials.person1Name"),
                role: t("landing.testimonials.person1Role"),
                quote: t("landing.testimonials.person1Quote"),
              },
              {
                initials: t("landing.testimonials.person2Initials"),
                name: t("landing.testimonials.person2Name"),
                role: t("landing.testimonials.person2Role"),
                quote: t("landing.testimonials.person2Quote"),
              },
              {
                initials: t("landing.testimonials.person3Initials"),
                name: t("landing.testimonials.person3Name"),
                role: t("landing.testimonials.person3Role"),
                quote: t("landing.testimonials.person3Quote"),
              },
            ].map((item) => (
              <div className="grid gap-3 rounded-xl border border-border/60 bg-card/88 p-4 sm:grid-cols-[40px_1fr]" key={item.name}>
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {item.initials}
                </div>
                <div>
                  <p className="text-sm leading-6 text-muted-foreground">"{item.quote}"</p>
                  <div className="mt-3 text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Card className="border-border/60 bg-card/88 shadow-sm" size="sm">
          <CardContent className="py-4">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h2 className="text-base font-semibold">{t("landing.sections.faqTitle")}</h2>
                <p className="text-xs leading-5 text-muted-foreground">{t("landing.sections.faqDescription")}</p>
              </div>
            </div>
            <Accordion type="single" collapsible>
              {faqItems.map((item) => (
                <AccordionItem key={item.id} value={item.id}>
                  <AccordionTrigger>{item.title}</AccordionTrigger>
                  <AccordionContent>{item.body}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </section>
    </PublicShell>
  );
}

function HeroMailConsole({
  formattedStatsUpdatedAt,
  isLoadingStats,
  messages,
  sampleAddress,
  sampleDomain,
}: {
  formattedStatsUpdatedAt: string | null;
  isLoadingStats: boolean;
  messages: Array<{ title: string; from: string; time: string }>;
  sampleAddress: string;
  sampleDomain: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-border/60 bg-card/88 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
      <div className="rounded-xl border border-border/60 bg-background/86">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{t("landing.workspaceTitle")}</div>
            <div className="text-xs text-muted-foreground">{sampleDomain}</div>
          </div>
          <Badge className="rounded-full" variant="secondary">
            {t("common.realTime")}
          </Badge>
        </div>

        <div className="grid gap-0 sm:grid-cols-[140px_1fr]">
          <div className="hidden border-r border-border/60 p-3 sm:block">
            <div className="space-y-2">
              {["Inbox", "Domains", "DNS", "API"].map((item, index) => (
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs",
                    index === 0 ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 p-3">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">{t("landing.addressLabel")}</div>
              <div className="mt-1 break-all font-mono text-sm font-semibold">{sampleAddress}</div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("landing.addressDescription")}</p>
            </div>

            <div className="space-y-2">
              {messages.map((item, index) => (
                <div
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-xl border border-border/60 px-3 py-3",
                    index === 0 ? "bg-primary/5" : "bg-card",
                  )}
                  key={item.title}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="truncate text-sm font-medium">{item.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{item.from}</div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">{item.time}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-dashed border-border/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {isLoadingStats
                ? t("landing.stats.syncing")
                : formattedStatsUpdatedAt
                  ? t("landing.stats.updatedAt", { time: formattedStatsUpdatedAt })
                  : t("landing.stats.unavailable")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
