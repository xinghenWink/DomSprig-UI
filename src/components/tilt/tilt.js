/* Nova UI · Tilt / Magnetic
 * 两者都用同一个阻尼弹簧在 rAF 中积分：指针静止且弹簧到位后循环立即停止，离开时弹回原位。
 * - 倾斜写 transform（复位后清空，恢复元素原有样式）；磁吸写独立的 translate 属性，可与 transform 叠加。
 * - 每帧先读位置、后写样式；触屏指针与减少动态时不做任何运动。
 */
(() => {
  const { Nova } = window;
  const { clamp } = Nova;

  /** 阻尼弹簧：stiffness 刚度，zeta 阻尼比（<1 会回弹） */
  const spring = (x0, stiffness, zeta) => {
    const damping = 2 * Math.sqrt(stiffness) * zeta;
    return {
      x: x0,
      v: 0,
      step(target, dt) {
        this.v += (stiffness * (target - this.x) - damping * this.v) * dt;
        this.x += this.v * dt;
      },
      settled(target, eps = 0.01) { return Math.abs(this.x - target) < eps && Math.abs(this.v) < eps; },
      snap(target) { this.x = target; this.v = 0; },
    };
  };
  const frameDt = (now, last) => clamp((now - last) / 1000, 0.001, 0.032);

  /* ———————————————— 3D 倾斜 ———————————————— */
  Nova.define('tilt', '[data-nv-tilt]', (el) => {
    const o = Nova.opts(el, { max: 10, perspective: 900, scale: 1.03, spring: 0.5, reverse: false, glare: false });
    const zeta = 1 - 0.75 * clamp(o.spring, 0, 1);
    const rx = spring(0, 170, zeta);
    const ry = spring(0, 170, zeta);
    const sc = spring(1, 170, Math.max(zeta, 0.6));
    let glare = null;
    let glareInner = null;
    if (o.glare) {
      glareInner = Nova.h('span');
      glare = Nova.h('span', { class: 'nv-tilt-glare', 'aria-hidden': 'true' }, glareInner);
      el.append(glare);
    }

    let raf = 0;
    let last = 0;
    let hovering = false;
    let px = 0;
    let py = 0;
    let w = 1;
    let h = 1;
    const target = { x: 0, y: 0, s: 1 };

    const tick = (now) => {
      const dt = frameDt(now, last);
      last = now;
      let gx = 0;
      let gy = 0;
      if (hovering) {
        const r = el.getBoundingClientRect(); // 只读；中心点不受倾斜影响
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const nx = clamp((px - cx) / (w / 2), -1, 1);
        const ny = clamp((py - cy) / (h / 2), -1, 1);
        const dir = o.reverse ? -1 : 1;
        target.y = nx * o.max * dir;
        target.x = -ny * o.max * dir;
        target.s = o.scale;
        gx = px - cx;
        gy = py - cy;
      }
      rx.step(target.x, dt);
      ry.step(target.y, dt);
      sc.step(target.s, dt);
      const done = rx.settled(target.x) && ry.settled(target.y) && sc.settled(target.s, 0.0005);
      if (done && !hovering) {
        rx.snap(0); ry.snap(0); sc.snap(1);
        el.style.transform = '';
        raf = 0;
        return;
      }
      el.style.transform = `perspective(${o.perspective}px) rotateX(${rx.x.toFixed(2)}deg) rotateY(${ry.x.toFixed(2)}deg) scale(${sc.x.toFixed(4)})`;
      if (glareInner && hovering) glareInner.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;
      raf = done ? 0 : requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const onEnter = (e) => {
      if (e.pointerType === 'touch' || Nova.reducedMotion()) return;
      hovering = true;
      w = el.offsetWidth || 1;
      h = el.offsetHeight || 1;
      el.setAttribute('data-active', '');
      onMove(e);
    };
    const onMove = (e) => {
      if (!hovering) return;
      px = e.clientX;
      py = e.clientY;
      start();
    };
    const onLeave = () => {
      if (!hovering) return;
      hovering = false;
      el.removeAttribute('data-active');
      target.x = 0; target.y = 0; target.s = 1;
      start();
    };
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);

    return {
      reset() { hovering = false; cancelAnimationFrame(raf); raf = 0; rx.snap(0); ry.snap(0); sc.snap(1); el.style.transform = ''; el.removeAttribute('data-active'); },
      destroy() {
        this.reset();
        el.removeEventListener('pointerenter', onEnter);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerleave', onLeave);
        glare && glare.remove();
      },
    };
  });

  /* ———————————————— 磁吸（所有实例共享一个 document 监听） ———————————————— */
  const mags = new Set();
  let mraf = 0;
  let mlast = 0;
  let mx = -1e6;
  let my = -1e6;

  const mtick = (now) => {
    const dt = frameDt(now, mlast);
    mlast = now;
    const list = [...mags];
    const rects = list.map((m) => m.el.getBoundingClientRect()); // 先批量读
    let moving = false;
    list.forEach((m, i) => { // 再批量写
      const r = rects[i];
      const left = r.left - m.x.x; // 去掉自身位移，得到原始位置
      const top = r.top - m.y.x;
      const R = m.o.radius;
      const near = !Nova.reducedMotion() && mx >= left - R && mx <= left + r.width + R && my >= top - R && my <= top + r.height + R;
      const tx = near ? (mx - (left + r.width / 2)) * m.o.strength : 0;
      const ty = near ? (my - (top + r.height / 2)) * m.o.strength : 0;
      m.x.step(tx, dt);
      m.y.step(ty, dt);
      if (near !== m.near) { m.near = near; m.el.toggleAttribute('data-active', near); }
      if (!near && m.x.settled(0, 0.05) && m.y.settled(0, 0.05)) {
        if (m.x.x || m.y.x) { m.x.snap(0); m.y.snap(0); m.el.style.translate = ''; }
        return;
      }
      m.el.style.translate = `${m.x.x.toFixed(2)}px ${m.y.x.toFixed(2)}px`;
      if (!(m.x.settled(tx, 0.05) && m.y.settled(ty, 0.05))) moving = true;
    });
    mraf = moving ? requestAnimationFrame(mtick) : 0;
  };
  const kick = () => {
    if (mraf || !mags.size) return;
    mlast = performance.now();
    mraf = requestAnimationFrame(mtick);
  };
  const onDocMove = (e) => {
    if (e.pointerType === 'touch') return;
    mx = e.clientX;
    my = e.clientY;
    kick();
  };
  const onDocOut = (e) => {
    if (e.relatedTarget) return; // 只处理指针离开窗口
    mx = -1e6;
    my = -1e6;
    kick();
  };

  Nova.define('magnetic', '[data-nv-magnetic]', (el) => {
    const o = Nova.opts(el, { strength: 0.35, radius: 60 });
    o.strength = clamp(o.strength, 0, 1);
    const m = { el, o, near: false, x: spring(0, 220, 0.55), y: spring(0, 220, 0.55) };
    if (!mags.size) {
      document.addEventListener('pointermove', onDocMove, { passive: true });
      document.addEventListener('pointerout', onDocOut);
    }
    mags.add(m);
    return {
      destroy() {
        mags.delete(m);
        el.style.translate = '';
        el.removeAttribute('data-active');
        if (!mags.size) {
          document.removeEventListener('pointermove', onDocMove);
          document.removeEventListener('pointerout', onDocOut);
        }
      },
    };
  });
})();
