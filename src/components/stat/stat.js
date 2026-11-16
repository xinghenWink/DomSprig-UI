/* DomSprig-UI · Stat 迷你走势图
 * <svg class="nv-stat-spark" data-values="3 5 4 8 7 9" data-type="area" data-animate></svg>
 * data-values  数字，空格或逗号分隔
 * data-type    line | area（默认）
 * data-dot     末端画一个圆点        data-animate  进入视口时描线
 * data-min / data-max  固定纵轴范围（默认取数据最小、最大值）
 * 尺寸随容器变化自动重绘；Nova.get(svg, 'stat-spark').set([…]) 更新数据。
 */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const parse = (s) => String(s || '').split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));

  Nova.define('stat-spark', 'svg.nv-stat-spark', (svg) => {
    let values = parse(svg.dataset.values);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('preserveAspectRatio', 'none');

    const make = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      return n;
    };

    const draw = () => {
      const w = svg.clientWidth || 200;
      const h = svg.clientHeight || 40;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.textContent = '';
      if (values.length < 2) return;
      const min = svg.dataset.min != null ? Number(svg.dataset.min) : Math.min(...values);
      const max = svg.dataset.max != null ? Number(svg.dataset.max) : Math.max(...values);
      const range = max - min || 1;
      const pad = 3; // 给线宽和末端圆点留边
      const pts = values.map((v, i) => [
        (i / (values.length - 1)) * w,
        pad + (1 - (v - min) / range) * (h - pad * 2),
      ]);
      // 相邻两点之间用水平切线的三次贝塞尔，曲线平滑，且极值不会冲出数据范围
      let d = `M${pts[0][0]},${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        const mx = (x0 + x1) / 2;
        d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
      }
      if ((svg.dataset.type || 'area') === 'area') {
        svg.append(make('path', { class: 'nv-stat-spark-area', d: `${d} L${w},${h} L0,${h} Z` }));
      }
      const line = make('path', { class: 'nv-stat-spark-line', d });
      svg.append(line);
      if ('dot' in svg.dataset) {
        const [x, y] = pts[pts.length - 1];
        svg.append(make('circle', { class: 'nv-stat-spark-dot', cx: x, cy: y, r: 3 }));
      }
      if ('animate' in svg.dataset) {
        const len = line.getTotalLength ? line.getTotalLength() : w * 2;
        svg.style.setProperty('--_len', String(Math.ceil(len)));
      }
    };

    draw();
    let lastW = svg.clientWidth;
    let lastH = svg.clientHeight;
    const ro = new ResizeObserver(() => {
      if (svg.clientWidth === lastW && svg.clientHeight === lastH) return;
      lastW = svg.clientWidth;
      lastH = svg.clientHeight;
      draw();
    });
    ro.observe(svg);
    const stopView = 'animate' in svg.dataset
      ? Nova.inView(svg, () => requestAnimationFrame(() => svg.classList.add('is-in')))
      : () => {};

    return {
      set(next) {
        values = Array.isArray(next) ? next.map(Number).filter((n) => Number.isFinite(n)) : parse(next);
        svg.dataset.values = values.join(' ');
        draw();
      },
      get values() { return values.slice(); },
      destroy() { ro.disconnect(); stopView(); },
    };
  });
})();
