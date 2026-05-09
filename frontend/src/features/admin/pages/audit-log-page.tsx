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
  WorkspaceListRow,
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
            {items.map((item) => (
              <WorkspaceListRow
                key={item.id}
                title={item.action}
                description={`${item.resourceType} / ${item.resourceId}`}
                meta={
                  <>
                    <WorkspaceBadge variant="outline">
                      {item.resourceType}
                    </WorkspaceBadge>
                    <WorkspaceBadge variant="secondary">
                      actor #{item.actorUserId}
                    </WorkspaceBadge>
                    <span>{formatDateTime(item.createdAt)}</span>
                  </>
                }
                titleClassName="whitespace-normal"
                descriptionClassName="whitespace-normal"
              />
            ))}
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
