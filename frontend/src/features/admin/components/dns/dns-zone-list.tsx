import { Button } from "@/components/ui/button";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspaceListRow,
} from "@/components/layout/workspace-ui";
import { cn } from "@/lib/utils";
import { PaginationControls, SectionToggle } from "./dns-shared-ui";
import { ADMIN_ZONES_PAGE_SIZE } from "./dns-page.utils";

type ZoneItem = { id: string; name: string; status: string };

type DnsZoneListProps = {
  providerZonePanel: {
    providerId: number;
    displayName: string;
    zones: ZoneItem[];
  } | null;
  activeZoneId: string | undefined;
  expanded: boolean;
  onToggleExpanded: () => void;
  paginatedItems: ZoneItem[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  zoneFailureCooldowns: Record<string, number>;
  loadingRecordsZoneKey: string | null;
  isChangeSetWorkspaceBusy: boolean;
  onLoadRecords: (zone: ZoneItem) => void;
};

export function DnsZoneList({
  providerZonePanel,
  activeZoneId,
  expanded,
  onToggleExpanded,
  paginatedItems,
  page,
  totalPages,
  total,
  onPageChange,
  zoneFailureCooldowns,
  loadingRecordsZoneKey,
  isChangeSetWorkspaceBusy,
  onLoadRecords,
}: DnsZoneListProps) {
  if (!providerZonePanel) {
    return (
      <WorkspaceEmpty
        title="先查看 Zone"
        description={'在 Provider 账号页点击"查看 Zones"后，这里会显示当前 Provider 的 Zone 列表。'}
      />
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-background/60 p-3">
      <SectionToggle
        description={`共 ${providerZonePanel.zones.length} 个可用 Zone`}
        expanded={expanded}
        meta={
          <WorkspaceBadge variant="outline">
            {providerZonePanel.displayName}
          </WorkspaceBadge>
        }
        title={`${providerZonePanel.displayName} · Zones`}
        onToggle={onToggleExpanded}
      />

      {expanded && providerZonePanel.zones.length ? (
        <div className="space-y-2">
          {paginatedItems.map((zone) => {
            const zoneKey = `${providerZonePanel.providerId}:${zone.id}`;
            const cooldownUntil = zoneFailureCooldowns[zoneKey] ?? 0;
            const cooldownSeconds = cooldownUntil > Date.now()
              ? Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000))
              : 0;
            return (
              <WorkspaceListRow
                className={cn(
                  activeZoneId === zone.id
                    ? "border-primary/45 bg-primary/5"
                    : undefined,
                )}
                key={zone.id}
                title={zone.name}
                description={
                  activeZoneId === zone.id
                    ? "Provider Zone · 当前工作区"
                    : "Provider Zone"
                }
                meta={
                  <>
                    <WorkspaceBadge>{zone.status}</WorkspaceBadge>
                    {activeZoneId === zone.id ? (
                      <WorkspaceBadge variant="outline">当前工作区</WorkspaceBadge>
                    ) : null}
                    {cooldownSeconds > 0 ? (
                      <WorkspaceBadge variant="outline">冷却 {cooldownSeconds}s</WorkspaceBadge>
                    ) : null}
                    <Button
                      aria-label={`${zone.name} 查看 Records`}
                      disabled={
                        loadingRecordsZoneKey === zoneKey ||
                        isChangeSetWorkspaceBusy ||
                        cooldownSeconds > 0
                      }
                      size="sm"
                      variant="ghost"
                      onClick={() => onLoadRecords(zone)}
                    >
                      {loadingRecordsZoneKey === zoneKey
                        ? "载入中..."
                        : cooldownSeconds > 0
                          ? `冷却 ${cooldownSeconds}s`
                          : "查看 Records"}
                    </Button>
                  </>
                }
              />
            );
          })}
          <PaginationControls
            itemLabel="Zone"
            page={page}
            pageSize={ADMIN_ZONES_PAGE_SIZE}
            total={total}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      ) : expanded ? (
        <WorkspaceEmpty
          title="暂无 Zone"
          description="当前 Provider 账号还没有可用的 Zone。"
        />
      ) : null}
    </div>
  );
}
