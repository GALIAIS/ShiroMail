
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "@/hooks/use-confirm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { validateHTTPUrl, validateRequiredText } from "@/lib/validation";
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
  testWebhook,
  toggleWebhook,
  updateWebhook,
  type WebhookItem,
} from "../api";
import { formatDateTime } from "./shared";

const SUPPORTED_EVENTS = [
  "new_message",
  "message_read",
  "message_deleted",
  "mailbox_created",
] as const;

export function UserWebhooksPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    targetUrl: "",
    events: [...SUPPORTED_EVENTS] as string[],
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();
  const webhooksQuery = useQuery({ queryKey: ["portal-webhooks"], queryFn: fetchWebhooks });

  const allEventsSelected = SUPPORTED_EVENTS.every((e) => draft.events.includes(e));

  function toggleEvent(event: string, checked: boolean) {
    setDraft((current) => {
      const next = checked
        ? [...current.events, event]
        : current.events.filter((e) => e !== event);
      return { ...current, events: next };
    });
  }

  function toggleAllEvents(checked: boolean) {
    setDraft((current) => ({
      ...current,
      events: checked ? [...SUPPORTED_EVENTS] : [],
    }));
  }

  const upsertMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: draft.name.trim(),
        targetUrl: draft.targetUrl.trim(),
        events: draft.events,
      };
      if (editingId) {
        return updateWebhook(editingId, payload);
      }
      return createWebhook(payload);
    },
    onSuccess: async () => {
      setMutationError(null);
      setActionNotice(editingId ? t("webhooks.updated") : t("webhooks.created"));
      setDraft({ name: "", targetUrl: "", events: [...SUPPORTED_EVENTS] });
      setEditingId(null);
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["portal-webhooks"] });
      await queryClient.invalidateQueries({ queryKey: ["portal-overview"] });
    },
    onError: (error) => {
      setMutationError(
        getAPIErrorMessage(error, t("webhooks.saveFailed")),
      );
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => toggleWebhook(id, enabled),
    onSuccess: async () => {
      setActionNotice(t("webhooks.statusUpdated"));
      await queryClient.invalidateQueries({ queryKey: ["portal-webhooks"] });
      await queryClient.invalidateQueries({ queryKey: ["portal-overview"] });
    },
    onError: (error) => {
      setMutationError(getAPIErrorMessage(error, t("webhooks.toggleFailed")));
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: number) => testWebhook(id),
    onSuccess: (result) => {
      if (result.success) {
        setActionNotice(t("webhooks.testSuccess", { status: result.responseStatus, ms: result.latencyMs }));
      } else {
        const detail = result.errorMessage || `${result.responseStatus}`;
        setMutationError(t("webhooks.testFailed", { detail }));
      }
    },
    onError: (error) => {
      setMutationError(getAPIErrorMessage(error, t("webhooks.testError")));
    },
  });

  function startEdit(item: WebhookItem) {
    setMutationError(null);
    setActionNotice(null);
    setEditingId(item.id);
    setDraft({
      name: item.name,
      targetUrl: item.targetUrl,
      events: item.events.length ? [...item.events] : [...SUPPORTED_EVENTS],
    });
    setDialogOpen(true);
  }

  function startCreate() {
    setMutationError(null);
    setActionNotice(null);
    setEditingId(null);
    setDraft({ name: "", targetUrl: "", events: [...SUPPORTED_EVENTS] });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const nameError = validateRequiredText(t("webhooks.nameLabel"), draft.name, { minLength: 2, maxLength: 80 });
    if (nameError) {
      setMutationError(nameError);
      return;
    }
    const urlError = validateHTTPUrl(draft.targetUrl);
    if (urlError) {
      setMutationError(urlError);
      return;
    }
    if (!draft.events.length) {
      setMutationError(t("webhooks.eventsRequired"));
      return;
    }
    setMutationError(null);
    upsertMutation.mutate();
  }

  return (
    <WorkspacePage>
      {ConfirmDialog}
      <WorkspacePanel
        action={<Button onClick={startCreate}>{t("webhooks.createBtn")}</Button>}
        description={t("webhooks.panelDescription")}
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
              <DialogTitle>{editingId ? t("webhooks.editTitle") : t("webhooks.createTitle")}</DialogTitle>
              <DialogDescription>
                {t("webhooks.dialogDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 xl:grid-cols-2">
              <WorkspaceField label={t("webhooks.nameLabel")}>
                <Input
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder={t("webhooks.namePlaceholder")}
                  value={draft.name}
                />
              </WorkspaceField>
              <WorkspaceField label={t("webhooks.urlLabel")}>
                <Input
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, targetUrl: event.target.value }))
                  }
                  placeholder="https://sandbox.local/webhooks/order"
                  value={draft.targetUrl}
                />
              </WorkspaceField>
            </div>

            <WorkspaceField label={t("webhooks.eventsLabel")}>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={allEventsSelected}
                    onCheckedChange={(checked) => toggleAllEvents(!!checked)}
                  />
                  <span className="font-medium">{t("webhooks.allEvents")}</span>
                </label>
                <div className="ml-1 grid gap-2 sm:grid-cols-2">
                  {SUPPORTED_EVENTS.map((event) => (
                    <label className="flex items-center gap-2 text-sm" key={event}>
                      <Checkbox
                        checked={draft.events.includes(event)}
                        onCheckedChange={(checked) => toggleEvent(event, !!checked)}
                      />
                      <span>{t(`webhooks.event_${event}`)}</span>
                    </label>
                  ))}
                </div>
              </div>
            </WorkspaceField>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t("webhooks.cancel")}</Button>
                </DialogClose>
              <Button disabled={upsertMutation.isPending} onClick={handleSubmit}>
                {editingId ? t("webhooks.saveBtn") : t("webhooks.createBtn")}
              </Button>
              </DialogFooter>
            </DialogContent>
        </Dialog>

        {webhooksQuery.data?.length ? (
          <div className="space-y-3">
            {webhooksQuery.data.map((item) => (
              <Card className="border-border/60 bg-card/85 shadow-none" key={item.id}>
                <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1.5">
                    <div className="text-sm font-medium">{item.name}</div>
                    <p className="text-xs text-muted-foreground">{item.targetUrl}</p>
                    <div className="flex flex-wrap gap-1">
                      {item.events.map((ev) => (
                        <WorkspaceBadge key={ev}>{t(`webhooks.event_${ev}`, ev)}</WorkspaceBadge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <WorkspaceBadge>{item.enabled ? "enabled" : "disabled"}</WorkspaceBadge>
                    <span>{formatDateTime(item.updatedAt)}</span>
                    <Button onClick={() => startEdit(item)} size="sm" variant="secondary">
                      {t("webhooks.editBtn")}
                    </Button>
                    <Button
                      disabled={testMutation.isPending}
                      onClick={() => testMutation.mutate(item.id)}
                      size="sm"
                      variant="secondary"
                    >
                      {testMutation.isPending && testMutation.variables === item.id ? t("webhooks.testing") : t("webhooks.testBtn")}
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/dashboard/webhooks/${item.id}/logs`}>{t("webhooks.logsBtn")}</Link>
                    </Button>
                    <Button
                      onClick={async () => {
                        if (item.enabled) {
                          const confirmed = await confirm({
                            title: t("webhooks.disableConfirmTitle"),
                            description: t("webhooks.disableConfirmDescription", { name: item.name, url: item.targetUrl }),
                            confirmLabel: t("webhooks.disableConfirmLabel"),
                            cancelLabel: t("webhooks.cancel"),
                            variant: "warning",
                          });
                          if (confirmed) {
                            toggleMutation.mutate({ id: item.id, enabled: false });
                          }
                          return;
                        }
                        toggleMutation.mutate({ id: item.id, enabled: true });
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {item.enabled ? t("webhooks.disableBtn") : t("webhooks.enableBtn")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <WorkspaceEmpty
            description={t("webhooks.emptyDescription")}
            title={t("webhooks.emptyTitle")}
          />
        )}
      </WorkspacePanel>

      <WebhookSignatureDocs />
    </WorkspacePage>
  );
}

const nodeExample = `const crypto = require('crypto');

function verifyWebhookSignature(body, secret, signatureHeader) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  const received = signatureHeader.replace('sha256=', '');
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(received, 'hex')
  );
}`;

const pythonExample = `import hmac
import hashlib

def verify_webhook_signature(body: bytes, secret: str, signature_header: str) -> bool:
    expected = hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    received = signature_header.removeprefix("sha256=")
    return hmac.compare_digest(expected, received)`;

const goExample = `package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "strings"
)

func VerifyWebhookSignature(body []byte, secret, signatureHeader string) bool {
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(body)
    expected := hex.EncodeToString(mac.Sum(nil))
    received := strings.TrimPrefix(signatureHeader, "sha256=")
    return hmac.Equal([]byte(expected), []byte(received))
}`;

function WebhookSignatureDocs() {
  const { t } = useTranslation();

  return (
    <Card className="border-border/60 bg-card/85 shadow-none">
      <CardContent className="py-4">
        <Accordion type="single" collapsible>
          <AccordionItem value="signature-docs" className="border-none">
            <AccordionTrigger className="py-2 text-sm font-semibold hover:no-underline">
              {t("webhooks.signatureDocsTitle")}
            </AccordionTrigger>
            <AccordionContent className="space-y-4 text-sm">
              <p>{t("webhooks.signatureDocsDescription")}</p>

              <div>
                <h4 className="mb-1 font-medium text-foreground">
                  {t("webhooks.signatureDocsHeader")}
                </h4>
                <p>{t("webhooks.signatureDocsHeaderDetail")}</p>
              </div>

              <div>
                <h4 className="mb-1 font-medium text-foreground">
                  {t("webhooks.signatureDocsSteps")}
                </h4>
                <ul className="list-none space-y-1 pl-0">
                  <li>{t("webhooks.signatureDocsStep1")}</li>
                  <li>{t("webhooks.signatureDocsStep2")}</li>
                  <li>{t("webhooks.signatureDocsStep3")}</li>
                  <li>{t("webhooks.signatureDocsStep4")}</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-foreground">
                  {t("webhooks.signatureDocsNodeTitle")}
                </h4>
                <pre className="overflow-x-auto rounded-lg bg-muted/60 p-3 text-xs">
                  <code>{nodeExample}</code>
                </pre>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-foreground">
                  {t("webhooks.signatureDocsPythonTitle")}
                </h4>
                <pre className="overflow-x-auto rounded-lg bg-muted/60 p-3 text-xs">
                  <code>{pythonExample}</code>
                </pre>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-foreground">
                  {t("webhooks.signatureDocsGoTitle")}
                </h4>
                <pre className="overflow-x-auto rounded-lg bg-muted/60 p-3 text-xs">
                  <code>{goExample}</code>
                </pre>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
