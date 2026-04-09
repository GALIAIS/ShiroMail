import type { PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { SiteBrandRuntime } from "@/components/brand/site-brand-runtime";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "../lib/query-client";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <SiteBrandRuntime />
          {children}
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
