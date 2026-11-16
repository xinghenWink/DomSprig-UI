/* Nova UI · Input
 * 增强 <input> 的三项能力（纯外观无需 JS）：
 *   data-clearable                 有内容时显示清除按钮（data-clear-label 覆盖文案）
 *   type="password" data-toggle     显示/隐藏密码（data-show-label / data-hide-label）
 *   maxlength + data-count          字数统计「12/50」；无 maxlength 时只显示字数
 * 独立的 <input class="nv-input"> 会被包进 <div class="nv-control nv-input-box">（data-size / data-variant 一并转移）。
 * 实例：Nova.get(input, 'input') → { clear, refresh, destroy }
 */
(() => {
  const { Nova } = window;
  const FEATURES = ':is([data-clearable], [data-toggle], [data-count])';

  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

  Nova.define('input', `input.nv-input${FEATURES}, .nv-control > input${FEATURES}`, (input) => {
    const o = Nova.opts(input, {
      clearable: false,
      toggle: false,
      count: false,
      clearLabel: '清除',
      showLabel: '显示密码',
      hideLabel: '隐藏密码',
    });
    let box = input.parentElement && input.parentElement.classList.contains('nv-control') ? input.parentElement : null;
    let wrapped = false;
    if (!box) {
      box = Nova.h('div', { class: 'nv-control nv-input-box' });
      for (const k of ['size', 'variant']) if (input.dataset[k]) box.dataset[k] = input.dataset[k];
      input.before(box);
      box.append(input);
      wrapped = true;
    }
    const added = [];
    const cleanups = [];
    const on = (t, type, fn) => { t.addEventListener(type, fn); cleanups.push(() => t.removeEventListener(type, fn)); };
    let anchor = input;
    const place = (node) => { anchor.after(node); anchor = node; added.push(node); return node; };

    let clearBtn = null;
    if (o.clearable) {
      clearBtn = place(Nova.h('button', {
        type: 'button',
        class: 'nv-control-btn nv-input-clear',
        tabindex: '-1',
        'aria-label': o.clearLabel,
        html: Nova.icon('x', { size: 14 }),
        hidden: true,
      }));
      // pointerdown 阻止默认：点清除时输入框不失焦
      on(clearBtn, 'pointerdown', (e) => e.preventDefault());
      on(clearBtn, 'click', () => clear());
    }

    let countEl = null;
    const max = Number(input.getAttribute('maxlength')) || 0;
    if (o.count) {
      countEl = place(Nova.h('span', { class: 'nv-input-count', 'aria-hidden': 'true' }));
    }

    let toggleBtn = null;
    if (o.toggle && input.type === 'password') {
      toggleBtn = place(Nova.h('button', {
        type: 'button',
        class: 'nv-control-btn nv-input-toggle',
        'aria-label': o.showLabel,
        'aria-pressed': 'false',
        html: Nova.icon('eye'),
      }));
      if (input.id) toggleBtn.setAttribute('aria-controls', input.id);
      on(toggleBtn, 'click', () => {
        const show = input.type === 'password';
        // 保持光标位置
        const { selectionStart: s, selectionEnd: e } = input;
        input.type = show ? 'text' : 'password';
        toggleBtn.setAttribute('aria-pressed', String(show));
        toggleBtn.setAttribute('aria-label', show ? o.hideLabel : o.showLabel);
        toggleBtn.innerHTML = Nova.icon(show ? 'eye-off' : 'eye');
        if (document.activeElement === input) { try { input.setSelectionRange(s, e); } catch (_) { /* ignore */ } }
      });
    }

    // 点击包装空白处聚焦输入框
    if (wrapped) on(box, 'pointerdown', (e) => {
      if (e.target === box) { e.preventDefault(); input.focus(); }
    });

    const refresh = () => {
      const len = [...input.value].length;
      if (clearBtn) clearBtn.hidden = !len || input.disabled || input.readOnly;
      if (countEl) {
        countEl.textContent = max ? `${len}/${max}` : String(len);
        countEl.toggleAttribute('data-full', !!max && len >= max);
      }
    };
    function clear() {
      if (input.disabled || input.readOnly || !input.value) return;
      input.value = '';
      fire(input, 'input');
      fire(input, 'change');
      Nova.emit(input, 'nv:clear');
      input.focus();
      refresh();
    }
    on(input, 'input', refresh);
    on(input, 'change', refresh);
    const form = input.form;
    if (form) on(form, 'reset', () => setTimeout(refresh));
    // 有些浏览器在自动填充时不派发 input
    on(input, 'animationstart', refresh);
    refresh();

    // 屏幕阅读器字数提示：接近上限时朗读
    if (countEl && max) {
      const live = place(Nova.h('span', { class: 'nv-sr-only', 'aria-live': 'polite' }));
      let lastSpoken = -1;
      on(input, 'input', () => {
        const left = max - [...input.value].length;
        if (left <= Math.min(10, Math.ceil(max * 0.1)) && left !== lastSpoken) {
          live.textContent = left > 0 ? `还可输入 ${left} 字` : '已达到字数上限';
          lastSpoken = left;
        }
      });
    }

    return {
      clear,
      refresh,
      destroy() {
        cleanups.forEach((f) => f());
        added.forEach((n) => n.remove());
        if (toggleBtn) input.type = 'password';
        if (wrapped) { box.before(input); box.remove(); }
      },
    };
  });

  Nova.input = {
    clear: (el) => Nova.get(el, 'input')?.clear(),
    refresh: (el) => Nova.get(el, 'input')?.refresh(),
  };
})();
