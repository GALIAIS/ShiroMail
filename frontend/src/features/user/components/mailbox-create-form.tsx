import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OptionCombobox } from "@/components/ui/option-combobox";
import { WorkspaceField } from "@/components/layout/workspace-ui";
import { MailPlus } from "lucide-react";
import { mailboxLocalPartSchema } from "@/lib/schemas";
import type { DomainOption } from "../api";

const ttlOptions = [
  { label: "永久", value: "permanent", keywords: ["permanent", "forever", "永久", "不过期"] },
  { label: "24 小时", value: "24", keywords: ["1 day", "24"] },
  { label: "72 小时", value: "72", keywords: ["3 days", "72"] },
  { label: "168 小时", value: "168", keywords: ["7 days", "168"] },
];

const retentionOptions = [
  { label: "永久保留", value: "0", keywords: ["forever", "keep", "永久"] },
  { label: "7 天", value: "7", keywords: ["7 days", "一周"] },
  { label: "14 天", value: "14", keywords: ["14 days", "两周"] },
  { label: "30 天", value: "30", keywords: ["30 days", "一个月"] },
  { label: "60 天", value: "60", keywords: ["60 days", "两个月"] },
  { label: "90 天", value: "90", keywords: ["90 days", "三个月"] },
];

type Props = {
  domains: DomainOption[];
  effectiveDomainId: string;
  onDomainIdChange: (value: string) => void;
  ttlHours: number;
  onTtlHoursChange: (value: number) => void;
  permanent: boolean;
  onPermanentChange: (value: boolean) => void;
  localPart: string;
  onLocalPartChange: (value: string) => void;
  retentionDays: number;
  onRetentionDaysChange: (value: number) => void;
  feedback: string | null;
  isPending: boolean;
  onSubmit: () => void;
};

export function MailboxCreateForm({
  domains,
  effectiveDomainId,
  onDomainIdChange,
  ttlHours,
  onTtlHoursChange,
  permanent,
  onPermanentChange,
  localPart,
  onLocalPartChange,
  retentionDays,
  onRetentionDaysChange,
  feedback,
  isPending,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const [localPartError, setLocalPartError] = useState<string | null>(null);

  function handleLocalPartChange(value: string) {
    onLocalPartChange(value);
    if (value.trim()) {
      const result = mailboxLocalPartSchema.safeParse(value.trim().toLowerCase());
      setLocalPartError(result.success ? null : result.error.issues[0]?.message ?? null);
    } else {
      setLocalPartError(null);
    }
  }

  function handleSubmit() {
    if (localPart.trim()) {
      const result = mailboxLocalPartSchema.safeParse(localPart.trim().toLowerCase());
      if (!result.success) {
        setLocalPartError(result.error.issues[0]?.message ?? t("validation.required"));
        return;
      }
    }
    onSubmit();
  }

  return (
    <Card className="border-border/60 bg-muted/10 shadow-none">
      <CardContent className="space-y-4 py-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MailPlus className="size-4" />
          <span>创建新邮箱</span>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_180px_180px_auto]">
          <WorkspaceField label="域名">
            <OptionCombobox
              ariaLabel="选择域名"
              emptyLabel="没有匹配域名"
              onValueChange={onDomainIdChange}
              options={domains.map((domain) => ({
                value: String(domain.id),
                label: domain.domain,
                keywords: [domain.rootDomain, domain.kind],
              }))}
              placeholder="选择域名"
              searchPlaceholder="搜索域名"
              value={effectiveDomainId}
            />
          </WorkspaceField>

          <WorkspaceField label="有效期">
            <OptionCombobox
              ariaLabel="邮箱有效期"
              emptyLabel="没有匹配的有效期"
              onValueChange={(value) => {
                if (value === "permanent") {
                  onPermanentChange(true);
                } else {
                  onPermanentChange(false);
                  onTtlHoursChange(Number(value));
                }
              }}
              options={ttlOptions}
              placeholder="选择有效期"
              searchPlaceholder="搜索有效期"
              value={permanent ? "permanent" : String(ttlHours)}
            />
          </WorkspaceField>

          <WorkspaceField label="消息保留">
            <OptionCombobox
              ariaLabel="消息保留时间"
              emptyLabel="没有匹配的保留时间"
              onValueChange={(value) => onRetentionDaysChange(Number(value))}
              options={retentionOptions}
              placeholder="选择保留时间"
              searchPlaceholder="搜索保留时间"
              value={String(retentionDays)}
            />
          </WorkspaceField>

          <div className="flex items-end">
            <Button
              className="w-full md:w-auto"
              disabled={effectiveDomainId === "" || isPending}
              onClick={handleSubmit}
            >
              <MailPlus className="size-4" />
              {isPending ? "创建中..." : "创建邮箱"}
            </Button>
          </div>
        </div>

        <WorkspaceField label="邮箱前缀">
          <Input
            onChange={(event) => handleLocalPartChange(event.target.value)}
            placeholder="留空则自动生成"
            value={localPart}
          />
          {localPartError ? <p className="text-xs text-destructive">{localPartError}</p> : null}
        </WorkspaceField>

        {feedback ? <div className="text-xs text-muted-foreground">{feedback}</div> : null}
      </CardContent>
    </Card>
  );
}
