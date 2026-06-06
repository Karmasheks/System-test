import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { Providers } from "@/components/providers";
import { PageHelmet } from "@/components/page-helmet";

createRoot(document.getElementById("root")!).render(
  <Providers>
    <PageHelmet title="StarLine" />
    <App />
  </Providers>
);
