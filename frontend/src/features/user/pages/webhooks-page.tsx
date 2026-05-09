
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { getAPIErrorMessage } from "@/lib/http";
import { normalizeCommaSeparatedList, validateHTTPUrl, validateRequiredText } from "@/lib/validation";
import { Link } from "react-router-dom";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspaceField,
  WorkspacePage,
  WorkspacePanel,
} from "@/components/layout/workspace-ui";
import {
  createWebhook,
  fetchWebhooks,
  toggleWebhook,
  updateWebhook,
  type WebhookItem,
} from "../api";
import { formatDateTime } from "./shared";

const defaultEvents = ["message.received", "mailbox.released"];

export function UserWebhooksPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    targetUrl: "",
    events: defaultEvents.join(", "),
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [pendingDisableItem, setPendingDisableItem] = useState<WebhookItem | null>(null);
  const webhooksQuery = useQuery({ queryKey: ["portal-webhooks"], queryFn: fetchWebhooks });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: draft.name.trim(),
        targetUrl: draft.targetUrl.trim(),
        events: normalizeCommaSeparatedList(draft.events),
      };
      if (editingId) {
        return updateWebhook(editingId, payload);
      }
      return createWebhook(payload);
    },
    onSuccess: async () => {
      setMutationError(null);
      setActionNotice(editingId ? "Webhook 已更新。" : "Webhook 已创建。");
      setDraft({ name: "", targetUrl: "", events: defaultEvents.join(", ") });
      setEditingId(null);
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["portal-webhooks"] });
      await queryClient.invalidateQueries({ queryKey: ["portal-overview"] });
    },
    onError: (error) => {
      setMutationError(
        getAPIErrorMessage(
          error,
          editingId ? "保存 Webhook 失败，请检查回调地址后重试。" : "创建 Webhook 失败，请检查回调地址后重试。",
        ),
      );
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => toggleWebhook(id, enabled),
    onSuccess: async () => {
      setActionNotice("Webhook 状态已更新。");
      await queryClient.invalidateQueries({ queryKey: ["portal-webhooks"] });
      await queryClient.invalidateQueries({ queryKey: ["portal-overview"] });
    },
    onError: (error) => {
      setMutationError(getAPIErrorMessage(error, "切换 Webhook 状态失败，请稍后重试。"));
    },
  });

  function startEdit(item: WebhookItem) {
    setMutationError(null);
    setActionNotice(null);
    setEditingId(item.id);
    setDraft({
      name: item.name,
      targetUrl: item.targetUrl,
      events: item.events.join(", "),
    });
    setDialogOpen(true);
  }

  function startCreate() {
    setMutationError(null);
    setActionNotice(null);
    setEditingId(null);
    setDraft({ name: "", targetUrl: "", events: defaultEvents.join(", ") });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const nameError = validateRequiredText("Webhook 名称", draft.name, { minLength: 2, maxLength: 80 });
    if (nameError) {
      setMutationError(nameError);
      return;
    }
    const urlError = validateHTTPUrl(draft.targetUrl);
    if (urlError) {
      setMutationError(urlError);
      return;
    }
    const normalizedEvents = normalizeCommaSeparatedList(draft.events);
    if (!normalizedEvents.length) {
      setMutationError("至少需要配置一个事件。");
      return;
    }
    setMutationError(null);
    upsertMutation.mutate();
  }

  return (
    <WorkspacePage>
      <AlertDialog
        open={pendingDisableItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDisableItem(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>停用 Webhook？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDisableItem
                ? `确认停用 Webhook ${pendingDisableItem.name}？停用后事件将不再投递到 ${pendingDisableItem.targetUrl}。`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDisableItem) {
                  return;
                }
                toggleMutation.mutate({ id: pendingDisableItem.id, enabled: false });
                setPendingDisableItem(null);
              }}
            >
              确认停用
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <WorkspacePanel
        action={<Button onClick={startCreate}>创建 Webhook</Button>}
        description="管理事件回调地址、事件范围与启停状态。"
        title="Webhook"
      >
        {mutationError ? (
          <NoticeBanner autoHideMs={5000} className="mb-4" onDismiss={() => setMutationError(null)} variant="error">
            {mutationError}
          </NoticeBanner>
        ) : null}
        {actionNotice ? (
          <NoticeBanner autoHideMs={5000} className="mb-4" onDismiss={() => setActionNotice(null)} variant="success">
            {actionNotice}
          </NoticeBanner>
        ) : null}
        <Dialog onOpenChange={setDialogOpen} open={isDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "编辑 Webhook" : "创建 Webhook"}</DialogTitle>
              <DialogDescription>
                配置回调地址与事件列表，保存后会立即更新当前 webhook 配置。
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 xl:grid-cols-2">
              <WorkspaceField label="Webhook 名称">
                <Input
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Webhook 名称"
                  value={draft.name}
                />
              </WorkspaceField>
              <WorkspaceField label="回调地址">
                <Input
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, targetUrl: event.target.value }))
                  }
                  placeholder="https://sandbox.local/webhooks/order"
                  value={draft.targetUrl}
                />
              </WorkspaceField>
              <WorkspaceField label="事件列表">
                <Input
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, events: event.target.value }))
                  }
                  placeholder="message.received, mailbox.released"
                  value={draft.events}
                />
              </WorkspaceField>
            </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
              <Button disabled={upsertMutation.isPending} onClick={handleSubmit}>
                {editingId ? "保存修改" : "创建 Webhook"}
              </Button>
              </DialogFooter>
            </DialogContent>
        </Dialog>

        {webhooksQuery.data?.length ? (
          <div className="space-y-3">
            {webhooksQuery.data.map((item) => (
              <Card className="border-border/60 bg-card/85 shadow-none" key={item.id}>
                <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{item.name}</div>
                    <p className="text-xs text-muted-foreground">{item.targetUrl}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <WorkspaceBadge>{item.enabled ? "enabled" : "disabled"}</WorkspaceBadge>
                    <span>{formatDateTime(item.updatedAt)}</span>
                    <Button onClick={() => startEdit(item)} size="sm" variant="secondary">
                      编辑
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/dashboard/webhooks/${item.id}/logs`}>日志</Link>
                    </Button>
                    <Button
                      onClick={() => {
                        if (item.enabled) {
                          setPendingDisableItem(item);
                          return;
                        }
                        toggleMutation.mutate({ id: item.id, enabled: true });
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {item.enabled ? "停用" : "启用"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <WorkspaceEmpty
            description="创建第一个回调地址后，这里会列出所有 Webhook。"
            title="还没有 Webhook"
          />
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
