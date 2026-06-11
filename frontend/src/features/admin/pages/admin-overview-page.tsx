import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Database, Globe, ShieldCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  WorkspaceListRow,
  WorkspaceMetricStrip,
  WorkspacePage,
  WorkspaceSection,
  WorkspaceSurface,
} from "@/components/layout/workspace-ui";
import { Badge } from "@/components/ui/badge";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { decodeMimeHeaderValue } from "@/lib/mail-header";
import { paginateItems } from "@/lib/pagination";
import { fetchAdminJobs, fetchAdminMessages, fetchAdminOverview } from "../api";
import { formatDateTime } from "../../user/pages/shared";

const ADMIN_OVERVIEW_MESSAGES_PAGE_SIZE = 5;

export function AdminOverviewPage() {
  const { t } = useTranslation();
  const [messagesPage, setMessagesPage] = useState(1);
  const overviewQuery = useQuery({ queryKey: ["admin-overview"], queryFn: fetchAdminOverview });
  const jobsQuery = useQuery({ queryKey: ["admin-jobs"], queryFn: fetchAdminJobs });
  const messagesQuery = useQuery({ queryKey: ["admin-messages"], queryFn: fetchAdminMessages });

  const overview = overviewQuery.data;
  const stats = [
    { label: t("adminOverview.activeMailboxes"), value: overview?.activeMailboxCount ?? 0, hint: t("adminOverview.activeMailboxesHint"), icon: Database },
    { label: t("adminOverview.todayMessages"), value: overview?.todayMessageCount ?? 0, hint: t("adminOverview.todayMessagesHint"), icon: Activity },
    { label: t("adminOverview.activeDomains"), value: overview?.activeDomainCount ?? 0, hint: t("adminOverview.activeDomainsHint"), icon: Globe },
    { label: t("adminOverview.failedJobs"), value: overview?.failedJobCount ?? 0, hint: t("adminOverview.failedJobsHint"), icon: ShieldCheck },
  ] as const;
  const paginatedMessages = useMemo(
    () => paginateItems(messagesQuery.data ?? [], messagesPage, ADMIN_OVERVIEW_MESSAGES_PAGE_SIZE),
    [messagesPage, messagesQuery.data],
  );

  return (
    <WorkspacePage>
      <WorkspaceSection
        action={
          <Badge className="rounded-full" variant="outline">
            <Users className="mr-1 size-3.5" />
            {t("adminOverview.badge")}
          </Badge>
        }
        description={t("adminOverview.description")}
        title={t("adminOverview.title")}
      >
        <WorkspaceMetricStrip items={stats} />
      </WorkspaceSection>

      <div className="grid gap-6 xl:grid-cols-2">
        <WorkspaceSection description={t("adminOverview.latestMessagesDescription")} title={t("adminOverview.latestMessagesTitle")}>
          <WorkspaceSurface>
          <div className="space-y-3">
            {paginatedMessages.items.map((item) => (
              <WorkspaceListRow
                className="border-0 bg-muted/15"
                description={`${decodeMimeHeaderValue(item.fromAddr)} → ${item.mailboxAddress}`}
                key={item.id}
                meta={
                  <>
                    <span className="rounded-full border border-border/60 px-2 py-1">{item.status}</span>
                    <span>{formatDateTime(item.receivedAt)}</span>
                  </>
                }
                title={decodeMimeHeaderValue(item.subject) || t("adminOverview.noSubject")}
              />
            ))}
            <PaginationControls
              itemLabel="邮件事件"
              onPageChange={setMessagesPage}
              page={paginatedMessages.page}
              pageSize={ADMIN_OVERVIEW_MESSAGES_PAGE_SIZE}
              total={paginatedMessages.total}
              totalPages={paginatedMessages.totalPages}
            />
          </div>
          </WorkspaceSurface>
        </WorkspaceSection>

        <WorkspaceSection description={t("adminOverview.jobsDescription")} title={t("adminOverview.jobsTitle")}>
          <WorkspaceSurface>
          <div className="space-y-3">
            {(jobsQuery.data ?? []).slice(0, 5).map((item) => (
              <WorkspaceListRow
                className="border-0 bg-muted/15"
                description={item.errorMessage || t("adminOverview.ok")}
                key={item.id}
                meta={
                  <>
                    <span className="rounded-full border border-border/60 px-2 py-1">{item.status}</span>
                    <span>{formatDateTime(item.createdAt)}</span>
                  </>
                }
                title={item.jobType}
              />
            ))}
          </div>
          </WorkspaceSurface>
        </WorkspaceSection>
      </div>
    </WorkspacePage>
  );
}
