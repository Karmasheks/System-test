import { useEffect } from "react";
import { unblockUI } from "@/hooks/use-modal-body-cleanup";

declare global {
  interface Window {
    unblockUI?: () => void;
  }
}

/** Восстанавливает клики, если Radix оставил невидимый блокирующий слой. */
export function BlockerRecovery() {
  useEffect(() => {
    const run = () => unblockUI();

    window.unblockUI = run;
    run();

    const t1 = window.setTimeout(run, 200);
    const t2 = window.setTimeout(run, 1500);
    const interval = window.setInterval(run, 2000);
    const stopInterval = window.setTimeout(() => window.clearInterval(interval), 20000);

    const root = document.getElementById("root");
    const observer =
      root &&
      new MutationObserver(() => {
        if (
          (root.hasAttribute("inert") || root.getAttribute("aria-hidden") === "true") &&
          !document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')
        ) {
          run();
        }
      });
    if (observer && root) {
      observer.observe(root, { attributes: true, attributeFilter: ["inert", "aria-hidden"] });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") run();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(stopInterval);
      window.clearInterval(interval);
      observer?.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      delete window.unblockUI;
    };
  }, []);

  return null;
}
