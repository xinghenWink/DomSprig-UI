/* Nova UI · Pin Input
 * <input class="nv-pin" name="code" data-length="6" aria-label="验证码">
 * 只有一个真实 input（透明地盖在格子上），所以下面这些都由浏览器原生完成：
 *   表单提交与校验、短信验证码自动填充（autocomplete="one-time-code"）、撤销、读屏朗读。
 * - data-length   位数，默认取 maxlength，再没有时为 6
 * - data-type     numeric（默认）| alphanumeric | any；不允许的字符输入或粘贴时直接丢弃（粘贴 "123 456" 得到 123456）
 * - data-group    每 n 格插一个分隔符；data-mask 用圆点显示；placeholder 的第 i 个字符显示在第 i 个空格子里
 * - data-autosubmit 填满后自动提交所在表单
 * - 光标始终在末尾：输入向后填、退格从后删；Ctrl/⌘ + A 全选后输入会整体替换。
 * 事件：原生 input / change；另外派发 nv:change { value, complete }，填满时派发 nv:complete { value }。
 * 实例：Nova.get(input, 'pin-input') → { value, clear(), focus(), destroy() }
 */
(() => {
  const FILTERS = {
    numeric: /[^0-9]/g,
    alphanumeric: /[^0-9a-z]/gi,
    any: /[\s]/g,
  };
  const PATTERNS = { numeric: '[0-9]', alphanumeric: '[0-9A-Za-z]', any: '\\S' };

  Nova.define('pin-input', 'input.nv-pin', (input) => {
    const o = Nova.opts(input, { length: 0, type: 'numeric', group: 0, mask: false, autosubmit: false });
    const n = Math.max(1, o.length || (input.maxLength > 0 ? input.maxLength : 6));
    const type = FILTERS[o.type] ? o.type : 'numeric';
    const clean = (s) => String(s ?? '').replace(FILTERS[type], '').slice(0, n);

    /* —— 原生属性：只补没写的 —— */
    const added = [];
    const ensure = (name, value) => {
      if (input.hasAttribute(name)) return;
      input.setAttribute(name, value);
      added.push(name);
    };
    input.maxLength = n;
    ensure('autocomplete', 'one-time-code');
    ensure('inputmode', type === 'numeric' ? 'numeric' : 'text');
    ensure('pattern', `${PATTERNS[type]}{${n}}`);
    ensure('spellcheck', 'false');
    ensure('autocapitalize', 'off');
    ensure('autocorrect', 'off');

    /* —— 结构 —— */
    const box = Nova.h('div', { class: 'nv-pin-box' });
    for (const k of ['size', 'variant']) if (input.dataset[k]) box.dataset[k] = input.dataset[k];
    const slotsEl = Nova.h('div', { class: 'nv-pin-slots', 'aria-hidden': 'true' });
    const slots = [];
    for (let i = 0; i < n; i++) {
      if (o.group > 0 && i > 0 && i % o.group === 0) slotsEl.append(Nova.h('span', { class: 'nv-pin-sep' }));
      const s = Nova.h('span', { class: 'nv-pin-slot' });
      slots.push(s);
      slotsEl.append(s);
    }
    input.before(box);
    box.append(input, slotsEl);

    /* —— 渲染 —— */
    let lastLen = input.value.length;
    const render = () => {
      const v = input.value;
      const ph = input.getAttribute('placeholder') || '';
      const focused = document.activeElement === input;
      const all = focused && v.length > 0 && input.selectionStart === 0 && input.selectionEnd === v.length;
      const at = Math.min(v.length, n - 1);
      slots.forEach((s, i) => {
        const ch = v[i];
        s.textContent = ch ? (o.mask ? '•' : ch) : (ph[i] || '');
        s.toggleAttribute('data-filled', !!ch);
        s.toggleAttribute('data-active', focused && (all ? i < v.length : i === at));
        s.toggleAttribute('data-caret', focused && !all && i === v.length);
      });
      // 新输入的那一格弹一下
      if (v.length > lastLen && v.length <= n) {
        const s = slots[v.length - 1];
        s.classList.remove('is-pop');
        void s.offsetWidth;
        s.classList.add('is-pop');
      }
      lastLen = v.length;
    };

    // 光标固定在末尾（全选除外），格子的高亮才能和真实光标一致
    const pinCaret = () => {
      if (document.activeElement !== input) return;
      const len = input.value.length;
      const all = len > 0 && input.selectionStart === 0 && input.selectionEnd === len;
      if (!all && (input.selectionStart !== len || input.selectionEnd !== len)) {
        try { input.setSelectionRange(len, len); } catch (_) { /* ignore */ }
      }
      render();
    };

    const emitChange = (prevComplete) => {
      const value = input.value;
      const complete = value.length === n;
      Nova.emit(input, 'nv:change', { value, complete });
      if (complete && !prevComplete) {
        Nova.emit(input, 'nv:complete', { value });
        if (o.autosubmit && input.form) {
          if (input.form.requestSubmit) input.form.requestSubmit();
          else input.form.submit();
        }
      }
    };

    /* —— 事件 —— */
    let wasComplete = input.value.length === n;
    const onInput = () => {
      const v = clean(input.value);
      if (v !== input.value) input.value = v;
      pinCaret();
      emitChange(wasComplete);
      wasComplete = v.length === n;
    };

    const onPaste = (e) => {
      if (input.readOnly || input.disabled) return;
      const text = clean(e.clipboardData?.getData('text') ?? '');
      e.preventDefault();
      if (!text) return;
      const len = input.value.length;
      const all = input.selectionStart === 0 && input.selectionEnd === len;
      const next = all || text.length >= n ? text : (input.value + text).slice(0, n);
      if (next === input.value) return;
      input.value = next;
      // 走一遍原生 input，让表单框架、撤销以外的监听者都能收到
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const onKey = (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) e.preventDefault();
    };

    const onSelChange = () => { if (document.activeElement === input) pinCaret(); };
    const onFocus = () => { requestAnimationFrame(pinCaret); render(); };
    const onBlur = () => render();

    input.addEventListener('input', onInput);
    input.addEventListener('paste', onPaste);
    input.addEventListener('keydown', onKey);
    input.addEventListener('keyup', pinCaret);
    input.addEventListener('pointerup', pinCaret);
    input.addEventListener('select', pinCaret);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    document.addEventListener('selectionchange', onSelChange);
    const form = input.form;
    const onReset = () => setTimeout(() => { lastLen = input.value.length; wasComplete = lastLen === n; render(); });
    form?.addEventListener('reset', onReset);
    const mo = new MutationObserver(render);
    mo.observe(input, { attributes: true, attributeFilter: ['placeholder', 'disabled'] });

    input.value = clean(input.value);
    lastLen = input.value.length;
    render();

    return {
      get value() { return input.value; },
      set value(v) {
        input.value = clean(v);
        lastLen = input.value.length;
        wasComplete = lastLen === n;
        render();
      },
      clear() {
        input.value = '';
        lastLen = 0;
        wasComplete = false;
        render();
      },
      focus() { input.focus(); },
      destroy() {
        input.removeEventListener('input', onInput);
        input.removeEventListener('paste', onPaste);
        input.removeEventListener('keydown', onKey);
        input.removeEventListener('keyup', pinCaret);
        input.removeEventListener('pointerup', pinCaret);
        input.removeEventListener('select', pinCaret);
        input.removeEventListener('focus', onFocus);
        input.removeEventListener('blur', onBlur);
        document.removeEventListener('selectionchange', onSelChange);
        form?.removeEventListener('reset', onReset);
        mo.disconnect();
        added.forEach((a) => input.removeAttribute(a));
        box.before(input);
        box.remove();
      },
    };
  });
})();
