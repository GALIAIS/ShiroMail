import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { showError, showSuccess } from "@/lib/toast";
import { batchDeleteMessages, batchMarkRead } from "../api";
import type { MailboxMessageSummary } from "../api";

type MessagesQueryData = MailboxMessageSummary[] | undefined;

export function useMessageMutations(mailboxId: number | null, searchQuery: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const messagesQueryKey = ["mailbox-messages", mailboxId, searchQuery];

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => batchDeleteMessages(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: messagesQueryKey });
      const previous = queryClient.getQueryData<MessagesQueryData>(messagesQueryKey);
      queryClient.setQueryData<MessagesQueryData>(messagesQueryKey, (old) => {
        if (!old) return old;
        return old.filter((msg) => !ids.includes(msg.id));
      });
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData(messagesQueryKey, context.previous);
      }
      showError(t("bulk.deleteFailed"));
    },
    onSuccess: (_data, ids) => {
      showSuccess(t("bulk.deleteSuccess", { count: ids.length }));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["mailbox-messages"] });
      void queryClient.invalidateQueries({ queryKey: ["user-dashboard"] });
    },
  });

  const batchMarkReadMutation = useMutation({
    mutationFn: ({ ids, read }: { ids: number[]; read: boolean }) => batchMarkRead(ids, read),
    onMutate: async ({ ids, read }) => {
      await queryClient.cancelQueries({ queryKey: messagesQueryKey });
      const previous = queryClient.getQueryData<MessagesQueryData>(messagesQueryKey);
      queryClient.setQueryData<MessagesQueryData>(messagesQueryKey, (old) => {
        if (!old) return old;
        return old.map((msg) => (ids.includes(msg.id) ? { ...msg, isRead: read } : msg));
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(messagesQueryKey, context.previous);
      }
      showError(t("bulk.markReadFailed"));
    },
    onSuccess: (_data, { ids, read }) => {
      if (read) {
        showSuccess(t("bulk.markReadSuccess", { count: ids.length }));
      } else {
        showSuccess(t("bulk.markUnreadSuccess", { count: ids.length }));
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["mailbox-messages"] });
      void queryClient.invalidateQueries({ queryKey: ["user-dashboard"] });
    },
  });

  return { batchDeleteMutation, batchMarkReadMutation };
}
