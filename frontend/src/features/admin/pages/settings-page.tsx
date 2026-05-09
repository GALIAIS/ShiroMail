import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Globe,
  KeyRound,
  Settings2,
  Users,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { NoticeBanner } from "@/components/ui/notice-banner";
import {
  WorkspacePage,
  WorkspacePanel,
} from "@/components/layout/workspace-ui";
import {
  getAPIErrorMessage,
  getMailDeliveryDiagnostic,
  getMailDeliveryErrorMessage,
} from "@/lib/http";
import { validateEmailAddress } from "@/lib/validation";
import {
  deleteAdminConfig,
  fetchAdminAPILimitsSettings,
  fetchAdminSettingsSections,
  sendAdminMailDeliveryTest,
  upsertAdminConfig,
} from "../api";
import {
  CONFIG_KEY_AUTH_OAUTH_DISPLAY,
  CONFIG_KEY_AUTH_OAUTH_PROVIDER_PREFIX,
  CONFIG_KEY_AUTH_PASSWORD,
  CONFIG_KEY_AUTH_REGISTRATION,
  CONFIG_KEY_AUTH_SESSION,
  CONFIG_KEY_API_LIMITS,
  CONFIG_KEY_DOMAIN_POLICY,
  CONFIG_KEY_MAIL_DELIVERY,
  CONFIG_KEY_MAIL_INBOUND,
  CONFIG_KEY_MAIL_SMTP,
  CONFIG_KEY_SITE_IDENTITY,
  defaultAPILimitsSettings,
  defaultAuthPasswordSettings,
  defaultAuthRegistrationSettings,
  defaultAuthSessionSettings,
  defaultDomainPolicySettings,
  defaultMailInboundSettings,
  defaultMailDeliverySettings,
  defaultMailSMTPSettings,
  defaultOAuthDisplaySettings,
  defaultSiteIdentitySettings,
  getOAuthProviderConfigKey,
} from "../settings/defaults";
import { AuthSettingsForm } from "../settings/auth-settings-form";
import { APISettingsForm } from "../settings/api-settings-form";
import { SiteSettingsForm } from "../settings/site-settings-form";
import {
  deriveMailTargetsFromAppBaseURL,
  shouldReplaceWithDerivedMailTarget,
} from "../settings/mail-domain-defaults";
import type {
  AuthPasswordSettings,
  AuthRegistrationSettings,
  AuthSessionSettings,
  APILimitsSettings,
  DomainPolicySettings,
  MailInboundSettings,
  MailDeliverySettings,
  MailSMTPSettings,
  OAuthDisplaySettings,
  OAuthProviderSettings,
  SiteIdentitySettings,
} from "../settings/types";
import {
  flattenSectionItems,
  parseSiteIdentity,
  parseRegistration,
  parsePassword,
  parseSession,
  parseOAuthDisplay,
  parseOAuthProviders,
  parseSMTP,
  parseMailDelivery,
  parseInbound,
  parseAPILimits,
  parseDomainPolicy,
} from "../lib/settings-parsers";
import { validateAdminSettingsSnapshot } from "../lib/settings-validation";
import { APIRuntimeStatus } from "../components/api-runtime-status";
import { OtherSettingsTab } from "../components/other-settings-tab";
import type { DeliveryTestDiagnosticState } from "../components/delivery-test-panel";

