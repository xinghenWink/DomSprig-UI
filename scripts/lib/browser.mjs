// 无头浏览器工具（puppeteer-core + 本机 Chrome/Edge），截图与交互测试共用
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

export function chromePath() {
  const p = CANDIDATES.find((c) => existsSync(c));
  if (!p) throw new Error('未找到 Chrome/Edge，请设置环境变量 CHROME_PATH');
  return p;
}

export const launch = () =>
  puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars', '--disable-gpu'],
  });

/**
 * 打开本地页面。返回 { page, errors }，errors 收集 pageerror 与 console.error。
 * opts: width height theme('light'|'dark') reducedMotion query
 */
export async function open(browser, file, { width = 1280, height = 860, theme = 'light', reducedMotion = false, query = '' } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: theme },
    { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
  ]);
  const q = new URLSearchParams(query);
  q.set('theme', theme);
  await page.goto(`${pathToFileURL(file).href}?${q}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  return { page, errors };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
