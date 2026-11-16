/* DomSprig-UI · Field
 * 自动关联：label[for] ↔ 控件 id；说明 / 错误的 id → 控件 aria-describedby；有错误文字 → aria-invalid="true"。
 * 错误文字可随时改写（textContent / hidden），MutationObserver 自动同步。
 * 控件查找：[data-field-control] 优先，否则取字段内第一个可见输入元素或复合控件。
 * Nova.field.setError(field, '文字' | null)
 */
(() => {
  const { Nova } = window;
  const CONTROL = [
    '[data-field-control]',
    'input:not([type="hidden"]):not([tabindex="-1"])',
    'textarea', 'select',
    '[role="radiogroup"]', '[role="slider"]', '[role="group"]',
  ].join(',');

  const visible = (el) => !!el && !el.hidden && el.textContent.trim() !== '';

  Nova.define('field', '.nv-field', (el) => {
    let control = null;
    let ownInvalid = false;
    let ownDescribed = [];

    const sync = () => {
      const next = el.querySelector('[data-field-control]') || el.querySelector(CONTROL);
      // 控件被替换（如 TagInput 增强后）时清理旧控件上我们写入的属性
      if (control && control !== next) cleanup(control);
      control = next;
      const label = el.querySelector(':scope > .nv-field-label, :scope > .nv-field-head > .nv-field-label');
      const desc = el.querySelector(':scope > .nv-field-desc');
      const error = el.querySelector(':scope > .nv-field-error');
      const invalid = visible(error);
      el.toggleAttribute('data-invalid', invalid);
      if (!control) return;

      if (label) {
        if (!label.id) label.id = Nova.uid('nv-field-label');
        const labelable = control.matches('input, textarea, select, button, meter, output, progress');
        if (labelable && label.tagName === 'LABEL') {
          if (!control.id) control.id = Nova.uid('nv-field-ctl');
          if (!label.htmlFor) label.htmlFor = control.id;
        } else if (!control.hasAttribute('aria-labelledby') && !control.hasAttribute('aria-label')) {
          control.setAttribute('aria-labelledby', label.id);
          control.dataset.nvFieldLabelled = '';
        }
      }

      const ids = [];
      if (desc && !desc.hidden) ids.push(desc.id || (desc.id = Nova.uid('nv-field-desc')));
      if (error && invalid) ids.push(error.id || (error.id = Nova.uid('nv-field-error')));
      if (error && !error.hasAttribute('aria-live')) error.setAttribute('aria-live', 'polite');
      const others = (control.getAttribute('aria-describedby') || '').split(/\s+/)
        .filter((t) => t && !ownDescribed.includes(t));
      const all = [...others, ...ids];
      if (all.length) control.setAttribute('aria-describedby', all.join(' '));
      else control.removeAttribute('aria-describedby');
      ownDescribed = ids;

      if (invalid) {
        if (control.getAttribute('aria-invalid') !== 'true') {
          control.setAttribute('aria-invalid', 'true');
          ownInvalid = true;
        }
      } else if (ownInvalid) {
        control.removeAttribute('aria-invalid');
        ownInvalid = false;
      }
    };

    function cleanup(c) {
      if (ownInvalid) c.removeAttribute('aria-invalid');
      ownInvalid = false;
      const rest = (c.getAttribute('aria-describedby') || '').split(/\s+/).filter((t) => t && !ownDescribed.includes(t));
      if (rest.length) c.setAttribute('aria-describedby', rest.join(' '));
      else c.removeAttribute('aria-describedby');
      ownDescribed = [];
      if ('nvFieldLabelled' in c.dataset) { c.removeAttribute('aria-labelledby'); delete c.dataset.nvFieldLabelled; }
    }

    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; sync(); });
    };
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'data-field-control'] });
    sync();

    return {
      refresh: sync,
      get control() { return control; },
      setError(msg) { Nova.field.setError(el, msg); },
      destroy() { mo.disconnect(); if (control) cleanup(control); el.removeAttribute('data-invalid'); },
    };
  });

  Nova.field = {
    /** 设置或清除错误文字；没有 .nv-field-error 时自动创建 */
    setError(field, msg) {
      if (typeof field === 'string') field = document.querySelector(field);
      if (!field) return;
      let err = field.querySelector(':scope > .nv-field-error');
      if (!err && msg) err = field.appendChild(Nova.h('p', { class: 'nv-field-error' }));
      if (err) err.textContent = msg || '';
      Nova.get(field, 'field')?.refresh();
    },
  };
})();
