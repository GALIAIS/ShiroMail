import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function WorkspacePage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-col gap-4", className)}>{children}</div>;
}

export function WorkspaceSection({
  title,
  description,
  action,
  children,
  className,
  headerClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  headerClassName?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {title || description || action ? (
        <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", headerClassName)}>
          <div className="min-w-0 space-y-1">
            {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : null}
            {description ? (
              <p className="max-w-3xl text-[0.92rem] leading-6 text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function WorkspaceSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card/88 p-4 shadow-none", className)}>
      {children}
    </div>
  );
}

export function WorkspacePanel({
  title,
  description,
  action,
  className,
  children,
}: {
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={cn("border-border/60 bg-card shadow-none", className)} size="sm">
      <CardHeader className="gap-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? (
            <CardDescription className="text-[0.92rem] leading-6">{description}</CardDescription>
          ) : null}
        </div>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      {children ? <CardContent className="space-y-3.5">{children}</CardContent> : null}
    </Card>
  );
}

export type WorkspaceMetricItem = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  badge?: ReactNode;
};

export function WorkspaceMetricStrip({
  items,
  className,
}: {
  items: readonly WorkspaceMetricItem[];
  className?: string;
}) {
  return (
    <div className={cn("grid overflow-hidden rounded-xl border border-border/60 bg-card/90 md:grid-cols-2 xl:grid-cols-4", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div className="flex min-h-28 items-start justify-between gap-4 border-b border-border/60 p-4 last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0" key={item.label}>
            <div className="min-w-0 space-y-1">
              <p className="text-[0.78rem] font-medium text-muted-foreground">{item.label}</p>
              <p className="text-2xl font-semibold tracking-tight">{item.value}</p>
              {item.hint ? <p className="text-[0.82rem] leading-5 text-muted-foreground">{item.hint}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              {item.badge}
              {Icon ? (
                <div className="flex size-9 items-center justify-center rounded-lg bg-muted/45 text-muted-foreground">
                  <Icon className="size-4" />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WorkspaceMetric({
  label,
  value,
  hint,
  icon: Icon,
  badge,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  badge?: ReactNode;
}) {
  return (
    <Card className="border-border/60 bg-card shadow-none" size="sm">
      <CardContent className="flex items-start justify-between gap-4 py-3.5">
        <div className="space-y-1">
          <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          {hint ? <p className="text-[0.82rem] leading-5 text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {badge}
          {Icon ? (
            <div className="flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/35 text-muted-foreground">
              <Icon className="size-4" />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function WorkspaceListRow({
  title,
  description,
  meta,
  className,
  titleClassName,
  descriptionClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-3.5 text-sm md:flex-row md:items-start md:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className={cn("truncate font-medium", titleClassName)}>{title}</div>
        {description ? (
          <div className={cn("text-sm leading-6 text-muted-foreground", descriptionClassName)}>
            {description}
          </div>
        ) : null}
      </div>
      {meta ? (
        <div className="flex flex-wrap items-center gap-2 text-[0.82rem] text-muted-foreground md:justify-end">
          {meta}
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceBadge({
  children,
  variant = "secondary",
}: {
  children: ReactNode;
  variant?: "default" | "secondary" | "outline" | "destructive";
}) {
  return (
    <Badge className="rounded-full px-2.5 py-0.5 text-[0.78rem]" variant={variant}>
      {children}
    </Badge>
  );
}

export function getWorkspaceStatusTone(status: string) {
  const normalized = status.trim().toLowerCase();
  if (
    [
      "active",
      "healthy",
      "success",
      "succeeded",
      "verified",
      "passed",
      "pass",
      "applied",
      "enabled",
      "ready",
      "ok",
    ].some((value) => normalized === value || normalized.includes(value))
  ) {
    return "success";
  }
  if (
    [
      "warning",
      "warn",
      "drifted",
      "missing",
      "pending",
      "queued",
      "draft",
      "cooldown",
      "retryable",
      "unknown",
    ].some((value) => normalized === value || normalized.includes(value))
  ) {
    return "warning";
  }
  if (
    [
      "failed",
      "fail",
      "error",
      "rejected",
      "reject",
      "disabled",
      "deleted",
      "invalid",
      "blocked",
      "unauthorized",
    ].some((value) => normalized === value || normalized.includes(value))
  ) {
    return "danger";
  }
  return "neutral";
}

export function WorkspaceStatusBadge({
  children,
  status,
  tone,
}: {
  children: ReactNode;
  status: string;
  tone?: "success" | "warning" | "danger" | "neutral";
}) {
  const resolvedTone = tone ?? getWorkspaceStatusTone(status);
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-full border px-2.5 py-0.5 text-[0.78rem] font-medium whitespace-nowrap",
        resolvedTone === "success" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        resolvedTone === "warning" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
        resolvedTone === "danger" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
        resolvedTone === "neutral" &&
          "border-border bg-secondary text-secondary-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function WorkspaceEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-card px-4 py-6 text-center">
      <div className="mx-auto max-w-md space-y-1.5">
        <p className="text-base font-medium">{title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function WorkspaceField({
  label,
  children,
  description,
  error,
}: {
  label: string;
  children: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      {children}
      {description ? <span className="text-xs leading-5 text-muted-foreground">{description}</span> : null}
      {error ? <span className="text-xs leading-5 text-destructive">{error}</span> : null}
    </label>
  );
}
