import { DEFAULT_SITE_NAME, useSiteBranding } from "@/hooks/use-site-branding";

export function useSiteName() {
  return useSiteBranding().siteName;
}

export { DEFAULT_SITE_NAME };
