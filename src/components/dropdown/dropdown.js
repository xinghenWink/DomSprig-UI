/* Nova UI · Dropdown 下拉菜单（WAI-ARIA APG Menu Button）
 * <button data-nv-dropdown="#m1">操作</button>
 * <div class="nv-menu" id="m1" hidden>
 *   <div class="nv-panel-label">分组标题</div>
 *   <button class="nv-item" role="menuitem">新建<kbd class="nv-item-kbd">Ctrl N</kbd></button>
 *   <button class="nv-item" role="menuitemcheckbox" aria-checked="true">显示网格</button>
 *   <div role="group"><button class="nv-item" role="menuitemradio" aria-checked="true">…</button></div>
 *   <button class="nv-item" role="menuitem" data-nv-submenu="#sub">分享到</button>
 *   <hr class="nv-panel-sep">
 *   <button class="nv-item" role="menuitem" data-color="danger">删除</button>
 * </div>
 * 右键菜单：<div data-nv-context-menu="#m1">…</div> 在指针位置打开。
 * 事件（在触发器 / 右键区域上）：nv:open、nv:close、nv:select（detail: { item, value, checked, target }）
 * Nova.dropdown.open(trigger) / close(trigger) / toggle(trigger) / isOpen(trigger)
 */
(() => {
  const { Nova } = window;
  const ITEM = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
  const menus = new Map(); // 选择器 → 菜单元素（关闭后菜单会从 DOM 移除，这里保留引用）
  const owners = new WeakMap(); // 菜单 → 正在使用它的根控制器（同一菜单被多个触发器共用时互斥）
  const prepared = new WeakSet();

  const findMenu = (sel) => {
    if (!sel) return null;
    const el = document.querySelector(sel) || menus.get(sel) || null;
    if (el) menus.set(sel, el);
    return el;
  };
  const ownItems = (menu) => [...menu.querySelectorAll(ITEM)].filter((el) => el.closest('.nv-menu') === menu);
  const isDisabled = (el) => el.getAttribute('aria-disabled') === 'true';
  const labelOf = (item) => {
    const label = item.querySelector('.nv-item-label');
    if (label) return label.textContent.trim();
    const clone = item.cloneNode(true);
    clone.querySelectorAll('.nv-item-kbd, .nv-item-desc, .nv-menu-indicator, .nv-menu-sub-icon').forEach((n) => n.remove());
    return clone.textContent.trim();
  };

  function prepareMenu(menu) {
    if (!prepared.has(menu)) {
      prepared.add(menu);
      menu.classList.add('nv-panel');
      if (!menu.hasAttribute('role')) menu.setAttribute('role', 'menu');
      if (!menu.id) menu.id = Nova.uid('nv-menu');
      menu.tabIndex = -1;
    }
    // 每次打开都整理一遍菜单项，动态增删的项也能正确工作
    for (const item of ownItems(menu)) {
      item.classList.add('nv-item');
      item.tabIndex = -1;
      if (item.tagName === 'BUTTON' && !item.hasAttribute('type')) item.type = 'button';
      if (item.disabled) item.setAttribute('aria-disabled', 'true');
      const role = item.getAttribute('role');
      if ((role === 'menuitemcheckbox' || role === 'menuitemradio') && !item.querySelector(':scope > .nv-menu-indicator')) {
        if (!item.hasAttribute('aria-checked')) item.setAttribute('aria-checked', 'false');
        item.prepend(Nova.h('span', {
          class: 'nv-menu-indicator',
          'data-type': role === 'menuitemradio' ? 'radio' : 'checkbox',
          'aria-hidden': 'true',
          html: role === 'menuitemradio' ? '' : Nova.icon('check', { size: 14, stroke: 2.5 }),
        }));
      }
      if (item.hasAttribute('data-nv-submenu')) {
        item.setAttribute('aria-haspopup', 'menu');
        if (!item.hasAttribute('aria-expanded')) item.setAttribute('aria-expanded', 'false');
        if (!item.querySelector(':scope > .nv-menu-sub-icon')) {
          item.append(Nova.h('span', { class: 'nv-menu-sub-icon', 'aria-hidden': 'true', html: Nova.icon('chevron-right', { size: 16 }) }));
        }
      }
    }
    for (const sep of menu.querySelectorAll('.nv-panel-sep')) if (!sep.hasAttribute('role')) sep.setAttribute('role', 'separator');
    for (const label of menu.querySelectorAll('.nv-panel-label')) {
      // 分组标题：作为所在 role=group 的名称；不在分组内时对读屏隐藏（菜单内只允许菜单项）
      const group = label.closest('[role="group"]');
      if (group && group.closest('.nv-menu') === menu && !group.hasAttribute('aria-labelledby')) {
        if (!label.id) label.id = Nova.uid('nv-menu-label');
        group.setAttribute('aria-labelledby', label.id);
      } else if (!group && !label.hasAttribute('role')) label.setAttribute('role', 'presentation');
    }
  }

  /**
   * 打开一个菜单（根菜单或子菜单），返回控制器 ctl。
   * o: { placement, offset, parent, owner, focus: 'first'|'last'|'menu'|'none', target, onClose(reason, hadFocus) }
   */
  function openMenu(menu, anchor, o) {
    prepareMenu(menu);
    menu.hidden = false;
    menu.toggleAttribute('data-sub', !!o.parent);
    const ctl = { menu, anchor, parent: o.parent || null, child: null, owner: o.owner, target: o.target, subTimer: 0, closed: false };
    ctl.root = ctl.parent ? ctl.parent.root : ctl;
    const nav = Nova.roving(() => ownItems(menu), {
      onChange: (el) => el && el.focus({ preventScroll: true }),
    });
    ctl.nav = nav;

    const f = Nova.floating(menu, anchor, {
      placement: o.placement,
      offset: o.offset,
      onDismiss: (reason) => {
        if (reason === 'escape' && ctl.parent) ctl.close('escape', { focusAnchor: true });
        else ctl.close(reason);
      },
    });

    const openSub = (item, focus) => {
      clearTimeout(ctl.subTimer);
      if (ctl.child && ctl.child.anchor === item) {
        if (focus === 'first') ctl.child.nav.first();
        return;
      }
      if (ctl.child) ctl.child.close('switch');
      const sub = findMenu(item.dataset.nvSubmenu);
      if (!sub || isDisabled(item)) return;
      item.setAttribute('aria-expanded', 'true');
      ctl.child = openMenu(sub, item, { placement: 'right-start', offset: 4, parent: ctl, owner: ctl.owner, target: ctl.target, focus });
    };
    const closeSub = () => { clearTimeout(ctl.subTimer); if (ctl.child) ctl.child.close('switch'); };

    let lastKey = '';
    function activate(item) {
      const role = item.getAttribute('role');
      let checked;
      if (role === 'menuitemcheckbox') {
        checked = item.getAttribute('aria-checked') !== 'true';
        item.setAttribute('aria-checked', String(checked));
      } else if (role === 'menuitemradio') {
        const group = item.closest('[role="group"]') || menu;
        for (const r of group.querySelectorAll('[role="menuitemradio"]')) {
          if (r.closest('.nv-menu') === menu) r.setAttribute('aria-checked', String(r === item));
        }
        checked = true;
      }
      // 勾选项：点击与空格保持菜单打开、回车关闭；普通项选择后关闭（data-keep-open 可保持）
      const toggleItem = role === 'menuitemcheckbox' || role === 'menuitemradio';
      const keep = item.hasAttribute('data-keep-open') || (toggleItem && lastKey !== 'Enter');
      const detail = { item, value: item.dataset.value ?? labelOf(item), checked, target: ctl.target };
      const owner = ctl.owner;
      if (keep) { Nova.emit(owner, 'nv:select', detail); return; }
      if (item.tagName === 'A' && item.href) {
        // 链接：等浏览器完成跳转的默认行为后再关闭（同步移除会取消跳转）
        Nova.emit(owner, 'nv:select', detail);
        setTimeout(() => ctl.root.close('select'));
        return;
      }
      ctl.root.close('select'); // 先关闭并还焦，再派发事件：回调里打开对话框时焦点能正确回到触发器
      Nova.emit(owner, 'nv:select', detail);
    }

    const onKey = (e) => {
      if (e.isComposing) return;
      const item = nav.active;
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (!item) return;
          if (item.hasAttribute('data-nv-submenu')) { openSub(item, 'first'); return; }
          lastKey = e.key;
          item.click(); // 统一走 click：链接照常跳转
          lastKey = '';
          return;
        case 'ArrowRight':
          if (item && item.hasAttribute('data-nv-submenu')) { e.preventDefault(); openSub(item, 'first'); }
          return;
        case 'ArrowLeft':
          if (ctl.parent) { e.preventDefault(); ctl.close('left', { focusAnchor: true }); }
          return;
        case 'Tab':
          // APG：Tab 关闭菜单，焦点回到触发器后由浏览器默认行为移到下一个元素
          ctl.root.close('tab');
          return;
        default:
          nav.key(e);
          // 键盘移到其它项时收起已展开的子菜单
          if (ctl.child && nav.active !== ctl.child.anchor) closeSub();
      }
    };
    // 空格的默认激活发生在 keyup：已在 keydown 中处理，这里阻止，避免勾选项被切换两次
    const onKeyUp = (e) => { if (e.key === ' ') e.preventDefault(); };
    const onMove = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      const item = e.target.closest(ITEM);
      if (!item || item.closest('.nv-menu') !== menu) return;
      if (isDisabled(item)) {
        if (nav.active) { nav.reset(); menu.focus({ preventScroll: true }); }
        return;
      }
      if (nav.active !== item) nav.set(item, { scroll: false });
      if (item.hasAttribute('data-nv-submenu')) {
        if (!ctl.child || ctl.child.anchor !== item) {
          clearTimeout(ctl.subTimer);
          ctl.subTimer = setTimeout(() => openSub(item, 'none'), 100);
        } else clearTimeout(ctl.subTimer);
      } else if (ctl.child) {
        clearTimeout(ctl.subTimer);
        ctl.subTimer = setTimeout(closeSub, 260); // 给斜向移入子菜单留出时间
      }
    };
    const onEnter = () => {
      if (!ctl.parent) return;
      clearTimeout(ctl.parent.subTimer);
      if (ctl.parent.nav.active !== anchor) ctl.parent.nav.set(anchor, { scroll: false });
    };
    const onLeave = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (!ctl.child) clearTimeout(ctl.subTimer);
      if (!ctl.child && nav.active && menu.contains(document.activeElement)) { nav.reset(); menu.focus({ preventScroll: true }); }
    };
    const onClick = (e) => {
      const item = e.target.closest(ITEM);
      if (!item || item.closest('.nv-menu') !== menu) return;
      if (isDisabled(item)) { e.preventDefault(); return; }
      if (item.hasAttribute('data-nv-submenu')) { e.preventDefault(); openSub(item, e.detail === 0 ? 'first' : 'none'); return; }
      activate(item);
    };
    menu.addEventListener('keydown', onKey);
    menu.addEventListener('keyup', onKeyUp);
    menu.addEventListener('pointermove', onMove);
    menu.addEventListener('pointerenter', onEnter);
    menu.addEventListener('pointerleave', onLeave);
    menu.addEventListener('click', onClick);

    ctl.close = (reason, { focusAnchor = false } = {}) => {
      if (ctl.closed) return;
      const ae = document.activeElement;
      const hadFocus = !!(ae && (ae === document.body || (ae.closest && ae.closest('.nv-menu'))));
      ctl.closed = true;
      clearTimeout(ctl.subTimer);
      if (ctl.child) ctl.child.close(reason);
      f.close();
      nav.reset();
      menu.removeEventListener('keydown', onKey);
      menu.removeEventListener('keyup', onKeyUp);
      menu.removeEventListener('pointermove', onMove);
      menu.removeEventListener('pointerenter', onEnter);
      menu.removeEventListener('pointerleave', onLeave);
      menu.removeEventListener('click', onClick);
      if (ctl.parent) {
        ctl.parent.child = null;
        anchor.setAttribute('aria-expanded', 'false');
        if (focusAnchor) { ctl.parent.nav.set(anchor); anchor.focus({ preventScroll: true }); }
      }
      if (o.onClose) o.onClose(reason, hadFocus);
    };

    if (o.focus === 'first') nav.first();
    else if (o.focus === 'last') nav.last();
    else if (o.focus === 'menu') menu.focus({ preventScroll: true });
    return ctl;
  }

  // 同一菜单只允许一处打开：打开前关闭之前的使用者
  const claim = (menu, ctlRef) => {
    const prev = owners.get(menu);
    if (prev && prev !== ctlRef && !prev.closed) prev.close('replace');
  };

  /* ————————————— 下拉菜单触发器 ————————————— */
  Nova.define('dropdown', '[data-nv-dropdown]', (trigger) => {
    const menu = findMenu(trigger.dataset.nvDropdown);
    if (!menu) { console.warn('[Nova] dropdown：找不到菜单', trigger.dataset.nvDropdown); return {}; }
    prepareMenu(menu);
    const o = Nova.opts(trigger, Nova.opts(menu, { placement: 'bottom-start', offset: 6 }));
    if (!trigger.id) trigger.id = Nova.uid('nv-menu-trigger');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', menu.id);
    let ctl = null;
    const disabled = () => trigger.disabled || trigger.getAttribute('aria-disabled') === 'true';

    function open(focus = 'first') {
      if (disabled()) return;
      if (ctl) {
        if (focus === 'first') ctl.nav.first();
        else if (focus === 'last') ctl.nav.last();
        return;
      }
      claim(menu, null);
      menu.setAttribute('aria-labelledby', trigger.id);
      ctl = openMenu(menu, trigger, {
        placement: o.placement,
        offset: o.offset,
        owner: trigger,
        focus,
        onClose: (reason, hadFocus) => {
          ctl = null;
          trigger.setAttribute('aria-expanded', 'false');
          delete trigger.dataset.state;
          if (reason !== 'replace' && (reason !== 'outside' || hadFocus) && trigger.isConnected) trigger.focus({ preventScroll: true });
          Nova.emit(trigger, 'nv:close', { reason });
        },
      });
      owners.set(menu, ctl);
      trigger.setAttribute('aria-expanded', 'true');
      trigger.dataset.state = 'open';
      Nova.emit(trigger, 'nv:open', { menu });
    }
    const close = (reason = 'api') => ctl && ctl.close(reason);

    const onClick = (e) => {
      if (disabled()) return;
      if (trigger.tagName === 'A') e.preventDefault();
      if (ctl) close('trigger');
      else open(e.detail === 0 ? 'first' : 'menu'); // 键盘（Enter / 空格）聚焦首项；鼠标只聚焦菜单
    };
    const onKey = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        open(e.key === 'ArrowDown' ? 'first' : 'last');
      } else if (trigger.tagName !== 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        if (ctl) close('trigger'); else open('first');
      }
    };
    trigger.addEventListener('click', onClick);
    trigger.addEventListener('keydown', onKey);
    return {
      open: () => open('first'),
      close: () => close('api'),
      toggle: () => (ctl ? close('api') : open('first')),
      get isOpen() { return !!ctl; },
      menu,
      destroy() {
        close('destroy');
        trigger.removeEventListener('click', onClick);
        trigger.removeEventListener('keydown', onKey);
      },
    };
  });

  /* ————————————— 右键菜单 ————————————— */
  Nova.define('context-menu', '[data-nv-context-menu]', (area) => {
    const menu = findMenu(area.dataset.nvContextMenu);
    if (!menu) { console.warn('[Nova] context-menu：找不到菜单', area.dataset.nvContextMenu); return {}; }
    prepareMenu(menu);
    let ctl = null;
    let stopScroll = null;

    function openAt(x, y, { target = area, viaKeyboard = false } = {}) {
      if (area.getAttribute('aria-disabled') === 'true') return;
      if (ctl) ctl.close('replace');
      claim(menu, null);
      const restoreTo = document.activeElement;
      menu.removeAttribute('aria-labelledby');
      if (!menu.hasAttribute('aria-label')) menu.setAttribute('aria-label', area.dataset.menuLabel || '右键菜单');
      const rect = { left: x, right: x, top: y, bottom: y, width: 0, height: 0 };
      const mine = openMenu(menu, rect, {
        placement: 'bottom-start',
        offset: 2,
        owner: area,
        target,
        focus: viaKeyboard ? 'first' : 'menu',
        onClose: (reason, hadFocus) => {
          if (ctl === mine) ctl = null;
          if (stopScroll && !ctl) { stopScroll(); stopScroll = null; }
          if (reason !== 'replace' && hadFocus && restoreTo && restoreTo !== document.body && restoreTo.isConnected) restoreTo.focus({ preventScroll: true });
          Nova.emit(area, 'nv:close', { reason });
        },
      });
      ctl = mine;
      owners.set(menu, ctl);
      // 与系统菜单一致：页面滚动或窗口缩放时关闭（菜单内部滚动除外）
      if (!stopScroll) {
        const onScroll = (e) => { if (ctl && !(e.target.closest && e.target.closest('.nv-menu'))) ctl.close('scroll'); };
        const onResize = () => ctl && ctl.close('resize');
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);
        stopScroll = () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onResize); };
      }
      Nova.emit(area, 'nv:open', { menu, target, x, y });
    }

    const onContext = (e) => {
      if (area.getAttribute('aria-disabled') === 'true') return;
      e.preventDefault();
      // 键盘（菜单键 / Shift+F10）触发：Chrome 为 PointerEvent，button = -1 且 pointerType 仍是 mouse；
      // Firefox 为 button 0 的 MouseEvent。此时在目标元素左下方打开并聚焦首项
      const viaKeyboard = e.button === -1 || (e.button !== 2 && !['mouse', 'touch', 'pen'].includes(e.pointerType));
      let { clientX: x, clientY: y } = e;
      if (viaKeyboard || (!x && !y)) {
        const r = (e.target.getBoundingClientRect ? e.target : area).getBoundingClientRect();
        x = r.left + Math.min(16, r.width / 2);
        y = r.top + Math.min(r.height, 32);
      }
      openAt(x, y, { target: e.target, viaKeyboard });
    };
    area.addEventListener('contextmenu', onContext);
    return {
      openAt,
      close: () => ctl && ctl.close('api'),
      get isOpen() { return !!ctl; },
      menu,
      destroy() {
        if (ctl) ctl.close('destroy');
        area.removeEventListener('contextmenu', onContext);
      },
    };
  });

  const get = (t, name) => {
    const el = typeof t === 'string' ? document.querySelector(t) : t;
    if (!el) return null;
    return Nova.get(el, name) || (Nova.init(el), Nova.get(el, name));
  };
  Nova.dropdown = {
    open: (t) => get(t, 'dropdown')?.open(),
    close: (t) => get(t, 'dropdown')?.close(),
    toggle: (t) => get(t, 'dropdown')?.toggle(),
    isOpen: (t) => !!get(t, 'dropdown')?.isOpen,
    /** 在指定坐标打开右键菜单：Nova.dropdown.openContext(area, x, y) */
    openContext: (t, x, y) => get(t, 'context-menu')?.openAt(x, y),
  };
})();
