export const ambientTimeSegments = [
  "midnight",
  "predawn",
  "dawn",
  "morning",
  "noon",
  "afternoon",
  "dusk",
] as const;

export const ambientSeasons = ["spring", "summer", "autumn", "winter"] as const;

export type AmbientTimeSegment = (typeof ambientTimeSegments)[number];
export type AmbientSeason = (typeof ambientSeasons)[number];

export type AmbientThemeSnapshot = {
  season: AmbientSeason;
  timeSegment: AmbientTimeSegment;
  themeKey: `${AmbientSeason}-${AmbientTimeSegment}`;
};

export function getSeason(date: Date): AmbientSeason {
  const month = date.getMonth();

  if (month >= 2 && month <= 4) {
    return "spring";
  }

  if (month >= 5 && month <= 7) {
    return "summer";
  }

  if (month >= 8 && month <= 10) {
    return "autumn";
  }

  return "winter";
}

export function getTimeSegment(date: Date): AmbientTimeSegment {
  const hour = date.getHours();

  if (hour < 2) {
    return "midnight";
  }

  if (hour < 5) {
    return "predawn";
  }

  if (hour < 8) {
    return "dawn";
  }

  if (hour < 11) {
    return "morning";
  }

  if (hour < 14) {
    return "noon";
  }

  if (hour < 18) {
    return "afternoon";
  }

  if (hour < 22) {
    return "dusk";
  }

  return "midnight";
}

export function getAmbientThemeSnapshot(date = new Date()): AmbientThemeSnapshot {
  const season = getSeason(date);
  const timeSegment = getTimeSegment(date);

  return {
    season,
    timeSegment,
    themeKey: `${season}-${timeSegment}`,
  };
}

export function getMillisecondsUntilNextAmbientThemeCheck(date = new Date()) {
  const next = new Date(date);
  next.setMinutes(0, 1, 0);
  next.setHours(date.getHours() + 1);
  return Math.max(60_000, next.getTime() - date.getTime());
}
