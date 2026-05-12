import {
  ArrowRight,
  BookOpen,
  Globe,
  KeyRound,
  Mail,
  Quote,
  Sparkles,
  Webhook,
} from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicShell } from "../components/public-shell";
import {
  PublicChecklist,
  PublicFeatureCard,
  PublicInfoCard,
  PublicSection,
  PublicStatBadge,
} from "../components/public-ui";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicSiteSettings, fetchPublicSiteStats } from "../api";
import { useSiteName } from "@/hooks/use-site-name";

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
  const featureItems = [
    {
      title: t("landing.features.tempMailTitle"),
      body: t("landing.features.tempMailBody"),
      icon: Mail,
    },
    {
      title: t("landing.features.customDomainTitle"),
      body: t("landing.features.customDomainBody"),
      icon: Globe,
    },
    {
      title: t("landing.features.apiTitle"),
      body: t("landing.features.apiBody"),
      icon: KeyRound,
    },
    {
      title: t("landing.features.webhookTitle"),
      body: t("landing.features.webhookBody"),
      icon: Webhook,
    },
  ];
  const workflowItems = [t("landing.workflow.item1"), t("landing.workflow.item2"), t("landing.workflow.item3")];
  const previewSignals = [
    {
      title: t("landing.preview.domainPoolTitle"),
      body: siteStats ? `${(siteStats.activeDomainCount ?? 0).toLocaleString()}` : t("landing.preview.domainPoolBody"),
    },
    {
      title: t("landing.preview.realtimeTitle"),
      body: siteStats ? `${(siteStats.todayMessageCount ?? 0).toLocaleString()}` : t("landing.preview.realtimeBody"),
    },
    {
      title: t("landing.preview.permissionTitle"),
      body: siteStats ? `${(siteStats.totalUserCount ?? 0).toLocaleString()}` : t("landing.preview.permissionBody"),
    },
  ];
  const previewMessages = [
    {
      title: t("landing.preview.message1Title"),
      from: siteSettings?.identity?.supportEmail || "support@example.com",
      time: t("landing.preview.justNow"),
    },
    {
      title: t("landing.preview.message2Title"),
      from: `system@${(siteSettings?.identity?.siteName || "shiro.email").toLowerCase().replace(/\s+/g, "-")}`,
      time: t("landing.preview.minutesAgo"),
    },
    {
      title: t("landing.preview.message3Title"),
      from: siteSettings?.identity?.supportEmail || "ops@shiro.email",
      time: t("landing.preview.today"),
    },
  ];
  const sampleDomain =
    (siteSettings?.identity?.siteName || "shiro.email").toLowerCase().replace(/\s+/g, "-") || "shiro.email";
  const sampleAddress = `inbox@${sampleDomain}`;
  const heroFacts = [
    { label: t("landing.heroFacts.unifiedLoginLabel"), value: t("landing.heroFacts.unifiedLoginValue") },
    { label: t("landing.heroFacts.subdomainLabel"), value: t("landing.heroFacts.subdomainValue") },
    { label: t("landing.heroFacts.workspaceLabel"), value: t("landing.heroFacts.workspaceValue") },
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
  const formattedStatsUpdatedAt =
    typeof siteStats?.updatedAt === "string" && !Number.isNaN(Date.parse(siteStats.updatedAt))
      ? new Date(siteStats.updatedAt).toLocaleString()
      : null;

  return (
    <PublicShell
      hero={({ openLogin }) => (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.02fr)_440px] lg:items-start" id="hero">
          <div className="space-y-5">
            <Badge className="rounded-full" variant="outline">
              <Sparkles className="size-3.5" />
              {t("landing.heroBadge")}
            </Badge>

            <div className="space-y-3">
              <h1 className="max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
                {siteName}
                <br />
                {t("landing.titleLine2")}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {t("landing.description")}
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Button className="h-9 px-4" onClick={openLogin} size="sm">
                {t("landing.primaryCta")}
                <ArrowRight className="size-4" />
              </Button>
              <Button asChild className="h-9 px-4" size="sm" variant="outline">
                <Link to="/docs">
                  <BookOpen className="size-4" />
                  {t("landing.secondaryCta")}
                </Link>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {heroFacts.map((item) => (
                <PublicStatBadge key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </div>

          <Card className="border-border/60 bg-card shadow-none" size="sm">
            <CardHeader className="gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm">{t("landing.workspaceTitle")}</CardTitle>
                    <p className="text-xs leading-6 text-muted-foreground">
                      {t("landing.workspaceDescription")}
                    </p>
                  </div>
                  <Badge className="rounded-full" variant="secondary">
                    {t("common.realTime")}
                  </Badge>
                </div>
              </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-card p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{t("landing.addressLabel")}</div>
                <div className="mt-1 text-sm font-medium">{sampleAddress}</div>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{t("landing.addressDescription")}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {previewSignals.map((item) => (
                  <div className="rounded-xl border border-border/60 bg-card px-3 py-3" key={item.title}>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{item.title}</div>
                    <div className="mt-1 text-sm font-medium">{item.body}</div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] leading-5 text-muted-foreground">
                {siteStatsQuery.isLoading
                  ? "正在同步实时数据..."
                  : formattedStatsUpdatedAt
                    ? `最近更新：${formattedStatsUpdatedAt}`
                    : "暂时无法获取实时数据"}
              </div>

              <div className="space-y-2">
                {previewMessages.map((item) => (
                  <div
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-3"
                    key={item.title}
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{item.title}</div>
                      <div className="text-xs text-muted-foreground">{item.from}</div>
                    </div>
                    <Badge className="rounded-full" variant="secondary">
                      {item.time}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    >
      <PublicSection
        description={t("landing.sections.coreDescription")}
        eyebrow={t("landing.sections.coreEyebrow")}
        title={t("landing.sections.coreTitle")}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featureItems.map((item) => (
            <PublicFeatureCard description={item.body} icon={item.icon} key={item.title} title={item.title} />
          ))}
        </div>
      </PublicSection>

      <PublicSection
        description={t("landing.sections.demoDescription")}
        eyebrow={t("landing.sections.demoEyebrow")}
        title={t("landing.sections.demoTitle")}
      >
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5">
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-red-400/70" />
                <span className="size-2.5 rounded-full bg-yellow-400/70" />
                <span className="size-2.5 rounded-full bg-green-400/70" />
              </div>
              <div className="ml-3 flex-1 rounded-md border border-border/40 bg-background/60 px-3 py-1 text-[11px] text-muted-foreground">
                {sampleDomain}/dashboard
              </div>
            </div>

            <div className="flex min-h-[280px] sm:min-h-[320px]">
              <div className="hidden w-[180px] shrink-0 border-r border-border/40 bg-muted/20 p-3 sm:block">
                <div className="space-y-2">
                  <div className="h-3 w-20 rounded bg-foreground/10" />
                  <div className="h-2.5 w-full rounded bg-primary/20" />
                  <div className="h-2.5 w-24 rounded bg-muted-foreground/10" />
                  <div className="h-2.5 w-28 rounded bg-muted-foreground/10" />
                  <div className="h-2.5 w-20 rounded bg-muted-foreground/10" />
                  <div className="mt-4 h-3 w-16 rounded bg-foreground/10" />
                  <div className="h-2.5 w-24 rounded bg-muted-foreground/10" />
                  <div className="h-2.5 w-28 rounded bg-muted-foreground/10" />
                </div>
              </div>

              <div className="flex-1 bg-gradient-to-br from-background via-background to-muted/30 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/40 bg-card p-3">
                    <div className="h-2 w-12 rounded bg-muted-foreground/20" />
                    <div className="mt-2 h-5 w-8 rounded bg-primary/30" />
                  </div>
                  <div className="rounded-lg border border-border/40 bg-card p-3">
                    <div className="h-2 w-14 rounded bg-muted-foreground/20" />
                    <div className="mt-2 h-5 w-10 rounded bg-green-500/25" />
                  </div>
                  <div className="rounded-lg border border-border/40 bg-card p-3">
                    <div className="h-2 w-10 rounded bg-muted-foreground/20" />
                    <div className="mt-2 h-5 w-6 rounded bg-orange-500/25" />
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-border/40 bg-card p-3">
                  <div className="mb-3 h-2.5 w-20 rounded bg-foreground/10" />
                  <div className="flex h-[80px] items-end gap-1.5">
                    <div className="h-[30%] flex-1 rounded-sm bg-primary/20" />
                    <div className="h-[55%] flex-1 rounded-sm bg-primary/30" />
                    <div className="h-[40%] flex-1 rounded-sm bg-primary/20" />
                    <div className="h-[70%] flex-1 rounded-sm bg-primary/40" />
                    <div className="h-[85%] flex-1 rounded-sm bg-primary/50" />
                    <div className="h-[60%] flex-1 rounded-sm bg-primary/30" />
                    <div className="h-[45%] flex-1 rounded-sm bg-primary/25" />
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card px-3 py-2">
                    <div className="size-2 rounded-full bg-green-500/50" />
                    <div className="h-2 w-32 rounded bg-muted-foreground/15" />
                    <div className="ml-auto h-2 w-16 rounded bg-muted-foreground/10" />
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card px-3 py-2">
                    <div className="size-2 rounded-full bg-blue-500/50" />
                    <div className="h-2 w-40 rounded bg-muted-foreground/15" />
                    <div className="ml-auto h-2 w-12 rounded bg-muted-foreground/10" />
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card px-3 py-2">
                    <div className="size-2 rounded-full bg-primary/50" />
                    <div className="h-2 w-28 rounded bg-muted-foreground/15" />
                    <div className="ml-auto h-2 w-14 rounded bg-muted-foreground/10" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </PublicSection>

      <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <PublicInfoCard
          description={t("landing.sections.workflowDescription")}
          title={t("landing.sections.workflowTitle")}
        >
          <PublicChecklist items={workflowItems} marker="index" />
        </PublicInfoCard>

        <PublicInfoCard
          description={t("landing.sections.operationsDescription")}
          title={t("landing.sections.operationsTitle")}
        >
          <div className="space-y-2 text-[11px] leading-5 text-muted-foreground">
            {previewMessages.map((item) => (
              <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-3" key={item.title}>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-foreground">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{item.from}</div>
                </div>
                <Badge className="rounded-full" variant="secondary">
                  {item.time}
                </Badge>
              </div>
            ))}
          </div>
        </PublicInfoCard>
      </div>

      <PublicSection
        description={t("landing.sections.testimonialsDescription")}
        eyebrow={t("landing.sections.testimonialsEyebrow")}
        title={t("landing.sections.testimonialsTitle")}
      >
        <div className="grid gap-4 md:grid-cols-3">
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
            <Card className="border-border/60 bg-card shadow-none" key={item.name}>
              <CardContent className="space-y-4 py-5">
                <Quote className="size-5 text-muted-foreground/40" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.quote}
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {item.initials}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.role}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </PublicSection>

      <PublicSection
        description={t("landing.sections.faqDescription")}
        eyebrow={t("landing.sections.faqEyebrow")}
        title={t("landing.sections.faqTitle")}
      >
        <Card className="border-border/60 bg-card shadow-none" size="sm">
          <CardContent className="py-2">
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
      </PublicSection>
    </PublicShell>
  );
}
