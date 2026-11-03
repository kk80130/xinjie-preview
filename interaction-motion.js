(() => {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const selector = ".narrative-temperature button,.narrative-choice-buttons button,.narrative-footer button,.story-link,.lab-presets button,.motion-phases button,.flow-nodes button,.choice-button";
  let items = [];
  let frame = 0, lastTime = 0;
  const paused = () => reduced.matches || document.documentElement.classList.contains("visual-paused");
  const active = (item) => !item.element.disabled && !item.element.closest("[inert]") && (item.hover || item.focus);
  function paint(item) {
    item.element.style.setProperty("--control-reach", item.x.toFixed(4));
    item.element.style.setProperty("--control-arc", Math.sin(Math.max(0, Math.min(1, item.x)) * Math.PI).toFixed(4));
    item.element.dataset.motionState = Math.abs(item.v) > .02 ? active(item) && item.age < .08 ? "prepare" : "respond" : active(item) ? "held" : "rest";
  }
  function settle() {
    cancelAnimationFrame(frame); frame = 0; lastTime = 0;
    items.forEach((item) => { item.x = active(item) ? 1 : 0; item.v = 0; paint(item); });
  }
  function tick(now) {
    frame = 0;
    if (paused() || document.hidden) { settle(); return; }
    const dt = Math.min(lastTime ? (now - lastTime) / 1000 : .016, .032); lastTime = now;
    let moving = false;
    items.forEach((item) => {
      item.age += dt;
      // 预备仅发生在进入时；连续输入重定向当前速度，不排队重播，也不移动命中框。
      const destination = item.pressed ? .2 : active(item) ? item.age < .08 ? -.15 * Math.sin(item.age / .08 * Math.PI) : 1 : 0;
      item.v += ((destination - item.x) * 100 - item.v * 17) * dt;
      item.x += item.v * dt;
      if (item.age >= .08 && Math.abs(destination - item.x) < .001 && Math.abs(item.v) < .01) { item.x = destination; item.v = 0; }
      else moving = true;
      paint(item);
    });
    if (moving) frame = requestAnimationFrame(tick); else lastTime = 0;
  }
  function schedule() {
    if (paused()) { settle(); return; }
    if (!frame && !document.hidden) { lastTime = 0; frame = requestAnimationFrame(tick); }
  }
  function bind(item) {
    item.element.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch") return;
      if (!active(item)) item.age = 0;
      item.hover = true; schedule();
    });
    item.element.addEventListener("pointerleave", () => { item.hover = item.pressed = false; schedule(); });
    item.element.addEventListener("focus", () => {
      if (!item.element.matches(":focus-visible")) return;
      if (!active(item)) item.age = 0;
      item.focus = true; schedule();
    });
    item.element.addEventListener("blur", () => { item.focus = item.pressed = false; schedule(); });
    item.element.addEventListener("pointerdown", () => { item.pressed = true; schedule(); });
    item.element.addEventListener("pointerup", () => { item.pressed = false; schedule(); });
    item.element.addEventListener("pointercancel", () => { item.hover = item.pressed = false; schedule(); });
  }
  function register() {
    // 对局每轮重建词卡；复用同一套连续动作，清掉旧控件，避免累积失效监听对象。
    items = items.filter((item) => item.element.isConnected);
    const known = new Set(items.map((item) => item.element));
    document.querySelectorAll(selector).forEach((element) => {
      if (known.has(element)) return;
      const wireOnly = element.matches(".choice-button");
      element.classList.add(wireOnly ? "wire-motion" : "motion-control");
      const item = { element, x: 0, v: 0, age: 1, hover: false, focus: false, pressed: false };
      items.push(item); bind(item); paint(item);
    });
  }
  register();
  const controls = document.getElementById("stageControls");
  if (controls) new MutationObserver(register).observe(controls, { childList: true, subtree: true });
  window.addEventListener("blur", () => { items.forEach((item) => { item.hover = item.pressed = false; }); schedule(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) settle(); });
  reduced.addEventListener("change", settle);
  new MutationObserver(() => { if (paused()) settle(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const story = document.getElementById("story");
  if (story) new MutationObserver(() => {
    let changed = false;
    items.forEach((item) => {
      // 滚动收回后清除旧悬停与焦点，重新显现不能复用已经离开的交互姿态。
      if ((item.element.disabled || item.element.closest("[inert]")) && (item.hover || item.focus || item.pressed || Math.abs(item.x) > .001)) {
        item.hover = item.focus = item.pressed = false;
        if (!frame) { item.x = item.v = 0; paint(item); }
        changed = true;
      }
    });
    if (changed && !frame) schedule();
  }).observe(story, { attributes: true, attributeFilter: ["inert", "disabled"], subtree: true });
})();
