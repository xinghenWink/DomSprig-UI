// Empty：插画注入、不重复注入、保留自定义图形、默认文案与覆盖、属性变化重绘、搜索示例
export const components = ['empty'];

export default async ({ page, assert, sleep }) => {
  const r = await page.evaluate(async () => {
    const box = document.createElement('div');
    box.innerHTML = `
      <div class="nv-empty" id="t-def"></div>
      <div class="nv-empty" id="t-search" data-image="search"><div class="nv-empty-title">自定义标题</div></div>
      <div class="nv-empty" id="t-custom" data-image="error"><div class="nv-empty-image"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div></div>
      <div class="nv-empty" id="t-icon"><span class="nv-empty-icon"><i data-nv-icon="file"></i></span></div>
      <div class="nv-empty" id="t-none" data-image="none" data-title="" data-description="只有描述"></div>
      <div class="nv-empty" id="t-unknown" data-image="nope"></div>
      <div class="nv-empty" id="t-xss" data-title="<img src=x onerror=window.__xss=1>"></div>
      <div class="nv-empty" id="t-n1" data-image="network"></div><div class="nv-empty" id="t-n2" data-image="network"></div>`;
    document.body.append(box);
    await new Promise((res) => setTimeout(res, 30));
    const $ = (id) => document.getElementById(id);
    const imgs = (id) => $(id).querySelectorAll('.nv-empty-image, .nv-empty-icon').length;
    const text = (id, sel) => $(id).querySelector(sel)?.textContent ?? null;
    const masks = [...document.querySelectorAll('#t-n1 mask, #t-n2 mask')].map((m) => m.id);
    return {
      def: { svg: !!$('t-def').querySelector('.nv-empty-image svg'), aria: $('t-def').querySelector('.nv-empty-image').getAttribute('aria-hidden'),
        title: text('t-def', '.nv-empty-title'), desc: text('t-def', '.nv-empty-desc'), first: $('t-def').firstElementChild.className },
      search: { titles: $('t-search').querySelectorAll('.nv-empty-title').length, title: text('t-search', '.nv-empty-title'),
        desc: text('t-search', '.nv-empty-desc'), order: [...$('t-search').children].map((c) => c.className).join(' ') },
      custom: { imgs: imgs('t-custom'), img: !!$('t-custom').querySelector('img'), svg: !!$('t-custom').querySelector('svg'), title: text('t-custom', '.nv-empty-title') },
      icon: imgs('t-icon'),
      none: { imgs: imgs('t-none'), title: text('t-none', '.nv-empty-title'), desc: text('t-none', '.nv-empty-desc') },
      unknown: { svg: !!$('t-unknown').querySelector('svg'), title: text('t-unknown', '.nv-empty-title') },
      xss: { title: text('t-xss', '.nv-empty-title'), img: !!$('t-xss').querySelector('.nv-empty-title img') },
      masks,
      accent: getComputedStyle($('t-custom')).getPropertyValue('--_accent').trim() !== getComputedStyle($('t-def')).getPropertyValue('--_accent').trim(),
    };
  });
  assert.equal(r.def.svg, true, '默认注入插画');
  assert.equal(r.def.aria, 'true', '插画 aria-hidden');
  assert.equal(r.def.first, 'nv-empty-image', '插画在最前');
  assert.equal(r.def.title, '暂无数据', '默认标题');
  assert.equal(r.def.desc, '这里还没有任何内容。', '默认描述');
  assert.equal(r.search.titles, 1, '已有标题不重复注入');
  assert.equal(r.search.title, '自定义标题', '保留作者标题');
  assert.equal(r.search.desc, null, '手写标题时不补默认描述');
  assert.equal(r.search.order, 'nv-empty-image nv-empty-title', '插画插在标题前');
  assert.equal(r.custom.imgs, 1, '自定义插画不再注入');
  assert.equal(r.custom.img && !r.custom.svg, true, '保留作者 img');
  assert.equal(r.custom.title, '加载失败', 'error 默认标题');
  assert.equal(r.icon, 1, '图标方块不再注入插画');
  assert.equal(r.none.imgs, 0, 'data-image=none 无插画');
  assert.equal(r.none.title, null, 'data-title="" 不显示标题');
  assert.equal(r.none.desc, '只有描述', 'data-description 覆盖');
  assert.equal(r.unknown.svg && r.unknown.title === '暂无数据', true, '未知类型回退 default');
  assert.equal(r.xss.img, false, 'data-title 走 textContent');
  assert(r.xss.title.startsWith('<img'), '标题按文本显示');
  assert.equal(r.masks.length, 2, '两个 network 插画');
  assert(r.masks[0] !== r.masks[1], `mask id 唯一（${r.masks}）`);
  assert.equal(r.accent, true, 'error 使用不同强调色');

  // 属性变化自动重绘，不重复注入；destroy 移除注入内容
  const re = await page.evaluate(async () => {
    const el = document.getElementById('t-def');
    el.dataset.image = 'inbox';
    await new Promise((res) => setTimeout(res, 20));
    const a = { imgs: el.querySelectorAll('.nv-empty-image').length, title: el.querySelector('.nv-empty-title').textContent };
    el.dataset.title = '没有新消息';
    await new Promise((res) => setTimeout(res, 20));
    const b = { titles: el.querySelectorAll('.nv-empty-title').length, title: el.querySelector('.nv-empty-title').textContent, desc: el.querySelector('.nv-empty-desc').textContent };
    Nova.empty.refresh(el);
    Nova.empty.refresh();
    const c = el.querySelectorAll('.nv-empty-image, .nv-empty-title, .nv-empty-desc').length;
    // 动态注册新插画
    Nova.empty.images.box = '<svg viewBox="0 0 10 10" id="t-box-svg"></svg>';
    Nova.empty.texts.box = { title: '盒子', description: '' };
    delete el.dataset.title;
    el.dataset.image = 'box';
    await new Promise((res) => setTimeout(res, 20));
    const d = { svg: !!el.querySelector('#t-box-svg'), title: el.querySelector('.nv-empty-title').textContent };
    Nova.get(el, 'empty').destroy();
    return { a, b, c, d, after: el.children.length };
  });
  assert.equal(re.a.imgs, 1, '切换类型只有一幅插画');
  assert.equal(re.a.title, '暂无消息', '切换类型后更新默认文案');
  assert.equal(re.b.titles, 1, 'data-title 变化不重复');
  assert.equal(re.b.title, '没有新消息', 'data-title 生效');
  assert.equal(re.b.desc, '新的通知和消息会显示在这里。', '描述仍为默认');
  assert.equal(re.c, 3, 'refresh 不重复注入');
  assert.equal(re.d.svg && re.d.title === '盒子', true, '注册新插画与文案');
  assert.equal(re.after, 0, 'destroy 清理注入节点');

  // 文档示例：自定义 cart 插画在定义前注册也能生效（示例脚本先于初始化执行）
  const cart = await page.evaluate(() => {
    const el = document.querySelector('.nv-empty[data-image="cart"]');
    return { title: el.querySelector('.nv-empty-title')?.textContent, svg: !!el.querySelector('.nv-empty-image svg'), firstIsImage: el.firstElementChild.classList.contains('nv-empty-image') };
  });
  assert.equal(cart.title, '购物车是空的', 'cart 默认标题');
  assert.equal(cart.svg && cart.firstIsImage, true, 'cart 插画');

  // 搜索示例：初始无结果 → 清除后显示列表并聚焦输入框
  const s0 = await page.evaluate(() => ({ empty: document.getElementById('empty-search-empty').hidden, term: document.getElementById('empty-search-term').textContent }));
  assert.equal(s0.empty, false, '「财务」无结果时显示空状态');
  assert.equal(s0.term, '财务', '搜索词写入描述');
  await page.click('#empty-search-clear');
  await sleep(50);
  const s1 = await page.evaluate(() => ({
    empty: document.getElementById('empty-search-empty').hidden,
    list: document.getElementById('empty-search-list').hidden,
    focus: document.activeElement.id,
  }));
  assert.equal(s1.empty, true, '清除后隐藏空状态');
  assert.equal(s1.list, false, '清除后显示列表');
  assert.equal(s1.focus, 'empty-search-input', '焦点回到输入框');
  await page.type('#empty-search-input', '研发');
  const s2 = await page.evaluate(() => [...document.querySelectorAll('#empty-search-list > :not([hidden])')].length);
  assert.equal(s2, 2, '过滤出 2 位研发部成员');
  const vis = await page.evaluate(() => getComputedStyle(document.getElementById('empty-search-empty')).display);
  assert.equal(vis, 'none', 'hidden 的空状态不显示');
};
