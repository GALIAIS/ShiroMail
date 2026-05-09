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
import { deleteAdminUser, fetchAdminUsers, getExportUsersURL, updateAdminUser, type AdminUser } from "../api";

const ROLE_OPTIONS = ["user", "admin"] as const;
const STATUS_OPTIONS = [
  { value: "active", label: "正常" },
  { value: "pending_verification", label: "待验证" },
  { value: "disabled", label: "停用" },
] as const;

const ADMIN_USERS_PAGE_SIZE = 10;

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
  const [usersPage, setUsersPage] = useState(1);
  const { confirm, ConfirmDialog } = useConfirm();
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
    () => paginateItems(users, usersPage, ADMIN_USERS_PAGE_SIZE),
    [users, usersPage],
  );

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
      queryClient.setQueryData<AdminUser[]>(["admin-users"], (current) =>
        (current ?? []).filter((user) => user.id !== userId),
      );
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) => {
      setFeedback(getAPIErrorMessage(error, "删除用户失败，请先清理该用户的邮箱、域名或服务商资源。"));
    },
  });

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
            {paginatedUsers.items.map((user) => {
              const isCurrentUser = user.id === currentUserId;
              return (
                <WorkspaceListRow
                  description={`${user.email} · ${user.status}${user.emailVerified ? " · 已验证" : " · 未验证"}`}
                  key={user.id}
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
              );
            })}
            <PaginationControls
              itemLabel="用户"
              onPageChange={setUsersPage}
              page={paginatedUsers.page}
              pageSize={ADMIN_USERS_PAGE_SIZE}
              total={paginatedUsers.total}
              totalPages={paginatedUsers.totalPages}
            />
          </div>
        ) : (
          <WorkspaceEmpty description="当前还没有可管理用户。" title="暂无用户" />
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
