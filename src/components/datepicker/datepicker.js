/* Nova UI · DatePicker
 * <input type="date" data-nv-date>             日期        值 YYYY-MM-DD
 * <input type="datetime-local" data-nv-date>   日期时间    值 YYYY-MM-DDTHH:mm（本地时间）
 * <input data-nv-date-range name="period">     日期范围    值 YYYY-MM-DD/YYYY-MM-DD（ISO 8601 区间）
 * 原生 input 保留（视觉隐藏），值与 input/change 事件照常；读取 min / max（按天限制）。
 * 命令式：Nova.datepicker(el, { presets, disabledDate, ... })  Nova.datepicker.refresh(el)
 */
(() => {
  const { Nova } = window;
  const { h } = Nova;

  /* ————————— 日期工具（全部按本地时间、零点） ————————— */
  const pad = (n) => String(n).padStart(2, '0');
  const mk = (y, m, d) => { const t = new Date(2000, 0, 1); t.setFullYear(y, m, d); return t; };
  const key = (d) => (d ? d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate() : 0);
  const same = (a, b) => !!a && !!b && key(a) === key(b);
  const addDays = (d, n) => mk(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const monthStart = (d) => mk(d.getFullYear(), d.getMonth(), 1);
  const monthEnd = (d) => mk(d.getFullYear(), d.getMonth() + 1, 0);
  const addMonths = (d, n) => {
    const t = mk(d.getFullYear(), d.getMonth() + n, 1);
    return mk(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), monthEnd(t).getDate()));
  };
  const today = () => { const n = new Date(); return mk(n.getFullYear(), n.getMonth(), n.getDate()); };
  const iso = (d) => `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const shown = (d) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const daysBetween = (a, b) => Math.round((mk(b.getFullYear(), b.getMonth(), b.getDate()) - mk(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  /** 解析 ISO：YYYY-MM-DD 或 YYYY-MM-DDTHH:mm[:ss] */
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(s || '').trim());
    if (!m) return null;
    const date = mk(+m[1], +m[2] - 1, +m[3]);
    if (date.getMonth() !== +m[2] - 1) return null;
    return { date, h: +(m[4] || 0), m: +(m[5] || 0) };
  }
  const toDate = (v) => (v instanceof Date ? mk(v.getFullYear(), v.getMonth(), v.getDate()) : (parseISO(v) || {}).date || null);

  /* 手动输入：2026-10-24 / 2026/10/24 / 2026.10.24 / 2026年10月24日 / 20261024，可带 13:52 */
  const DATE_SRC = '(\\d{4})\\s*[-/.年]\\s*(\\d{1,2})\\s*[-/.月]\\s*(\\d{1,2})\\s*日?|(\\d{4})(\\d{2})(\\d{2})';
  const SINGLE_RE = new RegExp(`^(?:${DATE_SRC})(?:\\s*[T\\s]\\s*(\\d{1,2})\\s*[:：时.]\\s*(\\d{1,2})\\s*分?)?$`);
  const ANY_RE = new RegExp(DATE_SRC, 'g');
  function dateFrom(m, i) {
    const y = +(m[i] || m[i + 3]);
    const mo = +(m[i + 1] || m[i + 4]);
    const d = +(m[i + 2] || m[i + 5]);
    if (mo < 1 || mo > 12 || d < 1) return null;
    const t = mk(y, mo - 1, d);
    return t.getMonth() === mo - 1 ? t : null;
  }

  /* ————————— 范围快捷预设 ————————— */
  const PRESETS = {
    today: { label: '今天', value: (t) => [t, t] },
    '7d': { label: '最近 7 天', value: (t) => [addDays(t, -6), t] },
    '30d': { label: '最近 30 天', value: (t) => [addDays(t, -29), t] },
    month: { label: '本月', value: (t) => [monthStart(t), monthEnd(t)] },
    lastMonth: { label: '上月', value: (t) => { const p = addMonths(monthStart(t), -1); return [p, monthEnd(p)]; } },
  };
  const PRESET_KEYS = Object.keys(PRESETS);

  const DEFAULTS = {
    placeholder: '',
    minuteStep: 1,
    weekStart: 1,
    clearable: false,
    size: '',
    placement: 'bottom-start',
    presets: '',
    months: 0,
    separator: ' – ',
    label: '选择日期',
    clearText: '清除',
    todayText: '今天',
    nowText: '此刻',
    okText: '确定',
    openText: '打开日历',
    hourText: '时',
    minuteText: '分',
    invalidText: '日期无效，已还原',
    rangeHint: '请选择结束日期',
    daysText: '共 {n} 天',
    prevMonthText: '上个月',
    nextMonthText: '下个月',
    prevYearText: '上一年',
    nextYearText: '下一年',
    prevDecadeText: '上一个十年',
    nextDecadeText: '下一个十年',
  };
  const PLACEHOLDER = { date: '年/月/日', datetime: '年/月/日 --:--', range: '开始日期 – 结束日期' };
  const jsOptions = new WeakMap(); // Nova.datepicker(el, opts) 先于初始化调用时暂存

  Nova.define('datepicker', 'input[data-nv-date], input[data-nv-date-range]', (nat) => {
    const range = nat.hasAttribute('data-nv-date-range');
    const time = !range && nat.type === 'datetime-local';
    const kind = range ? 'range' : time ? 'datetime' : 'date';
    const id = Nova.uid('nv-date');
    let opt = {};
    let min = null;
    let max = null;
    let presets = [];

    function readOpts() {
      opt = { ...Nova.opts(nat, DEFAULTS), ...(jsOptions.get(nat) || {}) };
      opt.minuteStep = Nova.clamp(Math.floor(opt.minuteStep) || 1, 1, 30);
      opt.weekStart = Number(opt.weekStart) === 0 ? 0 : 1;
      min = toDate(nat.getAttribute('min'));
      max = toDate(nat.getAttribute('max'));
      presets = [];
      if (range && opt.presets !== 'false' && opt.presets !== false) {
        const src = Array.isArray(opt.presets) ? opt.presets
          : opt.presets ? String(opt.presets).split(/[\s,]+/).filter(Boolean) : PRESET_KEYS;
        for (const p of src) {
          const def = typeof p === 'string' ? PRESETS[p] : p;
          if (def && def.label && def.value) presets.push(def);
        }
      }
    }
    readOpts();
    const isDisabled = (d) => (min && key(d) < key(min)) || (max && key(d) > key(max)) || !!(opt.disabledDate && opt.disabledDate(d));
    const clampDay = (d) => (min && key(d) < key(min) ? min : max && key(d) > key(max) ? max : d);

    /* —— 可见控件 —— */
    const input = h('input', {
      type: 'text',
      id: `${id}-input`,
      class: 'nv-date-input',
      role: 'combobox',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      'aria-controls': `${id}-panel`,
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const clearBtn = h('button', { type: 'button', class: 'nv-control-btn nv-date-clear', tabindex: '-1', html: Nova.icon('x', { size: 14 }), hidden: true });
    const toggleBtn = h('button', { type: 'button', class: 'nv-control-btn nv-date-toggle', tabindex: '-1', html: Nova.icon('calendar') });
    const live = h('span', { class: 'nv-sr-only', 'aria-live': 'polite' });
    const control = h('div', { class: 'nv-control nv-date', 'data-kind': kind }, input, clearBtn, toggleBtn, live);

    const labels = [...(nat.labels || [])];
    labels.forEach((l) => { if (!l.id) l.id = Nova.uid('nv-label'); });
    if (labels.length) input.setAttribute('aria-labelledby', labels.map((l) => l.id).join(' '));
    else if (nat.getAttribute('aria-label')) input.setAttribute('aria-label', nat.getAttribute('aria-label'));
    if (nat.getAttribute('aria-describedby')) input.setAttribute('aria-describedby', nat.getAttribute('aria-describedby'));

    const prevTabIndex = nat.getAttribute('tabindex');
    nat.after(control);
    nat.classList.add('nv-date-native');
    nat.setAttribute('tabindex', '-1');
    nat.setAttribute('aria-hidden', 'true');

    /* —— 值：single { date, h, m } ；range { start, end } —— */
    let value = null;
    function readValue() {
      if (range) {
        const [a, b] = String(nat.value || '').split('/');
        const s = toDate(a);
        const e = toDate(b);
        value = s && e ? (key(s) <= key(e) ? { start: s, end: e } : { start: e, end: s }) : null;
      } else {
        const p = parseISO(nat.value);
        value = p ? { date: p.date, h: time ? p.h : 0, m: time ? p.m : 0 } : null;
      }
    }
    const serialize = (v) => {
      if (!v) return '';
      if (range) return `${iso(v.start)}/${iso(v.end)}`;
      return time ? `${iso(v.date)}T${pad(v.h)}:${pad(v.m)}` : iso(v.date);
    };
    const display = (v) => {
      if (!v) return '';
      if (range) return `${shown(v.start)}${opt.separator}${shown(v.end)}`;
      return time ? `${shown(v.date)} ${pad(v.h)}:${pad(v.m)}` : shown(v.date);
    };

    let emitting = false;
    function commit(v) {
      const before = nat.value;
      value = v;
      nat.value = serialize(v);
      input.value = display(v);
      paintControl();
      if (panel) { paint(); paintTime(); paintFoot(); }
      if (nat.value !== before) {
        emitting = true;
        nat.dispatchEvent(new Event('input', { bubbles: true }));
        nat.dispatchEvent(new Event('change', { bubbles: true }));
        emitting = false;
      }
    }

    /** 解析手动输入；返回 { ok, value }，空串 → null 值 */
    function parseText(text) {
      const t = text.trim();
      if (!t) return { ok: true, value: null };
      if (range) {
        const found = [...t.matchAll(ANY_RE)];
        if (found.length !== 2) return { ok: false };
        const rest = t.replace(ANY_RE, '');
        if (!/^[\s~～至到\-–—_|/]*$|^\s*to\s*$/i.test(rest)) return { ok: false };
        let s = dateFrom(found[0], 1);
        let e = dateFrom(found[1], 1);
        if (!s || !e) return { ok: false };
        if (key(s) > key(e)) [s, e] = [e, s];
        if (isDisabled(s) || isDisabled(e)) return { ok: false };
        return { ok: true, value: { start: s, end: e } };
      }
      const m = SINGLE_RE.exec(t);
      if (!m) return { ok: false };
      const date = dateFrom(m, 1);
      if (!date || isDisabled(date)) return { ok: false };
      let hh = value ? value.h : 0;
      let mm = value ? value.m : 0;
      if (m[7] != null) { hh = +m[7]; mm = +m[8]; }
      if (hh > 23 || mm > 59) return { ok: false };
      return { ok: true, value: { date, h: time ? hh : 0, m: time ? mm : 0 } };
    }

    let flashTimer = 0;
    function flashInvalid(text) {
      clearTimeout(flashTimer);
      control.setAttribute('data-flash', '');
      live.textContent = opt.invalidText;
      Nova.emit(nat, 'nv:invalid', { text });
      flashTimer = setTimeout(() => { control.removeAttribute('data-flash'); live.textContent = ''; }, 1400);
    }
    /** 把输入框文字应用为值；非法时还原并提示。返回是否成功 */
    function applyText() {
      if (input.value === display(value)) return true;
      const res = parseText(input.value);
      if (res.ok) {
        commit(res.value);
        if (panel && res.value) jumpTo(range ? res.value.start : res.value.date);
        return true;
      }
      const typed = input.value;
      input.value = display(value);
      flashInvalid(typed);
      return false;
    }

    function paintControl() {
      input.disabled = nat.disabled;
      input.readOnly = nat.readOnly;
      input.placeholder = opt.placeholder || PLACEHOLDER[kind];
      if (nat.getAttribute('aria-invalid') === 'true') input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      if (nat.required) input.setAttribute('aria-required', 'true');
      else input.removeAttribute('aria-required');
      if (opt.size) control.dataset.size = opt.size;
      else delete control.dataset.size;
      clearBtn.hidden = !(opt.clearable && value && !nat.disabled && !nat.readOnly);
      clearBtn.setAttribute('aria-label', opt.clearText);
      toggleBtn.setAttribute('aria-label', opt.openText);
      toggleBtn.disabled = nat.disabled;
    }

    /* —— 面板状态 —— */
    let panel = null;
    let floating = null;
    let cals = null;
    let timeBox = null;
    let foot = null;
    let status = null;
    let presetBox = null;
    let view = monthStart(today()); // 左侧（第一个）日历的月份
    let mode = 'day'; // day | month | year
    let modeCal = 0; // 由第几个日历进入月份/年份面板
    let modeYear = 0;
    let months = 1;
    let cursor = null; // 键盘游标
    let cursorOn = false;
    let anchor = null; // 范围：已选的第一个端点
    let hover = null; // 范围：预览的另一个端点

    const baseDate = () => {
      if (range) return value ? value.start : clampDay(today());
      return value ? value.date : clampDay(today());
    };
    const visibleStart = () => view;
    const visibleEnd = () => monthEnd(addMonths(view, months - 1));
    function jumpTo(d) {
      if (key(d) < key(visibleStart()) || key(d) > key(visibleEnd())) {
        view = monthStart(months > 1 && key(d) > key(visibleEnd()) ? addMonths(d, -(months - 1)) : d);
      }
      if (mode !== 'day') setMode('day');
      else renderCals();
    }

    const navBtn = (dir, label, act) => h('button', {
      type: 'button', class: 'nv-date-nav', 'aria-label': label, 'data-act': act, tabindex: '-1',
      html: Nova.icon(dir < 0 ? 'chevron-left' : 'chevron-right'),
    });

    function dayCell(d, monthIndex, idx) {
      const outside = d.getMonth() !== monthIndex;
      if (outside && range && months > 1) return h('div', { role: 'gridcell', class: 'nv-date-cell', 'data-empty': '' });
      const t = today();
      const label = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}${same(d, t) ? '，今天' : ''}`;
      const off = isDisabled(d);
      const cell = h('div', {
        role: 'gridcell',
        class: 'nv-date-cell',
        id: `${id}-c${idx}-${key(d)}`,
        'data-outside': outside ? '' : null,
        'aria-disabled': off ? 'true' : null,
      }, h('button', {
        type: 'button',
        class: 'nv-date-day',
        tabindex: '-1',
        'aria-label': label,
        'data-today': same(d, t) ? '' : null,
        disabled: off,
      }, String(d.getDate())));
      cell._date = d;
      return cell;
    }

    function dayView(m, idx) {
      const first = mk(m.getFullYear(), m.getMonth(), 1);
      const lead = (first.getDay() - opt.weekStart + 7) % 7;
      const head = h('div', { class: 'nv-date-head' },
        idx === 0 ? navBtn(-1, opt.prevMonthText, 'prev') : h('span', { class: 'nv-date-nav-gap' }),
        h('div', { class: 'nv-date-title' },
          h('button', { type: 'button', class: 'nv-date-title-btn', 'data-act': 'year', 'data-cal': idx, tabindex: '-1' }, `${m.getFullYear()}年`),
          h('button', { type: 'button', class: 'nv-date-title-btn', 'data-act': 'month', 'data-cal': idx, tabindex: '-1' }, `${m.getMonth() + 1}月`)),
        idx === months - 1 ? navBtn(1, opt.nextMonthText, 'next') : h('span', { class: 'nv-date-nav-gap' }));
      const weekdays = h('div', { role: 'row', class: 'nv-date-week' },
        Array.from({ length: 7 }, (_, i) => {
          const wd = (i + opt.weekStart) % 7;
          return h('span', { role: 'columnheader', 'aria-label': `星期${WEEK[wd]}`, 'data-weekend': wd === 0 || wd === 6 ? '' : null }, WEEK[wd]);
        }));
      const rows = [];
      for (let r = 0; r < 6; r++) {
        rows.push(h('div', { role: 'row', class: 'nv-date-row' },
          Array.from({ length: 7 }, (_, c) => dayCell(mk(m.getFullYear(), m.getMonth(), 1 - lead + r * 7 + c), m.getMonth(), idx))));
      }
      return h('div', { class: 'nv-date-cal' }, head,
        h('div', { role: 'grid', class: 'nv-date-grid', 'aria-label': `${m.getFullYear()}年${m.getMonth() + 1}月` }, weekdays, rows));
    }

    function pickerView() {
      const year = mode === 'month';
      const sel = range ? (value && value.start) : value && value.date;
      const t = today();
      let title;
      let cells;
      if (year) {
        title = h('button', { type: 'button', class: 'nv-date-title-btn', 'data-act': 'year', tabindex: '-1' }, `${modeYear}年`);
        cells = Array.from({ length: 12 }, (_, i) => {
          const off = (min && key(monthEnd(mk(modeYear, i, 1))) < key(min)) || (max && key(mk(modeYear, i, 1)) > key(max));
          return h('button', {
            type: 'button', class: 'nv-date-pick', tabindex: '-1', 'data-month': i, disabled: !!off,
            'aria-pressed': String(!!sel && sel.getFullYear() === modeYear && sel.getMonth() === i),
            'data-today': t.getFullYear() === modeYear && t.getMonth() === i ? '' : null,
          }, `${i + 1}月`);
        });
      } else {
        const start = Math.floor(modeYear / 10) * 10;
        title = h('span', { class: 'nv-date-title-text' }, `${start} – ${start + 9}`);
        cells = Array.from({ length: 12 }, (_, i) => {
          const y = start - 1 + i;
          const off = (min && y < min.getFullYear()) || (max && y > max.getFullYear());
          return h('button', {
            type: 'button', class: 'nv-date-pick', tabindex: '-1', 'data-year': y, disabled: !!off,
            'data-outside': i === 0 || i === 11 ? '' : null,
            'aria-pressed': String(!!sel && sel.getFullYear() === y),
            'data-today': t.getFullYear() === y ? '' : null,
          }, String(y));
        });
      }
      const step = year ? 1 : 10;
      return h('div', { class: 'nv-date-cal nv-date-cal-wide' },
        h('div', { class: 'nv-date-head' },
          navBtn(-1, year ? opt.prevYearText : opt.prevDecadeText, `prev-${step}`),
          h('div', { class: 'nv-date-title' }, title),
          navBtn(1, year ? opt.nextYearText : opt.nextDecadeText, `next-${step}`)),
        h('div', { class: 'nv-date-picks', 'data-kind': mode }, cells));
    }

    function renderCals() {
      if (!cals) return;
      if (mode === 'day') {
        cals.replaceChildren(...Array.from({ length: months }, (_, i) => dayView(addMonths(view, i), i)));
        paint();
      } else {
        cals.replaceChildren(pickerView());
      }
      floating && floating.update();
    }

    function setMode(next, cal = 0) {
      if (next !== 'day' && mode === 'day' && cals) {
        // 锁定尺寸：切换到月份/年份面板时面板不跳动
        cals.style.minWidth = `${cals.offsetWidth}px`;
        cals.style.minHeight = `${cals.offsetHeight}px`;
      }
      if (next === 'day' && cals) { cals.style.minWidth = ''; cals.style.minHeight = ''; }
      if (mode === 'day' && next !== 'day') { modeCal = cal; modeYear = addMonths(view, cal).getFullYear(); }
      mode = next;
      renderCals();
    }

    /** 根据值 / 游标 / 预览刷新日期格状态（不重建 DOM） */
    function paint() {
      if (!cals || mode !== 'day') return;
      let s = null;
      let e = null;
      if (range) {
        if (anchor) {
          const o = hover || anchor;
          [s, e] = key(anchor) <= key(o) ? [anchor, o] : [o, anchor];
        } else if (value) ({ start: s, end: e } = value);
      }
      panel.toggleAttribute('data-pending', !!anchor);
      let activeId = null;
      for (const cell of cals.querySelectorAll('.nv-date-cell[id]')) {
        const d = cell._date;
        const k = key(d);
        let selected = false;
        if (range) {
          const isS = !!s && k === key(s);
          const isE = !!e && k === key(e);
          const inside = !!s && !!e && k > key(s) && k < key(e);
          cell.toggleAttribute('data-range-start', isS);
          cell.toggleAttribute('data-range-end', isE);
          cell.toggleAttribute('data-in-range', inside);
          selected = !anchor && (isS || isE || inside);
          if (anchor) selected = isS || isE;
        } else selected = !!value && k === key(value.date);
        cell.setAttribute('aria-selected', String(selected));
        const active = cursorOn && cursor && k === key(cursor) && !cell.hasAttribute('data-outside');
        cell.toggleAttribute('data-active', active);
        if (active) activeId = cell.id;
      }
      if (activeId) input.setAttribute('aria-activedescendant', activeId);
      else input.removeAttribute('aria-activedescendant');
    }

    /* —— 时间列 —— */
    function buildTime() {
      const col = (unit, list, label) => h('div', { class: 'nv-date-time-col' },
        h('div', { class: 'nv-date-time-head', 'aria-hidden': 'true' }, label),
        h('div', { class: 'nv-date-time-list nv-scroll', role: 'listbox', 'aria-label': label, 'data-unit': unit },
          list.map((n) => h('div', { role: 'option', class: 'nv-date-time-item', 'data-unit': unit, 'data-n': n, 'aria-selected': 'false' }, pad(n)))));
      const minutes = [];
      for (let i = 0; i < 60; i += opt.minuteStep) minutes.push(i);
      if (value && !minutes.includes(value.m)) { minutes.push(value.m); minutes.sort((a, b) => a - b); }
      timeBox.replaceChildren(
        col('h', Array.from({ length: 24 }, (_, i) => i), opt.hourText),
        col('m', minutes, opt.minuteText));
      paintTime();
    }
    function paintTime() {
      if (!timeBox) return;
      for (const it of timeBox.querySelectorAll('.nv-date-time-item')) {
        const on = !!value && value[it.dataset.unit] === Number(it.dataset.n);
        it.setAttribute('aria-selected', String(on));
      }
    }
    function centerTime(smooth) {
      if (!timeBox) return;
      for (const list of timeBox.querySelectorAll('.nv-date-time-list')) {
        const it = list.querySelector('[aria-selected="true"]');
        if (!it) continue;
        const top = it.offsetTop - list.clientHeight / 2 + it.offsetHeight / 2;
        list.scrollTo({ top, behavior: smooth && !Nova.reducedMotion() ? 'smooth' : 'auto' });
      }
    }
    function setTime(unit, n) {
      const base = value ? { ...value } : { date: clampDay(today()), h: 0, m: 0 };
      if (isDisabled(base.date)) return;
      base[unit] = n;
      commit(base);
      if (!range) jumpTo(base.date);
      centerTime(true);
    }

    function paintFoot() {
      if (!status) return;
      let text = '';
      if (anchor) text = opt.rangeHint;
      else if (value) text = opt.daysText.replace('{n}', daysBetween(value.start, value.end) + 1);
      status.textContent = text;
      if (presetBox) {
        for (const b of presetBox.children) {
          const r = presetRange(b._preset);
          b.setAttribute('aria-pressed', String(!!value && !!r && same(value.start, clampDay(r[0])) && same(value.end, clampDay(r[1]))));
        }
      }
    }

    /* —— 面板构建 —— */
    const footBtn = (act, text, variant) => h('button', {
      type: 'button', class: 'nv-btn nv-date-foot-btn', 'data-size': 'xs', 'data-variant': variant || null,
      'data-color': variant === 'ghost' ? 'neutral' : null, 'data-act': act, tabindex: '-1',
    }, text);
    function build() {
      panel = h('div', {
        class: 'nv-panel nv-date-panel',
        id: `${id}-panel`,
        role: 'dialog',
        'aria-label': opt.label,
        'data-kind': kind,
      });
      presetBox = null;
      if (range && presets.length) {
        presetBox = h('div', { class: 'nv-date-presets', role: 'group', 'aria-label': '快捷选择' },
          presets.map((p) => { const b = h('button', { type: 'button', class: 'nv-date-preset', tabindex: '-1', 'aria-pressed': 'false' }, p.label); b._preset = p; return b; }));
        panel.append(presetBox);
      }
      cals = h('div', { class: 'nv-date-cals', 'data-months': months });
      const body = h('div', { class: 'nv-date-body' }, cals);
      timeBox = null;
      if (time) {
        timeBox = h('div', { class: 'nv-date-time' });
        body.append(timeBox);
      }
      status = null;
      const left = range
        ? (status = h('span', { class: 'nv-date-status', 'aria-live': 'polite' }))
        : footBtn('clear', opt.clearText, 'ghost');
      const right = h('div', { class: 'nv-date-foot-actions' });
      if (range) right.append(footBtn('clear', opt.clearText, 'ghost'));
      else if (time) right.append(footBtn('today', opt.nowText, 'ghost'), footBtn('ok', opt.okText));
      else right.append(footBtn('today', opt.todayText, 'soft'));
      foot = h('div', { class: 'nv-date-foot' }, left, right);
      panel.append(h('div', { class: 'nv-date-main' }, body, foot));
      renderCals();
      if (time) buildTime();
      paintFoot();

      panel.addEventListener('mousedown', (e) => e.preventDefault()); // 焦点留在输入框
      panel.addEventListener('click', onPanelClick);
      panel.addEventListener('pointerover', (e) => {
        if (!range || !anchor) return;
        const cell = e.target.closest('.nv-date-cell[id]');
        if (cell && cell.getAttribute('aria-disabled') !== 'true' && !same(cell._date, hover)) { hover = cell._date; paint(); }
      });
      panel.addEventListener('pointerleave', () => { if (range && anchor && hover) { hover = null; paint(); } });
    }

    function onPanelClick(e) {
      const btn = e.target.closest('button, .nv-date-time-item');
      if (!btn || btn.disabled) return;
      const act = btn.dataset.act;
      if (btn.classList.contains('nv-date-day')) { pick(btn.parentElement._date); return; }
      if (btn.classList.contains('nv-date-time-item')) { setTime(btn.dataset.unit, Number(btn.dataset.n)); return; }
      if (btn._preset) { applyPreset(btn._preset); return; }
      if (btn.dataset.month != null) {
        view = addMonths(mk(modeYear, Number(btn.dataset.month), 1), -modeCal);
        setMode('day');
        return;
      }
      if (btn.dataset.year != null) { modeYear = Number(btn.dataset.year); setMode('month'); return; }
      switch (act) {
        case 'prev': view = addMonths(view, -1); renderCals(); break;
        case 'next': view = addMonths(view, 1); renderCals(); break;
        case 'prev-1': modeYear -= 1; renderCals(); break;
        case 'next-1': modeYear += 1; renderCals(); break;
        case 'prev-10': modeYear -= 10; renderCals(); break;
        case 'next-10': modeYear += 10; renderCals(); break;
        case 'month': setMode('month', Number(btn.dataset.cal || 0)); break;
        case 'year': if (mode === 'day') setMode('year', Number(btn.dataset.cal || 0)); else { mode = 'year'; renderCals(); } break;
        case 'clear': anchor = null; hover = null; commit(null); close(); break;
        case 'today': pickNow(); break;
        case 'ok': close(); break;
        default:
      }
    }

    function presetRange(p) {
      const t = today();
      const v = typeof p.value === 'function' ? p.value(t) : p.value;
      const [a, b] = (v || []).map(toDate);
      return a && b ? (key(a) <= key(b) ? [a, b] : [b, a]) : null;
    }
    function applyPreset(p) {
      const r = presetRange(p);
      if (!r) return;
      anchor = null;
      hover = null;
      commit({ start: clampDay(r[0]), end: clampDay(r[1]) });
      close();
    }

    function pick(d) {
      if (!d || isDisabled(d)) return;
      cursor = d;
      if (range) {
        if (!anchor) {
          anchor = d;
          hover = null;
          paint();
          paintFoot();
          if (key(d) < key(visibleStart()) || key(d) > key(visibleEnd())) jumpTo(d);
          return;
        }
        const [s, e] = key(anchor) <= key(d) ? [anchor, d] : [d, anchor];
        anchor = null;
        hover = null;
        commit({ start: s, end: e });
        close();
        return;
      }
      const base = value || { h: 0, m: 0 };
      commit({ date: d, h: base.h, m: base.m });
      if (!time) close();
      else jumpTo(d);
    }
    function pickNow() {
      const n = new Date();
      const d = today();
      if (isDisabled(d)) return;
      if (time) {
        commit({ date: d, h: n.getHours(), m: Math.floor(n.getMinutes() / opt.minuteStep) * opt.minuteStep });
        cursor = d;
        jumpTo(d);
        centerTime(true);
      } else {
        commit({ date: d, h: 0, m: 0 });
        close();
      }
    }

    /* —— 打开 / 关闭 —— */
    function open() {
      if (floating || nat.disabled || nat.readOnly) return;
      readOpts();
      months = range ? (opt.months > 0 ? Nova.clamp(opt.months, 1, 3) : window.innerWidth >= 700 ? 2 : 1) : 1;
      mode = 'day';
      anchor = null;
      hover = null;
      cursorOn = false;
      cursor = baseDate();
      view = monthStart(cursor);
      if (range && value && months > 1 && key(monthStart(value.end)) > key(addMonths(view, months - 1))) view = monthStart(value.start);
      build();
      floating = Nova.floating(panel, control, {
        placement: opt.placement,
        offset: 6,
        onDismiss: (reason) => {
          if (reason === 'escape') input.value = display(value);
          close();
        },
      });
      input.setAttribute('aria-expanded', 'true');
      control.classList.add('is-focused');
      requestAnimationFrame(() => centerTime(false));
      Nova.emit(nat, 'nv:open');
    }
    function close() {
      if (!floating) return;
      floating.close();
      floating = null;
      panel = null;
      cals = null;
      timeBox = null;
      status = null;
      presetBox = null;
      anchor = null;
      hover = null;
      cursorOn = false;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      if (document.activeElement !== input) control.classList.remove('is-focused');
      Nova.emit(nat, 'nv:close');
    }

    /* —— 键盘（焦点始终在输入框） —— */
    function moveCursor(next) {
      cursorOn = true;
      cursor = next;
      if (range && anchor) hover = next;
      if (mode !== 'day' || key(next) < key(visibleStart()) || key(next) > key(visibleEnd())) {
        mode = 'day';
        if (cals) { cals.style.minWidth = ''; cals.style.minHeight = ''; }
        view = monthStart(key(next) > key(visibleEnd()) && months > 1 ? addMonths(next, -(months - 1)) : next);
        renderCals();
      } else paint();
    }
    input.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      const k = e.key;
      if (!floating) {
        if (k === 'ArrowDown' || (k === 'ArrowUp' && e.altKey)) { e.preventDefault(); open(); }
        else if (k === 'Enter') { if (input.value !== display(value)) e.preventDefault(); applyText(); }
        return;
      }
      const c = cursor || baseDate();
      const arrows = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (k in arrows) {
        const vertical = k === 'ArrowUp' || k === 'ArrowDown';
        if (k === 'ArrowUp' && e.altKey) { e.preventDefault(); close(); return; }
        if (!cursorOn && !vertical && !e.altKey) return; // 未进入游标模式：←→ 用于编辑文字
        e.preventDefault();
        moveCursor(cursorOn || !vertical ? addDays(c, arrows[k]) : c);
      } else if (k === 'PageUp' || k === 'PageDown') {
        e.preventDefault();
        moveCursor(addMonths(c, (k === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1)));
      } else if ((k === 'Home' || k === 'End') && cursorOn) {
        e.preventDefault();
        const dow = (c.getDay() - opt.weekStart + 7) % 7;
        moveCursor(addDays(c, k === 'Home' ? -dow : 6 - dow));
      } else if (k === 'Enter') {
        e.preventDefault();
        if (cursorOn && cursor) {
          if (isDisabled(cursor)) return;
          pick(cursor);
        } else if (applyText()) close();
      } else if (k === 'Tab') {
        applyText();
        close();
      } else if (k.length === 1 && cursorOn && !e.ctrlKey && !e.metaKey) {
        cursorOn = false; // 开始打字：退出游标模式
        paint();
      }
    });
    input.addEventListener('click', () => open());
    input.addEventListener('focus', () => control.classList.add('is-focused'));
    input.addEventListener('blur', () => { if (!floating) control.classList.remove('is-focused'); });
    // 可见输入框的 input/change 只在组件内部使用，不冒泡给表单（对外事件由原生 input 派发）
    input.addEventListener('input', (e) => e.stopPropagation());
    input.addEventListener('change', (e) => { e.stopPropagation(); applyText(); });
    toggleBtn.addEventListener('mousedown', (e) => e.preventDefault());
    toggleBtn.addEventListener('click', () => {
      if (floating) close();
      else { input.focus({ preventScroll: true }); open(); }
    });
    clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
    clearBtn.addEventListener('click', () => { commit(null); close(); input.focus({ preventScroll: true }); });

    /* —— 与原生 input 同步 —— */
    function sync() {
      readOpts();
      readValue();
      input.value = display(value);
      paintControl();
      if (floating) {
        if (nat.disabled || nat.readOnly) close();
        else { renderCals(); if (time) buildTime(); paintFoot(); }
      }
    }
    const onNativeFocus = () => input.focus();
    const onNativeEvent = () => { if (!emitting) sync(); };
    const onReset = () => setTimeout(sync);
    nat.addEventListener('focus', onNativeFocus);
    nat.addEventListener('change', onNativeEvent);
    nat.addEventListener('input', onNativeEvent);
    const form = nat.form;
    form && form.addEventListener('reset', onReset);
    const mo = new MutationObserver(sync);
    mo.observe(nat, { attributes: true, attributeFilter: ['min', 'max', 'disabled', 'readonly', 'required', 'aria-invalid', 'value', 'data-placeholder', 'data-minute-step', 'data-size', 'data-clearable', 'data-presets', 'data-months', 'data-week-start'] });

    sync();

    return {
      open,
      close,
      refresh: sync,
      clear: () => commit(null),
      /** 设置值：单值传 Date / ISO 字符串；范围传 [start, end] 或 'YYYY-MM-DD/YYYY-MM-DD'；null 清空 */
      setValue(v) {
        if (v == null || v === '') { commit(null); return; }
        if (range) {
          const [a, b] = Array.isArray(v) ? v : String(v).split('/');
          const s = toDate(a);
          const e = toDate(b);
          if (s && e) commit(key(s) <= key(e) ? { start: s, end: e } : { start: e, end: s });
          return;
        }
        const p = v instanceof Date ? { date: toDate(v), h: v.getHours(), m: v.getMinutes() } : parseISO(v);
        if (p) commit({ date: p.date, h: time ? p.h : 0, m: time ? p.m : 0 });
      },
      get value() { return nat.value; },
      get input() { return input; },
      get panel() { return panel; },
      destroy() {
        close();
        mo.disconnect();
        nat.removeEventListener('focus', onNativeFocus);
        nat.removeEventListener('change', onNativeEvent);
        nat.removeEventListener('input', onNativeEvent);
        form && form.removeEventListener('reset', onReset);
        control.remove();
        nat.classList.remove('nv-date-native');
        nat.removeAttribute('aria-hidden');
        if (prevTabIndex == null) nat.removeAttribute('tabindex');
        else nat.setAttribute('tabindex', prevTabIndex);
      },
    };
  });

  const inst = (el) => {
    if (typeof el === 'string') el = document.querySelector(el);
    return el ? Nova.get(el, 'datepicker') : null;
  };
  /**
   * Nova.datepicker(el, options) → 实例。options 覆盖同名 data-*，另支持：
   *   presets: ['today', '7d', ...] 或 [{ label, value: (today) => [start, end] }]，false 关闭
   *   disabledDate: (date) => boolean   额外禁用某些日期
   */
  Nova.datepicker = (el, options = {}) => {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) return null;
    jsOptions.set(el, { ...(jsOptions.get(el) || {}), ...options });
    Nova.init(el);
    const i = inst(el);
    i && i.refresh();
    return i;
  };
  Nova.datepicker.refresh = (el) => inst(el) && inst(el).refresh();
  Nova.datepicker.open = (el) => inst(el) && inst(el).open();
  Nova.datepicker.close = (el) => inst(el) && inst(el).close();
  Nova.datepicker.presets = PRESETS;
})();
