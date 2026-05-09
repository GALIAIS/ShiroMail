import { Button } from "@/components/ui/button";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspaceListRow,
} from "@/components/layout/workspace-ui";
import type { DomainProviderItem } from "../../api";
import { PaginationControls } from "./dns-shared-ui";
import { ADMIN_PROVIDERS_PAGE_SIZE } from "./dns-page.utils";

type DnsProviderListProps = {
  providers: DomainProviderItem[];
  paginatedItems: DomainProviderItem[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  validatingProviderID: number | null;
  loadingZonesProviderID: number | null;
  deletingProviderID: number | null;
  onValidate: (provider: DomainProviderItem) => void;
  onEdit: (provider: DomainProviderItem) => void;
  onLoadZones: (provider: DomainProviderItem) => void;
  onDelete: (provider: DomainProviderItem) => void;
};

export function DnsProviderList({
  providers,
  paginatedItems,
  page,
  totalPages,
  total,
  onPageChange,
  validatingProviderID,
  loadingZonesProviderID,
  deletingProviderID,
  onValidate,
  onEdit,
  onLoadZones,
  onDelete,
}: DnsProviderListProps) {
  if (!providers.length) {
    return (
      <WorkspaceEmpty
        title="暂无 Provider 账号"
        description="先新增 DNS 服务商账号，再继续查看 Zone 和 Zone 工作区。"
      />
    );
  }

  return (
    <div className="space-y-3">
      {paginatedItems.map((provider) => (
        <WorkspaceListRow
          key={provider.id}
          title={provider.displayName}
          description={`${provider.provider} · ${provider.ownerType} · ${provider.authType}`}
          meta={
            <>
              <WorkspaceBadge>{provider.status}</WorkspaceBadge>
              <span>
                {provider.hasSecret
                  ? "secret ready"
                  : "secret missing"}
              </span>
              <span>{provider.capabilities.join(", ")}</span>
              <Button
                aria-label={`${provider.displayName} 校验连接`}
                disabled={
                  validatingProviderID === provider.id ||
                  loadingZonesProviderID === provider.id ||
                  deletingProviderID === provider.id
                }
                size="sm"
                variant="outline"
                onClick={() => onValidate(provider)}
              >
                {validatingProviderID === provider.id ? "校验中..." : "校验连接"}
              </Button>
              <Button
                aria-label={`${provider.displayName} 编辑`}
                disabled={
                  deletingProviderID === provider.id ||
                  validatingProviderID === provider.id ||
                  loadingZonesProviderID === provider.id
                }
                size="sm"
                variant="ghost"
                onClick={() => onEdit(provider)}
              >
                编辑
              </Button>
              <Button
                aria-label={`${provider.displayName} 查看 Zones`}
                disabled={
                  validatingProviderID === provider.id ||
                  loadingZonesProviderID === provider.id ||
                  deletingProviderID === provider.id
                }
                size="sm"
                variant="ghost"
                onClick={() => onLoadZones(provider)}
              >
                {loadingZonesProviderID === provider.id ? "载入中..." : "查看 Zones"}
              </Button>
              <Button
                aria-label={`${provider.displayName} 删除`}
                disabled={
                  deletingProviderID === provider.id ||
                  validatingProviderID === provider.id ||
                  loadingZonesProviderID === provider.id
                }
                size="sm"
                variant="ghost"
                onClick={() => onDelete(provider)}
              >
                {deletingProviderID === provider.id ? "删除中..." : "删除"}
              </Button>
            </>
          }
        />
      ))}
      <PaginationControls
        itemLabel="Provider 账号"
        page={page}
        pageSize={ADMIN_PROVIDERS_PAGE_SIZE}
        total={total}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}
