// 源码分发 CLI（shadcn 式）：把组件源码连同依赖复制进你的项目，之后随意修改。
//
//   node scripts/add.mjs --list                          列出全部组件
//   node scripts/add.mjs select toast                    复制到 ./nova（默认）
//   node scripts/add.mjs select --out ../app/src/ui/domsprig-ui 指定目录
//   node scripts/add.mjs --all --bundle                  全部组件，并额外合并出 nova.css / nova.js
//   --force                                              覆盖已存在的文件（默认跳过，保护你的修改）
import { mkdirSync, copyFileSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname, relative, resolve as resolvePath } from 'node:path';
import { ROOT, CORE_FILES, CATEGORIES, loadComponents, resolve } from './lib/docs.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const val = (f, d) => { const i = argv.indexOf(`--${f}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const outDir = resolvePath(process.cwd(), val('out', 'nova'));
const names = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');
const all = loadComponents();

if (has('list') || (!names.length && !has('all'))) {
  for (const [key, label] of CATEGORIES) {
    const items = all.filter((c) => c.doc.category === key);
    if (!items.length) continue;
    console.log(`\n${label}`);
    for (const c of items) {
      const deps = c.doc.deps.length ? `  ← ${c.doc.deps.join(', ')}` : '';
      console.log(`  ${c.name.padEnd(16)} ${c.doc.title}${deps}`);
    }
  }
  console.log('\n用法：node scripts/add.mjs <组件名…> [--out 目录] [--bundle] [--force]');
  process.exit(0);
}

let comps;
try {
  comps = resolve(has('all') ? all.map((c) => c.name) : names, all);
} catch (e) {
  console.error(`✗ ${e.message}\n  可用组件：${all.map((c) => c.name).join(' ')}`);
  process.exit(1);
}

const force = has('force');
let copied = 0;
let skipped = 0;
const copy = (rel, to) => {
  const dest = join(outDir, to);
  if (existsSync(dest) && !force) { skipped++; return; }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(ROOT, rel), dest);
  copied++;
};
const outName = (f) => f.replace(/^src\//, '');

for (const f of CORE_FILES) copy(f, outName(f));
for (const c of comps) for (const f of c.files) copy(f, outName(f));

// 入口文件：按依赖顺序引入（不覆盖：重复执行 add 时追加新组件）
const files = [...CORE_FILES, ...comps.flatMap((c) => c.files)].map(outName);
const cssEntry = join(outDir, 'nova.css');
const prevCss = existsSync(cssEntry) ? readFileSync(cssEntry, 'utf8') : '/* DomSprig-UI 样式入口（由 add.mjs 维护，可手动增删） */\n';
const cssLines = files.filter((f) => f.endsWith('.css')).map((f) => `@import "./${f}";`).filter((l) => !prevCss.includes(l));
writeFileSync(cssEntry, prevCss + (cssLines.length ? `${cssLines.join('\n')}\n` : ''));

const jsFiles = files.filter((f) => f.endsWith('.js'));
if (has('bundle')) {
  writeFileSync(join(outDir, 'nova.bundle.css'), files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(outDir, f), 'utf8')).join('\n'));
  writeFileSync(join(outDir, 'nova.bundle.js'), jsFiles.map((f) => readFileSync(join(outDir, f), 'utf8')).join('\n;\n'));
}

const rel = relative(process.cwd(), outDir).replace(/\\/g, '/') || '.';
console.log(`✓ ${comps.map((c) => c.name).join(', ')}`);
console.log(`  复制 ${copied} 个文件${skipped ? `，跳过 ${skipped} 个已存在文件（--force 覆盖）` : ''} → ${rel}/`);
console.log('\n在页面中引入（顺序很重要：core.js 必须最先）：');
console.log(`  <link rel="stylesheet" href="${rel}/nova.css">`);
if (has('bundle')) console.log(`  <script src="${rel}/nova.bundle.js"></script>`);
else for (const f of jsFiles) console.log(`  <script src="${rel}/${f}"></script>`);
