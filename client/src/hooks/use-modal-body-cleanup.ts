import { useEffect } from "react";
import { useLocation } from "wouter";

function isVisibleElement(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const s = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return (
    s.display !== "none" &&
    s.visibility !== "hidden" &&
    Number(s.opacity) > 0.05 &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function hasVisibleOpenDialogContent(): boolean {
  return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some((el) => {
    if (el.getAttribute("data-state") !== "open") return false;
    return isVisibleElement(el);
  });
}

function restoreInteractivity(el: Element) {
  if (!(el instanceof HTMLElement)) return;
  el.removeAttribute("aria-hidden");
  el.removeAttribute("inert");
  if (el.style.pointerEvents === "none") {
    el.style.pointerEvents = "";
  }
}

export function cleanupStaleModalLayers() {
  document.body.style.pointerEvents = "auto";
  document.body.style.overflow = "";
  document.body.removeAttribute("data-scroll-locked");
  document.body.removeAttribute("inert");
  document.documentElement.removeAttribute("inert");

  const root = document.getElementById("root");
  if (root) {
    restoreInteractivity(root);
    root.style.pointerEvents = "auto";
  }

  const shell = document.querySelector("#root .app-shell");
  if (shell) {
    restoreInteractivity(shell);
    if (shell instanceof HTMLElement) shell.style.pointerEvents = "auto";
  }

  document.querySelectorAll("#root [inert], #root [aria-hidden='true']").forEach((el) => {
    if (el.closest('[role="dialog"], [role="alertdialog"]')) return;
    restoreInteractivity(el);
  });

  const hasOpenDialog = hasVisibleOpenDialogContent();

  document.querySelectorAll("[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay]").forEach((el) => {
    if (!hasOpenDialog) {
      el.remove();
      return;
    }
    const portal = el.parentElement;
    const dialog = portal?.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
    if (!dialog || !isVisibleElement(dialog)) {
      el.remove();
    }
  });

  if (!hasOpenDialog) {
    document.querySelectorAll("body > div:not(#root)").forEach((el) => {
      if (
        el.querySelector("[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay]") ||
        el.getAttribute("data-radix-portal") != null
      ) {
        el.remove();
      }
    });
  }

  // Зависшие overlay мобильного меню после client-side navigation
  document.querySelectorAll(".mobile-sidebar-overlay").forEach((el) => {
    if (!el.isConnected || el.closest("#root") == null) {
      el.remove();
    }
  });
}

/** Полный сброс блокирующих слоёв; доступен как window.unblockUI */
export function unblockUI() {
  cleanupStaleModalLayers();
}

/** Сбрасывает зависшие Radix-слои (overlay, aria-hidden, pointer-events). */
export function useModalBodyCleanup() {
  const [location] = useLocation();

  useEffect(() => {
    cleanupStaleModalLayers();
    window.scrollTo(0, 0);

    const t1 = window.setTimeout(cleanupStaleModalLayers, 100);
    const t2 = window.setTimeout(cleanupStaleModalLayers, 500);
    const t3 = window.setInterval(cleanupStaleModalLayers, 2000);
    const stopInterval = window.setTimeout(() => window.clearInterval(t3), 12000);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cleanupStaleModalLayers();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(stopInterval);
      window.clearInterval(t3);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [location]);
}
