import { useTranslation } from "react-i18next";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNotifications } from "@/hooks/use-notifications";

export function NotificationToggle() {
  const { t } = useTranslation();
  const { permission, requestPermission } = useNotifications();

  if (permission === "granted") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="pointer-events-auto">
            <BellRing className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("notifications.enabled")}</TooltipContent>
      </Tooltip>
    );
  }

  if (permission === "denied") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="pointer-events-auto opacity-50">
            <BellOff className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px]">
          {t("notifications.denied")}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void requestPermission()}
        >
          <Bell className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("notifications.enable")}</TooltipContent>
    </Tooltip>
  );
}
