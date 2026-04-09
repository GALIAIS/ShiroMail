import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./theme-provider";

function ThemeProbe() {
  const { theme, resolvedTheme } = useTheme();
  return <div data-resolved-theme={resolvedTheme} data-theme={theme}>theme-probe</div>;
}

describe("ThemeProvider", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T19:45:00"));
    window.localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.dataset.theme = "";
    document.documentElement.dataset.themePreference = "";
    document.documentElement.dataset.timeSegment = "";
    document.documentElement.dataset.season = "";
    document.documentElement.dataset.ambientTheme = "";
    document.documentElement.dataset.ambientPreview = "";
    document.documentElement.style.colorScheme = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it("keeps the bootstrapped dark system theme from the document root on first mount", () => {
    window.localStorage.setItem("shiro-email.theme", "system");
    document.documentElement.classList.add("dark");
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.themePreference = "system";
    document.documentElement.style.colorScheme = "dark";

    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themePreference).toBe("system");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(screen.getByText("theme-probe")).toHaveAttribute("data-resolved-theme", "dark");
  });

  it("applies seasonal time metadata to the document root", () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(document.documentElement.dataset.timeSegment).toBe("dusk");
    expect(document.documentElement.dataset.season).toBe("autumn");
    expect(document.documentElement.dataset.ambientTheme).toBe("autumn-dusk");
  });

  it("preserves forced preview data when ambient preview mode is active", () => {
    document.documentElement.dataset.ambientPreview = "true";
    document.documentElement.dataset.timeSegment = "dawn";
    document.documentElement.dataset.season = "spring";
    document.documentElement.dataset.ambientTheme = "spring-dawn";

    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(document.documentElement.dataset.timeSegment).toBe("dawn");
    expect(document.documentElement.dataset.season).toBe("spring");
    expect(document.documentElement.dataset.ambientTheme).toBe("spring-dawn");
  });
});
