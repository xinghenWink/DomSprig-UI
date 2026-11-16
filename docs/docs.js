/* Nova UI 文档站交互：路由、目录、代码展开/复制、主题与主色、搜索 */
(() => {
  const body = document.body;
  const isPreview = body.classList.contains('is-preview');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* —— 代码块：展开 / 复制 —— */
  document.addEventListener('click', async (e) => {
    const toggle = e.target.closest('.doc-code-toggle');
    if (toggle) {
      const box = toggle.closest('.doc-code');
      const collapsed = box.toggleAttribute('data-collapsed');
      toggle.textContent = collapsed ? '展开代码' : '收起代码';
      return;
    }
    const copy = e.target.closest('.doc-copy');
    if (copy) {
      const text = copy.closest('.doc-code').querySelector('code').textContent;
      try {
        await navigator.clipboard.writeText(text);
        if (window.Nova && Nova.toast) Nova.toast.success('已复制到剪贴板');
        copy.textContent = '已复制';
      } catch (_) {
        copy.textContent = '复制失败';
      }
      setTimeout(() => { copy.textContent = '复制'; }, 1400);
    }
  });

  if (isPreview) return;

  /* —— 路由：#/<组件名>/<锚点> —— */
  const pages = $$('.doc-page');
  const links = $$('[data-nav]');
  const toc = $('.doc-toc');
  let tocObserver = null;

  function buildToc(page) {
    tocObserver && tocObserver.disconnect();
    toc.textContent = '';
    const heads = $$('.doc-demo, .doc-api', page);
    if (!heads.length) return;
    toc.append(Object.assign(document.createElement('div'), { className: 'doc-toc-title', textContent: '本页内容' }));
    const map = new Map();
    for (const el of heads) {
      const a = document.createElement('a');
      a.href = `#/${page.dataset.page}/${el.id}`;
      a.textContent = el.classList.contains('doc-api') ? 'API' : el.querySelector('h2').textContent;
      toc.append(a);
      map.set(el, a);
    }
    tocObserver = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        toc.querySelectorAll('[data-active]').forEach((x) => x.removeAttribute('data-active'));
        map.get(en.target).setAttribute('data-active', '');
      }
    }, { rootMargin: '-80px 0px -65% 0px' });
    heads.forEach((h) => tocObserver.observe(h));
  }

  function route() {
    // #/<组件名>/<锚点> 切页；普通 #锚点 视为首页内跳转
    const h = location.hash;
    let name = '';
    let anchor = '';
    if (h.startsWith('#/')) [, name = '', anchor = ''] = h.match(/^#\/([^/]*)\/?(.*)$/) || [];
    else if (h.length > 1) anchor = h.slice(1);
    const page = pages.find((p) => p.dataset.page === name) || pages.find((p) => p.dataset.page === '');
    const changed = page.hidden;
    pages.forEach((p) => { p.hidden = p !== page; });
    links.forEach((a) => (a.dataset.nav === page.dataset.page ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    document.title = page.dataset.title ? `${page.dataset.title} · Nova UI` : 'Nova UI · 组件库';
    if (changed) buildToc(page);
    body.classList.remove('nav-open');
    const target = anchor && document.getElementById(decodeURIComponent(anchor));
    if (target) target.scrollIntoView({ block: 'start' });
    else if (changed) window.scrollTo(0, 0);
    const current = $('[aria-current="page"]', $('.doc-sidebar'));
    current && current.scrollIntoView({ block: 'nearest' });
    if (window.Nova) Nova.emit(document, 'doc:route', { page: page.dataset.page });
  }
  addEventListener('hashchange', route);
  route();

  /* —— 移动端导航 —— */
  const menuBtn = $('.doc-menu-btn');
  menuBtn && menuBtn.addEventListener('click', () => {
    const open = body.classList.toggle('nav-open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (body.classList.contains('nav-open') && !e.target.closest('.doc-sidebar, .doc-menu-btn')) body.classList.remove('nav-open');
  });

  /* —— 主题与主色 —— */
  const themeBtn = $('[data-doc-theme]');
  const paintThemeBtn = () => {
    const dark = Nova.theme.resolved() === 'dark';
    themeBtn.innerHTML = Nova.icon(dark ? 'moon' : 'sun', { size: 17 });
    themeBtn.setAttribute('aria-label', dark ? '切换到亮色' : '切换到暗色');
  };
  themeBtn.addEventListener('click', (e) => Nova.theme.toggle(e));
  document.addEventListener('nv:themechange', paintThemeBtn);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintThemeBtn);
  paintThemeBtn();

  const HUES = [[278, "紫罗兰"], [252, '靛蓝'], [222, '天蓝'], [165, '翡翠'], [45, '琥珀'], [12, '珊瑚'], [338, '玫红']];
  const hueBox = $('.doc-hues');
  const currentHue = () => Number(getComputedStyle(document.documentElement).getPropertyValue('--nv-hue')) || 278;
  for (const [h, label] of HUES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'doc-hue';
    b.style.setProperty('--h', h);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-checked', String(h === currentHue()));
    b.addEventListener('click', () => {
      Nova.theme.setHue(h);
      try { localStorage.setItem('nova-hue', h); } catch (_) { /* ignore */ }
      $$('.doc-hue', hueBox).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    });
    hueBox.append(b);
  }

  /* —— 搜索（有 Command 组件时用命令面板，否则退化为侧栏过滤） —— */
  const items = links.filter((a) => a.dataset.nav).map((a) => {
    const page = pages.find((p) => p.dataset.page === a.dataset.nav);
    return { id: a.dataset.nav, label: a.textContent, group: a.closest('.doc-nav-group').querySelector('.doc-nav-title').firstChild.textContent, keywords: a.dataset.nav, page };
  });
  function openSearch() {
    if (Nova.command && Nova.command.open) {
      Nova.command.open({
        placeholder: '搜索组件…',
        items: [
          ...items.map((it) => ({ id: it.id, label: it.label, group: it.group, keywords: it.keywords, icon: 'grid', onSelect: () => { location.hash = `#/${it.id}`; } })),
          { id: 'theme', label: '切换明暗主题', group: '操作', icon: 'moon', keywords: 'theme dark light', onSelect: () => Nova.theme.toggle() },
        ],
      });
    } else {
      body.classList.add('nav-open');
      const first = $('.doc-sidebar .doc-nav-link');
      first && first.focus();
    }
  }
  $('[data-doc-search]').addEventListener('click', openSearch);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  });
})();
