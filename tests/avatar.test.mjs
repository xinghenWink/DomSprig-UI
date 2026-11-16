// Avatar：文字头像（中文取后两字、英文取首字母、同名同色）、图片失败回退、无名回退图标、头像组 +N 与 title、refresh、组内不遮挡文字
export default async ({ page, assert, sleep }) => {
  await sleep(300);
  const r = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.nv-avatar')];
    const by = (n) => all.find((a) => a.dataset.name === n);
    return {
      cn: by('周屿')?.textContent,
      en: Nova.avatar.initials('Chen Mo'),
      cn3: Nova.avatar.initials('欧阳娜娜'),
      hueSame: Nova.avatar.hue('林夏') === Nova.avatar.hue('林夏'),
      hueDiff: Nova.avatar.hue('林夏') !== Nova.avatar.hue('周屿'),
      role: by('周屿')?.getAttribute('role'),
      label: by('周屿')?.getAttribute('aria-label'),
      broken: all.find((a) => a.getAttribute('aria-label') === '宋一')?.textContent,
      brokenImg: !!all.find((a) => a.getAttribute('aria-label') === '宋一')?.querySelector('img'),
    };
  });
  assert.equal(r.cn, '周屿', '中文名取两个字');
  assert.equal(r.en, 'CM', '英文取首字母');
  assert.equal(r.cn3, '娜娜', '长中文名取最后两个字');
  assert(r.hueSame && r.hueDiff, '色相由名字决定');
  assert.equal(r.role, 'img', '文字头像 role=img');
  assert.equal(r.label, '周屿', '文字头像 aria-label');
  assert.equal(r.broken, '宋一', '图片加载失败回退为 alt 文字');
  assert(!r.brokenImg, '回退后移除坏图');

  // 头像组
  const g = await page.$eval('.nv-avatar-group[data-max]', (el) => {
    const shown = [...el.querySelectorAll('.nv-avatar')].filter((a) => !a.hidden);
    const more = el.querySelector('.nv-avatar-more');
    return { shown: shown.length, more: more?.textContent, title: more?.getAttribute('title') || more?.getAttribute('aria-label') };
  });
  assert.equal(g.shown, 5, '显示 4 个 + 一个 +N');
  assert.equal(g.more, '+3', '+N 计数');
  assert(g.title && g.title.includes('宋一') && g.title.includes('Ada Wong'), `+N 列出被折叠的名字（${g.title}）`);

  const re = await page.$eval('.nv-avatar-group[data-max]', (el) => {
    el.querySelectorAll('.nv-avatar:not(.nv-avatar-more)')[5].remove();
    el.querySelectorAll('.nv-avatar:not(.nv-avatar-more)')[5].remove();
    const inst = Nova.get(el, 'avatar-group');
    inst && inst.refresh();
    return new Promise((res) => setTimeout(() => res(el.querySelector('.nv-avatar-more')?.textContent), 50));
  });
  assert.equal(re, '+1', '删除后重新计算 +N');

  // 组内两字头像不被下一个遮住
  const clip = await page.$eval('.nv-avatar-group[data-max]', (el) => {
    const [a, b] = [...el.querySelectorAll('.nv-avatar')];
    const range = document.createRange();
    range.selectNodeContents(a);
    const text = range.getBoundingClientRect();
    return Math.round(b.getBoundingClientRect().left - 2 - text.right);
  });
  assert(clip >= -1, `文字不被下一个头像遮住（间距 ${clip}px）`);
};
