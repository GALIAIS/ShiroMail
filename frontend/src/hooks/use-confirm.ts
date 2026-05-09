import { useCallback, useRef, useState } from "react";
import { ConfirmDialog, type ConfirmDialogVariant } from "@/components/ui/confirm-dialog";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
};

type ResolverRef = ((value: boolean) => void) | null;

export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    title: "",
  });
  const resolverRef = useRef<ResolverRef>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setOpen(true);
    setLoading(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolverRef.current?.(true);
    resolverRef.current = null;
    setOpen(false);
  }, []);

  const handleOpenChange = useCallback((value: boolean) => {
    if (!value) {
      resolverRef.current?.(false);
      resolverRef.current = null;
      setOpen(false);
    }
  }, []);

  const ConfirmDialogElement = (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={options.title}
      description={options.description}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel}
      variant={options.variant}
      onConfirm={handleConfirm}
      loading={loading}
    />
  );

  return { confirm, setLoading, ConfirmDialog: ConfirmDialogElement };
}
