import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/lib/auth-store";
import { useConfirm } from "@/hooks/use-confirm";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  WorkspaceEmpty,
  WorkspaceField,
  WorkspaceListRow,
  WorkspaceMetric,
  WorkspacePage,
  WorkspacePanel,
} from "@/components/layout/workspace-ui";
import { getAPIErrorMessage } from "@/lib/http";
import { paginateItems } from "@/lib/pagination";
import { useURLPagination } from "@/hooks/use-url-pagination";
import {
  batchAdminUserAction,
  deleteAdminUser,
  fetchAdminUsers,
  getExportUsersURL,
  updateAdminUser,
  type AdminUser,
} from "../api";

const ROLE_OPTIONS = ["user", "admin"] as const;
const STATUS_OPTIONS = [
  { value: "active", label: "正常" },
  { value: "pending_verification", label: "待验证" },
  { value: "disabled", label: "停用" },
] as const;

const ADMIN_USERS_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50];

type UserEditForm = {
  username: string;
  email: string;
  status: string;
  emailVerified: boolean;
  roles: string[];
  newPassword: string;
};

function buildEditForm(user: AdminUser): UserEditForm {
  return {
    username: user.username,
    email: user.email,
    status: user.status || "active",
    emailVerified: user.emailVerified,
    roles: [...user.roles].sort(),
    newPassword: "",
  };
}

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentUserId = useAuthStore((state) => state.user?.userId ?? null);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const { confirm, ConfirmDialog } = useConfirm();
  const { page: usersPage, pageSize: usersPageSize, setPage: setUsersPage, setPageSize: setUsersPageSize } = useURLPagination({
    defaultPage: 1,
    defaultPageSize: ADMIN_USERS_PAGE_SIZE,
  });
  const [formState, setFormState] = useState<UserEditForm>({
    username: "",
    email: "",
    status: "active",
    emailVerified: false,
    roles: [],
    newPassword: "",
  });

  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: fetchAdminUsers });
  const users = usersQuery.data ?? [];
  const adminCount = users.filter((user) => user.roles.includes("admin")).length;
  const mailboxCount = users.reduce((sum, user) => sum + user.mailboxes, 0);
  const paginatedUsers = useMemo(
    () => paginateItems(users, usersPage, usersPageSize),
    [users, usersPage, usersPageSize],
  );

  // Batch selection helpers
  const pageUserIds = paginatedUsers.items.map((u) => u.id);
  const selectablePageIds = pageUserIds.filter((id) => id !== currentUserId);
  const allPageSelected = selectablePageIds.length > 0 && selectablePageIds.every((id) => selectedIds.has(id));
  const somePageSelected = selectablePageIds.some((id) => selectedIds.has(id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of selectablePageIds) next.delete(id);
      } else {
        for (const id of selectablePageIds) next.add(id);
      }
      return next;
    });
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, input }: { userId: number; input: UserEditForm }) =>
      updateAdminUser(userId, {
        username: input.username.trim(),
        email: input.email.trim(),
        status: input.status,
        emailVerified: input.emailVerified,
        roles: [...input.roles].sort(),
        newPassword: input.newPassword.trim() || undefined,
      }),
    onSuccess: async () => {
      setFeedback("用户信息已更新。");
      setDialogOpen(false);
      setSelectedUser(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) => {
      setFeedback(getAPIErrorMessage(error, "保存用户失败，请稍后重试。"));
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => deleteAdminUser(userId),
    onSuccess: async (_result, userId) => {
      setFeedback("用户已删除。");
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(userId); return next; });
      queryClient.setQueryData<AdminUser[]>(["admin-users"], (current) =>
        (current ?? []).filter((user) => user.id !== userId),
      );
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) => {
      setFeedback(getAPIErrorMessage(error, "删除用户失败，请先清理该用户的邮箱、域名或服务商资源。"));
    },
  });

  const batchMutation = useMutation({
    mutationFn: ({ ids, action }: { ids: number[]; action: "ban" | "unban" | "delete" }) =>
      batchAdminUserAction(ids, action),
    onSuccess: async (result) => {
      const successCount = result.succeeded.length;
      const failCount = result.failed.length;
      if (failCount === 0) {
        setFeedback(`批量操作完成，${successCount} 个用户已处理。`);
      } else {
        const reasons = result.failed.slice(0, 3).map((f) => f.message).join("; ");
        setFeedback(`${successCount} 个成功，${failCount} 个失败: ${reasons}`);
      }
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) => {
      setFeedback(getAPIErrorMessage(error, "批量操作失败，请稍后重试。"));
    },
  });

  async function handleBatchAction(action: "ban" | "unban" | "delete") {
    const ids = [...selectedIds];
    const labels: Record<string, string> = { ban: "封禁", unban: "解封", delete: "删除" };
    const confirmed = await confirm({
      title: `批量${labels[action]} ${ids.length} 个用户？`,
      description: action === "delete"
        ? "删除操作不可撤销，仍绑定资源的用户将跳过。"
        : `将对选中的 ${ids.length} 个用户执行${labels[action]}操作。`,
      confirmLabel: `确认${labels[action]}`,
      cancelLabel: "取消",
      variant: action === "delete" ? "danger" : "default",
    });
    if (confirmed) {
      setFeedback(null);
      batchMutation.mutate({ ids, action });
    }
  }

  function openEditDialog(user: AdminUser) {
    setSelectedUser(user);
    setFormState(buildEditForm(user));
    setDialogOpen(true);
  }

  const selectedUserIsCurrent = selectedUser?.id === currentUserId;

  return (
    <WorkspacePage>
      <WorkspacePanel
        action={
          <Button
            onClick={() => {
              const token = useAuthStore.getState().accessToken;
              const url = `${getExportUsersURL()}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
              window.open(url, "_blank");
            }}
            size="sm"
            variant="outline"
          >
            导出 CSV
          </Button>
        }
        description="查看账号状态、修改绑定信息，并支持管理员编辑或删除用户。"
        title="用户管理"
      >
        {feedback ? (
          <div className="rounded-xl border border-border/60 bg-muted/10 px-4 py-3 text-sm">{feedback}</div>
        ) : null}
        <Dialog
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setSelectedUser(null);
            }
          }}
          open={isDialogOpen}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>编辑用户</DialogTitle>
              <DialogDescription>修改账号基础资料、角色和验证状态；密码留空则保持不变。</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <WorkspaceField label="用户名">
                  <Input
                    onChange={(event) =>
                      setFormState((current) => ({ ...current, username: event.target.value }))
                    }
                    value={formState.username}
                  />
                </WorkspaceField>
                <WorkspaceField label="绑定邮箱">
                  <Input
                    onChange={(event) =>
                      setFormState((current) => ({ ...current, email: event.target.value }))
                    }
                    value={formState.email}
                  />
                </WorkspaceField>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <WorkspaceField label="账号状态">
                  <div className="grid gap-2 rounded-xl border border-border/60 bg-card px-4 py-4">
                    {STATUS_OPTIONS.map((item) => {
                      const statusId = `admin-user-status-${item.value}`;
                      return (
                        <label className="flex items-center gap-2 text-sm" htmlFor={statusId} key={item.value}>
                          <input
                            checked={formState.status === item.value}
                            className="size-4"
                            id={statusId}
                            name="admin-user-status"
                            onChange={() =>
                              setFormState((current) => ({ ...current, status: item.value }))
                            }
                            type="radio"
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </WorkspaceField>

                <WorkspaceField label="验证与密码">
                  <div className="space-y-3 rounded-xl border border-border/60 bg-card px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={formState.emailVerified}
                        id="admin-user-email-verified"
                        onCheckedChange={(checked) =>
                          setFormState((current) => ({
                            ...current,
                            emailVerified: checked === true,
                          }))
                        }
                      />
                      <Label htmlFor="admin-user-email-verified">邮箱已验证</Label>
                    </div>
                    <Input
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, newPassword: event.target.value }))
                      }
                      placeholder="输入新密码以覆盖"
                      type="password"
                      value={formState.newPassword}
                    />
                  </div>
                </WorkspaceField>
              </div>

              <WorkspaceField label="角色">
                <div className="grid gap-3 rounded-xl border border-border/60 bg-card px-4 py-4">
                  {ROLE_OPTIONS.map((role) => {
                    const checkboxId = `admin-user-role-${role}`;
                    return (
                      <div className="flex items-center gap-2" key={role}>
                        <Checkbox
                          aria-label={role}
                          checked={formState.roles.includes(role)}
                          disabled={selectedUserIsCurrent && role === "admin"}
                          id={checkboxId}
                          onCheckedChange={(checked) =>
                            setFormState((current) => ({
                              ...current,
                              roles:
                                checked === true
                                  ? [...new Set([...current.roles, role])].sort()
                                  : current.roles.filter((item) => item !== role),
                            }))
                          }
                        />
                        <Label className="text-sm" htmlFor={checkboxId}>
                          {role}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </WorkspaceField>
            </div>

            <DialogFooter>
              <Button onClick={() => setDialogOpen(false)} variant="outline">
                取消
              </Button>
              <Button
                disabled={!selectedUser || formState.roles.length === 0 || updateUserMutation.isPending}
                onClick={() => {
                  setFeedback(null);
                  selectedUser &&
                    updateUserMutation.mutate({
                      userId: selectedUser.id,
                      input: formState,
                    });
                }}
              >
                {updateUserMutation.isPending ? "保存中..." : "保存修改"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {ConfirmDialog}

        <div className="grid gap-4 md:grid-cols-3">
          <WorkspaceMetric hint="后台可见全部账号" label="用户总数" value={users.length} />
          <WorkspaceMetric hint="含 admin 角色的账号数量" label="管理员" value={adminCount} />
          <WorkspaceMetric hint="全部用户下的邮箱实例汇总" label="邮箱总量" value={mailboxCount} />
        </div>

        {users.length ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-1">
              <Checkbox
                aria-label="全选当前页"
                checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-xs text-muted-foreground">
                {selectedIds.size > 0 ? `已选 ${selectedIds.size} 个用户` : "全选当前页"}
              </span>
            </div>
            {paginatedUsers.items.map((user) => {
              const isCurrentUser = user.id === currentUserId;
              return (
                <div className="flex items-start gap-3" key={user.id}>
                  <div className="pt-4">
                    <Checkbox
                      aria-label={`选择 ${user.username}`}
                      checked={selectedIds.has(user.id)}
                      disabled={isCurrentUser}
                      onCheckedChange={() => toggleSelect(user.id)}
                    />
                  </div>
                  <div className="flex-1">
                    <WorkspaceListRow
                      description={`${user.email} · ${user.status}${user.emailVerified ? " · 已验证" : " · 未验证"}`}
                      meta={
                        <>
                          <span className="rounded-full border border-border/60 px-2 py-1">{user.roles.join(", ")}</span>
                          <span>{user.mailboxes} 个邮箱</span>
                          <Button onClick={() => navigate(`/admin/users/${user.id}`)} size="sm" variant="ghost">
                            查看
                          </Button>
                          <Button onClick={() => openEditDialog(user)} size="sm" variant="outline">
                            编辑
                          </Button>
                          <Button
                            disabled={isCurrentUser}
                            onClick={async () => {
                              const confirmed = await confirm({
                                title: "删除用户？",
                                description: `确认删除用户 ${user.username}？如果该用户仍绑定邮箱、域名或服务商资源，后端会阻止这次删除。`,
                                confirmLabel: "确认删除",
                                cancelLabel: "取消",
                                variant: "danger",
                              });
                              if (confirmed) {
                                setFeedback(null);
                                deleteUserMutation.mutate(user.id);
                              }
                            }}
                            size="sm"
                            variant="destructive"
                          >
                            删除
                          </Button>
                        </>
                      }
                      title={user.username}
                    />
                  </div>
                </div>
              );
            })}
            <PaginationControls
              itemLabel="用户"
              onPageChange={setUsersPage}
              onPageSizeChange={setUsersPageSize}
              page={paginatedUsers.page}
              pageSize={usersPageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              showPageSizeSelector
              total={paginatedUsers.total}
              totalPages={paginatedUsers.totalPages}
            />
          </div>
        ) : (
          <WorkspaceEmpty description="当前还没有可管理用户。" title="暂无用户" />
        )}

        {selectedIds.size > 0 && (
          <div className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit items-center gap-3 rounded-xl border border-border/60 bg-card px-5 py-3 shadow-lg">
            <span className="text-sm font-medium">已选 {selectedIds.size} 个用户</span>
            <Button
              disabled={batchMutation.isPending}
              onClick={() => handleBatchAction("ban")}
              size="sm"
              variant="outline"
            >
              封禁
            </Button>
            <Button
              disabled={batchMutation.isPending}
              onClick={() => handleBatchAction("unban")}
              size="sm"
              variant="outline"
            >
              解封
            </Button>
            <Button
              disabled={batchMutation.isPending}
              onClick={() => handleBatchAction("delete")}
              size="sm"
              variant="destructive"
            >
              删除
            </Button>
            <Button
              onClick={() => setSelectedIds(new Set())}
              size="sm"
              variant="ghost"
            >
              取消选择
            </Button>
          </div>
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
