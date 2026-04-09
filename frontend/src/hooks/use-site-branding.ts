import { useQuery } from "@tanstack/react-query";
import { fetchPublicSiteSettings } from "@/features/home/api";

export const DEFAULT_SITE_NAME = "Shiro Email";
export const DEFAULT_SITE_ICON_URL = "/shiromail-mark.svg?v=20260409";
export const DEFAULT_AMBIENT_THEME_ENABLED = true;
export const DEFAULT_AMBIENT_THEME_INTENSITY = "balanced";

export function resolveSiteIconUrl(iconUrl: string | null | undefined) {
  const trimmed = (iconUrl ?? "").trim();
  return trimmed || DEFAULT_SITE_ICON_URL;
}

export function useSiteBranding() {
  const siteSettingsQuery = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: fetchPublicSiteSettings,
    staleTime: 60_000,
  });

  const siteName = siteSettingsQuery.data?.identity?.siteName || DEFAULT_SITE_NAME;
  const siteIconUrl = resolveSiteIconUrl(siteSettingsQuery.data?.identity?.siteIconUrl);
  const ambientThemeEnabled = siteSettingsQuery.data?.identity?.ambientThemeEnabled ?? DEFAULT_AMBIENT_THEME_ENABLED;
  const ambientThemeIntensity =
    siteSettingsQuery.data?.identity?.ambientThemeIntensity || DEFAULT_AMBIENT_THEME_INTENSITY;

  return {
    siteName,
    siteIconUrl,
    ambientThemeEnabled,
    ambientThemeIntensity,
    siteSettings: siteSettingsQuery.data,
    siteSettingsQuery,
  };
}
