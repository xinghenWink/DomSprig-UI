// 组件截图：生成预览页并截图到 .shots/，同时打印页面报错
// node scripts/shot.mjs <组件名…> [--theme light|dark|both] [--width 1280] [--height 860]
//      [--demo N]            只截第 N 个示例（从 1 开始）
//      [--eval "js"]         截图前在页面执行的代码（可 await，用于点开浮层等）
//      [--wait 400]          截图前等待毫秒
//      [--viewport]          只截视口（默认整页）
//      [--docs]              改为截完整文档站 docs/index.html（需先 npm run build），配合 --hash "#/select"
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildPreview } from './build.mjs';
import { ROOT } from './lib/docs.mjs';
import { launch, open, sleep } from './lib/browser.mjs';

const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true; };
const names = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { if (argv[i + 1] && !argv[i + 1].startsWith('--') && !['viewport', 'docs'].includes(argv[i].slice(2))) i++; continue; }
  names.push(argv[i]);
}
const docsMode = flag('docs', false) === true;
if (!names.length && !docsMode) { console.error('用法：node scripts/shot.mjs <组件名> [--theme dark] [--width 390] [--demo 2] [--eval "…"]'); process.exit(1); }

const themeArg = flag('theme', 'light');
const themes = themeArg === 'both' ? ['light', 'dark'] : [themeArg];
const width = Number(flag('width', 1280));
const height = Number(flag('height', 860));
const demo = flag('demo', null);
const evalCode = flag('eval', null);
const wait = Number(flag('wait', 350));
const viewportOnly = flag('viewport', false) === true;
const hash = flag('hash', '');

const file = docsMode ? join(ROOT, 'docs/index.html') : buildPreview(names);
mkdirSync(join(ROOT, '.shots'), { recursive: true });
const browser = await launch();
let failed = false;
try {
  for (const theme of themes) {
    const { page, errors } = await open(browser, file, { width, height, theme });
    if (hash) { await page.evaluate((h) => { location.hash = h; }, hash); await sleep(150); }
    await sleep(150);
    let target = null;
    if (demo) {
      const handles = await page.$$('.doc-demo');
      target = handles[Number(demo) - 1];
      if (!target) throw new Error(`没有第 ${demo} 个示例（共 ${handles.length} 个）`);
      await target.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    }
    if (evalCode) await page.evaluate(`(async () => { ${evalCode} })()`);
    await sleep(wait);
    const base = docsMode ? `docs${hash ? `-${String(hash).replace(/[^\w-]+/g, '')}` : ''}` : names.join('+');
    const out = join(ROOT, '.shots', `${base}${demo ? `-d${demo}` : ''}-${theme}-${width}.png`);
    if (target && !viewportOnly) await target.screenshot({ path: out });
    else await page.screenshot({ path: out, fullPage: !viewportOnly });
    console.log(`✓ ${out}`);
    if (errors.length) { failed = true; console.log(`  ✗ 页面报错 ${errors.length} 条：\n    ${errors.join('\n    ')}`); }
    await page.close();
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
