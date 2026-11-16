/* DomSprig-UI · Upload 文件上传
 * <div class="nv-upload" data-multiple data-accept="image/*" data-max-size="5MB" data-max-count="3"></div>
 * 容器里没有触发器时自动生成拖拽区；放一个 <button> 则点按钮选择文件，同时放 .nv-upload-dragger 则两者都可用。
 * 支持点击选择、拖拽、在拖拽区获得焦点时粘贴（Ctrl+V 截图）。
 * 内部有一个隐藏的原生 input[type=file]，选中的文件会同步回它（DataTransfer），表单提交照常带上文件。
 *   data-name        input 的 name
 *   data-multiple    多选；不加时新文件替换旧文件
 *   data-accept      同 input[accept]
 *   data-max-size    单文件上限：字节数，或 800KB / 5MB / 1GB
 *   data-max-count   文件数量上限
 *   data-list        text（默认）| picture | none
 *   data-title / data-hint  拖拽区文案，hint 默认按 accept 与 max-size 生成
 *   data-action      设了就自动用 XHR 上传到该地址（POST，字段名 data-field，默认 file）
 *   data-disabled    禁用
 * 事件：nv:add { file }（可取消）、nv:remove { file }（可取消）、nv:change { files }、
 *       nv:reject { file, reason }，reason 取 type | size | count；
 *       有 data-action 时另有 nv:success { file, response }、nv:error { file, status }
 * 实例：Nova.get(el, 'upload') → { files, add(files), remove(file), clear(), open(),
 *       setProgress(file, percent), setStatus(file, 'ready'|'uploading'|'done'|'error', message?), destroy() }
 */
