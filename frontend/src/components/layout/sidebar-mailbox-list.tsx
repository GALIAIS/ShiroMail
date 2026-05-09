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
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

const MAX_QUICK_MAILBOXES = 3;

export function SidebarMailboxList() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["user-dashboard"],
    queryFn: fetchDashboard,
    staleTime: 60_000,
  });

  const mailboxes = (data?.mailboxes ?? [])
    .filter((m) => m.status === "active")
    .slice(0, MAX_QUICK_MAILBOXES);

  const unreadCounts = data?.unreadCounts ?? {};

  if (!mailboxes.length) return null;

  return (
    <SidebarGroup className="px-2 py-2">
      <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/50">
        {t("sidebar.recentMailboxes")}
      </SidebarGroupLabel>
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
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
