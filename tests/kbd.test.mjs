// Kbd：data-keys 按平台拆分、整组 aria-label、Nova.kbd.format
export default async ({ page, assert }) => {
  const r = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.nv-kbd-group')];
    const groups = all.filter((g) => !g.closest('.doc-preview > .nv-kbd-group:first-of-type') || g.getAttribute('aria-label') !== 'Shift Command P').filter((g) => g.getAttribute('aria-label') !== 'Shift Command P');
    const unlabeled = all.filter((g) => !g.getAttribute('aria-label')).length;
    return {
      isMac: Nova.kbd.isMac,
      keys: groups[0] ? [...groups[0].querySelectorAll('kbd')].map((k) => k.textContent) : [],
      label: groups[0]?.getAttribute('aria-label'),
      fmt: Nova.kbd.format('mod+k').join(' '),
      fmt2: Nova.kbd.format('ctrl+alt+delete'),
      groups: groups.length,
      unlabeled,
      leftover: document.querySelectorAll('kbd[data-keys]:not(.nv-kbd-group kbd)').length,
    };
  });
  assert.equal(r.unlabeled, 0, '所有按键组都有 aria-label');
  assert(r.groups >= 4, `生成按键组（${r.groups}）`);
  assert.equal(r.keys.join(' '), r.isMac ? '⌘ K' : 'Ctrl K', 'mod 按平台显示');
  assert.equal(r.label, r.isMac ? 'Command K' : 'Ctrl K', '整组 aria-label');
  assert.equal(r.fmt, r.isMac ? '⌘ K' : 'Ctrl K', 'Nova.kbd.format');
  assert.equal(r.fmt2.length, 3, `三键组合（${r.fmt2}）`);
};
