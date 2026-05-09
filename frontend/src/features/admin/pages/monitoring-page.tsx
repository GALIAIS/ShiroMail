import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Database,
  HardDrive,
  Server,
} from "lucide-react";
import {
  WorkspaceMetric,
  WorkspacePage,
  WorkspacePanel,
} from "@/components/layout/workspace-ui";
import { Badge } from "@/components/ui/badge";
import { fetchAdminSystemMonitoring } from "../api";

function formatUptime(seconds: number): string {
  if (seconds <= 0) return "0s";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(idx > 0 ? 1 : 0)} ${units[idx]}`;
}

type HealthStatus = "healthy" | "warning" | "critical";

function getHealthColor(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "critical":
      return "bg-red-500";
  }
}
function HealthDot({ status }: { status: HealthStatus }) {
  return (
    <span
      aria-label={status}
      className={`inline-block size-2.5 rounded-full ${getHealthColor(status)}`}
    />
  );
}

export function AdminMonitoringPage() {
  const { t } = useTranslation();
  const monitoringQuery = useQuery({
    queryKey: ["admin-monitoring"],
    queryFn: fetchAdminSystemMonitoring,
    refetchInterval: 15_000,
  });

  const data = monitoringQuery.data;

  const smtpHealth: HealthStatus =
    data && data.smtp.queueDepth > 100
      ? "critical"
      : data && data.smtp.queueDepth > 20
        ? "warning"
        : "healthy";

  const redisHealth: HealthStatus =
    data && !data.redis.connected
      ? "critical"
      : data && data.redis.usedMemoryBytes > 500 * 1024 * 1024
        ? "warning"
        : "healthy";

  const dbHealth: HealthStatus =
    data && data.database.maxOpen > 0 && data.database.inUse / data.database.maxOpen > 0.8
      ? "critical"
      : data && data.database.maxOpen > 0 && data.database.inUse / data.database.maxOpen > 0.5
        ? "warning"
        : "healthy";

  return (
    <WorkspacePage>
      <WorkspacePanel
        action={
          <Badge className="rounded-full" variant="outline">
            <Activity className="mr-1 size-3.5" />
            {t("monitoring.badge")}
          </Badge>
        }
        description={t("monitoring.description")}
        title={t("monitoring.title")}
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2">
              <Server className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("monitoring.smtp.title")}</span>
              <HealthDot status={smtpHealth} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <WorkspaceMetric
                hint={t("monitoring.smtp.queueHint")}
                label={t("monitoring.smtp.queue")}
                value={data?.smtp.queueDepth ?? 0}
              />
              <WorkspaceMetric
                hint={t("monitoring.smtp.sessionsHint")}
                label={t("monitoring.smtp.sessions")}
                value={data?.smtp.sessionsStarted ?? 0}
              />
              <WorkspaceMetric
                hint={t("monitoring.smtp.recipientsHint")}
                label={t("monitoring.smtp.recipients")}
                value={data?.smtp.recipientsAccepted ?? 0}
              />
              <WorkspaceMetric
                hint={t("monitoring.smtp.bytesHint")}
                label={t("monitoring.smtp.bytes")}
                value={formatBytes(data?.smtp.bytesReceived ?? 0)}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2">
              <HardDrive className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("monitoring.redis.title")}</span>
              <HealthDot status={redisHealth} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <WorkspaceMetric
                hint={t("monitoring.redis.memoryHint")}
                label={t("monitoring.redis.memory")}
                value={data?.redis.usedMemoryHuman || "0 B"}
              />
              <WorkspaceMetric
                hint={t("monitoring.redis.clientsHint")}
                label={t("monitoring.redis.clients")}
                value={data?.redis.connectedClients ?? 0}
              />
              <WorkspaceMetric
                hint={t("monitoring.redis.uptimeHint")}
                label={t("monitoring.redis.uptime")}
                value={formatUptime(data?.redis.uptimeSeconds ?? 0)}
              />
              <WorkspaceMetric
                hint={t("monitoring.redis.statusHint")}
                label={t("monitoring.redis.status")}
                value={data?.redis.connected ? t("monitoring.connected") : t("monitoring.disconnected")}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("monitoring.database.title")}</span>
              <HealthDot status={dbHealth} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <WorkspaceMetric
                hint={t("monitoring.database.openHint")}
                label={t("monitoring.database.open")}
                value={data?.database.openConnections ?? 0}
              />
              <WorkspaceMetric
                hint={t("monitoring.database.inUseHint")}
                label={t("monitoring.database.inUse")}
                value={data?.database.inUse ?? 0}
              />
              <WorkspaceMetric
                hint={t("monitoring.database.idleHint")}
                label={t("monitoring.database.idle")}
                value={data?.database.idle ?? 0}
              />
              <WorkspaceMetric
                hint={t("monitoring.database.maxHint")}
                label={t("monitoring.database.max")}
                value={data?.database.maxOpen ?? 0}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("monitoring.general.title")}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <WorkspaceMetric
                hint={t("monitoring.general.uptimeHint")}
                label={t("monitoring.general.uptime")}
                value={formatUptime(data?.general.uptimeSeconds ?? 0)}
              />
              <WorkspaceMetric
                hint={t("monitoring.general.messagesHint")}
                label={t("monitoring.general.messages")}
                value={data?.general.totalMessagesCount ?? 0}
              />
              <WorkspaceMetric
                hint={t("monitoring.general.mailboxesHint")}
                label={t("monitoring.general.mailboxes")}
                value={data?.general.activeMailboxCount ?? 0}
              />
              <WorkspaceMetric
                hint={t("monitoring.general.startedHint")}
                label={t("monitoring.general.started")}
                value={data?.general.startedAt ? new Date(data.general.startedAt).toLocaleString() : "-"}
              />
            </div>
          </div>
        </div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
