import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ShortcutEntry = {
  key: string;
  path: string;
  label: string;
};

export function KeyboardShortcutsIndicator({ active }: { active: boolean }) {
  const { t } = useTranslation();
  if (!active) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="rounded-lg border border-border/60 bg-popover px-4 py-2 text-sm font-medium text-popover-foreground shadow-lg">
        {t("shortcuts.waiting")}
      </div>
    </div>
  );
}

export function KeyboardShortcutsHelp({
  open,
  onOpenChange,
  shortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: ShortcutEntry[];
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("shortcuts.title")}</DialogTitle>
          <DialogDescription>{t("shortcuts.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.key}
              className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2"
            >
              <span className="text-sm text-foreground">{shortcut.label}</span>
              <div className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono">
                  G
                </kbd>
                <span className="text-xs text-muted-foreground">then</span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono">
                  {shortcut.key.toUpperCase()}
                </kbd>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
            <span className="text-sm text-foreground">
              {t("shortcuts.helpLabel")}
            </span>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono">
              ?
            </kbd>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
