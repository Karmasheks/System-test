import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:5000/login", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector('input[placeholder="email@example.com"]', { timeout: 20000 });
await page.fill('input[placeholder="email@example.com"]', "admin@admin.ru");
await page.fill('input[type="password"]', "admin");
await page.click('button[type="submit"]');
await page.waitForTimeout(5000);

const report = await page.evaluate(() => {
  const blockers = [...document.querySelectorAll("*")]
    .filter((el) => {
      const s = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        (s.position === "fixed" || s.position === "absolute") &&
        rect.width >= window.innerWidth * 0.85 &&
        rect.height >= window.innerHeight * 0.85 &&
        Number(s.opacity) > 0.03 &&
        s.display !== "none"
      );
    })
    .map((el) => ({
      tag: el.tagName,
      cls: el.className?.toString?.().slice(0, 160),
      op: getComputedStyle(el).opacity,
      z: getComputedStyle(el).zIndex,
      pe: getComputedStyle(el).pointerEvents,
      ds: el.getAttribute("data-state"),
    }));

  const center = document.elementFromPoint(700, 450);
  return {
    blockers,
    center: center && { tag: center.tagName, cls: center.className?.toString?.().slice(0, 120) },
    bodyPE: getComputedStyle(document.body).pointerEvents,
    rootInert: document.getElementById("root")?.hasAttribute("inert"),
    unblockUI: typeof window.unblockUI,
    bodyKids: [...document.body.children].map((c) => c.tagName + (c.id ? "#" + c.id : "")),
  };
});

let clickOk = false;
try {
  await page.locator("aside.sidebar button").first().click({ timeout: 2000 });
  clickOk = true;
} catch {}

console.log(JSON.stringify({ report, clickOk }, null, 2));
await browser.close();
