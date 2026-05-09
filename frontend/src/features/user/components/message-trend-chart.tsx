import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchDashboardTrend } from "../api";

export function MessageTrendChart({ days = 7 }: { days?: number }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-trend", days],
    queryFn: () => fetchDashboardTrend(days),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  const chartData = (data ?? []).map((item) => ({
    date: item.date.slice(5),
    count: item.count,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "13px",
          }}
          labelStyle={{ color: "hsl(var(--foreground))" }}
        />
        <Area
          type="monotone"
          dataKey="count"
          name={t("dashboard.trendMessages")}
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#trendFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
