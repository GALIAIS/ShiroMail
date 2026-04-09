# Seasonal Time-Adaptive Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-site theme accent layer that adapts to the visitor's local time segment and current season without overriding the chosen light/dark/system mode.

**Architecture:** Keep the existing light/dark/system resolution untouched in `ThemeProvider`, then add a second semantic layer that derives `timeSegment` and `season`, writes them to root `data-*` attributes, and drives CSS custom properties for background glow, accent, surfaces, and grid tone. The visual system should be subtle, animated, and low-cost, with the same semantic attributes consumed by public pages, login surfaces, and console shells.

**Tech Stack:** React 19, Vite, Vitest, CSS custom properties, document root data attributes.

---

### Task 1: Define seasonal time semantics

**Files:**
- Create: `frontend/src/lib/ambient-theme.ts`
- Test: `frontend/src/lib/ambient-theme.test.ts`

- [ ] Add pure helpers for `getTimeSegment(date)`, `getSeason(date)`, and a combined resolver.
- [ ] Cover boundaries for dawn/morning/noon/afternoon/dusk/midnight and spring/summer/autumn/winter with Vitest.
- [ ] Verify the tests fail before implementation, then pass after adding the helpers.

### Task 2: Extend theme runtime

**Files:**
- Modify: `frontend/src/components/providers/theme-provider.tsx`
- Test: `frontend/src/components/providers/theme-provider.test.tsx`

- [ ] Extend the provider so it computes ambient theme data from local time, writes `data-time-segment`, `data-season`, and `data-ambient-theme` to `document.documentElement`, and refreshes on a low-frequency timer.
- [ ] Keep the existing `theme`, `resolvedTheme`, and bootstrapping logic unchanged.
- [ ] Add/adjust tests to assert the new root attributes are applied for a mocked date.

### Task 3: Apply semantic variables to global styling

**Files:**
- Modify: `frontend/src/index.css`

- [ ] Introduce CSS variables for ambient accent/background/grid tones for light and dark themes.
- [ ] Override those variables via `[data-time-segment=...]` and `[data-season=...]` combinations.
- [ ] Update existing `brand-backdrop` / `brand-panel-grid` layers to consume the semantic variables instead of hard-coded colors.
- [ ] Preserve `prefers-reduced-motion` handling and avoid expensive animation changes.

### Task 4: Verify end-to-end integration

**Files:**
- Modify if needed: `frontend/src/app/providers.tsx`
- Verify: `frontend/src/features/home/components/public-shell.tsx`
- Verify: `frontend/src/components/auth/login-modal.tsx`
- Verify: `frontend/src/components/layout/console-shell.tsx`

- [ ] Confirm the runtime is already mounted high enough for the whole app; only adjust provider wiring if needed.
- [ ] Run targeted tests, full frontend build, and rebuild/restart local Docker so the new theme system is visible in the running app.
