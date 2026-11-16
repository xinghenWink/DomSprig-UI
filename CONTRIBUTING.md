# DomSprig-UI 组件开发规范

所有组件必须遵守本文。参考实现：`src/components/button/`（CSS + JS + 文档片段）和 `src/core.js`。

## 1. 目录与文件

```
src/tokens.css              设计变量（唯一的颜色/圆角/阴影/动效来源）
src/base.css                共享原语：.nv-control .nv-panel .nv-item .nv-spinner .nv-scroll .nv-sr-only + 动画
src/core.js                 运行时：Nova.define / position / floating / layer / trapFocus / lockScroll / roving / icon / theme
src/components/<name>/
  <name>.css                样式（必需）
  <name>.js                 行为（纯 CSS 组件可省略）
  <name>.doc.html           文档与示例（必需，构建时生成文档页）
tests/<name>.test.mjs       交互测试（有 JS 行为的组件必需）
```

- `<name>` 用小写短横线（`number-input`）。一个文件夹一个组件。
- 共享文件（tokens/base/core、docs/、scripts/）只允许做**向后兼容的小修复**，并在交付说明里写清楚改了什么、为什么。不要重构、不要改已有 API。

## 2. 命名

- 类名前缀 `nv-`：根 `nv-<comp>`，部件 `nv-<comp>-<part>`（`nv-select-trigger`）。
- 修饰用 `data-*`：`data-variant` `data-color` `data-size="sm|md|lg"` `data-block` 等，与 Button 保持一致的取值。
- 状态优先用 ARIA / 原生：`aria-expanded` `aria-selected` `aria-checked` `aria-invalid` `aria-disabled` `:disabled`；
  其它状态用 `data-state="open|closed"`、`data-active`。避免 `is-xxx` 类。
- 组件私有 CSS 变量用 `--_x`；对外可定制的变量用 `--nv-<comp>-x`，并在文档 API 中列出。

## 3. 视觉规则

- **只用 tokens.css 中的变量**。不写死颜色（`#fff`/`black` 只允许出现在 `color-mix()` 里或实心彩色底上的白字）。亮/暗两套主题都必须好看：变量已用 `light-dark()` 处理，不要自己写 `[data-theme=dark]` 分支，除非确有必要。
- 表面：页面 `--nv-bg`，卡片 `--nv-surface`，浮层（菜单/面板/对话框）`--nv-surface-raised`，弱底 `--nv-surface-2/3`。
- 边框：一般 `--nv-border`；输入类 `--nv-border-input`；hover `--nv-border-strong`。
- 字重只用 **400 / 500 / 600 / 700**（Windows 中文字体只有常规和粗体，550/650 会渲染成粗体）。
- 字号：12 / 13 / 14 / 16 / 18 / 22（`--nv-text-*`）。控件高度：32 / 38 / 44（`--nv-h-sm/md/lg`）。
- 焦点：输入类 → 边框 `--nv-primary` + `0 0 0 3px var(--nv-ring)`；其它可点击元素 → `outline: 2px solid var(--nv-primary); outline-offset: 2px`，只在 `:focus-visible` 显示。
- 选中/激活用主色；hover 用 `--nv-surface-2`；禁用 `opacity: .5` + `cursor: not-allowed`。
- 动效：时长 `--nv-dur-1..4`，入场 `--nv-ease-out`，弹性 `--nv-ease-spring`。浮层统一用 `.nv-panel` 的 `nv-pop-in`（从锚点方向缩放弹出）。`base.css` 已全局处理 `prefers-reduced-motion`；**JS 驱动的动画必须检查 `Nova.reducedMotion()`**。
- 图标：`Nova.icon(name, { size })` 或 `<i data-nv-icon="name">`，控件内 16px。新图标加到组件 JS 里：`Nova.icons.foo = '<path …/>'`（24×24、描边 2、圆角端点）。
- 界面文案用中文；所有内置文案（占位、无结果、按钮文字…）都要能通过 `data-*` 或 JS 选项覆盖。

## 4. JS 规则

```js
(() => {
  const { Nova } = window;
  Nova.define('select', 'select[data-nv-select]', (el) => {
    // …增强 el…
    return { open, close, refresh, destroy };   // 实例 API，Nova.get(el, 'select') 可取
  });
  Nova.select = { refresh: (el) => Nova.get(el, 'select')?.refresh() };   // 需要时提供命令式 API
})();
```

