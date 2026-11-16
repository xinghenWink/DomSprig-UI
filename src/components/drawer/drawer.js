/* DomSprig-UI · Drawer 抽屉
 * 与 Modal 共用同一套模态内核（Nova.modal._register）：焦点陷阱、滚动锁定、Esc / 遮罩关闭、嵌套、还焦、退场动画。
 * <div class="nv-drawer" id="d1" data-side="right" hidden aria-labelledby="d1-title"><div class="nv-drawer-panel">…</div></div>
 * 打开：[data-nv-drawer-open="#d1"] 或 Nova.drawer.open(el)；关闭：[data-nv-drawer-close] / .nv-drawer-close、Esc、遮罩
 * 事件：nv:open / nv:close（detail.reason）
 */
(() => {
  const { Nova } = window;
  Nova.drawer = Nova.modal._register('drawer');
})();
