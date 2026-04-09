import { useEffect } from "react";
import { useSiteBranding } from "@/hooks/use-site-branding";

function ensureFaviconLink() {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  return link;
}

function inferIconMimeType(siteIconUrl: string) {
  const lower = siteIconUrl.toLowerCase();
  if (lower.startsWith("data:image/")) {
    const match = /^data:(image\/[a-z0-9.+-]+);/i.exec(siteIconUrl);
    return match?.[1] || "image/svg+xml";
  }
  if (lower.includes(".png")) {
    return "image/png";
  }
  if (lower.includes(".ico")) {
    return "image/x-icon";
  }
  if (lower.includes(".webp")) {
    return "image/webp";
  }
  if (lower.includes(".jpg") || lower.includes(".jpeg")) {
    return "image/jpeg";
  }
  return "image/svg+xml";
}

export function SiteBrandRuntime() {
  const { ambientThemeEnabled, ambientThemeIntensity, siteIconUrl } = useSiteBranding();

  useEffect(() => {
    const link = ensureFaviconLink();
    link.type = inferIconMimeType(siteIconUrl);
    link.href = siteIconUrl;
  }, [siteIconUrl]);

  useEffect(() => {
    document.documentElement.dataset.ambientEnabled = ambientThemeEnabled ? "true" : "false";
    document.documentElement.dataset.ambientIntensity = ambientThemeIntensity;
  }, [ambientThemeEnabled, ambientThemeIntensity]);

  return null;
}
