import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Database, Globe, Users } from "lucide-react";
import { PublicBottomCta, PublicPageHero, PublicShell } from "../components/public-shell";
import { PublicFeatureCard, PublicInfoCard, PublicSection } from "../components/public-ui";
import { Button } from "@/components/ui/button";
import { fetchPublicSiteStats } from "../api";

export function StatsPage() {
  const statsQuery = useQuery({
    queryKey: ["public-site-stats"],
    queryFn: fetchPublicSiteStats,
    staleTime: 15_000,
  });
  const stats = statsQuery.data;
  const formattedUpdatedAt =
    typeof stats?.updatedAt === "string" && !Number.isNaN(Date.parse(stats.updatedAt))
      ? new Date(stats.updatedAt).toLocaleString()
      : null;
  const metricCards = [
    { title: "活跃域名", value: stats?.activeDomainCount ?? 0, icon: Globe },
    { title: "活跃邮箱", value: stats?.activeMailboxCount ?? 0, icon: Database },
    { title: "今日消息", value: stats?.todayMessageCount ?? 0, icon: Activity },
    { title: "注册用户", value: stats?.totalUserCount ?? 0, icon: Users },
    { title: "失败任务", value: stats?.failedJobCount ?? 0, icon: AlertTriangle },
  ];

  return (
    <PublicShell>
      <PublicPageHero
        eyebrow="Stats"
        title="统计说明"
        description="这里汇总系统实时统计数据与查看位置。"
      />

      <PublicSection description="以下数值来自后端真实数据聚合。" title="实时指标">
        <div className="mb-3 flex items-center justify-end">
          <Button onClick={() => statsQuery.refetch()} size="sm" variant="outline">
            刷新数据
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {metricCards.map((item) => (
            <PublicFeatureCard
              description={statsQuery.isLoading ? "正在同步..." : `${item.value.toLocaleString()} 条`}
              icon={item.icon}
              key={item.title}
              title={item.title}
            />
          ))}
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm leading-6 text-muted-foreground">
          {statsQuery.isLoading
            ? "正在读取真实统计数据..."
            : statsQuery.isError
              ? "拉取统计数据失败，请点击上方“刷新数据”重试。"
            : formattedUpdatedAt
              ? `最近更新时间：${formattedUpdatedAt}`
              : "暂时无法获取实时统计数据，请稍后刷新重试。"}
        </div>
      </PublicSection>

      <PublicInfoCard title="查看方式">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm leading-6 text-muted-foreground">
            公开页展示统计范围。
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm leading-6 text-muted-foreground">
            用户控制台查看账户数据。
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm leading-6 text-muted-foreground">
            管理后台查看整站运行状态。
          </div>
        </div>
      </PublicInfoCard>

      <PublicBottomCta />
    </PublicShell>
  );
}
