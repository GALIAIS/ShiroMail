import { Button } from "@/components/ui/button";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspaceListRow,
} from "@/components/layout/workspace-ui";
import type { VerificationProfileItem } from "../../api";
import { SectionToggle } from "./dns-shared-ui";
import { formatChangeSetTimestamp } from "./dns-page.utils";

type DnsVerificationSectionProps = {
  verificationProfiles: VerificationProfileItem[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onLoadRepairRecords: (profile: VerificationProfileItem) => void;
};

export function DnsVerificationSection({
  verificationProfiles,
  expanded,
  onToggleExpanded,
  onLoadRepairRecords,
}: DnsVerificationSectionProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-background/80 p-3">
      <SectionToggle
        description="检查当前 Zone 的所有权、收信与发信记录是否符合平台建议。"
        expanded={expanded}
        meta={<WorkspaceBadge variant="outline">{verificationProfiles.length} 项</WorkspaceBadge>}
        title="Verification Health"
        onToggle={onToggleExpanded}
      />

      {expanded ? (
        verificationProfiles.length ? (
          <div className="space-y-2">
            {verificationProfiles.map((profile) => (
              <WorkspaceListRow
                key={profile.verificationType}
                title={profile.summary}
                description={`${profile.verificationType} · observed ${profile.observedRecords.length} / expected ${profile.expectedRecords.length}`}
                meta={
                  <>
                    <WorkspaceBadge>{profile.status}</WorkspaceBadge>
                    <span>
                      {profile.lastCheckedAt
                        ? `检查于 ${formatChangeSetTimestamp(profile.lastCheckedAt)}`
                        : "未记录检查时间"}
                    </span>
                    <Button
                      disabled={!profile.repairRecords.length}
                      size="sm"
                      variant="outline"
                      onClick={() => onLoadRepairRecords(profile)}
                    >
                      加载 {profile.verificationType} 建议
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        ) : (
          <WorkspaceEmpty
            title="暂无验证结果"
            description="当前 Zone 还没有生成可展示的 Verification Health 数据。"
          />
        )
      ) : null}
    </div>
  );
}
