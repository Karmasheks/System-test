import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { Providers } from "@/components/providers";
import { PageHelmet } from "@/components/page-helmet";
import { unblockUI } from "@/hooks/use-modal-body-cleanup";

declare global {
  interface Window {
    unblockUI?: () => void;
  }
}

window.unblockUI = unblockUI;
unblockUI();

createRoot(document.getElementById("root")!).render(
  <Providers>
    <PageHelmet title="StarLine" />
    <App />
  </Providers>
);
