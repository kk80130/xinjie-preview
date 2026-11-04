(() => {
  "use strict";
  const root = document.documentElement;
  let width = innerWidth, height = innerHeight, reading = null, restoreTimer = 0;
  const editable = (target) => target instanceof Element && target.matches('#story textarea, #story input:not([type="radio"]):not([type="checkbox"]):not([type="range"])');
  const publishHeight = () => root.style.setProperty("--story-viewport-height", `${height}px`);
  publishHeight();
  function begin(target) {
    if (!editable(target)) return;
    if (innerWidth > 640 && !matchMedia("(pointer: coarse)").matches) return;
    clearTimeout(restoreTimer);
    if (!reading) reading = { y: scrollY, width: innerWidth, closing: false };
    reading.closing = false;
  }
  function resume() {
    if (innerWidth !== width) { width = innerWidth; height = innerHeight; publishHeight(); }
    reading = null;
    window.dispatchEvent(new Event("ui-reading-resume"));
  }
  function restore() {
    if (!reading?.closing) return;
    // 键盘只改变可视区域，不能把一整条叙事时间轴按键盘高度重新缩放。
    if (innerWidth !== reading.width) { resume(); return; }
    window.scrollTo({ top: reading.y, behavior: "instant" });
  }
  function finish() {
    reading.closing = true;
    requestAnimationFrame(restore);
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => { restore(); resume(); }, 700);
  }
  document.addEventListener("pointerdown", (event) => begin(event.target), true);
  document.addEventListener("focusin", (event) => begin(event.target), true);
  document.addEventListener("focusout", (event) => {
    if (!editable(event.target) || !reading || editable(event.relatedTarget)) return;
    finish();
  }, true);
  const visualResize = () => {
    if (!reading) return;
    // 部分手机先改变可视区域、稍后才发出 blur；两者都要恢复同一位置。
    const visibleHeight = window.visualViewport?.height || innerHeight;
    if (visibleHeight < height - 150) reading.keyboardSeen = true;
    // Android 的“收起键盘”可以保留输入焦点，不能只等待 blur。
    if (reading.keyboardSeen && visibleHeight >= height - 80 && !reading.closing) finish();
    if (reading.closing) requestAnimationFrame(restore);
  };
  window.visualViewport?.addEventListener("resize", visualResize, { passive: true });
  window.addEventListener("resize", () => {
    if (reading) { visualResize(); return; }
    if (innerWidth === width && innerWidth <= 640) return;
    width = innerWidth; height = innerHeight; publishHeight();
  });
  // 用户主动继续滚动后，取消尚未完成的键盘收起补偿，避免抢回阅读位置。
  const continueReading = () => {
    if (!reading?.closing) return;
    clearTimeout(restoreTimer); resume();
  };
  window.addEventListener("touchmove", continueReading, { passive: true });
  window.addEventListener("wheel", continueReading, { passive: true });
  window.uiReadingInput = { get active() { return Boolean(reading); } };
})();
