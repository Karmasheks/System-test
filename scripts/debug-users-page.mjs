import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto("http://127.0.0.1:5000/login", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector('input[placeholder="email@example.com"]', { timeout: 20000 });
await page.fill('input[placeholder="email@example.com"]', "admin@admin.ru");
await page.fill('input[type="password"]', "admin");
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);

await page.goto("http://127.0.0.1:5000/users", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(5000);

const report = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  h1: document.querySelector("h1")?.textContent?.trim(),
  h2: document.querySelector("h2")?.textContent?.trim(),
  bodyText: document.body.innerText.slice(0, 500),
  blockers: [...document.querySelectorAll("*")]
    .filter((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        (s.position === "fixed" || s.position === "absolute") &&
        r.width >= window.innerWidth * 0.85 &&
        r.height >= window.innerHeight * 0.85 &&
        Number(s.opacity) > 0.03 &&
        s.display !== "none"
      );
    })
    .map((el) => el.className?.toString?.().slice(0, 120)),
}));

console.log(JSON.stringify({ report, errors }, null, 2));
await browser.close();
