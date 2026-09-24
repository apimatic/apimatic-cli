import { chromium } from 'playwright-core';
import console from 'node:console';
import process from 'node:process';

export const origin = process.argv[2];
export const browser = await chromium.launch({ channel: process.argv[3] ?? 'chrome' });

const results = [];
export function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(pass);
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${name}${
      pass ? '' : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`
    }`
  );
}
export const note = (label) => `No ${label} sample for this example.`;

export async function open(route) {
  const page = await browser.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on(
    'response',
    (r) => r.status() >= 400 && !r.url().endsWith('favicon.ico') && page.errors.push(`${r.status()} ${r.url()}`)
  );
  const response = await page.goto(`${origin}/api/${route}/`, { waitUntil: 'networkidle', timeout: 120_000 });
  page.status = response.status();
  if (page.status === 200) await page.waitForSelector('[role=tab][id$="-trigger-curl"]', { timeout: 60_000 });
  return page;
}

const usageTabList = '[role=tablist]:has([id$="-trigger-curl"])';
export const labels = async (page) =>
  (await page.locator(`${usageTabList} > [role=tab]`).allInnerTexts()).map((text) => text.trim());
export async function panel(page, id) {
  const tab = page.locator(`${usageTabList} > [id$="-trigger-${id}"]`);
  await tab.click();
  return (await page.locator(`#${await tab.getAttribute('aria-controls')}`).innerText()).trim();
}
export const panelElement = async (page, id) =>
  page.locator(`#${await page.locator(`${usageTabList} > [id$="-trigger-${id}"]`).getAttribute('aria-controls')}`);

const exampleSelector = (page) =>
  page.locator('div:has(> [role=combobox]):has([id$="-trigger-curl"]) > [role=combobox]');
export const hasSelector = async (page) => (await exampleSelector(page).count()) > 0;
export async function choose(page, name) {
  await exampleSelector(page).click();
  await page.locator('[role=option]', { hasText: name }).first().click();
  await page.waitForTimeout(150);
}
export async function options(page) {
  await exampleSelector(page).click();
  await page.locator('[role=option]').first().waitFor();
  const names = await page.locator('[role=option] p.font-medium').allInnerTexts();
  await page.keyboard.press('Escape');
  await page.locator('[role=option]').first().waitFor({ state: 'hidden' });
  return names;
}
export async function finish(page, route) {
  check(`${route}: no page errors or failed requests`, page.errors, []);
  await page.close();
}

export async function done() {
  await browser.close();
  const failed = results.filter((pass) => !pass).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}
