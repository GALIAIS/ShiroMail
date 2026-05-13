import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./app/providers";
import { AppRouter } from "./app/router";
import { initializeI18n } from "./lib/i18n";
import { registerServiceWorker } from "./lib/register-sw";
import "./index.css";

async function bootstrap() {
  await initializeI18n();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </StrictMode>,
  );
}

void bootstrap();

registerServiceWorker();
