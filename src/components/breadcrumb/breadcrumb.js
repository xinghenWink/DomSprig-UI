/* Nova UI · Breadcrumb
 * - 最后一项没有 aria-current 时自动补上（最后一个 li 里的链接或文字视为当前页）。
 * - data-max="N"：项目数超过 N 时保留第一项和最后 N-2 项，中间折叠成「…」按钮。
 *   有 Dropdown 组件时点开是菜单（被折叠的链接依次列出）；没有时点击直接展开全部。
 * Nova.get(nav, 'breadcrumb').refresh()：增删项目后重新计算折叠。
 */
(() => {
  Nova.define('breadcrumb', '.nv-breadcrumb', (nav) => {
    const list = nav.querySelector(':scope > ol, :scope > ul');
    if (!list) return {};
    if (!nav.hasAttribute('aria-label')) nav.setAttribute('aria-label', '面包屑');
    let moreLi = null;
    let menu = null;

    const items = () => [...list.children].filter((li) => li !== moreLi);

    const markCurrent = () => {
      const all = items();
      const last = all[all.length - 1];
      if (!last || list.querySelector('[aria-current]')) return;
      const target = last.querySelector('a, span') || last;
      if (target === last) {
        const span = Nova.h('span', { 'aria-current': 'page' }, ...last.childNodes);
        last.append(span);
      } else target.setAttribute('aria-current', 'page');
    };

    const cleanup = () => {
      moreLi?.remove();
      menu?.remove();
      moreLi = menu = null;
      items().forEach((li) => { li.hidden = false; });
    };

    const refresh = () => {
      cleanup();
      markCurrent();
      const max = Number(nav.dataset.max) || 0;
      const all = items();
      if (!max || max < 3 || all.length <= max) return;
      const hidden = all.slice(1, all.length - (max - 2));
      hidden.forEach((li) => { li.hidden = true; });

      const btn = Nova.h('button', {
        type: 'button',
        class: 'nv-breadcrumb-more',
        'aria-label': `显示其余 ${hidden.length} 级`,
        html: Nova.icon('more', { size: 16 }),
      });
      moreLi = Nova.h('li', { 'data-nv-breadcrumb-more': '' }, btn);

      if (Nova.dropdown) {
        menu = Nova.h('div', { class: 'nv-menu', id: Nova.uid('nv-crumb-menu'), hidden: true },
          hidden.map((li) => {
            const link = li.querySelector('a');
            const text = (link || li).textContent.trim();
            return link
              ? Nova.h('a', { class: 'nv-item', role: 'menuitem', href: link.getAttribute('href') }, text)
              : Nova.h('div', { class: 'nv-item', role: 'menuitem', 'aria-disabled': 'true' }, text);
          }));
        nav.append(menu);
        btn.setAttribute('data-nv-dropdown', `#${menu.id}`);
      } else {
        btn.addEventListener('click', () => {
          hidden.forEach((li) => { li.hidden = false; });
          const first = hidden[0]?.querySelector('a');
          moreLi.remove();
          moreLi = null;
          first?.focus();
        });
      }
      all[0].after(moreLi);
      // 首屏初始化期间插入的节点不会被 MutationObserver 捕获，手动升级一次（重复调用是幂等的）
      Nova.init(moreLi);
    };

    refresh();
    return { refresh, destroy: cleanup };
  });
})();
