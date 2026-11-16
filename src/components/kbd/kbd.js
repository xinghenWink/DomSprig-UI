/* DomSprig-UI · Kbd
 * <kbd class="nv-kbd" data-keys="mod+k"></kbd> → 按平台拆成多个按键：
 *   Mac：⌘ K    其他：Ctrl K（mod / ctrl / alt / shift / enter / esc / 方向键等有对应写法）
 * 结果是 <span class="nv-kbd-group"><kbd class="nv-kbd">⌘</kbd><kbd class="nv-kbd">K</kbd></span>，
 * 整组带 aria-label（如「Command K」），读屏不会念出符号。
 * Nova.kbd.isMac / Nova.kbd.format('mod+k') → ['⌘', 'K']
 */
(() => {
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
  const MAC = { mod: '⌘', cmd: '⌘', meta: '⌘', ctrl: '⌃', alt: '⌥', option: '⌥', shift: '⇧' };
  const WIN = { mod: 'Ctrl', cmd: 'Win', meta: 'Win', ctrl: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift' };
  const COMMON = { enter: '↵', return: '↵', esc: 'Esc', escape: 'Esc', tab: 'Tab', space: 'Space', backspace: '⌫', delete: 'Del', up: '↑', down: '↓', left: '←', right: '→', pageup: 'PgUp', pagedown: 'PgDn', home: 'Home', end: 'End', plus: '+' };
  const SPOKEN = { '⌘': 'Command', '⌃': 'Control', '⌥': 'Option', '⇧': 'Shift', '↵': 'Enter', '⌫': 'Backspace', '↑': '上', '↓': '下', '←': '左', '→': '右' };

  const format = (keys) => String(keys).split(/\s*\+\s*(?!$)/).filter(Boolean).map((k) => {
    const lk = k.toLowerCase();
    return (isMac ? MAC : WIN)[lk] || COMMON[lk] || (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));
  });

  Nova.define('kbd', '.nv-kbd[data-keys]', (el) => {
    const parts = format(el.dataset.keys);
    const label = parts.map((p) => SPOKEN[p] || p).join(' ');
    const make = (p) => {
      const k = el.cloneNode(false);
      k.removeAttribute('data-keys');
      k.textContent = p;
      return k;
    };
    if (parts.length === 1) {
      el.textContent = parts[0];
      el.setAttribute('aria-label', label);
      el.removeAttribute('data-keys');
      return {};
    }
    const group = Nova.h('span', { class: 'nv-kbd-group', 'aria-label': label, role: 'img' }, parts.map(make));
    el.replaceWith(group);
    return {};
  });

  Nova.kbd = { isMac, format };
})();
