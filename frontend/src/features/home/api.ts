import { http } from "../../lib/http";

export type PublicSiteSettings = {
  identity: {
    siteName: string;
    slogan: string;
    supportEmail: string;
    siteIconUrl: string;
    appBaseUrl: string;
    defaultLanguage: string;
    defaultTimeZone: string;
    ambientThemeEnabled: boolean;
    ambientThemeIntensity: string;
  };
  mailDns: {
    mxTarget: string;
    dkimCnameTarget: string;
  };
};

export type PublicSiteStats = {
  activeMailboxCount: number;
  todayMessageCount: number;
  activeDomainCount: number;
  totalUserCount: number;
  failedJobCount: number;
  updatedAt: string;
};

export async function fetchPublicSiteSettings() {
  const { data } = await http.get<PublicSiteSettings>("/site/settings");
  return data;
}

export async function fetchPublicSiteStats() {
  const { data } = await http.get<PublicSiteStats>("/site/stats");
  return data;
}
