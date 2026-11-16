// 文档片段解析与渲染（构建期执行，零依赖）
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
export const SRC = join(ROOT, 'src');
export const COMPONENTS_DIR = join(SRC, 'components');
export const CORE_FILES = ['src/tokens.css', 'src/base.css', 'src/core.js'];

export const CATEGORIES = [
  ['general', '通用'],
  ['form', '数据录入'],
  ['data', '数据展示'],
  ['feedback', '反馈'],
  ['overlay', '浮层'],
  ['navigation', '导航'],
  ['effects', '动效特效'],
];
const CAT_LABEL = Object.fromEntries(CATEGORIES);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function dedent(s) {
  const lines = s.replace(/\r\n/g, '\n').replace(/^\n+|\s+$/g, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n');
}

/**
 * 片段格式：
 * <!--
 * @name select
 * @title Select 选择器
 * @category form
 * @deps tooltip            （可选：依赖的其它组件）
 * @desc 一句话说明
 * -->
 * <!-- @demo 标题 | 说明（可含 `code`） | 标记：block left col tall full -->
 * ...HTML 与 <script>...
 * <!-- @api
 * Markdown（### 标题、表格、列表、段落）
 * -->
 */
export function parseDoc(src, file) {
  src = src.replace(/\r\n/g, '\n');
  const header = /<!--\s*(@name[\s\S]*?)-->/.exec(src);
  if (!header) throw new Error(`${file}: 缺少 @name 头部注释`);
  const meta = {};
  header[1].replace(/@(\w+)[ \t]+([^\n]*)/g, (_, k, v) => { meta[k] = v.trim(); });
  meta.deps = meta.deps ? meta.deps.split(/[\s,]+/).filter(Boolean) : [];
  meta.order = Number(meta.order || 50);
  let rest = src.slice(header.index + header[0].length);
  let api = '';
  rest = rest.replace(/<!--\s*@api\s*([\s\S]*?)-->/, (_, md) => { api = dedent(md); return ''; });
  const marks = [...rest.matchAll(/<!--\s*@demo\s+([\s\S]*?)-->/g)];
  const demos = marks.map((m, i) => {
    const [title, desc = '', flags = ''] = m[1].split(/\s\|\s/).map((s) => s.trim()); // 字段用「 | 」（两侧空格）分隔，`a|b` 不受影响
    const start = m.index + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : rest.length;
    return { title, desc, flags: flags.split(/\s+/).filter(Boolean), code: dedent(rest.slice(start, end)) };
  });
  return { ...meta, demos, api, categoryLabel: CAT_LABEL[meta.category] || meta.category };
}

/** 读取全部组件：{ name, dir, css, js, doc } */
export function loadComponents() {
  if (!existsSync(COMPONENTS_DIR)) return [];
  const list = [];
  for (const name of readdirSync(COMPONENTS_DIR)) {
    const dir = join(COMPONENTS_DIR, name);
    const docFile = join(dir, `${name}.doc.html`);
    if (!existsSync(docFile)) continue;
    const doc = parseDoc(readFileSync(docFile, 'utf8'), docFile);
    if (doc.name !== name) throw new Error(`${docFile}: @name 应为 ${name}`);
    const files = [];
    if (existsSync(join(dir, `${name}.css`))) files.push(`src/components/${name}/${name}.css`);
    if (existsSync(join(dir, `${name}.js`))) files.push(`src/components/${name}/${name}.js`);
    list.push({ name, dir, files, doc });
  }
  const catIndex = Object.fromEntries(CATEGORIES.map(([k], i) => [k, i]));
  return list.sort((a, b) =>
    (catIndex[a.doc.category] ?? 99) - (catIndex[b.doc.category] ?? 99) || a.doc.order - b.doc.order || a.name.localeCompare(b.name));
}

/** 按依赖拓扑排序（依赖在前） */
export function resolve(names, all, { strict = true } = {}) {
  const byName = Object.fromEntries(all.map((c) => [c.name, c]));
  const out = [];
  const seen = new Set();
  const visit = (n, chain = []) => {
    if (seen.has(n)) return;
    const c = byName[n];
    if (!c) {
      const msg = `未知组件：${n}${chain.length ? `（被 ${chain.at(-1)} 依赖）` : ''}`;
      if (strict || !chain.length) throw new Error(msg);
      console.warn(`⚠ ${msg}，预览中暂时跳过`);
      seen.add(n);
      return;
    }
    if (chain.includes(n)) throw new Error(`循环依赖：${[...chain, n].join(' → ')}`);
    c.doc.deps.forEach((d) => visit(d, [...chain, n]));
    seen.add(n);
    out.push(c);
  };
  names.forEach((n) => visit(n));
  return out;
}

/* ————————————— 轻量 Markdown（表格 / 标题 / 列表 / 段落 / 行内代码 / 粗体 / 链接） ————————————— */
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}
export function markdown(md) {
  const lines = md.split('\n');
  let html = '';
  let i = 0;
  const splitRow = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) { html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; i++; continue; }
    if (line.trim().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      const head = splitRow(rows[0]);
      const body = rows.slice(rows[1] && /^\s*\|?\s*:?-/.test(rows[1]) ? 2 : 1).map(splitRow);
      html += `<div class="doc-table-wrap"><table class="doc-table"><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      html += '<ul>';
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) html += `<li>${inline(lines[i++].replace(/^\s*[-*]\s+/, ''))}</li>`;
      html += '</ul>';
      continue;
    }
    if (line.startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      html += `<pre class="doc-pre"><code>${highlight(buf.join('\n'))}</code></pre>`;
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,4}\s|\s*[-*]\s|\||```)/.test(lines[i])) buf.push(lines[i++]);
    html += `<p>${inline(buf.join(' '))}</p>`;
  }
  return html;
}

