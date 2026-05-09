import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { BasicSelect } from "@/components/ui/basic-select";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from "@/components/layout/workspace-ui";
import { fetchAdminAuditPaginated } from "../api";
import { formatDateTime } from "../../user/pages/shared";

const PAGE_SIZE = 20;

const actionOptions = [
  { label: "All actions", value: "" },
  { label: "Domain upsert", value: "admin.domain.upsert" },
  { label: "Domain delete", value: "admin.domain.delete" },
  { label: "Domain verify", value: "admin.domain.verify" },
  { label: "Domain review", value: "admin.domain.public_pool.approve" },
  { label: "Mailbox create", value: "admin.mailbox.create" },
  { label: "Mailbox extend", value: "admin.mailbox.extend" },
  { label: "Mailbox release", value: "admin.mailbox.release" },
  { label: "User delete", value: "admin.user.delete" },
  { label: "Config upsert", value: "admin.config.upsert" },
  { label: "Rule upsert", value: "admin.rule.upsert" },
  { label: "API key create", value: "admin.api_key.create" },
  { label: "API key revoke", value: "admin.api_key.revoke" },
  { label: "Webhook create", value: "admin.webhook.create" },
  { label: "SMTP test", value: "admin.mail_delivery.test" },
  { label: "SMTP test failed", value: "admin.mail_delivery.test_failed" },
  { label: "Spool retry", value: "admin.inbound_spool.retry" },
  { label: "Provider create", value: "admin.domain_provider.create" },
  { label: "Provider delete", value: "admin.domain_provider.delete" },
];

export function AdminAuditLogPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");

  const auditQuery = useQuery({
    queryKey: ["admin-audit-paginated", page, actionFilter],
    queryFn: () =>
      fetchAdminAuditPaginated({
        page,
        pageSize: PAGE_SIZE,
        action: actionFilter,
      }),
  });

  const result = auditQuery.data;
  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isRefreshing = auditQuery.isRefetching;

  return (
    <WorkspacePage>
      <WorkspacePanel
        description={t("audit.description")}
        title={t("audit.title")}
        action={
          <div className="flex items-center gap-2">
            <BasicSelect
              aria-label={t("audit.filterLabel")}
              className="min-w-44"
              value={actionFilter}
              onChange={(event) => {
                setActionFilter(event.target.value);
                setPage(1);
              }}
            >
              {actionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </BasicSelect>
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void auditQuery.refetch()}
            >
              <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {t("common.refresh")}
            </Button>
          </div>
        }
      >
        {items.length ? (
          <div className="space-y-3">
            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">{t("audit.colAction")}</th>
                    <th className="px-3 py-2.5 font-medium">{t("audit.colResource")}</th>
                    <th className="px-3 py-2.5 font-medium">{t("audit.colActor")}</th>
                    <th className="px-3 py-2.5 font-medium">{t("audit.colTime")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 font-medium">{item.action}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        <span>{item.resourceType}</span>
                        <span className="mx-1 text-border">/</span>
                        <span>{item.resourceId}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <WorkspaceBadge variant="secondary">
                          actor #{item.actorUserId}
                        </WorkspaceBadge>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                        {formatDateTime(item.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card view */}
            <div className="space-y-3 md:hidden">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-border/60 bg-card p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium break-all">{item.action}</span>
                    <WorkspaceBadge variant="secondary">
                      actor #{item.actorUserId}
                    </WorkspaceBadge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {item.resourceType} / {item.resourceId}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <WorkspaceBadge variant="outline">{item.resourceType}</WorkspaceBadge>
                    <span>{formatDateTime(item.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>

            <PaginationControls
              itemLabel={t("audit.itemLabel")}
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        ) : (
          <WorkspaceEmpty
            description={t("audit.emptyDescription")}
            title={t("audit.emptyTitle")}
          />
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
