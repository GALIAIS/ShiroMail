import { cn } from "@/lib/utils";
import { DEFAULT_SITE_ICON_URL, resolveSiteIconUrl } from "@/hooks/use-site-branding";

type SiteBrandMarkProps = {
  siteName: string;
  iconUrl?: string | null;
  className?: string;
  imageClassName?: string;
};

export function SiteBrandMark({
  siteName,
  iconUrl,
  className,
  imageClassName,
}: SiteBrandMarkProps) {
  return (
    <div className={cn("flex items-center justify-center overflow-hidden rounded-[inherit]", className)}>
      <img
        alt={siteName}
        className={cn("h-full w-full object-contain", imageClassName)}
        loading="eager"
        onError={(event) => {
          const target = event.currentTarget;
          const fallback = resolveSiteIconUrl("");
          if (target.dataset.fallbackApplied === "true" || target.src.endsWith(DEFAULT_SITE_ICON_URL)) {
            return;
          }
          target.dataset.fallbackApplied = "true";
          target.src = fallback;
        }}
        src={resolveSiteIconUrl(iconUrl)}
      />
    </div>
  );
}
