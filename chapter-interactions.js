(() => {
  'use strict';

  const shortcuts = document.querySelector('.mobile-shortcuts');
  const menu = shortcuts?.querySelector('details');
  const currentLabel = document.getElementById('mobileCurrentChapter');
  const names = { concept: '概念', research: '研究', system: '视觉', motion: '动画',
    flow: '流程', process: '制作', deliverables: '反馈' };
  let navigationFrame = 0;
  function updateShortcuts() {
    navigationFrame = 0;
    if (!shortcuts || !menu) return;
    const header = document.querySelector('.topbar');
    const show = innerWidth <= 640 && header.getBoundingClientRect().bottom < 0;
    shortcuts.hidden = !show;
    if (!show) menu.open = false;
    const current = [...document.querySelectorAll('[data-story-chapter]')].find((chapter) => {
      const box = chapter.getBoundingClientRect();
      return box.top <= innerHeight * .4 && box.bottom > innerHeight * .4;
    });
    currentLabel.textContent = current ? `章节 · ${names[current.id]}` : '章节';
    menu.querySelectorAll('[data-view-target]').forEach((item) => {
      if (item.dataset.viewTarget === current?.id) item.setAttribute('aria-current', 'location');
      else item.removeAttribute('aria-current');
    });
  }
  function scheduleNavigation() {
    if (!navigationFrame) navigationFrame = requestAnimationFrame(updateShortcuts);
  }
  if (shortcuts && menu) {
    // 沿用页面已有的章节跳转；只补充移动端随手可达的入口。
    shortcuts.addEventListener('click', (event) => {
      if (event.target.closest('[data-view-target]')) menu.open = false;
    });
    document.addEventListener('click', (event) => {
      if (!shortcuts.contains(event.target)) menu.open = false;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menu.open) {
        menu.open = false;
        menu.querySelector('summary').focus();
      }
    });
    window.addEventListener('scroll', scheduleNavigation, { passive: true });
    window.addEventListener('resize', scheduleNavigation);
    document.addEventListener('site-mode-change', scheduleNavigation);
    updateShortcuts();
  }

  const study = document.querySelector('.object-study');
  const button = study?.querySelector('[data-object-reveal]');
  const truth = document.getElementById('objectTruth');
  if (!study || !button || !truth) return;

  // 与游戏内容库采用同一件旧物的描述与真相，演示不改动对局状态。
  const camera = window.uiMatchContent?.items?.find((item) => item.id === 'camera');
  const actual = camera?.truths?.[2] || '边角掉漆，快门测光正常';
  button.addEventListener('click', () => {
    const revealed = study.dataset.revealed !== 'true';
    study.dataset.revealed = String(revealed);
    button.setAttribute('aria-pressed', String(revealed));
    truth.textContent = revealed ? actual : '尚未核对 · · ·';
    button.replaceChildren(document.createTextNode(revealed ? '收起实拍 ' : '看一眼实拍 '));
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = revealed ? '↙' : '↗';
    button.append(arrow);
  });
})();
