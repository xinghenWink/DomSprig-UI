# Nova UI

零依赖、源码分发的现代 UI 组件库。原生 JS + CSS，双击 HTML 就能运行，React / Vue / 后端模板里都能直接使用。

- **源码分发**（借鉴 shadcn/ui）：`scripts/add.mjs` 按名称复制组件源码并自动带上依赖；`registry.json` 是机器可读的组件清单。
- **精致默认视觉**（借鉴 HeroUI）：OKLCH 色彩体系，分层阴影，按压与弹性微交互，明暗主题同等打磨。
- **现代动效**（借鉴 Magic UI / React Bits）：流光按钮、光束边框、聚光卡片、3D 倾斜、数字滚动、文字特效、彩带。
- **业务组件**（借鉴 Ant Design）：数据表格、日期范围、上传、命令面板、确认框、步骤条、描述列表。
- **一致的 API 与开发体验**（借鉴 Mantine）：统一的 `data-size` / `data-variant` / `data-color`，原生表单语义与事件，动态插入自动初始化，`Nova.get(el)` 取实例。

## 快速开始

打开 `docs/index.html` 浏览全部组件、示例代码与 API。

**方式一：全量引入**

```html
<link rel="stylesheet" href="dist/nova.css">
<script src="dist/nova.js"></script>
```

**方式二：按需复制源码**

```bash
node scripts/add.mjs --list                          # 查看全部组件
node scripts/add.mjs select datepicker toast --out ../my-app/src/ui/nova
```

命令会复制 `tokens.css`、`base.css`、`core.js` 与所选组件（含依赖），生成样式入口 `nova.css`，并打印需要按顺序引入的 `<script>`。加 `--bundle` 额外生成单文件 `nova.bundle.css` / `nova.bundle.js`；已存在的文件默认跳过，`--force` 覆盖。

**使用**

```html
<button class="nv-btn" data-variant="soft">保存</button>
<select data-nv-select data-search>…</select>
<input type="date" data-nv-date>
<script>
  Nova.toast.success('已保存');
  Nova.confirm({ title: '删除项目？', danger: true }).then((ok) => { /* … */ });
</script>
```

## 主题

```html
<html data-theme="dark">            <!-- light | dark；不设置时跟随系统 -->
```

```css
:root {
  --nv-hue: 165;      /* 主色相 0–360，整套主色、柔和色、焦点环、渐变自动推导 */
  --nv-radius: 12px;  /* 圆角基准，sm/lg/xl 等比缩放 */
}
```

运行时：`Nova.theme.set('dark')`、`Nova.theme.toggle(event)`（支持时从点击处圆形展开新主题）、`Nova.theme.setHue(165)`、`Nova.theme.setRadius(12)`。

## 组件

<!-- components:start -->
共 52 个组件：

| 分类 | 组件 |
|---|---|
| **通用** | `button` 按钮 · `badge` 徽标 |
| **数据录入** | `input` 输入框 · `field` 表单项 · `textarea` 多行输入 · `checkbox` 复选框 · `radio` 单选框 · `switch` 开关 · `slider` 滑块 · `segmented` 分段控制器 · `number-input` Input 数字输入框 · `pin-input` Input 验证码输入 · `tag-input` Input 标签输入 · `rating` 评分 · `select` 选择器 · `combobox` 自动补全 · `datepicker` 日期选择 · `upload` 上传 |
| **数据展示** | `avatar` 头像 · `tag` 标签 · `table` 表格 · `stat` 统计数值 · `card` 卡片 · `accordion` 折叠面板 · `descriptions` 描述列表 · `kbd` 按键 · `timeline` 时间轴 |
| **反馈** | `alert` 警告提示 · `progress` 进度条 · `toast` 轻提示 · `spinner` 加载中 · `skeleton` 骨架屏 · `empty` 空状态 |
| **浮层** | `modal` 对话框 · `drawer` 抽屉 · `popover` 弹出层 · `tooltip` 文字提示 · `dropdown` 下拉菜单 · `command` 命令面板 |
| **导航** | `pagination` 分页 · `breadcrumb` 面包屑 · `tabs` 标签页 · `steps` 步骤条 |
| **动效特效** | `number-ticker` Ticker 数字滚动 · `shimmer-button` Button 流光按钮 · `border-beam` Beam 光束边框 · `spotlight` 聚光卡片 · `tilt` 3D 倾斜 / 磁吸 · `text-fx` FX 文字特效 · `marquee` 无限滚动 · `confetti` 彩带 · `backdrop` 装饰背景 |
<!-- components:end -->

## 目录

```
src/tokens.css        设计变量（颜色、圆角、阴影、动效、层级）
src/base.css          共享原语：控件框、浮层面板、列表项、动画
src/core.js           运行时：注册与自动初始化、定位、浮层栈、焦点陷阱、键盘导航、图标、主题
src/components/<名>/   每个组件的 css / js / 文档片段
dist/                 全量构建产物
docs/                 文档站（index.html 由构建生成）
registry.json         组件清单（名称、分类、依赖、文件）
tests/                交互测试
```

## 开发

```bash
npm install                     # 只安装测试用的 puppeteer-core，组件本身无依赖
npm run build                   # 生成 dist/、registry.json、docs/index.html、本文件的组件清单
npm test                        # 运行全部交互测试（使用本机 Chrome / Edge，或设置 CHROME_PATH）
node scripts/shot.mjs select --theme both --width 390   # 截图检查 → .shots/
```

新增或修改组件前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。需要让 AI 在现有项目中接入时，可直接使用 [AI_PROMPT.md](AI_PROMPT.md)。

## 浏览器支持

Chrome / Edge 123+、Safari 17.5+、Firefox 128+（依赖 CSS `light-dark()`、`color-mix()`、OKLCH 与 `:has()`）。

## 许可证

本项目使用 [MIT 许可证](LICENSE)。
