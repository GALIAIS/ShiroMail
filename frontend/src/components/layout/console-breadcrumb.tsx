import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ConsoleNavItem, ConsoleNavSection } from "@/lib/console-nav";

type Props = {
  sections: ConsoleNavSection[];
  topNav: ConsoleNavItem[];
  rootLabel: string;
  rootPath: string;
};

export function ConsoleBreadcrumb({ sections, topNav, rootLabel, rootPath }: Props) {
  const { t } = useTranslation();
  const location = useLocation();

  const allItems = [...topNav, ...sections.flatMap((s) => s.items)];
  const activeItem = allItems.find(
    (item) => location.pathname === item.to || (item.to !== rootPath && location.pathname.startsWith(`${item.to}/`)),
  );

  if (!activeItem || location.pathname === rootPath) return null;

  return (
    <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
      <Link to={rootPath} className="hover:text-foreground transition-colors">
        {rootLabel}
      </Link>
      <ChevronRight className="size-3.5" />
      <span className="font-medium text-foreground">{t(activeItem.labelKey)}</span>
    </nav>
  );
}
