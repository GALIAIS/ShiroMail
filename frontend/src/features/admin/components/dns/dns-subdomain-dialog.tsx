import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { OptionCombobox } from "@/components/ui/option-combobox";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceField } from "@/components/layout/workspace-ui";
import type { DomainOption } from "../../../user/api";

type DnsSubdomainDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootDomains: DomainOption[];
  selectedBaseDomainId: number | "";
  onSelectedBaseDomainIdChange: (value: number | "") => void;
  prefixInput: string;
  onPrefixInputChange: (value: string) => void;
  mutationError: string | null;
  onDismissError: () => void;
  isPending: boolean;
  onSubmit: () => void;
};

export function DnsSubdomainDialog({
  open,
  onOpenChange,
  rootDomains,
  selectedBaseDomainId,
  onSelectedBaseDomainIdChange,
  prefixInput,
  onPrefixInputChange,
  mutationError,
  onDismissError,
  isPending,
  onSubmit,
}: DnsSubdomainDialogProps) {
  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (nextOpen) {
          onDismissError();
        }
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>批量生成子域名</DialogTitle>
          <DialogDescription>
            从现有根域批量生成子域前缀，适合统一下发 MX、relay、edge 等记录入口。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <WorkspaceField label="选择根域名">
            <OptionCombobox
              ariaLabel="选择根域名"
              emptyLabel="没有匹配根域名"
              onValueChange={(value) =>
                onSelectedBaseDomainIdChange(value ? Number(value) : "")
              }
              options={rootDomains.map((item) => ({
                value: String(item.id),
                label: item.domain,
                keywords: [item.rootDomain],
              }))}
              placeholder="选择根域名"
              searchPlaceholder="搜索根域名"
              value={
                selectedBaseDomainId === ""
                  ? undefined
                  : String(selectedBaseDomainId)
              }
            />
          </WorkspaceField>

          <WorkspaceField label="多级前缀">
            <Textarea
              onChange={(event) => onPrefixInputChange(event.target.value)}
              placeholder={"一行一个前缀，例如：\nmx\nmx.edge\nrelay.cn.hk"}
              rows={6}
              value={prefixInput}
            />
          </WorkspaceField>
        </div>

        <DialogFooter>
          {mutationError ? (
            <NoticeBanner autoHideMs={5000} className="mr-auto" onDismiss={onDismissError} variant="error">
              {mutationError}
            </NoticeBanner>
          ) : null}
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button
            disabled={selectedBaseDomainId === "" || isPending}
            onClick={onSubmit}
          >
            {isPending ? "提交中..." : "批量生成子域名"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
