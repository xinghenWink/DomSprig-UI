/* DomSprig-UI · Tag
 * - [data-closable]：追加关闭按钮。点击先派发可取消的 nv:close，未取消则播放退场动画并移除；
 *   data-closable="hide" 时只隐藏（hidden），不移除。
 * - [data-checkable]（建议用 <button>）：点击切换 aria-pressed，派发 nv:change { checked }。
 * - .nv-tag-group：组内可选标签的值汇总，派发 nv:change { value: [...] }；data-single 单选（可再次点击取消，
 *   加 data-required 则至少保留一个）。标签的值取 data-value，没有时取文字。
 * Nova.tag.close(el) / Nova.tag.toggle(el, force?) / Nova.get(group, 'tag-group').value（可读写，写入不派发事件）
 */
(() => {
  // 标签文字：跳过头像、图标、关闭按钮等装饰（文字头像本身也是文字，不能算进去）
  const SKIP = '.nv-avatar, .nv-tag-close, svg, [aria-hidden="true"]';
  const label = (el) => {
    const own = el.querySelector('.nv-tag-label');
    if (own) return own.textContent.trim();
    const copy = el.cloneNode(true);
    copy.querySelectorAll(SKIP).forEach((n) => n.remove());
    return copy.textContent.trim();
  };
  const valueOf = (el) => el.dataset.value ?? label(el);

  function close(el, { emit = true } = {}) {
    if (emit && !Nova.emit(el, 'nv:close', { value: valueOf(el) })) return false;
    // 焦点挪到相邻的可聚焦标签，避免丢失
    const next = el.nextElementSibling?.querySelector?.('.nv-tag-close') || el.previousElementSibling?.querySelector?.('.nv-tag-close');
    const hadFocus = el.contains(document.activeElement);
    const parent = el.parentElement;
    const done = () => {
      if (el.dataset.closable === 'hide') { el.hidden = true; el.removeAttribute('data-state'); }
      else el.remove();
      if (hadFocus) (next || parent)?.focus?.();
    };
    Nova.animateOut(el, done);
    return true;
  }

  function toggle(el, force, { emit = true } = {}) {
    const checked = force ?? el.getAttribute('aria-pressed') !== 'true';
    if (checked === (el.getAttribute('aria-pressed') === 'true')) return false;
    el.setAttribute('aria-pressed', String(checked));
    if (emit) Nova.emit(el, 'nv:change', { checked, value: valueOf(el) });
    return true;
  }

  Nova.define('tag', '.nv-tag', (el) => {
    if ('closable' in el.dataset && !el.querySelector(':scope > .nv-tag-close')) {
      const btn = Nova.h('button', {
        type: 'button',
        class: 'nv-tag-close',
        'aria-label': `移除 ${label(el)}`,
        html: Nova.icon('x', { size: 12, stroke: 2.25 }),
      });
      btn.addEventListener('click', (e) => { e.stopPropagation(); close(el); });
      el.append(btn);
    }
    if ('checkable' in el.dataset) {
      if (!el.hasAttribute('aria-pressed')) el.setAttribute('aria-pressed', 'false');
      if (!el.matches('button, a, [tabindex]')) { el.tabIndex = 0; el.setAttribute('role', 'button'); }
      const onClick = () => {
        const group = el.closest('.nv-tag-group');
        if (group && Nova.get(group, 'tag-group')) return; // 交给组处理
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
        toggle(el);
      };
      const onKey = (e) => {
        if (el.matches('button')) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      };
      el.addEventListener('click', onClick);
      el.addEventListener('keydown', onKey);
      return { toggle: (f) => toggle(el, f), destroy() { el.removeEventListener('click', onClick); el.removeEventListener('keydown', onKey); } };
    }
    return { close: () => close(el) };
  });

  Nova.define('tag-group', '.nv-tag-group', (group) => {
    const items = () => [...group.querySelectorAll('.nv-tag[data-checkable]')];
    const value = () => items().filter((t) => t.getAttribute('aria-pressed') === 'true').map(valueOf);
    const onClick = (e) => {
      const tag = e.target.closest('.nv-tag[data-checkable]');
      if (!tag || !group.contains(tag) || tag.disabled || tag.getAttribute('aria-disabled') === 'true') return;
      const on = tag.getAttribute('aria-pressed') === 'true';
      if ('single' in group.dataset) {
        if (on && 'required' in group.dataset) return;
        items().forEach((t) => t !== tag && toggle(t, false, { emit: false }));
      }
      toggle(tag, !on, { emit: false });
      Nova.emit(group, 'nv:change', { value: value() });
    };
    // 组内标签不单独派发 nv:change，只由组派发一次 { value: [...] }
    group.addEventListener('click', onClick);
    if (!group.hasAttribute('role')) group.setAttribute('role', 'group');
    return {
      get value() { return value(); },
      set value(v) {
        const set = new Set([].concat(v).map(String));
        items().forEach((t) => toggle(t, set.has(String(valueOf(t))), { emit: false }));
      },
      destroy() { group.removeEventListener('click', onClick); },
    };
  });

  Nova.tag = { close, toggle };
})();
