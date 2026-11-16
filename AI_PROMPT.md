# 直接复制给 AI 的提示词

你是资深前端工程师。我的项目要接入 Nova UI 组件库（零依赖，原生 JS + CSS，源码在 `nova-ui/`）。请先阅读：

- `nova-ui/README.md`（接入方式与主题）
- `nova-ui/CONTRIBUTING.md`（命名、视觉与交互规范）
- `nova-ui/registry.json`（组件清单与依赖）
- 需要用到的组件的 `src/components/<名>/<名>.doc.html`（示例与 API）

然后在我现有项目的技术栈中完成接入：

1. 用 `node nova-ui/scripts/add.mjs <组件…> --out <项目内目录>` 复制所需组件源码，在全局入口按输出提示的顺序引入 css 与 js（`core.js` 最先）。
2. 把项目里的原生控件替换为 Nova 组件：`<select>` → `data-nv-select`，`date`/`datetime-local` → `data-nv-date`，弹窗 → `nv-modal` / `Nova.confirm`，消息提示 → `Nova.toast`，悬停说明 → `data-tip`。保持原有的 `name`、`value`、`change` 事件与表单提交行为不变。
3. 如果项目使用 React / Vue 等框架：封装薄组件（如 `<Select value onChange options size searchable disabled invalid>`），内部渲染原生元素并在挂载后由 Nova 自动增强；程序化改值后调用对应的 `refresh`（如 `Nova.select.refresh(el)`），卸载时调用 `Nova.destroy(el)`。
4. 把项目原有的品牌色换算成 OKLCH 色相，写入 `--nv-hue`；如有暗色模式，切换 `<html data-theme>`。
5. 不新增第三方依赖。完成后列出：被替换的位置、改动的文件、仍保留原生控件的地方及原因。
