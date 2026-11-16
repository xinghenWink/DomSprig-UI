/* DomSprig-UI · Empty
 * - 按 data-image 注入内置线性插画（装饰性，aria-hidden）；已有 .nv-empty-image / .nv-empty-icon 时保留作者内容
 * - 没写标题/描述时补上该类型的默认文案；data-title / data-description 或 Nova.empty.texts 可覆盖
 * - data-image / data-title / data-description 变化时自动重绘
 * 扩展：Nova.empty.images.cart = (id) => '<svg …>'（可信字符串）；Nova.empty.texts.cart = { title, description }
 */
(() => {
  const { Nova } = window;

  const svg = (body) =>
    `<svg viewBox="0 0 160 120" fill="none" stroke-linecap="round" stroke-linejoin="round" focusable="false">${body}</svg>`;
  const BASE = '<circle class="nv-empty-halo" cx="80" cy="58" r="50"/><ellipse class="nv-empty-ground" cx="80" cy="106" rx="50" ry="5.5"/>';

  const IMAGES = {
    // 打开的空纸箱
    default: () => svg(`${BASE}
      <path class="nv-empty-shade" d="M56 50h48l10 12H46z"/>
      <path class="nv-empty-paper" d="M46 62 32 53l12-11 12 8z"/>
      <path class="nv-empty-paper" d="m114 62 14-9-12-11-12 8z"/>
      <path class="nv-empty-paper" d="M46 62h68v32a4 4 0 0 1-4 4H50a4 4 0 0 1-4-4z"/>
      <path class="nv-empty-stroke" d="M70 77h20"/>
      <circle class="nv-empty-accent-dot" cx="80" cy="32" r="3"/>
      <path class="nv-empty-accent" d="M61 22v7M57.5 25.5h7M99 16v5M96.5 18.5h5"/>`),
    // 文档 + 放大镜
    search: () => svg(`${BASE}
      <rect class="nv-empty-paper" x="40" y="20" width="62" height="78" rx="7"/>
      <path class="nv-empty-faint" d="M52 36h30M52 47h38M52 58h22M52 69h16"/>
      <path class="nv-empty-stroke" d="m113 86 13 13" stroke-width="6"/>
      <circle class="nv-empty-lens" cx="100" cy="72" r="18"/>
      <path class="nv-empty-accent" d="M90.5 66a11 11 0 0 1 7-5.5"/>
      <path class="nv-empty-stroke" d="m95.5 71.5 9 9m0-9-9 9"/>`),
    // 收件盘 + 信封
    inbox: () => svg(`${BASE}
      <path class="nv-empty-paper" d="m38 74 14-20h56l14 20v20a4 4 0 0 1-4 4H42a4 4 0 0 1-4-4z"/>
      <path class="nv-empty-shade" d="M53 55.5h54l11.6 17.5H99l-6 9H67l-6-9H41.4z"/>
      <path class="nv-empty-stroke" d="M38 74h22l6 9h28l6-9h22"/>
      <rect class="nv-empty-accent-soft" x="62" y="18" width="36" height="25" rx="4"/>
      <path class="nv-empty-accent" d="m63.5 21.5 16.5 11 16.5-11"/>
      <path class="nv-empty-faint" d="M80 49v3" stroke-width="2.5"/>
      <path class="nv-empty-faint" d="M52 26h4M104 26h4M55 36h3M102 36h3" stroke-width="2.5"/>`),
    // 浏览器窗口 + 警示
    error: () => svg(`${BASE}
      <rect class="nv-empty-paper" x="32" y="22" width="96" height="72" rx="8"/>
      <path class="nv-empty-stroke" d="M32 37h96"/>
      <circle class="nv-empty-dot" cx="42" cy="29.5" r="2"/><circle class="nv-empty-dot" cx="49" cy="29.5" r="2"/><circle class="nv-empty-dot" cx="56" cy="29.5" r="2"/>
      <path class="nv-empty-faint" d="M44 84h18M98 84h18" stroke-width="2.5"/>
      <path class="nv-empty-accent-soft" d="M80 46.5 97 77H63z"/>
      <path class="nv-empty-accent" d="M80 57v9" stroke-width="2.5"/>
      <circle class="nv-empty-accent-dot" cx="80" cy="71.5" r="1.8"/>`),
    // 断开的云
    network: (id) => svg(`${BASE}
      <mask id="${id}-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="120">
        <rect width="160" height="120" fill="#fff"/><path d="M58 24l46 70" stroke="#000" stroke-width="10"/>
      </mask>
      <g mask="url(#${id}-cut)">
        <path class="nv-empty-paper" transform="translate(32 10) scale(4)" vector-effect="non-scaling-stroke" d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
        <path class="nv-empty-faint" d="M62 74h36" stroke-width="2.5"/>
      </g>
      <path class="nv-empty-accent" d="M58 24l46 70" stroke-width="3"/>`),
  };

  const TEXTS = {
    default: { title: '暂无数据', description: '这里还没有任何内容。' },
    search: { title: '没有找到相关结果', description: '换个关键词，或减少筛选条件后再试试。' },
    inbox: { title: '暂无消息', description: '新的通知和消息会显示在这里。' },
    error: { title: '加载失败', description: '服务暂时不可用，请稍后重试。' },
    network: { title: '网络连接已断开', description: '请检查网络设置，恢复连接后刷新页面。' },
  };

  Nova.empty = {
    images: IMAGES,
    texts: TEXTS,
    /** 重绘指定元素；不传参数时重绘页面上全部空状态（注册新插画/改文案后调用） */
    refresh(el) {
      const list = el ? [typeof el === 'string' ? document.querySelector(el) : el] : document.querySelectorAll('.nv-empty');
      list.forEach((x) => x && Nova.get(x, 'empty')?.refresh());
    },
  };

  const own = (el, sel) => [...el.children].find((c) => c.matches(sel) && !c.hasAttribute('data-nv-injected')) || null;

  Nova.define('empty', '.nv-empty', (el) => {
    let nodes = []; // 本组件注入的节点

    function render() {
      nodes.forEach((n) => n.remove());
      nodes = [];
      const d = el.dataset;
      const name = d.image || 'default';
      const imageKey = Nova.empty.images[name] ? name : 'default';
      const texts = Nova.empty.texts[name] || Nova.empty.texts[imageKey] || Nova.empty.texts.default || {};

      // 插画
      let anchor = own(el, '.nv-empty-image, .nv-empty-icon');
      if (!anchor && name !== 'none') {
        const art = Nova.empty.images[imageKey];
        const html = typeof art === 'function' ? art(Nova.uid('nv-empty')) : String(art || '');
        if (html) {
          anchor = Nova.h('div', { class: 'nv-empty-image', 'aria-hidden': 'true', 'data-nv-injected': '', html });
          el.prepend(anchor);
          nodes.push(anchor);
        }
      }

      // 文案
      const title = own(el, '.nv-empty-title');
      const desc = own(el, '.nv-empty-desc');
      let after = title || anchor;
      if (!title) {
        const text = 'title' in d ? d.title : texts.title;
        if (text) {
          const t = Nova.h('div', { class: 'nv-empty-title', 'data-nv-injected': '', text });
          if (after) after.after(t); else el.prepend(t);
          nodes.push(t);
          after = t;
        }
      }
      if (!desc) {
        // 作者已写标题时不再补默认描述，避免文案不搭
        const text = 'description' in d ? d.description : title ? '' : texts.description;
        if (text) {
          const t = Nova.h('div', { class: 'nv-empty-desc', 'data-nv-injected': '', text });
          if (after) after.after(t); else el.prepend(t);
          nodes.push(t);
        }
      }
    }
    render();

    const mo = new MutationObserver(render);
    mo.observe(el, { attributes: true, attributeFilter: ['data-image', 'data-title', 'data-description'] });

    return {
      refresh: render,
      destroy() {
        mo.disconnect();
        nodes.forEach((n) => n.remove());
        nodes = [];
      },
    };
  });
})();
