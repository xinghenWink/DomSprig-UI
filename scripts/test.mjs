// 交互测试：tests/<组件名>.test.mjs，在该组件的预览页里运行
// node scripts/test.mjs            运行全部
// node scripts/test.mjs select     只运行指定组件
//
// 测试文件写法：
//   export default async ({ page, assert, sleep, errors }) => {
//     await page.click('#sel-basic + .nv-select-trigger');
//     assert(await page.$('.nv-select-panel'), '面板应打开');
//   };
// 测试结束时若页面有 pageerror / console.error 也会判为失败。
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPreview } from './build.mjs';
import { ROOT } from './lib/docs.mjs';
import { launch, open, sleep } from './lib/browser.mjs';

const dir = join(ROOT, 'tests');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.test.mjs')) : [];
const targets = files.filter((f) => !only.length || only.includes(f.replace('.test.mjs', '')));
if (!targets.length) { console.log('没有可运行的测试'); process.exit(only.length ? 1 : 0); }

const assert = (cond, msg) => { if (!cond) throw new Error(`断言失败：${msg}`); };
assert.equal = (a, b, msg) => { if (a !== b) throw new Error(`断言失败：${msg}（期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}）`); };

const browser = await launch();
let pass = 0;
let fail = 0;
try {
  for (const f of targets) {
    const name = f.replace('.test.mjs', '');
    const mod = await import(pathToFileURL(join(dir, f)).href);
    const preview = buildPreview(mod.components || [name]);
    const { page, errors } = await open(browser, preview, mod.viewport || {});
    const t0 = Date.now();
    try {
      await mod.default({ page, assert, sleep, errors });
      if (errors.length) throw new Error(`页面报错：\n    ${errors.join('\n    ')}`);
      pass++;
      console.log(`✓ ${name} (${Date.now() - t0}ms)`);
    } catch (e) {
      fail++;
      console.log(`✗ ${name}\n    ${e.message}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
