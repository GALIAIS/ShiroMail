import { ShieldCheck } from "lucide-react";
import { WorkspacePanel } from "@/components/layout/workspace-ui";
import { MailSettingsForm } from "../settings/mail-settings-form";
import { DomainPolicyForm } from "../settings/domain-policy-form";
import { DeliveryTestPanel, type DeliveryTestDiagnosticState } from "./delivery-test-panel";
import type {
  DomainPolicySettings,
  MailDeliverySettings,
  MailInboundSettings,
  MailSMTPSettings,
} from "../settings/types";

type OtherSettingsTabProps = {
  smtp: MailSMTPSettings;
  delivery: MailDeliverySettings;
  inbound: MailInboundSettings;
  domainPolicy: DomainPolicySettings;
  onSMTPChange: (next: MailSMTPSettings) => void;
  onDeliveryChange: (next: MailDeliverySettings) => void;
  onInboundChange: (next: MailInboundSettings) => void;
  onDomainPolicyChange: (next: DomainPolicySettings) => void;
  deliveryTestRecipient: string;
  onDeliveryTestRecipientChange: (value: string) => void;
  isTestPending: boolean;
  onSendDeliveryTest: () => void;
  deliveryTestDiagnostic: DeliveryTestDiagnosticState;
  hasUnsavedChanges?: boolean;
};

export function OtherSettingsTab({
  smtp,
  delivery,
  inbound,
  domainPolicy,
  onSMTPChange,
  onDeliveryChange,
  onInboundChange,
  onDomainPolicyChange,
  deliveryTestRecipient,
  onDeliveryTestRecipientChange,
  isTestPending,
  onSendDeliveryTest,
  deliveryTestDiagnostic,
  hasUnsavedChanges = false,
}: OtherSettingsTabProps) {
  return (
    <div className="grid gap-4">
      <WorkspacePanel
        title="邮件基础设施"
        description="管理 SMTP 监听地址、邮件主机名与基础收件开关。"
      >
        <MailSettingsForm
          smtp={smtp}
          delivery={delivery}
          inbound={inbound}
          onSMTPChange={onSMTPChange}
          onDeliveryChange={onDeliveryChange}
          onInboundChange={onInboundChange}
          mode="smtp"
        />
      </WorkspacePanel>

      <WorkspacePanel
        title="账户邮件发信"
        description="配置注册验证、找回密码与账户通知发信 SMTP。"
      >
        <MailSettingsForm
          smtp={smtp}
          delivery={delivery}
          inbound={inbound}
          onSMTPChange={onSMTPChange}
          onDeliveryChange={onDeliveryChange}
          onInboundChange={onInboundChange}
          mode="delivery"
        />
        <DeliveryTestPanel
          recipient={deliveryTestRecipient}
          onRecipientChange={onDeliveryTestRecipientChange}
          isPending={isTestPending}
          onSendTest={onSendDeliveryTest}
          diagnosticState={deliveryTestDiagnostic}
          hasUnsavedChanges={hasUnsavedChanges}
        />
      </WorkspacePanel>

      <WorkspacePanel
        title="入站策略"
        description="控制 raw 保留、附件大小、catch-all 与入站收件限制。"
      >
        <MailSettingsForm
          smtp={smtp}
          delivery={delivery}
          inbound={inbound}
          onSMTPChange={onSMTPChange}
          onDeliveryChange={onDeliveryChange}
          onInboundChange={onInboundChange}
          mode="inbound"
        />
      </WorkspacePanel>

      <WorkspacePanel
        title="平台治理"
        description="整站级公开域审核与后续平台风控策略。"
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 text-muted-foreground" />
          域名平台策略
        </div>
        <DomainPolicyForm
          value={domainPolicy}
          onChange={onDomainPolicyChange}
        />
      </WorkspacePanel>
    </div>
  );
}
