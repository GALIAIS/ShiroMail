import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OptionCombobox } from "@/components/ui/option-combobox";
import { WorkspaceField } from "@/components/layout/workspace-ui";
import { MailPlus } from "lucide-react";
import type { DomainOption } from "../api";

const ttlOptions = [
  { label: "24 小时", value: "24", keywords: ["1 day", "24"] },
  { label: "72 小时", value: "72", keywords: ["3 days", "72"] },
  { label: "168 小时", value: "168", keywords: ["7 days", "168"] },
];

type Props = {
  domains: DomainOption[];
  effectiveDomainId: string;
  onDomainIdChange: (value: string) => void;
  ttlHours: number;
  onTtlHoursChange: (value: number) => void;
  localPart: string;
  onLocalPartChange: (value: string) => void;
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
  localPart,
  onLocalPartChange,
  feedback,
  isPending,
  onSubmit,
}: Props) {
  return (
    <Card className="border-border/60 bg-muted/10 shadow-none">
      <CardContent className="space-y-4 py-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MailPlus className="size-4" />
          <span>创建新邮箱</span>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_180px_auto]">
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
              onValueChange={(value) => onTtlHoursChange(Number(value))}
              options={ttlOptions}
              placeholder="选择有效期"
              searchPlaceholder="搜索有效期"
              value={String(ttlHours)}
            />
          </WorkspaceField>

          <div className="flex items-end">
            <Button
              className="w-full md:w-auto"
              disabled={effectiveDomainId === "" || isPending}
              onClick={onSubmit}
            >
              <MailPlus className="size-4" />
              {isPending ? "创建中..." : "创建邮箱"}
            </Button>
          </div>
        </div>

        <WorkspaceField label="邮箱前缀">
          <Input
            onChange={(event) => onLocalPartChange(event.target.value)}
            placeholder="留空则自动生成"
            value={localPart}
          />
        </WorkspaceField>

        {feedback ? <div className="text-xs text-muted-foreground">{feedback}</div> : null}
      </CardContent>
    </Card>
  );
}
