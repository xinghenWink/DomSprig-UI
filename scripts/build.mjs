// 构建：dist/nova.css + dist/nova.js（全量包）、registry.json（源码分发清单）、docs/index.html（文档站）
// 用法：node scripts/build.mjs           全量构建
//       node scripts/build.mjs --preview select [tabs …]   只生成 .preview/<name>.html（开发与截图用）
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, CORE_FILES, CATEGORIES, loadComponents, resolve, renderPage, assetTags, esc, THEME_BOOT } from './lib/docs.mjs';

const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const pkg = JSON.parse(read('package.json'));

export function buildPreview(names) {
  const all = loadComponents();
  const comps = resolve(names, all, { strict: false });
  const wanted = new Set(names);
  const files = [...CORE_FILES, ...comps.flatMap((c) => c.files)];
  const { css, js } = assetTags(files, '../');
  const pages = comps.filter((c) => wanted.has(c.name)).map((c, i) => renderPage(c, { hidden: false }));
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(names.join(', '))} · DomSprig-UI 预览</title>
${THEME_BOOT}
${css}
<link rel="stylesheet" href="../docs/docs.css">
${js}
</head>
<body class="nv-app doc is-preview">
<main class="doc-main">
${pages.join('\n')}
</main>
<script src="../docs/docs.js"></script>
</body>
</html>`;
  mkdirSync(join(ROOT, '.preview'), { recursive: true });
  const out = join(ROOT, '.preview', `${names.join('+')}.html`);
  writeFileSync(out, html);
  return out;
}

function buildAll() {
  const all = loadComponents();
  const ordered = resolve(all.map((c) => c.name), all);
  const banner = `/*! DomSprig-UI v${pkg.version} · MIT · 由 scripts/build.mjs 生成，请勿直接修改 */\n`;

  // 1. 全量包
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  const cssFiles = [...CORE_FILES, ...ordered.flatMap((c) => c.files)].filter((f) => f.endsWith('.css'));
  const jsFiles = [...CORE_FILES, ...ordered.flatMap((c) => c.files)].filter((f) => f.endsWith('.js'));
  writeFileSync(join(ROOT, 'dist/nova.css'), banner + cssFiles.map((f) => `/* ${f} */\n${read(f)}`).join('\n'));
  writeFileSync(join(ROOT, 'dist/nova.js'), banner + jsFiles.map((f) => `/* ${f} */\n${read(f)}`).join('\n;\n'));

  // 2. Registry（shadcn 式：按名称取源码，自动带上依赖）
  const registry = {
    $schema: './registry.schema.json',
    name: pkg.name,
    version: pkg.version,
    core: { description: '设计变量、基础样式与运行时，所有组件都需要', files: CORE_FILES },
    items: ordered.map((c) => ({
      name: c.name,
      title: c.doc.title,
      category: c.doc.category,
      description: c.doc.desc,
      registryDependencies: c.doc.deps,
      files: c.files,
    })),
  };
  writeFileSync(join(ROOT, 'registry.json'), `${JSON.stringify(registry, null, 2)}\n`);

  // README 组件清单（<!-- components:start --> 与 <!-- components:end --> 之间自动生成）
  const readmeFile = join(ROOT, 'README.md');
  if (existsSync(readmeFile)) {
    const table = CATEGORIES.map(([key, label]) => {
      const items = ordered.filter((c) => c.doc.category === key);
      if (!items.length) return '';
      return `| **${label}** | ${items.map((c) => `\`${c.name}\` ${c.doc.title.replace(/^\S+\s*/, '')}`).join(' · ')} |`;
    }).filter(Boolean).join('\n');
    const readme = readFileSync(readmeFile, 'utf8').replace(
      /<!-- components:start -->[\s\S]*<!-- components:end -->/,
      `<!-- components:start -->\n共 ${ordered.length} 个组件：\n\n| 分类 | 组件 |\n|---|---|\n${table}\n<!-- components:end -->`
    );
    writeFileSync(readmeFile, readme);
  }

  // 3. 文档站
  const nav = CATEGORIES.map(([key, label]) => {
    const items = ordered.filter((c) => c.doc.category === key);
    if (!items.length) return '';
    return `<div class="doc-nav-group"><div class="doc-nav-title">${label}<span>${items.length}</span></div>${items
      .map((c) => `<a class="doc-nav-link" href="#/${c.name}" data-nav="${c.name}">${esc(c.doc.title)}</a>`).join('')}</div>`;
  }).join('');
  const overview = CATEGORIES.map(([key, label]) => {
    const items = ordered.filter((c) => c.doc.category === key);
    if (!items.length) return '';
    return `<div class="doc-ov-group"><h2>${label}<span>${items.length}</span></h2><div class="doc-ov-grid">${items
      .map((c) => `<a class="doc-ov-card" href="#/${c.name}"><b>${esc(c.doc.title)}</b><span>${esc(c.doc.desc || '')}</span></a>`).join('')}</div></div>`;
  }).join('');
  const homeFile = join(ROOT, 'docs/home.html');
  const home = (existsSync(homeFile) ? readFileSync(homeFile, 'utf8') : '')
    .replace('{{OVERVIEW}}', overview)
    .replace(/\{\{COUNT\}\}/g, String(ordered.length))
    .replace(/\{\{VERSION\}\}/g, pkg.version);
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DomSprig-UI · 组件库</title>
<meta name="description" content="零依赖、源码分发的现代 UI 组件库">
${THEME_BOOT}
<link rel="stylesheet" href="../dist/nova.css">
<link rel="stylesheet" href="docs.css">
<script src="../dist/nova.js"></script>
</head>
<body class="nv-app doc">
<a class="doc-skip" href="#doc-main">跳到正文</a>
<header class="doc-header">
  <button type="button" class="doc-menu-btn" aria-label="打开导航" aria-expanded="false">${'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'}</button>
  <a class="doc-logo" href="#/"><span class="doc-logo-mark" aria-hidden="true"></span>DomSprig-UI<span class="doc-version">v${pkg.version}</span></a>
  <button type="button" class="doc-search" data-doc-search><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>搜索组件…</span><kbd>Ctrl K</kbd></button>
  <div class="doc-header-actions">
    <div class="doc-hues" role="radiogroup" aria-label="主色"></div>
    <button type="button" class="doc-icon-btn" data-doc-theme aria-label="切换明暗主题"></button>
  </div>
</header>
<div class="doc-layout">
  <aside class="doc-sidebar" aria-label="组件导航">
    <a class="doc-nav-link" href="#/" data-nav="">总览</a>
    ${nav}
  </aside>
  <main class="doc-main" id="doc-main">
    <section class="doc-page doc-home" data-page="" hidden>
${home}
    </section>
${ordered.map((c) => renderPage(c)).join('\n')}
  </main>
  <nav class="doc-toc" aria-label="本页目录"></nav>
</div>
<script src="docs.js"></script>
</body>
</html>`;
  writeFileSync(join(ROOT, 'docs/index.html'), html);
  console.log(`✓ ${ordered.length} 个组件 → dist/nova.css (${(read('dist/nova.css').length / 1024).toFixed(1)} KB), dist/nova.js (${(read('dist/nova.js').length / 1024).toFixed(1)} KB), registry.json, docs/index.html`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const i = process.argv.indexOf('--preview');
  if (i > 0) {
    const names = process.argv.slice(i + 1).filter((a) => !a.startsWith('--'));
    console.log(buildPreview(names));
  } else buildAll();
}