export function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["admin-settings-sections"],
    queryFn: fetchAdminSettingsSections,
  });
  const apiLimitsRuntimeQuery = useQuery({
    queryKey: ["admin-api-limits-settings"],
    queryFn: fetchAdminAPILimitsSettings,
  });

  const [siteIdentity, setSiteIdentity] = useState<SiteIdentitySettings>(
    defaultSiteIdentitySettings,
  );
  const [registration, setRegistration] = useState<AuthRegistrationSettings>(
    defaultAuthRegistrationSettings,
  );
  const [password, setPassword] = useState<AuthPasswordSettings>(
    defaultAuthPasswordSettings,
  );
  const [session, setSession] = useState<AuthSessionSettings>(
    defaultAuthSessionSettings,
  );
  const [oauthDisplay, setOAuthDisplay] = useState<OAuthDisplaySettings>(
    defaultOAuthDisplaySettings,
  );
  const [oauthProviders, setOAuthProviders] = useState<OAuthProviderSettings[]>([]);
  const [smtp, setSMTP] = useState<MailSMTPSettings>(defaultMailSMTPSettings);
  const [delivery, setDelivery] = useState<MailDeliverySettings>(
    defaultMailDeliverySettings,
  );
  const [deliveryTestRecipient, setDeliveryTestRecipient] = useState("");
  const [inbound, setInbound] = useState<MailInboundSettings>(
    defaultMailInboundSettings,
  );
  const [apiLimits, setAPILimits] = useState<APILimitsSettings>(
    defaultAPILimitsSettings,
  );
  const [domainPolicy, setDomainPolicy] = useState<DomainPolicySettings>(
    defaultDomainPolicySettings,
  );
  const derivedMailTargets = useMemo(
    () => deriveMailTargetsFromAppBaseURL(siteIdentity.appBaseUrl),
    [siteIdentity.appBaseUrl],
  );
  const previousDerivedMailTargetsRef = useRef(derivedMailTargets);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackVariant, setFeedbackVariant] = useState<"error" | "success">("success");
  const [deliveryTestDiagnostic, setDeliveryTestDiagnostic] = useState<DeliveryTestDiagnosticState>({
    status: "idle",
    recipient: "",
  });
  const deliveryTestLockRef = useRef(false);

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setSiteIdentity(parseSiteIdentity(settingsQuery.data));
    setRegistration(parseRegistration(settingsQuery.data));
    setPassword(parsePassword(settingsQuery.data));
    setSession(parseSession(settingsQuery.data));
    setOAuthDisplay(parseOAuthDisplay(settingsQuery.data));
    setOAuthProviders(parseOAuthProviders(settingsQuery.data));
    setSMTP(parseSMTP(settingsQuery.data));
    const nextDelivery = parseMailDelivery(settingsQuery.data);
    setDelivery(nextDelivery);
    setDeliveryTestRecipient(nextDelivery.fromAddress);
    setInbound(parseInbound(settingsQuery.data));
    setAPILimits(parseAPILimits(settingsQuery.data));
    setDomainPolicy(parseDomainPolicy(settingsQuery.data));
  }, [settingsQuery.data]);

  useEffect(() => {
    const previousDerivedTargets = previousDerivedMailTargetsRef.current;
    previousDerivedMailTargetsRef.current = derivedMailTargets;

    if (!derivedMailTargets) {
      return;
    }

    setSMTP((current) => {
      const next = { ...current };
      let changed = false;

      if (shouldReplaceWithDerivedMailTarget(current.hostname, previousDerivedTargets?.hostname)) {
        if (current.hostname !== derivedMailTargets.hostname) {
          next.hostname = derivedMailTargets.hostname;
          changed = true;
        }
      }

      if (shouldReplaceWithDerivedMailTarget(current.dkimCnameTarget, previousDerivedTargets?.dkimCnameTarget)) {
        if (current.dkimCnameTarget !== derivedMailTargets.dkimCnameTarget) {
          next.dkimCnameTarget = derivedMailTargets.dkimCnameTarget;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [derivedMailTargets]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const providerKeys = flattenSectionItems(settingsQuery.data ?? [])
        .filter((item) => item.key.startsWith(CONFIG_KEY_AUTH_OAUTH_PROVIDER_PREFIX))
        .map((item) => item.key);
      const nextProviderKeys = oauthProviders.map((item) =>
        getOAuthProviderConfigKey(item.slug),
      );
      const staleProviderKeys = providerKeys.filter(
        (key) => !nextProviderKeys.includes(key),
      );

      await Promise.all([
        upsertAdminConfig(CONFIG_KEY_SITE_IDENTITY, siteIdentity),
        upsertAdminConfig(CONFIG_KEY_AUTH_REGISTRATION, registration),
        upsertAdminConfig(CONFIG_KEY_AUTH_PASSWORD, password),
        upsertAdminConfig(CONFIG_KEY_AUTH_SESSION, session),
        upsertAdminConfig(CONFIG_KEY_AUTH_OAUTH_DISPLAY, oauthDisplay),
        upsertAdminConfig(CONFIG_KEY_MAIL_SMTP, smtp),
        upsertAdminConfig(CONFIG_KEY_MAIL_DELIVERY, delivery),
        upsertAdminConfig(CONFIG_KEY_MAIL_INBOUND, inbound),
        upsertAdminConfig(CONFIG_KEY_API_LIMITS, apiLimits),
        upsertAdminConfig(CONFIG_KEY_DOMAIN_POLICY, domainPolicy),
        ...oauthProviders.map((provider) =>
          upsertAdminConfig(getOAuthProviderConfigKey(provider.slug), provider),
        ),
        ...staleProviderKeys.map((key) => deleteAdminConfig(key)),
      ]);
    },
    onSuccess: async () => {
      setFeedbackVariant("success");
      setFeedback("系统设置已保存。");
      await queryClient.invalidateQueries({
        queryKey: ["admin-settings-sections"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin-api-limits-settings"],
      });
      window.setTimeout(() => setFeedback(null), 5000);
    },
    onError: (error) => {
      setFeedbackVariant("error");
      setFeedback(getAPIErrorMessage(error, "系统设置保存失败，请稍后重试。"));
      window.setTimeout(() => setFeedback(null), 5000);
    },
  });

  const testDeliveryMutation = useMutation({
    mutationFn: async () =>
      sendAdminMailDeliveryTest({
        to: deliveryTestRecipient.trim() || delivery.fromAddress,
      }),
    onSuccess: (result) => {
      const testedAt = new Date().toISOString();
      setDeliveryTestDiagnostic({
        status: "success",
        recipient: result.recipient,
        testedAt,
        message: `测试邮件已提交到 ${result.recipient}。`,
      });
      setFeedbackVariant("success");
      setFeedback(`测试邮件已发送至 ${result.recipient}。`);
      window.setTimeout(() => setFeedback(null), 5000);
    },
    onError: (error) => {
      const recipient = deliveryTestRecipient.trim() || delivery.fromAddress;
      const diagnostic = getMailDeliveryDiagnostic(error);
      setDeliveryTestDiagnostic({
        status: "error",
        recipient,
        testedAt: new Date().toISOString(),
        diagnostic: diagnostic ?? undefined,
        message: getMailDeliveryErrorMessage(
          error,
          "测试邮件发送失败，请检查 SMTP 配置后重试。",
        ),
      });
      setFeedbackVariant("error");
      setFeedback(
        getMailDeliveryErrorMessage(
          error,
          "测试邮件发送失败，请检查 SMTP 配置后重试。",
        ),
      );
      window.setTimeout(() => setFeedback(null), 5000);
    },
  });

  const loadingText = useMemo(() => {
    if (settingsQuery.isLoading) {
      return "正在加载系统设置...";
    }
    if (saveMutation.isPending) {
      return "正在保存系统设置...";
    }
    return null;
  }, [saveMutation.isPending, settingsQuery.isLoading]);

  function handleSaveSettings() {
    const validationError = validateAdminSettingsSnapshot({
      siteIdentity,
      registration,
      password,
      session,
      smtp,
      delivery,
      inbound,
      apiLimits,
      oauthProviders,
    });
    if (validationError) {
      setFeedbackVariant("error");
      setFeedback(validationError);
      window.setTimeout(() => setFeedback(null), 5000);
      return;
    }
    saveMutation.mutate();
  }

  function handleSendDeliveryTest() {
    if (deliveryTestLockRef.current || testDeliveryMutation.isPending) {
      return;
    }
    const recipient = deliveryTestRecipient.trim() || delivery.fromAddress;
    const recipientError = validateEmailAddress(recipient);
    if (recipientError) {
      setFeedbackVariant("error");
      setFeedback(recipientError);
      window.setTimeout(() => setFeedback(null), 5000);
      return;
    }
    deliveryTestLockRef.current = true;
    testDeliveryMutation.mutate(undefined, {
      onSettled: () => {
        deliveryTestLockRef.current = false;
      },
    });
  }

  return (
    <WorkspacePage>
      <WorkspacePanel
        title="系统设置"
        description="按站点、OAuth、用户策略和其他系统项分组管理，避免整页长表单堆叠。"
        action={
          <Button
            disabled={saveMutation.isPending || settingsQuery.isLoading}
            onClick={handleSaveSettings}
          >
            {saveMutation.isPending ? "保存中..." : "保存设置"}
          </Button>
        }
      >
        <div className="space-y-4">
          {loadingText ? (
            <div className="text-sm text-muted-foreground">{loadingText}</div>
          ) : null}
          {feedback ? (
            <NoticeBanner onDismiss={() => setFeedback(null)} variant={feedbackVariant}>
              {feedback}
            </NoticeBanner>
          ) : null}
        </div>
      </WorkspacePanel>

      <Tabs defaultValue="site" className="gap-4">
        <WorkspacePanel
          title="设置分组"
          description="先选分类，再编辑对应配置；保存按钮仍然一次性提交全部当前设置。"
        >
          <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-2xl bg-muted/40 p-1.5">
            <TabsTrigger className="h-10 flex-none px-3.5" value="site">
              <Globe className="size-4" />
              网站设置
            </TabsTrigger>
            <TabsTrigger className="h-10 flex-none px-3.5" value="oauth">
              <KeyRound className="size-4" />
              OAuth 设置
            </TabsTrigger>
            <TabsTrigger className="h-10 flex-none px-3.5" value="users">
              <Users className="size-4" />
              用户设置
            </TabsTrigger>
            <TabsTrigger className="h-10 flex-none px-3.5" value="api">
              <Activity className="size-4" />
              API 设置
            </TabsTrigger>
            <TabsTrigger className="h-10 flex-none px-3.5" value="other">
              <Settings2 className="size-4" />
              其他设置
            </TabsTrigger>
          </TabsList>
        </WorkspacePanel>

        <TabsContent value="site">
          <WorkspacePanel
            title="网站设置"
            description="维护站点名称、支持邮箱、默认语言与时区等基础站点信息。"
          >
            <SiteSettingsForm
              identity={siteIdentity}
              onIdentityChange={setSiteIdentity}
            />
          </WorkspacePanel>
        </TabsContent>

        <TabsContent value="oauth">
          <WorkspacePanel
            title="OAuth 设置"
            description="管理登录页展示、OAuth 2.1 / PKCE provider 端点与客户端凭据。"
          >
            <AuthSettingsForm
              registration={registration}
              password={password}
              session={session}
              oauthDisplay={oauthDisplay}
              providers={oauthProviders}
              onRegistrationChange={setRegistration}
              onPasswordChange={setPassword}
              onSessionChange={setSession}
              onOAuthDisplayChange={setOAuthDisplay}
              onProvidersChange={setOAuthProviders}
              mode="oauth"
            />
          </WorkspacePanel>
        </TabsContent>

        <TabsContent value="users">
          <WorkspacePanel
            title="用户设置"
            description="控制注册开放、密码规则、会话策略与用户侧认证约束。"
          >
            <AuthSettingsForm
              registration={registration}
              password={password}
              session={session}
              oauthDisplay={oauthDisplay}
              providers={oauthProviders}
              onRegistrationChange={setRegistration}
              onPasswordChange={setPassword}
              onSessionChange={setSession}
              onOAuthDisplayChange={setOAuthDisplay}
              onProvidersChange={setOAuthProviders}
              mode="user"
            />
          </WorkspacePanel>
        </TabsContent>

        <TabsContent value="api">
          <WorkspacePanel
            title="API 设置"
            description="细分匿名、已认证、登录注册与邮箱写操作限流，并支持严格 IP 桶。"
          >
            <APIRuntimeStatus data={apiLimitsRuntimeQuery.data} />
            <APISettingsForm value={apiLimits} onChange={setAPILimits} />
          </WorkspacePanel>
        </TabsContent>

        <TabsContent value="other">
          <OtherSettingsTab
            smtp={smtp}
            delivery={delivery}
            inbound={inbound}
            domainPolicy={domainPolicy}
            onSMTPChange={setSMTP}
            onDeliveryChange={setDelivery}
            onInboundChange={setInbound}
            onDomainPolicyChange={setDomainPolicy}
            deliveryTestRecipient={deliveryTestRecipient}
            onDeliveryTestRecipientChange={setDeliveryTestRecipient}
            isTestPending={testDeliveryMutation.isPending}
            onSendDeliveryTest={handleSendDeliveryTest}
            deliveryTestDiagnostic={deliveryTestDiagnostic}
          />
        </TabsContent>
      </Tabs>
    </WorkspacePage>
  );
}
