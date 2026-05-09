import type { TFunction } from "i18next";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspaceListRow,
  WorkspaceMetric,
  WorkspacePage,
  WorkspacePanel,
} from "@/components/layout/workspace-ui";
import {
  ArrowRight,
  Coins,
  FolderTree,
  Globe,
  KeyRound,
  Mail,
  MailPlus,
  MessageSquareText,
  Sparkles,
  TrendingUp,
  Webhook,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";
import { fetchDashboard, fetchPortalOverview } from "../api";
import { MessageTrendChart } from "../components/message-trend-chart";
import { formatDateTime } from "./shared";

export function UserDashboardPage() {
  const { t } = useTranslation();
  const sessionUserId = useAuthStore((state) => state.user?.userId);
  const sessionUsername = useAuthStore((state) => state.user?.username);
  const dashboardQuery = useQuery({ queryKey: ["user-dashboard"], queryFn: fetchDashboard });
  const overviewQuery = useQuery({ queryKey: ["portal-overview"], queryFn: fetchPortalOverview });

  const dashboard = dashboardQuery.data;
  const overview = overviewQuery.data;
  const [trendDays, setTrendDays] = useState(7);
  const displayName = sessionUsername || overview?.username || "Shiro 用户";
  const greeting = getGreeting(t);
  const domains = dashboard?.availableDomains ?? [];
  const ownedDomains = domains.filter((item) => item.ownerUserId === sessionUserId);
  const mailboxes = dashboard?.mailboxes ?? [];
  const rootDomainCount = ownedDomains.filter((item) => item.kind === "root").length;
  const childDomainCount = Math.max(0, ownedDomains.length - rootDomainCount);

  const stats = [
    {
      label: t("dashboard.mailboxQuota"),
      value: `${dashboard?.activeMailboxCount ?? 0}`,
      hint: quotaMeta(dashboard?.activeMailboxCount ?? 0, overview?.mailboxQuota ?? 0, t),
      icon: Mail,
    },
    {
      label: t("dashboard.activeApiKeys"),
      value: `${overview?.activeApiKeyCount ?? 0}`,
      hint: t("dashboard.activeKeysHint"),
      icon: KeyRound,
    },
    {
      label: t("dashboard.availableDomains"),
      value: `${ownedDomains.length}`,
      hint: quotaMeta(ownedDomains.length, overview?.domainQuota ?? 0, t),
      icon: Globe,
    },
    {
      label: t("dashboard.webhooks"),
      value: `${overview?.enabledWebhookCount ?? 0}`,
      hint: t("dashboard.webhookHint"),
      icon: Webhook,
    },
  ] as const;

  const quickActions = [
    {
      title: t("dashboard.quickActionCreateMailboxTitle"),
      description: t("dashboard.quickActionCreateMailboxBody"),
      to: "/dashboard/mailboxes",
      icon: MailPlus,
    },
    {
      title: t("dashboard.quickActionBindDomainTitle"),
      description: t("dashboard.quickActionBindDomainBody"),
      to: "/dashboard/domains",
      icon: FolderTree,
    },
    {
      title: t("dashboard.quickActionCreateApiKeyTitle"),
      description: t("dashboard.quickActionCreateApiKeyBody"),
      to: "/dashboard/api-keys",
      icon: KeyRound,
    },
  ] as const;

  return (
    <WorkspacePage>
      <WorkspacePanel
        action={
          <div className="flex items-center gap-2">
            <WorkspaceBadge>{t("dashboard.noticesCount", { count: overview?.noticeCount ?? 0 })}</WorkspaceBadge>
            <Badge className="rounded-full" variant="outline">
              <Sparkles className="mr-1 size-3.5" />
              {dashboardQuery.isLoading || overviewQuery.isLoading ? t("common.syncing") : t("common.realTime")}
            </Badge>
          </div>
        }
        className="bg-card/90"
        description={t("dashboard.unifiedAccount")}
        title={`${greeting}，${displayName}`}
      >
        <div className="grid gap-4 xl:grid-cols-4">
          {stats.map((item) => (
            <WorkspaceMetric hint={item.hint} icon={item.icon} key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        action={
          <div className="flex items-center gap-1">
            {([7, 14, 30] as const).map((d) => (
              <Button
                key={d}
                size="sm"
                variant={trendDays === d ? "default" : "ghost"}
                onClick={() => setTrendDays(d)}
              >
                {d}{t("dashboard.trendDaysSuffix")}
              </Button>
            ))}
          </div>
        }
        description={t("dashboard.trendDescription")}
        title={
          <span className="inline-flex items-center gap-2">
            <TrendingUp className="size-4" />
            {t("dashboard.trendTitle")}
          </span>
        }
      >
        <MessageTrendChart days={trendDays} />
      </WorkspacePanel>

      <WorkspacePanel
        action={
          <Button asChild size="sm" variant="secondary">
            <Link to="/dashboard/domains">
              {t("dashboard.manageDomains")}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
        description={t("dashboard.domainsDescription")}
        title={t("dashboard.domainsTitle")}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <WorkspaceMetric hint={t("dashboard.totalDomainsHint")} label={t("dashboard.totalDomains")} value={ownedDomains.length} />
          <WorkspaceMetric hint={t("dashboard.rootDomainsHint")} label={t("dashboard.rootDomains")} value={rootDomainCount} />
          <WorkspaceMetric hint={t("dashboard.childDomainsHint")} label={t("dashboard.childDomains")} value={childDomainCount} />
        </div>

        {ownedDomains.length ? (
          <div className="grid gap-3 xl:grid-cols-3">
            {ownedDomains.slice(0, 6).map((domain) => (
              <Card className="border-border/60 bg-muted/10 shadow-none" key={domain.id}>
                <CardContent className="space-y-1.5 py-4">
                  <div className="text-sm font-medium">{domain.domain}</div>
                  <div className="text-[0.92rem] leading-6 text-muted-foreground">
                    {domain.kind === "root"
                      ? t("dashboard.domainKindRoot")
                      : t("dashboard.domainKindChild", { level: domain.level })}{" "}
                    · {t("dashboard.weight", { weight: domain.weight })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <WorkspaceEmpty
            action={
              <Button asChild size="sm">
                <Link to="/dashboard/domains">{t("dashboard.addDomain")}</Link>
              </Button>
            }
            description={t("dashboard.noDomainsDescription")}
            title={t("dashboard.noDomainsTitle")}
          />
        )}
      </WorkspacePanel>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <WorkspacePanel description={t("dashboard.quickActionsDescription")} title={t("dashboard.quickActionsTitle")}>
          <div className="grid gap-3 lg:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Card className="border-border/60 bg-muted/10 shadow-none" key={action.to}>
                  <CardContent className="flex items-start justify-between gap-3 py-4">
                    <div className="flex gap-3">
                      <div className="flex size-11 items-center justify-center rounded-xl border border-border/70 bg-muted/40 text-muted-foreground">
                        <Icon className="size-4" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-[0.95rem] font-medium">{action.title}</div>
                        <p className="text-[0.92rem] leading-6 text-muted-foreground">{action.description}</p>
                      </div>
                    </div>
                    <Button asChild size="icon-sm" variant="ghost">
                      <Link to={action.to}>
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </WorkspacePanel>

        <WorkspacePanel description={t("dashboard.summaryDescription")} title={t("dashboard.summaryTitle")}>
          <div className="grid gap-3 md:grid-cols-2">
            <WorkspaceMetric hint={t("dashboard.openFeedbackHint")} label={t("dashboard.openFeedback")} value={overview?.openFeedbackCount ?? 0} />
            <WorkspaceMetric hint={t("dashboard.latestNoticesHint")} label={t("dashboard.latestNotices")} value={overview?.noticeCount ?? 0} />
            <WorkspaceMetric hint={t("dashboard.totalMailboxesHint")} label={t("dashboard.totalMailboxes")} value={dashboard?.totalMailboxCount ?? 0} />
            <WorkspaceMetric hint={t("dashboard.feedbackEntryHint")} label={t("dashboard.feedbackEntry")} value={t("dashboard.connected")} />
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-3 text-[0.92rem] text-muted-foreground">
            <MessageSquareText className="size-4" />
            <span>{t("dashboard.summaryFootnote")}</span>
          </div>
        </WorkspacePanel>
      </div>

      <WorkspacePanel
        action={
          <Button asChild size="sm" variant="secondary">
            <Link to="/dashboard/mailboxes">
              {t("dashboard.openMailboxManager")}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
        description={t("dashboard.recentMailboxesDescription")}
        title={t("dashboard.recentMailboxesTitle")}
      >
        {mailboxes.length ? (
          <div className="space-y-3">
            {mailboxes.slice(0, 5).map((mailbox) => (
              <WorkspaceListRow
                description={`${mailbox.domain} · ${
                  mailbox.status === "active" ? t("dashboard.mailboxStatusActive") : t("dashboard.mailboxStatusReleased")
                }`}
                key={mailbox.id}
                meta={
                  <>
                    <WorkspaceBadge>{mailbox.localPart}</WorkspaceBadge>
                    <span>{formatDateTime(mailbox.expiresAt)}</span>
                  </>
                }
                title={mailbox.address}
              />
            ))}
          </div>
        ) : (
          <WorkspaceEmpty
            description={t("dashboard.noMailboxesDescription")}
            title={t("dashboard.noMailboxesTitle")}
          />
        )}

        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-3 text-[0.92rem] text-muted-foreground">
          <Coins className="size-4" />
          <span>{t("dashboard.recentMailboxesFootnote")}</span>
        </div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}

function getGreeting(t: TFunction, date = new Date()) {
  const hour = date.getHours();

  if (hour < 11) {
    return t("dashboard.greetings.morning");
  }

  if (hour < 14) {
    return t("dashboard.greetings.noon");
  }

  if (hour < 18) {
    return t("dashboard.greetings.afternoon");
  }

  return t("dashboard.greetings.evening");
}

function quotaMeta(value: number, quota: number, t: TFunction) {
  if (!quota) {
    return t("dashboard.currentPackageUnlimited");
  }

  return t("dashboard.quotaMeta", { value, quota });
}
