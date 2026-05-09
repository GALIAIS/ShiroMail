import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, KeyRound, Mail, ScrollText, Webhook } from "lucide-react";
import {
  WorkspaceEmpty,
  WorkspaceListRow,
  WorkspacePage,
  WorkspacePanel,
} from "@/components/layout/workspace-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchAdminUserDetail } from "../api";
import { formatDateTime } from "../../user/pages/shared";

export function AdminUserDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const userId = Number(id);

  const detailQuery = useQuery({
    queryKey: ["admin-user-detail", userId],
    queryFn: () => fetchAdminUserDetail(userId),
    enabled: userId > 0,
  });

  const user = detailQuery.data;

  if (!userId || userId <= 0) {
    return (
      <WorkspacePage>
        <WorkspacePanel title={t("userDetail.title")}>
          <WorkspaceEmpty
            description={t("userDetail.invalidId")}
            title={t("userDetail.notFound")}
          />
        </WorkspacePanel>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <WorkspacePanel
        action={
          <Button onClick={() => navigate("/admin/users")} size="sm" variant="outline">
            <ArrowLeft className="mr-1 size-3.5" />
            {t("userDetail.back")}
          </Button>
        }
        description={user ? `${user.email} · ${user.status}` : ""}
        title={user?.username ?? t("userDetail.loading")}
      >
        {user ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {user.roles.map((role) => (
                <Badge className="rounded-full" key={role} variant="outline">
                  {role}
                </Badge>
              ))}
              <Badge
                className="rounded-full"
                variant={user.status === "active" ? "default" : "destructive"}
              >
                {user.status}
              </Badge>
              {user.emailVerified ? (
                <Badge className="rounded-full" variant="outline">
                  {t("userDetail.verified")}
                </Badge>
              ) : null}
            </div>

            <Tabs className="mt-6" defaultValue="mailboxes">
              <TabsList>
                <TabsTrigger value="mailboxes">
                  <Mail className="mr-1 size-3.5" />
                  {t("userDetail.tabs.mailboxes")} ({user.mailboxes.length})
                </TabsTrigger>
                <TabsTrigger value="webhooks">
                  <Webhook className="mr-1 size-3.5" />
                  {t("userDetail.tabs.webhooks")} ({user.webhooks.length})
                </TabsTrigger>
                <TabsTrigger value="apiKeys">
                  <KeyRound className="mr-1 size-3.5" />
                  {t("userDetail.tabs.apiKeys")} ({user.apiKeys.length})
                </TabsTrigger>
                <TabsTrigger value="activity">
                  <ScrollText className="mr-1 size-3.5" />
                  {t("userDetail.tabs.activity")} ({user.auditLog.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent className="mt-4 space-y-3" value="mailboxes">
                {user.mailboxes.length > 0 ? (
                  user.mailboxes.map((mb) => (
                    <WorkspaceListRow
                      description={`${mb.domain} · ${mb.status} · ${t("userDetail.expires")} ${formatDateTime(mb.expiresAt)}`}
                      key={mb.id}
                      meta={
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(mb.createdAt)}
                        </span>
                      }
                      title={mb.address}
                    />
                  ))
                ) : (
                  <WorkspaceEmpty
                    description={t("userDetail.noMailboxes")}
                    title={t("userDetail.emptyMailboxes")}
                  />
                )}
              </TabsContent>

              <TabsContent className="mt-4 space-y-3" value="webhooks">
                {user.webhooks.length > 0 ? (
                  user.webhooks.map((wh) => (
                    <WorkspaceListRow
                      description={`${wh.targetUrl} · ${wh.events.join(", ")}`}
                      key={wh.id}
                      meta={
                        <Badge className="rounded-full" variant={wh.enabled ? "default" : "outline"}>
                          {wh.enabled ? t("userDetail.enabled") : t("userDetail.disabled")}
                        </Badge>
                      }
                      title={wh.name}
                    />
                  ))
                ) : (
                  <WorkspaceEmpty
                    description={t("userDetail.noWebhooks")}
                    title={t("userDetail.emptyWebhooks")}
                  />
                )}
              </TabsContent>

              <TabsContent className="mt-4 space-y-3" value="apiKeys">
                {user.apiKeys.length > 0 ? (
                  user.apiKeys.map((key) => (
                    <WorkspaceListRow
                      description={`${key.keyPreview} · ${key.scopes.join(", ") || t("userDetail.noScopes")}`}
                      key={key.id}
                      meta={
                        <Badge
                          className="rounded-full"
                          variant={key.status === "active" ? "default" : "outline"}
                        >
                          {key.status}
                        </Badge>
                      }
                      title={key.name}
                    />
                  ))
                ) : (
                  <WorkspaceEmpty
                    description={t("userDetail.noApiKeys")}
                    title={t("userDetail.emptyApiKeys")}
                  />
                )}
              </TabsContent>

              <TabsContent className="mt-4 space-y-3" value="activity">
                {user.auditLog.length > 0 ? (
                  user.auditLog.map((entry) => (
                    <WorkspaceListRow
                      description={`${entry.resourceType}/${entry.resourceId}`}
                      key={entry.id}
                      meta={
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(entry.createdAt)}
                        </span>
                      }
                      title={entry.action}
                    />
                  ))
                ) : (
                  <WorkspaceEmpty
                    description={t("userDetail.noActivity")}
                    title={t("userDetail.emptyActivity")}
                  />
                )}
              </TabsContent>
            </Tabs>
          </>
        ) : detailQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : (
          <WorkspaceEmpty
            description={t("userDetail.loadError")}
            title={t("userDetail.notFound")}
          />
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
