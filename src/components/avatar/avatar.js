/* Nova UI · Avatar
 * - data-name：生成文字头像。中文取最后两个字（xs 尺寸取一个），英文取前两个单词的首字母；
 *   色相由名字哈希得出，同名同色。写了 data-color 则不自动配色。
 * - 图片加载失败：回退为文字头像（名字取 data-name 或 img 的 alt），都没有时显示 user 图标。
 * - .nv-avatar-group[data-max]：最多显示 max 个，其余隐藏并在末尾追加 +N（title 列出被隐藏的名字）。
 * Nova.avatar.initials(name, max?) / Nova.avatar.hue(name)
 */
(() => {
  const CJK = /[㐀-鿿豈-﫿]/;
  const hue = (name) => {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % 360;
  };
  const initials = (name, max = 2) => {
    const s = String(name || '').trim();
    if (!s) return '';
    if (CJK.test(s)) return [...s.replace(/\s+/g, '')].slice(-max).join('');
    const words = s.split(/[\s._-]+/).filter(Boolean);
    return words.slice(0, max).map((w) => [...w][0]).join('').toUpperCase();
  };

  function paint(el, name) {
    el.textContent = '';
    const text = initials(name, el.dataset.size === 'xs' ? 1 : 2);
    if (text) {
      el.append(text);
      el.dataset.chars = String([...text].length);
    } else {
      el.insertAdjacentHTML('beforeend', Nova.icon('user'));
    }
    if (!el.matches('a, button') && !el.hasAttribute('aria-label')) {
      el.setAttribute('role', 'img');
      if (name) el.setAttribute('aria-label', name);
    }
  }

  Nova.define('avatar', '.nv-avatar', (el) => {
    if (el.classList.contains('nv-avatar-more')) return {};
    const img = el.querySelector(':scope > img');
    const name = el.dataset.name || img?.alt || '';
    if (name && !el.dataset.color) el.style.setProperty('--_hue', String(hue(name)));

    if (img) {
      const fallback = () => paint(el, name);
      if (img.complete && img.getAttribute('src') && img.naturalWidth === 0) fallback();
      else img.addEventListener('error', fallback, { once: true });
    } else if (!el.textContent.trim() && !el.querySelector('svg, [data-nv-icon]')) {
      paint(el, name);
    }
    return {};
  });

  Nova.define('avatar-group', '.nv-avatar-group', (el) => {
    const avatars = () => [...el.querySelectorAll(':scope > .nv-avatar:not(.nv-avatar-more)')];
    const refresh = () => {
      el.querySelectorAll(':scope > .nv-avatar-more').forEach((m) => m.remove());
      const items = avatars();
      if (el.dataset.size) items.forEach((a) => { a.dataset.size = el.dataset.size; });
      items.forEach((a) => { a.hidden = false; });
      const max = Number(el.dataset.max) || 0;
      if (!max || items.length <= max) return;
      const rest = items.slice(max);
      rest.forEach((a) => { a.hidden = true; });
      const names = rest.map((a) => a.dataset.name || a.querySelector('img')?.alt || '').filter(Boolean);
      el.append(Nova.h('span', {
        class: 'nv-avatar nv-avatar-more',
        role: 'img',
        'aria-label': `另有 ${rest.length} 人`,
        title: names.join('、') || null,
        'data-size': items[0].dataset.size || null,
        'data-shape': items[0].dataset.shape || null,
      }, `+${rest.length}`));
    };
    refresh();
    const mo = new MutationObserver((records) => {
      const changed = records.some((r) => [...r.addedNodes, ...r.removedNodes]
        .some((n) => n.nodeType === 1 && !n.classList.contains('nv-avatar-more')));
      if (changed) refresh();
    });
    mo.observe(el, { childList: true });
    return { refresh, destroy() { mo.disconnect(); } };
  });

  Nova.avatar = { initials, hue };
})();
