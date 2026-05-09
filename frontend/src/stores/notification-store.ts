import { create } from "zustand";

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
};

type NotificationState = {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
};

const MAX_NOTIFICATIONS = 50;

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  addNotification: (notification) =>
    set((state) => {
      const entry: Notification = {
        ...notification,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
        read: false,
      };
      const next = [entry, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
      return { notifications: next };
    }),
  markRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    })),
  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),
  clearAll: () => set({ notifications: [] }),
}));

export function useUnreadCount() {
  return useNotificationStore((s) => s.notifications.filter((n) => !n.read).length);
}
