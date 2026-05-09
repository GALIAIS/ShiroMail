import type { AdminAPILimitsSettings } from "../api";

type APIRuntimeStatusProps = {
  data: AdminAPILimitsSettings | undefined;
};

export function APIRuntimeStatus({ data }: APIRuntimeStatusProps) {
  return (
    <div className="mb-4 grid gap-3 lg:grid-cols-4">
      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Runtime Status
        </div>
        <div className="mt-2 text-base font-semibold text-foreground">
          {data?.enabled ? "Rate limit enabled" : "Rate limit disabled"}
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          当前后端读取到的主限流状态。保存后这里会随着轮询刷新自动更新。
        </p>
      </div>
      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Identity Mode
        </div>
        <div className="mt-2 text-base font-semibold text-foreground">
          {data?.identityMode === "ip" ? "IP only" : "Bearer / IP mixed"}
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          匿名流量走 IP 桶；已认证流量根据当前策略决定是否按 Bearer Token 分桶。
        </p>
      </div>
      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Main RPM
        </div>
        <div className="mt-2 text-base font-semibold text-foreground">
          {data
            ? `${data.anonymousRPM} / ${data.authenticatedRPM}`
            : "-- / --"}
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          左侧是匿名请求每分钟上限，右侧是已认证请求每分钟上限。
        </p>
      </div>
      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Strict IP
        </div>
        <div className="mt-2 text-base font-semibold text-foreground">
          {data?.strictIpEnabled
            ? `${data.strictIpRPM} RPM`
            : "Disabled"}
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          作为第二层兜底桶，适合限制共享代理、出口合并或单源高频打点。
        </p>
      </div>
    </div>
  );
}
