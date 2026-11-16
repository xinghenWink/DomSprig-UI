/* DomSprig-UI · Text FX
 * 拆分类特效（blur-in / scramble）共用一个模式：动画期间把原文节点暂存起来，显示拆分后的副本（aria-hidden），
 * 并放一份 .nv-sr-only 原文供读屏；动画结束后把原始节点放回去，DOM 恢复成作者写的样子（字距、换行、选中复制都正常）。
 * 打字机 / 轮换：读屏读 .nv-sr-only 中的完整文案（或 data-label），动画层 aria-hidden。
 * 减少动态：blur-in / scramble 不拆分直接显示原文；打字机直接显示第一个词（不循环）；轮换停在第一个词。
 */
(() => {
  const { Nova } = window;
  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
  const words = (s) => String(s || '').split('|').map((w) => w.trim()).filter(Boolean);

  /** 把文本拆成 [片段, 是否空白]：按词（中文按词典分词）或按字 */
  function tokens(text, mode) {
    if (mode === 'char') return [...text].map((ch) => [ch, /\s/.test(ch)]);
    if (segmenter) return [...segmenter.segment(text)].map((s) => [s.segment, !s.segment.trim()]);
    return text.split(/(\s+)/).filter(Boolean).map((t) => [t, !t.trim()]);
  }

  /**
   * 暂存原文，返回拆分后的视觉副本。makeUnit(text, index) 返回替换一个片段的节点。
   * restore() 把原始节点放回去。
   */
  function splitText(el, mode, makeUnit) {
    const original = document.createDocumentFragment();
    original.append(...el.childNodes);
    const visual = Nova.h('span', { 'aria-hidden': 'true', class: 'nv-text-split' });
    const copy = original.cloneNode(true);
    copy.querySelectorAll?.('[id]').forEach((n) => n.removeAttribute('id'));
    let i = 0;
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const [t, space] of tokens(child.data, mode)) frag.append(space ? t : makeUnit(t, i++));
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          if (child.id) child.removeAttribute('id');
          walk(child);
        }
      }
    };
    walk(copy);
    visual.append(copy);
    const sr = Nova.h('span', { class: 'nv-sr-only' }, original.textContent.replace(/\s+/g, ' ').trim());
    el.append(sr, visual);
    return {
      count: i,
      visual,
      restore() {
        sr.remove();
        visual.remove();
        el.append(original);
      },
    };
  }

  /* ———————————————— 逐词模糊淡入 ———————————————— */
  Nova.define('text-blur-in', '[data-nv-text="blur-in"]', (el) => {
    const o = Nova.opts(el, { split: 'word', duration: 700, stagger: 60, delay: 0, threshold: 0.3 });
    if (Nova.reducedMotion()) { el.dataset.state = 'done'; return {}; }
    let split = null;
    let timer = 0;
    const prepare = () => {
      split && split.restore();
      el.dataset.state = 'reset';
      split = splitText(el, o.split, (t, i) => Nova.h('span', { class: 'nv-text-unit', style: `--_i:${i}` }, t));
      el.style.setProperty('--_d', `${o.duration}ms`);
      el.style.setProperty('--_stagger', `${o.stagger}ms`);
    };
    const play = () => {
      clearTimeout(timer);
      if (!split) prepare();
      el.getBoundingClientRect(); // 提交初始状态
      timer = setTimeout(() => {
        el.dataset.state = 'in';
        timer = setTimeout(() => {
          split.restore();
          split = null;
          el.dataset.state = 'done';
          Nova.emit(el, 'nv:done');
        }, o.duration + o.stagger * Math.max(0, split.count - 1) + 60);
      }, Math.max(0, o.delay));
    };
    prepare();
    const stop = Nova.inView(el, play, { threshold: o.threshold });
    return {
      replay() { prepare(); play(); },
      destroy() { stop(); clearTimeout(timer); split && split.restore(); split = null; delete el.dataset.state; },
    };
  });

  /* ———————————————— 乱码解码 ———————————————— */
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&*+=?<>/\\{}[]';
  Nova.define('text-scramble', '[data-nv-text="scramble"]', (el) => {
    const o = Nova.opts(el, { duration: 900, delay: 0, chars: GLYPHS, replay: true, trigger: 'view' });
    if (Nova.reducedMotion()) return {};
    const pool = [...o.chars];
    const rand = () => pool[(Math.random() * pool.length) | 0];
    let raf = 0;
    let split = null;

    const run = () => {
      if (raf || Nova.reducedMotion()) return;
      const cells = [];
      split = splitText(el, 'word', (t) => {
        const word = Nova.h('span', { class: 'nv-scramble-word' });
        for (const ch of t) {
          const glyph = Nova.h('span', { class: 'nv-scramble-glyph' }, rand());
          const ghost = Nova.h('span', { class: 'nv-scramble-ghost' }, ch);
          const cell = Nova.h('span', { class: 'nv-scramble-ch', 'data-busy': '' }, ghost, glyph);
          cells.push({ cell, glyph, ch });
          word.append(cell);
        }
        return word;
      });
      const n = cells.length || 1;
      const t0 = performance.now() + o.delay;
      let lastSwap = 0;
      el.dataset.state = 'running';
      const step = (now) => {
        const t = now - t0;
        const swap = now - lastSwap > 45; // 乱码约 22 次/秒，避免闪得太快
        if (swap) lastSwap = now;
        let pending = 0;
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];
          if (!c.cell.hasAttribute('data-busy')) continue;
          const at = (i / n) * o.duration * 0.75 + o.duration * 0.25; // 先整体乱一会儿，再从左到右依次定格
          if (t >= at) {
            c.glyph.textContent = c.ch;
            c.cell.removeAttribute('data-busy');
          } else {
            pending++;
            if (swap) c.glyph.textContent = rand();
          }
        }
        if (pending) { raf = requestAnimationFrame(step); return; }
        raf = 0;
        split.restore();
        split = null;
        el.dataset.state = 'done';
        Nova.emit(el, 'nv:done');
      };
      raf = requestAnimationFrame(step);
    };

    const stop = o.trigger === 'view' ? Nova.inView(el, run, { threshold: 0.4 }) : () => {};
    const onEnter = (e) => { if (e.pointerType !== 'touch') run(); };
    const replayTarget = el.closest('a, button, [tabindex]') || el;
    if (o.replay) {
      replayTarget.addEventListener('pointerenter', onEnter);
      replayTarget.addEventListener('focus', run);
    }
    return {
      replay: run,
      destroy() {
        stop();
        cancelAnimationFrame(raf);
        raf = 0;
        split && split.restore();
        replayTarget.removeEventListener('pointerenter', onEnter);
        replayTarget.removeEventListener('focus', run);
      },
    };
  });

  /* ———————————————— 打字机 ———————————————— */
  Nova.define('text-type', '[data-nv-text="type"]', (el) => {
    const o = Nova.opts(el, {
      words: '', speed: 70, deleteSpeed: 35, pause: 1600, delay: 300, loop: true, caret: true, reserve: false, label: '',
    });
    const list = words(o.words);
    if (!list.length) list.push(el.textContent.trim());
    const loop = o.loop && list.length > 1;
    const label = o.label || list.join('、');
    const reduced = Nova.reducedMotion();

    el.textContent = '';
    const sr = Nova.h('span', { class: 'nv-sr-only' }, label);
    const line = Nova.h('span', { class: 'nv-type-line', 'aria-hidden': 'true' });
    const text = document.createTextNode(reduced ? list[0] : '');
    line.append(text);
    if (o.caret) line.append(Nova.h('span', { class: 'nv-type-caret' }));
    el.append(sr);
    if (o.reserve) {
      const longest = list.reduce((a, b) => ([...b].length > [...a].length ? b : a), '');
      el.append(Nova.h('span', { class: 'nv-type-ghost', 'aria-hidden': 'true' }, longest));
    }
    el.append(line);
    if (reduced) { el.dataset.state = 'done'; return {}; }

    let timer = 0;
    let wi = 0;
    let ci = 0;
    let deleting = false;
    let visible = true;
    let waiting = false; // 离开视口时暂停，回来后继续
    const chars = () => [...list[wi]];

    const tick = () => {
      timer = 0;
      if (!visible) { waiting = true; return; }
      const cs = chars();
      if (!deleting) {
        ci++;
        text.data = cs.slice(0, ci).join('');
        el.dataset.state = 'typing';
        if (ci < cs.length) { timer = setTimeout(tick, o.speed * (0.6 + Math.random() * 0.8)); return; }
        el.dataset.state = loop || wi < list.length - 1 ? 'pause' : 'done';
        if (!loop && wi >= list.length - 1) { Nova.emit(el, 'nv:done'); return; }
        deleting = true;
        timer = setTimeout(tick, o.pause);
        return;
      }
      ci--;
      text.data = cs.slice(0, ci).join('');
      el.dataset.state = 'typing';
      if (ci > 0) { timer = setTimeout(tick, o.deleteSpeed); return; }
      deleting = false;
      wi = (wi + 1) % list.length;
      el.dataset.state = 'pause';
      timer = setTimeout(tick, o.speed * 4);
    };

    el.dataset.state = 'pause';
    let started = false;
    const stop = Nova.inView(el, (v) => {
      visible = v;
      if (!v || timer) return;
      if (waiting) { waiting = false; timer = setTimeout(tick, 0); }
      else if (!started) { started = true; timer = setTimeout(tick, Math.max(0, o.delay)); }
    }, { once: false, threshold: 0 });

    return {
      destroy() { stop(); clearTimeout(timer); },
    };
  });

  /* ———————————————— 词语轮换 ———————————————— */
  Nova.define('text-rotate', '[data-nv-text="rotate"]', (el) => {
    const o = Nova.opts(el, { words: '', interval: 2200, label: '' });
    const list = words(o.words);
    if (!list.length) list.push(...el.textContent.split('|').map((w) => w.trim()).filter(Boolean));
    if (!list.length) return {};
    el.textContent = '';
    el.append(Nova.h('span', { class: 'nv-sr-only' }, o.label || list.join('、')));
    const nodes = list.map((w, i) => Nova.h('span', { class: 'nv-rotate-word', 'aria-hidden': 'true', 'data-state': i === 0 ? 'active' : null }, w));
    el.append(...nodes);
    if (Nova.reducedMotion() || list.length < 2) return {};

    let i = 0;
    let timer = 0;
    const next = () => {
      const cur = nodes[i];
      i = (i + 1) % nodes.length;
      const nxt = nodes[i];
      cur.dataset.state = 'out';
      // 先把下一个词放回底部起点（无过渡），下一帧再进场
      nxt.style.transition = 'none';
      nxt.removeAttribute('data-state');
      nxt.getBoundingClientRect();
      nxt.style.transition = '';
      nxt.dataset.state = 'active';
      timer = setTimeout(() => {
        if (cur.dataset.state === 'out') cur.removeAttribute('data-state');
      }, 700);
      Nova.emit(el, 'nv:change', { index: i, word: list[i] });
    };
    let iv = 0;
    const stop = Nova.inView(el, (v) => {
      clearInterval(iv);
      if (v) iv = setInterval(next, Math.max(800, o.interval));
    }, { once: false, threshold: 0 });
    return {
      next,
      destroy() { stop(); clearInterval(iv); clearTimeout(timer); },
    };
  });

  Nova.textFx = {
    /** 重播 blur-in / scramble */
    replay(el) {
      if (typeof el === 'string') el = document.querySelector(el);
      const inst = Nova.get(el, 'text-blur-in') || Nova.get(el, 'text-scramble');
      inst && inst.replay && inst.replay();
    },
  };
})();
