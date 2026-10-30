import { test, expect } from "@playwright/test";

/**
 * CSS viewport 參考尺寸（模擬器）。
 * 實體 iPhone 測試請見 docs/RWD-TEST-CHECKLIST.md。
 */
const PHONES = [
  { name: "iPhone7", width: 375, height: 667 },
  { name: "iPhone15", width: 393, height: 852 },
  { name: "iPhone17ProMax", width: 440, height: 956 }
];

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth
    };
  });
  expect(
    overflow.scrollWidth,
    `horizontal overflow: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function assertReachable(locator, label) {
  await expect(locator, label).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box, `${label} missing box`).toBeTruthy();
  const vp = locator.page().viewportSize();
  /* 允許在捲動後進入可視區；仍禁止整顆按鈕完全在畫面右側外 */
  expect(box.x, `${label} left`).toBeLessThan(vp.width);
  expect(box.x + box.width, `${label} right`).toBeGreaterThan(0);
  expect(box.y, `${label} top`).toBeLessThan(vp.height + 2);
  expect(box.y + box.height, `${label} bottom`).toBeGreaterThan(-2);
}

async function goHome(page) {
  await page.goto("./index.html", { waitUntil: "networkidle" });
  await expect(page.locator("body")).toHaveAttribute("data-scene", "home");
}

async function openRocket(page) {
  await page.locator('[data-act="go"][data-view="rocket"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-scene", "rocket");
  const start = page.locator('[data-act="rocket-start"]');
  if (await start.count()) {
    await start.first().click();
  }
  await expect(page.locator(".craft-drop").first()).toBeVisible({ timeout: 15_000 });
}

for (const phone of PHONES) {
  test.describe(`${phone.name} portrait ${phone.width}x${phone.height}`, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test("home has no overflow and key controls visible", async ({ page }) => {
      await goHome(page);
      await assertNoHorizontalOverflow(page);
      await assertReachable(page.locator('[data-act="home"]'), "home");
      await assertReachable(page.locator("#mute"), "mute");
      await assertReachable(page.locator('[data-act="go"][data-view="learn"]'), "learn gate");
      await assertReachable(page.locator('[data-act="go"][data-view="rocket"]'), "rocket gate");
    });

    test("learn / listen / boss entry stay operable", async ({ page }) => {
      await goHome(page);
      for (const view of ["learn", "listen", "boss"]) {
        await page.locator(`[data-act="go"][data-view="${view}"]`).click();
        await expect(page.locator("body")).toHaveAttribute("data-scene", view);
        await assertNoHorizontalOverflow(page);
        await assertReachable(page.locator('[data-act="home"]'), `home from ${view}`);
        await page.locator('[data-act="home"]').click();
        await expect(page.locator("body")).toHaveAttribute("data-scene", "home");
      }
    });

    test("rocket slots and bank chips are reachable", async ({ page }) => {
      await goHome(page);
      await openRocket(page);
      await assertNoHorizontalOverflow(page);
      await assertReachable(page.locator(".craft-drop").first(), "craft drop");
      await assertReachable(page.locator("[data-rocket-piece]").first(), "bank piece");
      await assertReachable(page.locator('[data-act="home"]'), "home on rocket");

      const chip = page.locator("[data-rocket-piece]:not([disabled])").first();
      const drop = page.locator(".craft-drop.empty, .craft-drop").first();
      const chipBox = await chip.boundingBox();
      const dropBox = await drop.boundingBox();
      expect(chipBox?.width || 0).toBeGreaterThanOrEqual(36);
      expect(dropBox?.height || 0).toBeGreaterThanOrEqual(16);

      // 點選放置：先點零件再點空格
      await chip.click();
      await drop.click();
      await page.waitForTimeout(200);
    });

    test("rocket drag does not leave page unusable after cancel", async ({ page }) => {
      await goHome(page);
      await openRocket(page);
      const chip = page.locator("[data-rocket-piece]:not([disabled])").first();
      const box = await chip.boundingBox();
      expect(box).toBeTruthy();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 40, box.y + 80, { steps: 8 });
      await page.evaluate(() => {
        document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }));
      });
      await page.mouse.up();
      await expect(page.locator("body")).not.toHaveClass(/rocket-dragging/);
      await assertReachable(page.locator("[data-rocket-piece]").first(), "chip after cancel");
    });
  });

  test.describe(`${phone.name} landscape`, () => {
    test.use({ viewport: { width: phone.height, height: Math.min(phone.width, 430) } });

    test("landscape home/rocket without desktop lockup", async ({ page }) => {
      await goHome(page);
      await assertNoHorizontalOverflow(page);
      await assertReachable(page.locator('[data-act="go"][data-view="rocket"]'), "rocket gate landscape");
      await openRocket(page);
      await assertNoHorizontalOverflow(page);
      await assertReachable(page.locator(".craft-drop").first(), "drop landscape");
      await assertReachable(page.locator("[data-rocket-piece]").first(), "chip landscape");
    });
  });
}

test.describe("visualViewport height sync", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("updates --app-height when viewport shrinks", async ({ page }) => {
    await goHome(page);
    await openRocket(page);
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--app-height").trim());
    await page.setViewportSize({ width: 375, height: 520 });
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--app-height").trim());
    expect(before.length).toBeGreaterThan(0);
    expect(after).toMatch(/px$/);
    const afterPx = Number.parseFloat(after);
    expect(afterPx).toBeLessThanOrEqual(540);
  });
});
