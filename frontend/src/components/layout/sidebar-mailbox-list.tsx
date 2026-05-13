import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { fetchDashboard } from "@/features/user/api";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

const MAX_COLLAPSED = 3;
const MAX_EXPANDED = 10;

export function SidebarMailboxList() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { data } = useQuery({
    queryKey: ["user-dashboard"],
    queryFn: fetchDashboard,
    staleTime: 60_000,
  });

  const allMailboxes = (data?.mailboxes ?? []).filter((m) => m.status === "active");
  const unreadCounts = data?.unreadCounts ?? {};
  const limit = expanded ? MAX_EXPANDED : MAX_COLLAPSED;
  const mailboxes = allMailboxes.slice(0, limit);
  const hasMore = allMailboxes.length > MAX_COLLAPSED;

  if (!allMailboxes.length) return null;

  return (
    <SidebarGroup className="px-2 py-2">
      <div className="flex items-center justify-between group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/50">
          {t("sidebar.recentMailboxes")}
        </SidebarGroupLabel>
        <NavLink
          className="mr-2 flex size-5 items-center justify-center rounded-md text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          title={t("nav.user.mailboxes")}
          to="/dashboard/mailboxes"
        >
          <Plus className="size-3.5" />
        </NavLink>
      </div>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {mailboxes.map((mailbox) => {
            const unread = unreadCounts[mailbox.id] ?? 0;
            const initial = mailbox.address.charAt(0).toUpperCase();

            return (
              <SidebarMenuItem key={mailbox.id}>
                <SidebarMenuButton
                  asChild
                  className="h-9 rounded-xl px-3 text-sm group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2"
                  tooltip={mailbox.address}
                >
                  <NavLink to={`/dashboard/mailboxes?id=${mailbox.id}`}>
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground group-data-[collapsible=icon]:size-7">
                      {initial}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2 group-data-[collapsible=icon]:hidden">
                      <span className="truncate text-xs">{mailbox.address}</span>
                      {unread > 0 ? (
                        <Badge className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]" variant="secondary">
                          {unread}
                        </Badge>
                      ) : null}
                    </span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
          {hasMore ? (
            <SidebarMenuItem>
              <button
                className="flex h-7 w-full items-center justify-center gap-1 rounded-lg text-[11px] text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
                onClick={() => setExpanded((v) => !v)}
                type="button"
              >
                <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
                <span>{expanded ? t("common.collapse", "收起") : `+${allMailboxes.length - MAX_COLLAPSED}`}</span>
              </button>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
