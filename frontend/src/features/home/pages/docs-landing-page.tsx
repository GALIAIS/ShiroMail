import { BookOpen, Globe, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PublicBottomCta, PublicPageHero, PublicShell } from "../components/public-shell";
import { PublicChecklist, PublicFeatureCard, PublicInfoCard, PublicSection } from "../components/public-ui";
import { apiReferenceSections, runtimeCapabilities } from "../docs-reference";

const docsSections = [
  {
    title: "认证与账户",
    body: "注册、登录、OAuth、邮箱验证、密码重置和 TOTP 两步验证。",
    icon: ShieldCheck,
  },
  {
    title: "邮箱与消息",
    body: "邮箱创建、续期、释放、消息详情、附件下载与 EML 原文下载。",
    icon: Mail,
  },
  {
    title: "域名与 DNS",
    body: "根域名接入、子域名生成、服务商绑定、DNS 校验与变更应用。",
    icon: Globe,
  },
  {
    title: "API Key 与 Webhook",
    body: "用户 API Key、域名绑定策略、Webhook 配置与控制台补充接口。",
    icon: KeyRound,
  },
  {
    title: "控制台文档",
    body: "普通用户与管理员共用一套数据源，文档中心内容可在后台实时维护。",
    icon: BookOpen,
  },
];

export function DocsLandingPage() {
  const { t } = useTranslation();

  return (
    <PublicShell>
      <PublicPageHero
        eyebrow="Docs"
        title="公开文档与 API 文档都按当前代码和接口整理"
        description="这里汇总核心能力与接口分组。"
      />

      <PublicSection
        description="先看能力边界，再按接口分组进入接入实现。"
        title="当前可用能力"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {docsSections.map((section) => (
            <PublicFeatureCard description={section.body} icon={section.icon} key={section.title} title={section.title} />
          ))}
        </div>
      </PublicSection>

      <PublicInfoCard
        description="以下能力均对应实际页面或接口。"
        title="运行时范围"
      >
        <PublicChecklist items={runtimeCapabilities} marker="index" />
      </PublicInfoCard>

      <PublicInfoCard
        description={t("docsLanding.llmCompanion.description")}
        title={t("docsLanding.llmCompanion.title")}
      >
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            {t("docsLanding.llmCompanion.fileIntro")} <code>/llm.txt</code>
            <br />
            {t("docsLanding.llmCompanion.fileNote")}
          </p>
          <p>
            {t("docsLanding.llmCompanion.summary")}
            <br />
            {t("docsLanding.llmCompanion.summaryNote")}
          </p>
          <a
            className="inline-flex items-center rounded-lg border border-border/60 bg-card px-3 py-2 font-medium text-foreground transition hover:border-border hover:bg-accent"
            href="/llm.txt"
            rel="noreferrer"
            target="_blank"
          >
            {t("docsLanding.llmCompanion.open")}
          </a>
        </div>
      </PublicInfoCard>

      <PublicSection
        description="接口路径、鉴权方式和作用都来自当前后端路由注册。"
        title="API 参考"
      >
        <div className="space-y-4">
          {apiReferenceSections.map((section) => (
            <div className="rounded-xl border border-border/60 bg-card/92 p-4" key={section.title}>
              <div className="space-y-1">
                <h2 className="text-base font-semibold tracking-tight">{section.title}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{section.description}</p>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="border-b border-border/60 px-3 py-2">Method</th>
                      <th className="border-b border-border/60 px-3 py-2">Path</th>
                      <th className="border-b border-border/60 px-3 py-2">鉴权</th>
                      <th className="border-b border-border/60 px-3 py-2">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.endpoints.map((endpoint) => (
                      <tr className="align-top" key={`${endpoint.method}-${endpoint.path}`}>
                        <td className="border-b border-border/40 px-3 py-3 font-medium">{endpoint.method}</td>
                        <td className="border-b border-border/40 px-3 py-3 font-mono text-xs">{endpoint.path}</td>
                        <td className="border-b border-border/40 px-3 py-3">{endpoint.auth}</td>
                        <td className="border-b border-border/40 px-3 py-3 text-muted-foreground">{endpoint.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </PublicSection>

      <PublicBottomCta />
    </PublicShell>
  );
}