- 无依赖，现代浏览器（ES2020+，Chrome/Edge 120+、Safari 17+、Firefox 120+）。不用构建工具。
- **渐进增强**：能包装原生元素就包装（`select` `input` `checkbox`），原生元素保留并同步值，表单提交、`change`/`input` 事件照常。
- 事件：包装原生控件的派发原生 `change`/`input`；其它组件在宿主元素上派发 `nv:*` 自定义事件（`Nova.emit(el, 'nv:change', detail)`）。
- **安全**：用户数据一律走 `textContent` / `Nova.h()` / `Nova.esc()`，禁止把未转义数据拼进 `innerHTML`。
- 必须复用 core：
  - 锚定浮层 → `Nova.floating(panel, anchor, { placement, offset, onDismiss })`（挂载、翻转、夹紧、跟随滚动、Esc/点外部关闭、动画全包）；
  - 模态 → `Nova.layer.push` + `Nova.trapFocus` + `Nova.lockScroll`；
  - 列表键盘导航 → `Nova.roving`；
  - 配置读取 → `Nova.opts(el, defaults)`。
- 组件可能在 `display:none` 的容器里初始化（文档站隐藏页、Tabs 隐藏面板）。**不要在 setup 里依赖尺寸测量**；需要尺寸时在交互时测量或用 `ResizeObserver`。
- 同一页面多个实例互不干扰；动态插入的元素自动初始化（core 的 MutationObserver 已处理）。

## 5. 无障碍（验收必查）

- 正确的 role / aria 关系（combobox↔listbox、tab↔tabpanel、dialog 的 `aria-modal` `aria-labelledby` 等）。
- 完整键盘操作（参考 WAI-ARIA APG 对应模式），焦点可见、焦点不丢失；关闭浮层后焦点回到触发器。
- 只有图标的按钮必须有 `aria-label`。文本对比度 ≥ 4.5:1（亮/暗都要满足）。
- 触摸设备可用（不依赖 hover 才能完成的操作）。

## 6. 文档片段 `<name>.doc.html`

```html
<!--
@name select
@title Select 选择器
@category form
@order 10
@deps tooltip
@desc 一句话说明组件用途与亮点。
-->

<!-- @demo 示例标题 | 一句话说明，可用 `代码` | block -->
<label class="doc-label" for="select-basic">模型</label>
<select id="select-basic" data-nv-select>…</select>
<script>
  { // 必须包在块或函数里：整个文档站共享一个全局作用域
    const el = document.getElementById('select-basic');
    el.addEventListener('change', () => {});
  }
</script>

<!-- @api
### 属性
| 属性 | 说明 | 取值 | 默认 |
|---|---|---|---|
| `data-search` | 可搜索 | 布尔 | — |
-->
```

- `@category`：`general` 通用 · `form` 数据录入 · `data` 数据展示 · `feedback` 反馈 · `overlay` 浮层 · `navigation` 导航 · `effects` 动效特效。`@order` 控制同类排序。
- `@demo` 用「空格|空格」分隔：标题 | 说明 | 标记。标记（空格分隔，可多个）：
  `block` 普通块布局（表单/表格等） · `left` 左对齐 · `col` 纵向排列 · `tall` 最小高 380px · `full` 无内边距 · `plain` 无点阵底。
- 示例 HTML 原样显示为代码，所以要写得像真实用法：简洁、有意义的中文文案，不写内联样式（布局用 `doc-row` `doc-stack` `doc-narrow`(360px) `doc-mid`(520px) `doc-label` `doc-hint` `doc-log`）。
- 元素 id 全站唯一，以组件名开头（`select-basic`）。脚本放在 `{ }` 块里；需要实例时用 `Nova.ready(() => …)`。
- 每个组件 4–8 个示例，覆盖：基础、变体/尺寸、状态（禁用/错误/加载）、真实业务场景、键盘/无障碍说明。最后写完整 API（属性、事件、方法、CSS 变量）。

## 7. 自检流程（交付前必须全部通过）

```bash
node scripts/shot.mjs <name> --theme both              # 整页截图（亮+暗）→ .shots/
node scripts/shot.mjs <name> --width 390               # 手机宽度
node scripts/shot.mjs <name> --demo 2 --eval "document.querySelector('#select-basic + .nv-select-trigger, .nv-select-trigger').click()" --wait 400
                                                       # 截某个示例，并在截图前执行代码（打开浮层等）
node scripts/test.mjs <name>                           # 交互测试
```

- 用 Read 工具**打开 PNG 亲眼检查**：对齐、间距、截断、溢出、暗色对比度、浮层位置。截图脚本打印的页面报错必须为 0。
- 交互测试覆盖：鼠标与键盘主流程、值同步与事件、Esc/点外部关闭、禁用态、边界（空数据、超长文本）。
