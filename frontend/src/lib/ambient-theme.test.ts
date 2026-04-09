import { describe, expect, it } from "vitest";
import { getAmbientThemeSnapshot, getSeason, getTimeSegment } from "./ambient-theme";

describe("ambient theme helpers", () => {
  it("maps the year to meteorological seasons", () => {
    expect(getSeason(new Date("2026-03-20T08:00:00"))).toBe("spring");
    expect(getSeason(new Date("2026-07-01T08:00:00"))).toBe("summer");
    expect(getSeason(new Date("2026-10-01T08:00:00"))).toBe("autumn");
    expect(getSeason(new Date("2026-12-20T08:00:00"))).toBe("winter");
  });

  it("splits a day into stable named time segments", () => {
    expect(getTimeSegment(new Date("2026-04-10T00:30:00"))).toBe("midnight");
    expect(getTimeSegment(new Date("2026-04-10T03:30:00"))).toBe("predawn");
    expect(getTimeSegment(new Date("2026-04-10T06:30:00"))).toBe("dawn");
    expect(getTimeSegment(new Date("2026-04-10T09:30:00"))).toBe("morning");
    expect(getTimeSegment(new Date("2026-04-10T12:30:00"))).toBe("noon");
    expect(getTimeSegment(new Date("2026-04-10T15:30:00"))).toBe("afternoon");
    expect(getTimeSegment(new Date("2026-04-10T19:30:00"))).toBe("dusk");
  });

  it("returns a combined semantic snapshot for the active date", () => {
    expect(getAmbientThemeSnapshot(new Date("2026-10-10T19:45:00"))).toEqual({
      season: "autumn",
      timeSegment: "dusk",
      themeKey: "autumn-dusk",
    });
  });
});
