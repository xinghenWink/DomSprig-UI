/* Nova UI · Tag Input
 * <div class="nv-tag-input" data-name="tags" data-value="设计,前端" data-placeholder="输入后回车" aria-label="标签"></div>
 * 回车或分隔符（默认逗号，中文逗号同样生效）把输入变成标签；输入框为空时按退格先选中最后一个标签，再按一次删除。
 * 每个标签对应一个隐藏 input[name]，表单提交得到 tags=设计&tags=前端；没有 data-name 时不生成隐藏域。
 * 粘贴 "a, b, c" 或多行文字一次变多个标签。容器加 aria-disabled="true" 或 .is-disabled 时禁用。
 * 事件：nv:add { value, values }（可取消）、nv:remove { value, values }（可取消）、nv:change { values }、
 *       nv:invalid { value, reason }，reason 取 duplicate | pattern | max | maxlength。
 * 实例：Nova.get(el, 'tag-input') → { value, add(v), remove(v), clear(), focus(), destroy() }
 */
(() => {
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

  Nova.define('tag-input', '.nv-tag-input', (el) => {
    const o = Nova.opts(el, {
      name: '', value: '', placeholder: '', separator: ',', max: 0, maxLength: 0,
      duplicates: false, caseSensitive: false, pattern: '', variant: 'soft', color: '', size: '',
    });
    const sep = o.separator || ',';
    const seps = sep === ',' ? ',，' : sep;
    const splitRe = sep === ' ' ? /\s+/ : new RegExp(`[${escRe(seps)}\\r\\n]+`);
    let pattern = null;
    try { if (o.pattern) pattern = new RegExp(o.pattern); } catch (_) { /* 非法正则忽略 */ }
    const key = (s) => (o.caseSensitive ? s : s.toLocaleLowerCase());
    const split = (s) => String(s ?? '').split(splitRe).map((x) => x.trim()).filter(Boolean);

    el.classList.add('nv-control');
    if (o.size) el.dataset.size = o.size;
    if (!el.hasAttribute('role')) el.setAttribute('role', 'group');
    const disabled = el.classList.contains('is-disabled') || el.getAttribute('aria-disabled') === 'true';

    const input = Nova.h('input', {
      type: 'text',
      class: 'nv-tag-input-field',
      placeholder: o.placeholder || null,
      autocomplete: 'off',
      spellcheck: 'false',
      enterkeyhint: 'done',
      'aria-label': el.getAttribute('aria-label') || o.placeholder || '添加标签',
      disabled: disabled || null,
    });
    el.append(input);

    const items = []; // { value, tag, hidden }
    const values = () => items.map((it) => it.value);
    const emitChange = () => Nova.emit(el, 'nv:change', { values: values() });
    const syncFull = () => el.classList.toggle('is-full', o.max > 0 && items.length >= o.max);

    const removeAt = (i, emit = true) => {
      const it = items[i];
      if (!it) return false;
      if (emit && !Nova.emit(el, 'nv:remove', { value: it.value, values: values().filter((_, k) => k !== i) })) return false;
      items.splice(i, 1);
      it.hidden?.remove();
      if (emit) Nova.animateOut(it.tag, () => it.tag.remove());
      else it.tag.remove();
      syncFull();
      if (emit) emitChange();
      return true;
    };

    const makeTag = (value) => {
      const btn = Nova.h('button', {
        type: 'button',
        class: 'nv-tag-close',
        'aria-label': `移除 ${value}`,
        disabled: disabled || null,
        html: Nova.icon('x', { size: 11, stroke: 2.25 }),
      });
      const tag = Nova.h('span', {
        class: 'nv-tag',
        'data-variant': o.variant,
        'data-color': o.color || null,
        'data-value': value,
      }, Nova.h('span', { class: 'nv-tag-label', title: value }, value), btn);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (removeAt(items.findIndex((it) => it.tag === tag))) input.focus();
      });
      return tag;
    };

    const add = (raw, emit = true) => {
      const value = String(raw ?? '').trim();
      if (!value) return false;
      const reject = (reason) => { if (emit) Nova.emit(el, 'nv:invalid', { value, reason }); return false; };
      if (o.max > 0 && items.length >= o.max) return reject('max');
      if (o.maxLength > 0 && [...value].length > o.maxLength) return reject('maxlength');
      if (pattern && !pattern.test(value)) return reject('pattern');
      if (!o.duplicates && items.some((it) => key(it.value) === key(value))) return reject('duplicate');
      if (emit && !Nova.emit(el, 'nv:add', { value, values: [...values(), value] })) return false;
      const tag = makeTag(value);
      const hidden = o.name ? Nova.h('input', { type: 'hidden', name: o.name, value }) : null;
      input.before(tag);
      if (hidden) el.append(hidden);
      items.push({ value, tag, hidden });
      syncFull();
      if (emit) emitChange();
      return true;
    };

    const reset = (list) => {
      items.splice(0).forEach((it) => { it.tag.remove(); it.hidden?.remove(); });
      list.forEach((v) => add(v, false));
      syncFull();
    };

    // 拆开逐个添加；被拒绝的最后一段留在输入框里，方便修改
    const commit = (text) => {
      let rest = '';
      for (const p of split(text)) if (!add(p)) rest = p;
      input.value = rest;
    };

    /* —— 事件 —— */
    const last = () => items[items.length - 1];
    const clearPending = () => items.forEach((it) => it.tag.removeAttribute('data-pending'));
    const onKey = (e) => {
      if (e.isComposing || e.keyCode === 229) return; // 输入法组字中
      if (e.key === 'Enter' || (e.key.length === 1 && seps.includes(e.key))) {
        if (input.value.trim()) { e.preventDefault(); commit(input.value); }
        else if (e.key !== 'Enter') e.preventDefault(); // 空输入时不留下孤立的分隔符；回车照常提交表单
        return;
      }
      if (e.key === 'Backspace' && input.value === '' && items.length) {
        e.preventDefault();
        if (last().tag.hasAttribute('data-pending')) removeAt(items.length - 1);
        else last().tag.setAttribute('data-pending', '');
        return;
      }
      clearPending();
    };
    const onInput = (e) => {
      clearPending();
      if (!e.isComposing && splitRe.test(input.value)) commit(input.value);
    };
    const onPaste = (e) => {
      const text = e.clipboardData?.getData('text') ?? '';
      if (!splitRe.test(text.trim())) return; // 单个词交给浏览器正常粘贴
      e.preventDefault();
      commit(input.value + sep + text);
    };
    const onBlur = () => { clearPending(); if (input.value.trim()) commit(input.value); };
    const onClick = (e) => { if (!e.target.closest('button, input')) input.focus(); };

    input.addEventListener('keydown', onKey);
    input.addEventListener('input', onInput);
    input.addEventListener('paste', onPaste);
    input.addEventListener('blur', onBlur);
    el.addEventListener('click', onClick);

    const initial = split(o.value);
    const form = el.closest('form');
    // reset 事件在表单恢复默认值之前派发；隐藏域的值写在属性上，不受恢复影响
    const onReset = () => reset(initial);
    form?.addEventListener('reset', onReset);
    reset(initial);

    return {
      get value() { return values(); },
      set value(v) { reset(Array.isArray(v) ? v : split(v)); },
      add: (v) => add(v),
      remove: (v) => removeAt(items.findIndex((it) => key(it.value) === key(String(v)))),
      clear() { if (items.length) { reset([]); emitChange(); } },
      focus: () => input.focus(),
      destroy() {
        input.removeEventListener('keydown', onKey);
        input.removeEventListener('input', onInput);
        input.removeEventListener('paste', onPaste);
        input.removeEventListener('blur', onBlur);
        el.removeEventListener('click', onClick);
        form?.removeEventListener('reset', onReset);
        reset([]);
        input.remove();
        el.classList.remove('nv-control', 'is-full');
      },
    };
  });
})();
