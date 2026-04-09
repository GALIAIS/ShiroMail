import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BasicSelect } from "@/components/ui/basic-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { WorkspaceField } from "@/components/layout/workspace-ui";
import { SiteBrandMark } from "@/components/brand/site-brand-mark";
import {
  ambientSeasons,
  ambientTimeSegments,
  getAmbientThemeSnapshot,
  type AmbientSeason,
  type AmbientTimeSegment,
} from "@/lib/ambient-theme";
import type { SiteIdentitySettings } from "./types";

function getIconSourceLabel(siteIconUrl: string) {
  const trimmed = siteIconUrl.trim();
  if (!trimmed) {
    return "默认图标";
  }
  if (trimmed.startsWith("data:image/")) {
    return "已上传图标";
  }
  if (trimmed.startsWith("/")) {
    return "站内路径";
  }
  return "外部 URL";
}

function CheckboxField({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(next) => onCheckedChange(next === true)} />
      <span>{label}</span>
    </label>
  );
}

const seasonLabels: Record<AmbientSeason, string> = {
  spring: "Spring · 春",
  summer: "Summer · 夏",
  autumn: "Autumn · 秋",
  winter: "Winter · 冬",
};

const timeSegmentLabels: Record<AmbientTimeSegment, string> = {
  midnight: "Midnight · 午夜",
  predawn: "Predawn · 凌晨",
  dawn: "Dawn · 清晨",
  morning: "Morning · 上午",
  noon: "Noon · 正午",
  afternoon: "Afternoon · 午后",
  dusk: "Dusk · 黄昏",
};