(() => {
  const { h } = Nova;
  const UNITS = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };

  const parseSize = (v) => {
    if (!v) return 0;
    const m = String(v).trim().toLowerCase().match(/^([\d.]+)\s*(b|kb|mb|gb)?$/);
    return m ? Number(m[1]) * UNITS[m[2] || 'b'] : 0;
  };
  const formatSize = (n) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1).replace(/\.0$/, '')} KB`;
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1).replace(/\.0$/, '')} MB`;
    return `${(n / 1024 ** 3).toFixed(1).replace(/\.0$/, '')} GB`;
  };
  // 与浏览器 accept 规则一致：.ext、type/*、完整 MIME
  const accepts = (file, accept) => {
    if (!accept) return true;
    const name = file.name.toLowerCase();
    const type = (file.type || '').toLowerCase();
    return accept.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).some((rule) => {
      if (rule.startsWith('.')) return name.endsWith(rule);
      if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
      return type === rule;
    });
  };
  const isImage = (file) => /^image\//.test(file.type || '');

  Nova.define('upload', '.nv-upload', (el) => {
    const o = Nova.opts(el, {
      name: '', multiple: false, accept: '', maxSize: '', maxCount: 0, list: 'text',
      title: '', hint: '', action: '', field: 'file',
    });
    const maxSize = parseSize(o.maxSize);
    const maxCount = o.multiple ? Number(o.maxCount) || 0 : 1;
    const disabled = () => el.hasAttribute('data-disabled');

    const input = h('input', {
      type: 'file',
      class: 'nv-upload-input',
      name: o.name || null,
      accept: o.accept || null,
      multiple: o.multiple || null,
      tabindex: '-1',
      'aria-hidden': 'true',
    });
    el.append(input);

    // 触发器：已有按钮 / 已有拖拽区；都没有就生成拖拽区
    const buttons = [...el.querySelectorAll(':scope > button, :scope > .nv-btn, [data-upload-trigger]')];
    let dragger = el.querySelector(':scope > .nv-upload-dragger');
    const createdDragger = !dragger && !buttons.length;
    if (createdDragger) {
      dragger = h('div', { class: 'nv-upload-dragger' });
      el.prepend(dragger);
    }
    if (dragger) {
      dragger.setAttribute('role', 'button');
      if (!dragger.hasAttribute('tabindex')) dragger.tabIndex = 0;
      if (!dragger.hasAttribute('aria-label')) dragger.setAttribute('aria-label', o.title || '选择或拖入文件');
      if (!dragger.children.length && !dragger.textContent.trim()) {
        const tips = [];
        if (o.accept) tips.push(`支持 ${o.accept.replace(/\s*,\s*/g, ' / ')}`);
        if (maxSize) tips.push(`单个不超过 ${formatSize(maxSize)}`);
        if (o.multiple && maxCount) tips.push(`最多 ${maxCount} 个`);
        const title = h('div', { class: 'nv-upload-title' });
        if (o.title) title.textContent = o.title;
        else title.append('拖拽文件到这里，或 ', h('em', {}, '点击选择'));
        const hint = o.hint || tips.join('，');
        dragger.append(
          h('div', { class: 'nv-upload-icon', 'aria-hidden': 'true', html: Nova.icon('cloud-upload', { size: 22 }) }),
          title,
        );
        if (hint) dragger.append(h('div', { class: 'nv-upload-hint' }, hint));
      }
    }

    const list = o.list === 'none' ? null : h('ul', {
      class: 'nv-upload-list',
      'data-variant': o.list === 'picture' ? 'picture' : null,
      'aria-live': 'polite',
    });
    if (list) el.append(list);

    /* —— 文件状态 —— */
    const items = []; // { file, status, progress, message, li, url, xhr }
    const find = (file) => items.find((it) => it.file === file);
    const files = () => items.map((it) => it.file);

    // 把当前文件写回原生 input，保证表单提交与 FormData(form) 拿得到
    const syncInput = () => {
      try {
        const dt = new DataTransfer();
        items.forEach((it) => dt.items.add(it.file));
        input.files = dt.files;
      } catch (_) { /* 旧浏览器不支持写 files，忽略 */ }
    };

    const metaText = (it) => {
      if (it.status === 'error') return it.message || '上传失败';
      if (it.status === 'uploading') return `${formatSize(it.file.size)} · ${Math.round(it.progress)}%`;
      if (it.status === 'done') return `${formatSize(it.file.size)} · ${it.message || '已完成'}`;
      return formatSize(it.file.size);
    };

    const paint = (it) => {
      if (!it.li) return;
      it.li.dataset.status = it.status;
      it.li.style.setProperty('--value', { ready: 0, uploading: it.progress }[it.status] ?? 100);
      it.li.querySelector('.nv-upload-meta').textContent = metaText(it);
    };

    const renderItem = (it) => {
      if (!list) return;
      const thumb = h('span', { class: 'nv-upload-thumb', 'aria-hidden': 'true' });
      if (isImage(it.file)) {
        it.url = URL.createObjectURL(it.file);
        thumb.append(h('img', { src: it.url, alt: '' }));
      } else {
        thumb.innerHTML = Nova.icon('file', { size: 18 });
      }
      const rm = h('button', {
        type: 'button',
        class: 'nv-upload-remove',
        'aria-label': `移除 ${it.file.name}`,
        html: Nova.icon(o.list === 'picture' ? 'x' : 'trash', { size: 15 }),
      });
      rm.addEventListener('click', () => removeItem(it));
      it.li = h('li', { class: 'nv-upload-item' },
        thumb,
        h('span', { class: 'nv-upload-main' },
          h('span', { class: 'nv-upload-name', title: it.file.name }, it.file.name),
          h('span', { class: 'nv-upload-meta' })),
        rm);
      list.append(it.li);
      paint(it);
    };

    const dropItem = (it) => {
      it.xhr?.abort();
      if (it.url) URL.revokeObjectURL(it.url);
      if (it.li) {
        const li = it.li;
        Nova.animateOut(li, () => li.remove());
      }
    };

    function removeItem(it, emit = true) {
      const i = items.indexOf(it);
      if (i < 0) return false;
      if (emit && !Nova.emit(el, 'nv:remove', { file: it.file })) return false;
      items.splice(i, 1);
      dropItem(it);
      syncInput();
      if (emit) Nova.emit(el, 'nv:change', { files: files() });
      return true;
    }

    /* —— 上传（可选） —— */
    function send(it) {
      const xhr = new XMLHttpRequest();
      const fd = new FormData();
      fd.append(o.field || 'file', it.file);
      it.xhr = xhr;
      setStatus(it.file, 'uploading');
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) setProgress(it.file, (e.loaded / e.total) * 99);
      });
      xhr.addEventListener('load', () => {
        it.xhr = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          setStatus(it.file, 'done');
          Nova.emit(el, 'nv:success', { file: it.file, response: xhr.response });
        } else {
          setStatus(it.file, 'error', `上传失败（${xhr.status}）`);
          Nova.emit(el, 'nv:error', { file: it.file, status: xhr.status });
        }
      });
      xhr.addEventListener('error', () => {
        it.xhr = null;
        setStatus(it.file, 'error', '网络错误');
        Nova.emit(el, 'nv:error', { file: it.file, status: 0 });
      });
      xhr.open('POST', o.action);
      xhr.send(fd);
    }

    function add(input_) {
      if (disabled()) return [];
      const incoming = [...(input_ || [])].filter((f) => f instanceof File);
      const added = [];
      const reject = (file, reason) => Nova.emit(el, 'nv:reject', { file, reason });
      for (const file of incoming) {
        if (!accepts(file, o.accept)) { reject(file, 'type'); continue; }
        if (maxSize && file.size > maxSize) { reject(file, 'size'); continue; }
        // 单选模式：新文件替换旧文件
        if (!o.multiple && items.length) {
          if (!Nova.emit(el, 'nv:add', { file })) continue;
          items.splice(0).forEach(dropItem);
        } else {
          if (maxCount && items.length >= maxCount) { reject(file, 'count'); continue; }
          if (!Nova.emit(el, 'nv:add', { file })) continue;
        }
        const it = { file, status: 'ready', progress: 0, message: '', li: null, url: null, xhr: null };
        items.push(it);
        renderItem(it);
        added.push(file);
        if (!o.multiple) break;
      }
      if (added.length) {
        syncInput();
        Nova.emit(el, 'nv:change', { files: files() });
        if (o.action) added.forEach((f) => send(find(f)));
      }
      return added;
    }

    function setProgress(file, pct) {
      const it = find(file);
      if (!it) return;
      it.progress = Nova.clamp(Number(pct) || 0, 0, 100);
      if (it.progress >= 100) { it.status = 'done'; it.message = ''; }
      else it.status = 'uploading';
      paint(it);
    }
    function setStatus(file, status, message = '') {
      const it = find(file);
      if (!it) return;
      it.status = status;
      it.message = message;
      if (status === 'ready') it.progress = 0;
      paint(it);
    }

    /* —— 交互 —— */
    const open = () => { if (!disabled()) input.click(); };
    const onInputChange = () => {
      const picked = [...input.files];
      add(picked);
      syncInput(); // 原生选择会覆盖 input.files，这里写回完整列表
    };
    // 拖拽区里再放触发按钮时只打开一次
    const onTrigger = (e) => { e.preventDefault(); e.stopPropagation(); open(); };
    const onDraggerKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    };

    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    const onDragEnter = (e) => {
      if (!hasFiles(e) || disabled()) return;
      e.preventDefault();
      depth += 1;
      el.setAttribute('data-dragover', '');
    };
    const onDragOver = (e) => {
      if (!hasFiles(e) || disabled()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) el.removeAttribute('data-dragover');
    };
    const onDrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      el.removeAttribute('data-dragover');
      add(e.dataTransfer.files);
    };
    const onPaste = (e) => {
      const pasted = [...(e.clipboardData?.files || [])];
      if (!pasted.length) return;
      e.preventDefault();
      add(pasted);
    };
    const form = el.closest('form');
    const onReset = () => { items.splice(0).forEach(dropItem); Nova.emit(el, 'nv:change', { files: [] }); };

    input.addEventListener('change', onInputChange);
    buttons.forEach((b) => b.addEventListener('click', onTrigger));
    dragger?.addEventListener('click', onTrigger);
    dragger?.addEventListener('keydown', onDraggerKey);
    el.addEventListener('dragenter', onDragEnter);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);
    el.addEventListener('paste', onPaste);
    form?.addEventListener('reset', onReset);

    return {
      get files() { return files(); },
      add: (f) => add(f instanceof File ? [f] : f),
      remove: (file) => { const it = find(file); return it ? removeItem(it) : false; },
      clear() {
        if (!items.length) return;
        items.splice(0).forEach(dropItem);
        syncInput();
        Nova.emit(el, 'nv:change', { files: [] });
      },
      open,
      setProgress,
      setStatus,
      destroy() {
        input.removeEventListener('change', onInputChange);
        buttons.forEach((b) => b.removeEventListener('click', onTrigger));
        dragger?.removeEventListener('click', onTrigger);
        dragger?.removeEventListener('keydown', onDraggerKey);
        el.removeEventListener('dragenter', onDragEnter);
        el.removeEventListener('dragover', onDragOver);
        el.removeEventListener('dragleave', onDragLeave);
        el.removeEventListener('drop', onDrop);
        el.removeEventListener('paste', onPaste);
        form?.removeEventListener('reset', onReset);
        items.splice(0).forEach((it) => { it.xhr?.abort(); if (it.url) URL.revokeObjectURL(it.url); });
        list?.remove();
        input.remove();
        if (createdDragger) dragger.remove();
        el.removeAttribute('data-dragover');
      },
    };
  });
})();
