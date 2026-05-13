import { useCallback, useEffect, useState } from "react";

type NotificationPermission = "default" | "granted" | "denied";

const isSupported = typeof window !== "undefined" && "Notification" in window;

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (!isSupported) return "default";
    return Notification.permission as NotificationPermission;
  });

  useEffect(() => {
    if (!isSupported) return;
    setPermission(Notification.permission as NotificationPermission);
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return;
    const result = await Notification.requestPermission();
    setPermission(result as NotificationPermission);
  }, []);

  const notify = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (!isSupported || permission !== "granted") return;
      new Notification(title, options);
    },
    [permission],
  );

  return { permission, requestPermission, notify };
}
