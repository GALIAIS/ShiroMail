import type { PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { SiteBrandRuntime } from "@/components/brand/site-brand-runtime";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { queryClient } from "../lib/query-client";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <SiteBrandRuntime />
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
