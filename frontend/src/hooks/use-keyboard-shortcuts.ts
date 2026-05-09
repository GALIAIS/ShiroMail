import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

type ShortcutEntry = {
  key: string;
  path: string;
  label: string;
};

const LEADER_TIMEOUT_MS = 1500;

const userShortcuts: ShortcutEntry[] = [
  { key: "d", path: "/dashboard", label: "Dashboard" },
  { key: "m", path: "/dashboard/mailboxes", label: "Mailboxes" },
  { key: "w", path: "/dashboard/webhooks", label: "Webhooks" },
  { key: "s", path: "/dashboard/settings", label: "Settings" },
];

const adminShortcuts: ShortcutEntry[] = [
  { key: "d", path: "/dashboard", label: "Dashboard" },
  { key: "m", path: "/dashboard/mailboxes", label: "Mailboxes" },
  { key: "w", path: "/dashboard/webhooks", label: "Webhooks" },
  { key: "s", path: "/admin/settings", label: "Settings" },
  { key: "a", path: "/admin", label: "Admin" },
];

function isEditableElement(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

export type KeyboardShortcutsState = {
  leaderActive: boolean;
  shortcuts: ShortcutEntry[];
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
};

export function useKeyboardShortcuts(
  role: "user" | "admin",
): KeyboardShortcutsState {
  const navigate = useNavigate();
  const [leaderActive, setLeaderActive] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const leaderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortcuts = role === "admin" ? adminShortcuts : userShortcuts;

  const clearLeader = useCallback(() => {
    setLeaderActive(false);
    if (leaderTimerRef.current) {
      clearTimeout(leaderTimerRef.current);
      leaderTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableElement(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();

      // Help shortcut
      if (key === "?" && !leaderActive) {
        event.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // Leader key activation
      if (key === "g" && !leaderActive) {
        event.preventDefault();
        setLeaderActive(true);
        leaderTimerRef.current = setTimeout(() => {
          setLeaderActive(false);
        }, LEADER_TIMEOUT_MS);
        return;
      }

      // Sequence completion
      if (leaderActive) {
        event.preventDefault();
        const match = shortcuts.find((s) => s.key === key);
        if (match) {
          navigate(match.path);
        }
        clearLeader();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (leaderTimerRef.current) {
        clearTimeout(leaderTimerRef.current);
      }
    };
  }, [leaderActive, shortcuts, navigate, clearLeader]);

  return { leaderActive, shortcuts, helpOpen, setHelpOpen };
}