export function SiteSettingsForm({
  identity,
  onIdentityChange,
}: {
  identity: SiteIdentitySettings;
  onIdentityChange: (next: SiteIdentitySettings) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [iconUploadError, setIconUploadError] = useState<string | null>(null);
  const [iconUploadHint, setIconUploadHint] = useState<string | null>(null);
  const [isDraggingIcon, setIsDraggingIcon] = useState(false);
  const currentAmbientSnapshot = useMemo(() => getAmbientThemeSnapshot(), []);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [previewSeason, setPreviewSeason] = useState<AmbientSeason>(currentAmbientSnapshot.season);
  const [previewTimeSegment, setPreviewTimeSegment] = useState<AmbientTimeSegment>(currentAmbientSnapshot.timeSegment);
  const iconSourceLabel = getIconSourceLabel(identity.siteIconUrl);

  useEffect(() => {
    const root = document.documentElement;
    if (!previewEnabled) {
      delete root.dataset.ambientPreview;
      return;
    }

    root.dataset.ambientPreview = "true";
    root.dataset.season = previewSeason;
    root.dataset.timeSegment = previewTimeSegment;
    root.dataset.ambientTheme = `${previewSeason}-${previewTimeSegment}`;

    return () => {
      delete root.dataset.ambientPreview;
    };
  }, [previewEnabled, previewSeason, previewTimeSegment]);

  useEffect(() => {
    return () => {
      const root = document.documentElement;
      delete root.dataset.ambientPreview;
    };
  }, []);

  async function applyIconFile(file: File | null | undefined) {
    if (!file) {
      return;
    }

    const allowedTypes = new Set([
      "image/svg+xml",
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/x-icon",
      "image/vnd.microsoft.icon",
    ]);

    if (!allowedTypes.has(file.type)) {
      setIconUploadError("仅支持 SVG、PNG、JPG、WEBP 或 ICO 图标。");
      setIconUploadHint(null);
      return;
    }

    if (file.size > 512 * 1024) {
      setIconUploadError("图标文件不能超过 512 KB。");
      setIconUploadHint(null);
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
            return;
          }
          reject(new Error("invalid result"));
        };
        reader.onerror = () => reject(reader.error ?? new Error("read failed"));
        reader.readAsDataURL(file);
      });

      setIconUploadError(null);
      setIconUploadHint(
        file.type === "image/svg+xml"
          ? "已应用 SVG 图标，将按原样显示，不做裁切。"
          : `已应用 ${file.name}，当前直接作为站点图标使用。`,
      );
      onIdentityChange({
        ...identity,
        siteIconUrl: dataUrl,
      });
    } catch {
      setIconUploadError("图标读取失败，请重试。");
      setIconUploadHint(null);
    }
  }

  async function handleIconFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    await applyIconFile(file);
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <WorkspaceField label="站点名称">
        <Input
          aria-label="站点名称"
          value={identity.siteName}
          onChange={(event) =>
            onIdentityChange({ ...identity, siteName: event.target.value })
          }
        />
      </WorkspaceField>

      <WorkspaceField label="支持邮箱">
        <Input
          aria-label="支持邮箱"
          value={identity.supportEmail}
          onChange={(event) =>
            onIdentityChange({
              ...identity,
              supportEmail: event.target.value,
            })
          }
        />
      </WorkspaceField>

      <WorkspaceField label="站点地址">
        <Input
          aria-label="站点地址"
          value={identity.appBaseUrl}
          onChange={(event) =>
            onIdentityChange({
              ...identity,
              appBaseUrl: event.target.value,
            })
          }
        />
      </WorkspaceField>

      <WorkspaceField label="站点图标 URL">
        <div className="space-y-3">
          <div
            className={[
              "rounded-2xl border border-dashed px-3 py-3 transition-colors",
              isDraggingIcon
                ? "border-foreground/30 bg-muted/35"
                : "border-border/70 bg-muted/15",
            ].join(" ")}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDraggingIcon(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                return;
              }
              setIsDraggingIcon(false);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (!isDraggingIcon) {
                setIsDraggingIcon(true);
              }
            }}
            onDrop={async (event) => {
              event.preventDefault();
              setIsDraggingIcon(false);
              await applyIconFile(event.dataTransfer.files?.[0]);
            }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-card shadow-sm">
                <SiteBrandMark
                  iconUrl={identity.siteIconUrl}
                  imageClassName="size-6"
                  siteName={identity.siteName || "Shiro Email"}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">拖拽图标到这里，或点击下方按钮上传</p>
                  <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground">
                    {iconSourceLabel}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  SVG 原样使用；PNG / JPG / WEBP / ICO 直接作为站点图标，不做额外裁切。
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card shadow-sm">
              <SiteBrandMark
                iconUrl={identity.siteIconUrl}
                imageClassName="size-5"
                siteName={identity.siteName || "Shiro Email"}
              />
            </div>
            <Input
              aria-label="站点图标 URL"
              placeholder="https://example.com/icon.svg"
              value={identity.siteIconUrl}
              onChange={(event) =>
                onIdentityChange({
                  ...identity,
                  siteIconUrl: event.target.value,
                })
              }
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              accept=".svg,.png,.jpg,.jpeg,.webp,.ico,image/svg+xml,image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon"
              className="hidden"
              onChange={handleIconFileChange}
              type="file"
            />
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              上传图标
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                setIconUploadError(null);
                setIconUploadHint("已恢复默认站点图标。");
                onIdentityChange({
                  ...identity,
                  siteIconUrl: "",
                });
              }}
            >
              恢复默认
            </Button>
            <p className="text-xs text-muted-foreground">支持 URL 或直接上传，建议使用 SVG，最大 512 KB。</p>
          </div>
          {iconUploadError ? (
            <p className="text-xs text-destructive">{iconUploadError}</p>
          ) : null}
          {!iconUploadError && iconUploadHint ? (
            <p className="text-xs text-muted-foreground">{iconUploadHint}</p>
          ) : null}
          {!iconUploadError && !iconUploadHint ? (
            <p className="text-xs text-muted-foreground">
              当前来源：{iconSourceLabel}。建议优先使用 SVG，以获得最清晰的缩放显示效果。
            </p>
          ) : null}
        </div>
      </WorkspaceField>

      <WorkspaceField label="默认语言">
        <Input
          aria-label="默认语言"
          value={identity.defaultLanguage}
          onChange={(event) =>
            onIdentityChange({
              ...identity,
              defaultLanguage: event.target.value,
            })
          }
        />
      </WorkspaceField>

      <WorkspaceField label="默认时区">
        <Input
          aria-label="默认时区"
          value={identity.defaultTimeZone}
          onChange={(event) =>
            onIdentityChange({
              ...identity,
              defaultTimeZone: event.target.value,
            })
          }
        />
      </WorkspaceField>

      <div className="md:col-span-2">
        <WorkspaceField label="站点标语">
          <Input
            aria-label="站点标语"
            value={identity.slogan}
            onChange={(event) =>
              onIdentityChange({ ...identity, slogan: event.target.value })
            }
          />
        </WorkspaceField>
      </div>

      <div className="md:col-span-2">
        <div className="grid gap-3 rounded-2xl border border-border/60 bg-muted/15 p-4 md:grid-cols-[1.1fr_0.9fr]">
          <WorkspaceField label="动态主题">
            <div className="space-y-3">
              <CheckboxField
                checked={identity.ambientThemeEnabled}
                label="启用按用户本地时间与季节自动微调主题配色"
                onCheckedChange={(ambientThemeEnabled) =>
                  onIdentityChange({
                    ...identity,
                    ambientThemeEnabled,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                不改变用户选择的亮色 / 暗色 / 跟随系统，仅在当前主题内部做无感渐变切换。
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
                  当前季节：{seasonLabels[currentAmbientSnapshot.season]}
                </span>
                <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
                  当前时段：{timeSegmentLabels[currentAmbientSnapshot.timeSegment]}
                </span>
              </div>
            </div>
          </WorkspaceField>

          <WorkspaceField label="动态主题强度">
            <div className="space-y-2">
              <BasicSelect
                aria-label="动态主题强度"
                value={identity.ambientThemeIntensity}
                onChange={(event) =>
                  onIdentityChange({
                    ...identity,
                    ambientThemeIntensity: event.target.value,
                  })
                }
              >
                <option value="subtle">Subtle · 极轻微</option>
                <option value="balanced">Balanced · 默认平衡</option>
                <option value="vivid">Vivid · 更明显</option>
              </BasicSelect>
              <p className="text-xs text-muted-foreground">
                `Subtle` 适合后台长时间使用；`Vivid` 会让黄昏、清晨、四季差异更明显。
              </p>
            </div>
          </WorkspaceField>
        </div>
      </div>

      <div className="md:col-span-2">
        <div className="grid gap-3 rounded-2xl border border-border/60 bg-card/70 p-4 md:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-3">
            <WorkspaceField label="主题预览模式">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground">
                    {previewEnabled ? "Forced preview active" : "Auto local time mode"}
                  </span>
                  <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground">
                    {previewEnabled
                      ? `${seasonLabels[previewSeason]} / ${timeSegmentLabels[previewTimeSegment]}`
                      : `${seasonLabels[currentAmbientSnapshot.season]} / ${timeSegmentLabels[currentAmbientSnapshot.timeSegment]}`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  这里只影响当前管理员页面的视觉预览，不会直接改写真实用户的本地时间判定。
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    type="button"
                    variant={previewEnabled ? "outline" : "default"}
                    onClick={() => {
                      setPreviewEnabled(false);
                      setPreviewSeason(currentAmbientSnapshot.season);
                      setPreviewTimeSegment(currentAmbientSnapshot.timeSegment);
                    }}
                  >
                    预览当前时段
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant={previewEnabled ? "default" : "outline"}
                    onClick={() => setPreviewEnabled(true)}
                  >
                    强制预览指定时段
                  </Button>
                </div>
              </div>
            </WorkspaceField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <WorkspaceField label="预览季节">
              <BasicSelect
                aria-label="预览季节"
                disabled={!previewEnabled}
                value={previewSeason}
                onChange={(event) => setPreviewSeason(event.target.value as AmbientSeason)}
              >
                {ambientSeasons.map((season) => (
                  <option key={season} value={season}>
                    {seasonLabels[season]}
                  </option>
                ))}
              </BasicSelect>
            </WorkspaceField>

            <WorkspaceField label="预览时段">
              <BasicSelect
                aria-label="预览时段"
                disabled={!previewEnabled}
                value={previewTimeSegment}
                onChange={(event) => setPreviewTimeSegment(event.target.value as AmbientTimeSegment)}
              >
                {ambientTimeSegments.map((timeSegment) => (
                  <option key={timeSegment} value={timeSegment}>
                    {timeSegmentLabels[timeSegment]}
                  </option>
                ))}
              </BasicSelect>
            </WorkspaceField>
          </div>
        </div>
      </div>
    </div>
  );
}
