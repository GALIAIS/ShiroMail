import { useTranslation } from "react-i18next";
import { Bell, CheckCheck, Trash2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  useNotificationStore,
  useUnreadCount,
} from "@/stores/notification-store";

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "<1m";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function NotificationDropdown() {
  const { t } = useTranslation();
  const notifications = useNotificationStore((s) => s.notifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const unreadCount = useUnreadCount();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("notifications.title")}
          size="icon-sm"
          title={t("notifications.title")}
          variant="ghost"
          className="relative"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("notifications.title")}</span>
          <div className="flex items-center gap-1">
            <Button
              size="icon-xs"
              variant="ghost"
              title={t("notifications.markAllRead")}
              onClick={(e) => {
                e.preventDefault();
                markAllRead();
              }}
            >
              <CheckCheck className="size-3" />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              title={t("notifications.clearAll")}
              onClick={(e) => {
                e.preventDefault();
                clearAll();
              }}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted-foreground">
            <Mail className="size-5 opacity-50" />
            <span>{t("notifications.empty")}</span>
          </div>
        ) : (
          <ScrollArea className="max-h-72">
            <div className="flex flex-col">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                    !notification.read && "bg-muted/30",
                  )}
                  onClick={() => markRead(notification.id)}
                >
                  <div className="mt-0.5 flex size-2 shrink-0 items-center">
                    {!notification.read && (
                      <span className="size-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {notification.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {notification.body}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatRelativeTime(notification.timestamp)}
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