/* ————————————— 代码高亮（HTML + 内联 JS/CSS） ————————————— */
const JS_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\[\s\S]|[^`\\])*`)|\b(const|let|var|function|return|if|else|for|of|in|new|await|async|true|false|null|undefined|this|typeof|class|import|from|export|default|try|catch|throw|while|switch|case|break)\b|\b(\d+(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)(?=\s*\()/g;
function hlJs(s) {
  let out = '';
  let last = 0;
  for (const m of s.matchAll(JS_RE)) {
    out += esc(s.slice(last, m.index));
    const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : m[4] ? 'n' : 'f';
    out += `<span class="tk-${cls}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}
function hlCss(s) {
  return esc(s)
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tk-c">$1</span>')
    .replace(/([\w-]+)(\s*:)(?![^{]*\{)/g, '<span class="tk-a">$1</span>$2');
}
function hlHtml(s) {
  const TOKEN = /<!--[\s\S]*?-->|<\/?[a-zA-Z][\w-]*(?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>|[^<]+|</g;
  return s.replace(TOKEN, (tok) => {
    if (tok.startsWith('<!--')) return `<span class="tk-c">${esc(tok)}</span>`;
    const m = /^<(\/?)([\w-]+)([\s\S]*?)(\/?)>$/.exec(tok);
    if (!m) return esc(tok);
    const attrs = m[3].replace(/([^\s=]+)(\s*=\s*)?("[^"]*"|'[^']*'|[^\s>]+)?/g, (all, name, eq, val) =>
      `<span class="tk-a">${esc(name)}</span>${eq ? `${esc(eq)}<span class="tk-s">${esc(val || '')}</span>` : ''}`);
    return `<span class="tk-p">&lt;${m[1]}</span><span class="tk-t">${m[2]}</span>${attrs}<span class="tk-p">${m[4]}&gt;</span>`;
  });
}
export function highlight(code, lang = 'html') {
  if (lang === 'js') return hlJs(code);
  if (lang === 'css') return hlCss(code);
  let out = '';
  let last = 0;
  for (const m of code.matchAll(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)|(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g)) {
    out += hlHtml(code.slice(last, m.index));
    out += m[1] ? hlHtml(m[1]) + hlJs(m[2]) + hlHtml(m[3]) : hlHtml(m[4]) + hlCss(m[5]) + hlHtml(m[6]);
    last = m.index + m[0].length;
  }
  return out + hlHtml(code.slice(last));
}

/* ————————————— 页面渲染 ————————————— */
const slug = (s, i) => `${String(s).replace(/[^\w一-龥-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'demo'}-${i}`;

export function renderPage(c, { hidden = true } = {}) {
  const d = c.doc;
  const demos = d.demos.map((demo, i) => {
    const id = `${c.name}--${slug(demo.title, i + 1)}`;
    return `
<div class="doc-demo" id="${id}">
  <div class="doc-demo-head"><h2><a href="#/${c.name}/${id}">${esc(demo.title)}</a></h2>${demo.desc ? `<p>${inline(demo.desc)}</p>` : ''}</div>
  <div class="doc-preview ${demo.flags.map((f) => `is-${f}`).join(' ')}">
${demo.code}
  </div>
  <div class="doc-code" data-collapsed>
    <div class="doc-code-bar"><span>HTML</span><button type="button" class="doc-code-toggle">展开代码</button><button type="button" class="doc-copy" aria-label="复制代码">复制</button></div>
    <pre class="doc-pre"><code>${highlight(demo.code)}</code></pre>
  </div>
</div>`;
  }).join('\n');
  const files = c.files.map((f) => `<code>${esc(f.replace('src/components/', ''))}</code>`).join(' ');
  const deps = d.deps.length ? `<span>依赖：${d.deps.map((x) => `<a href="#/${x}">${esc(x)}</a>`).join('、')}</span>` : '';
  return `
<section class="doc-page" data-page="${c.name}" data-title="${esc(d.title)}" data-category="${esc(d.category)}"${hidden ? ' hidden' : ''}>
  <header class="doc-page-head">
    <div class="doc-eyebrow">${esc(d.categoryLabel)}</div>
    <h1>${esc(d.title)}</h1>
    <p class="doc-lead">${inline(d.desc || '')}</p>
    <div class="doc-meta"><span>文件：${files || '—'}</span>${deps}<span class="doc-install"><code>node scripts/add.mjs ${c.name}</code></span></div>
  </header>
${demos}
${d.api ? `<div class="doc-api" id="${c.name}--api"><h2 class="doc-api-title"><a href="#/${c.name}/${c.name}--api">API</a></h2>${markdown(d.api)}</div>` : ''}
</section>`;
}

/** 生成 <link>/<script> 标签（相对 prefix 路径） */
export function assetTags(files, prefix) {
  const css = files.filter((f) => f.endsWith('.css')).map((f) => `<link rel="stylesheet" href="${prefix}${f}">`);
  const js = files.filter((f) => f.endsWith('.js')).map((f) => `<script src="${prefix}${f}"></script>`);
  return { css: css.join('\n'), js: js.join('\n') };
}

export const THEME_BOOT = `<script>(function(){try{var q=new URLSearchParams(location.search),d=document.documentElement,t=q.get('theme')||localStorage.getItem('nova-theme');if(t&&t!=='system')d.dataset.theme=t;var h=q.get('hue')||localStorage.getItem('nova-hue');if(h)d.style.setProperty('--nv-hue',h);var r=q.get('radius')||localStorage.getItem('nova-radius');if(r)d.style.setProperty('--nv-radius',r+'px');if(q.has('motion'))d.dataset.motion=q.get('motion')}catch(e){}})();</script>`;
