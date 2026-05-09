import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  CreditCard,
  FileText,
  Gift,
  Globe,
  Inbox,
  KeyRound,
  LayoutGrid,
  LifeBuoy,
  Mail,
  Megaphone,
  MessageSquareText,
  Network,
  Radio,
  ScrollText,
  Settings,
  SlidersHorizontal,
  UserRound,
  Users,
  Wallet,
  Webhook,
} from "lucide-react";

export type ConsoleNavItem = {
  labelKey: string;
  to: string;
  icon: LucideIcon;
};

export type ConsoleNavSection = {
  title?: string;
  items: ConsoleNavItem[];
};

export const userTopNav: ConsoleNavItem[] = [
  { labelKey: "nav.user.mailboxes", to: "/dashboard/mailboxes", icon: Mail },
  { labelKey: "nav.user.dashboard", to: "/dashboard", icon: LayoutGrid },
  { labelKey: "nav.user.domains", to: "/dashboard/domains", icon: Globe },
  { labelKey: "nav.user.apiKeys", to: "/dashboard/api-keys", icon: KeyRound },
  { labelKey: "nav.user.docs", to: "/dashboard/docs", icon: BookOpen },
];

export const userSidebarSections: ConsoleNavSection[] = [
  {
    items: [
      { labelKey: "nav.user.dashboard", to: "/dashboard", icon: LayoutGrid },
      { labelKey: "nav.user.mailboxes", to: "/dashboard/mailboxes", icon: Inbox },
      { labelKey: "nav.user.notices", to: "/dashboard/notices", icon: Megaphone },
      { labelKey: "nav.user.feedback", to: "/dashboard/feedback", icon: LifeBuoy },
    ],
  },
  {
    items: [
      { labelKey: "nav.user.apiKeys", to: "/dashboard/api-keys", icon: KeyRound },
      { labelKey: "nav.user.domains", to: "/dashboard/domains", icon: Globe },
      { labelKey: "nav.user.dns", to: "/dashboard/dns", icon: Network },
      { labelKey: "nav.user.extractors", to: "/dashboard/extractors", icon: SlidersHorizontal },
      { labelKey: "nav.user.webhooks", to: "/dashboard/webhooks", icon: Webhook },
      { labelKey: "nav.user.docs", to: "/dashboard/docs", icon: BookOpen },
    ],
  },
  {
    items: [
      { labelKey: "nav.user.billing", to: "/dashboard/billing", icon: CreditCard },
      { labelKey: "nav.user.balance", to: "/dashboard/balance", icon: Wallet },
      { labelKey: "nav.user.rewards", to: "/dashboard/rewards", icon: Gift },
      { labelKey: "nav.user.settings", to: "/dashboard/settings", icon: Settings },
    ],
  },
];

export const adminTopNav: ConsoleNavItem[] = [
  { labelKey: "nav.admin.overview", to: "/admin", icon: LayoutGrid },
  { labelKey: "nav.admin.users", to: "/admin/users", icon: Users },
  { labelKey: "nav.admin.messages", to: "/admin/messages", icon: MessageSquareText },
  { labelKey: "nav.admin.domains", to: "/admin/domains", icon: Globe },
  { labelKey: "nav.admin.mailboxes", to: "/admin/mailboxes", icon: Inbox },
  { labelKey: "nav.admin.rules", to: "/admin/rules", icon: SlidersHorizontal },
];

export const adminSidebarSections: ConsoleNavSection[] = [
  {
    items: [
      { labelKey: "nav.admin.overview", to: "/admin", icon: LayoutGrid },
      { labelKey: "nav.admin.users", to: "/admin/users", icon: Users },
      { labelKey: "nav.admin.messages", to: "/admin/messages", icon: MessageSquareText },
      { labelKey: "nav.admin.mailboxes", to: "/admin/mailboxes", icon: Inbox },
      { labelKey: "nav.admin.domains", to: "/admin/domains", icon: Globe },
      { labelKey: "nav.admin.dns", to: "/admin/dns", icon: Network },
      { labelKey: "nav.admin.extractors", to: "/admin/extractors", icon: SlidersHorizontal },
    ],
  },
  {
    items: [
      { labelKey: "nav.admin.rules", to: "/admin/rules", icon: SlidersHorizontal },
      { labelKey: "nav.admin.apiKeys", to: "/admin/api-keys", icon: KeyRound },
      { labelKey: "nav.admin.webhooks", to: "/admin/webhooks", icon: Webhook },
      { labelKey: "nav.admin.notices", to: "/admin/notices", icon: Bell },
      { labelKey: "nav.admin.jobs", to: "/admin/jobs", icon: Radio },
      { labelKey: "nav.admin.auditLogs", to: "/admin/audit-logs", icon: ScrollText },
    ],
  },
  {
    items: [
      { labelKey: "nav.admin.docs", to: "/admin/docs", icon: FileText },
      { labelKey: "nav.admin.account", to: "/admin/account", icon: UserRound },
      { labelKey: "nav.admin.settings", to: "/admin/settings", icon: Settings },
    ],
  },
];

export const accountIcon = UserRound;
