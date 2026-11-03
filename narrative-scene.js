(() => {
  "use strict";
  const root = document.querySelector("#concept .narrative-content");
  if (!root) return;
  const stage = root.querySelector(".narrative-stage");
  const wire = root.querySelector(".narrative-wire");
  const wirePath = root.querySelector(".narrative-wire-path");
  const copies = [...root.querySelectorAll("[data-scene-copy]")];
  const temperatureButtons = [...root.querySelectorAll("[data-scene-temperature]")];
  const choiceButtons = [...root.querySelectorAll("[data-scene-choice]")];
  const outcome = root.querySelector(".narrative-outcome");
  const smooth = (v) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
  let temperature = null, choice = null, lastCursor = 0, lastPaused = false;
  let warmthWeight = 1, roundnessWeight = 1, paletteTween = null, paletteFrame = 0, outcomeAnimation = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const motionPaused = () => reduced.matches || document.documentElement.classList.contains("visual-paused");
  const emitSceneSound = (name, detail = {}) => {
    if (!document.hidden) document.dispatchEvent(new CustomEvent("ui-sound", { detail: { name, ...detail } }));
  };
  const cancelSceneSound = (scope) => document.dispatchEvent(new CustomEvent("ui-sound-cancel", { detail: { scope } }));
  const responses = {
    accept: "你选择了成交。相信这句描述，也承担成色未知的风险。",
    check: "你选择了要实拍。让对方展示这件旧物的真实成色。",
    refuse: "你选择了不买了。付出占用时间的代价，这单到此为止。"
  };
  const responseMotion = { duration: 360, offset: .76, curve: [.2, .7, .2, 1] };
  const [rx1, ry1, rx2, ry2] = responseMotion.curve;
  let responseLow = 0, responseHigh = 1;
  // 全局缓动先改变时间映射，76%的关键姿势并不发生在原始时间的76%处。
  for (let iteration = 0; iteration < 24; iteration++) {
    const t = (responseLow + responseHigh) / 2, u = 1 - t;
    if (3 * u * u * t * ry1 + 3 * u * t * t * ry2 + t ** 3 < responseMotion.offset) responseLow = t;
    else responseHigh = t;
  }
  const responseT = (responseLow + responseHigh) / 2, responseU = 1 - responseT;
  const responseAccentMs = responseMotion.duration * (3 * responseU ** 2 * responseT * rx1 + 3 * responseU * responseT ** 2 * rx2 + responseT ** 3);
  const wireDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  wireDot.setAttribute("r", "3"); wireDot.setAttribute("class", "narrative-wire-dot"); wire?.append(wireDot);

  function paintPalette(cursor, paused) {
    const currentTemperature = cursor < 2.75 && !paused ? "cool" : temperature || "warm";
    root.dataset.temperature = currentTemperature;
    // 只缓动点击带来的选择权重；滚动进度直接乘入，倒放不承担额外的时间延迟。
    const ramp = paused ? 1 : smooth((cursor - 2.5) / 1);
    root.style.setProperty("--phone-warmth", `${(ramp * warmthWeight * 100).toFixed(3)}%`);
    root.style.setProperty("--phone-roundness", (ramp * roundnessWeight).toFixed(4));
    temperatureButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.sceneTemperature === currentTemperature)));
  }
  function paletteTick(now) {
    paletteFrame = 0;
    if (!paletteTween) return;
    const { from, corners, to, start } = paletteTween;
    const elapsed = now - start;
    const done = motionPaused() || elapsed >= 560;
    warmthWeight = done ? to : from + (to - from) * smooth(elapsed / 480);
    // 背景先回应，气泡圆角稍后跟随，文字与手机边框始终保持原位置。
    roundnessWeight = done ? to : corners + (to - corners) * smooth((elapsed - 60) / 500);
    paintPalette(lastCursor, motionPaused());
    if (done) paletteTween = null; else paletteFrame = requestAnimationFrame(paletteTick);
  }

  function render(cursor, paused) {
    const enteringPause = paused && !lastPaused;
    lastCursor = cursor; lastPaused = paused;
    const enterComparison = smooth((cursor - 2.75) / .75);
    const enterChoice = smooth((cursor - 4.75) / .75);
    const presence = [1 - enterComparison, enterComparison * (1 - enterChoice), enterChoice];
    const nextPhase = cursor < 3 ? "contact" : cursor < 5 ? "comparison" : "choice";
    // 回滚离开局部场景时撤回尚未落下的提示，避免声音留在已经收起的内容上。
    if (enteringPause || root.dataset.scenePhase === "comparison" && nextPhase !== "comparison") cancelSceneSound("narrative-palette");
    if (enteringPause || root.dataset.scenePhase === "choice" && nextPhase !== "choice") cancelSceneSound("narrative-choice");
    root.dataset.scenePhase = nextPhase;
    root.style.setProperty("--scene-journey", smooth(cursor / 7).toFixed(4));
    const phoneArrival = paused ? 1 : smooth((cursor - .55) / .45);
    root.style.setProperty("--phone-arrival", phoneArrival.toFixed(4));
    const phoneRegion = root.querySelector(".narrative-phone");
    phoneRegion.inert = phoneArrival < .05;
    phoneRegion.setAttribute("aria-hidden", String(phoneArrival < .05));
    root.style.setProperty("--wire-arrival", (paused ? 1 : smooth((cursor - .64) / .36)).toFixed(4));
    if (paused && paletteTween) {
      warmthWeight = roundnessWeight = paletteTween.to;
      paletteTween = null; cancelAnimationFrame(paletteFrame); paletteFrame = 0;
    }
    paintPalette(cursor, paused);
    copies.forEach((copy, index) => {
      const visible = paused ? 1 : presence[index];
      copy.style.setProperty("--scene-presence", visible.toFixed(4));
      copy.inert = visible < .05;
      copy.setAttribute("aria-hidden", String(visible < .05));
    });
    // 外部引导线抵达左侧阅读落点，内部线路继续接到同一个聊天界面。
    const target = root.querySelector(".narrative-message-first");
    const request = root.querySelector(".narrative-request");
    if (wire && wirePath && target && request && stage) {
      const box = stage.getBoundingClientRect();
      const phone = root.querySelector(".narrative-phone").getBoundingClientRect();
      const message = target.getBoundingClientRect();
        const requestBox = request.getBoundingClientRect();
      if (box.width && box.height) {
        const endX = Math.max(8, phone.left - box.left);
        const travel = paused ? 1 : smooth((cursor - 3.75) / 1.5);
        const messageY = message.top - box.top + message.height / 2;
        const requestY = requestBox.top - box.top + requestBox.height / 2;
        const endY = Math.max(20, Math.min(box.height - 20, messageY + (requestY - messageY) * travel));
        const startY = box.height * .62;
        wire.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
        if (endX > box.width * .35) {
          const copyIndex = enterChoice > .5 ? 2 : enterComparison > .5 ? 1 : 0;
          const copyBottom = copies[copyIndex].firstElementChild.getBoundingClientRect().bottom - box.top;
          const guardY = Math.min(box.height - 60, Math.max(startY + 16, copyBottom + 20));
          const gutterX = Math.max(24, endX - 28);
          wirePath.setAttribute("d", `M 0 ${startY} C -14 ${startY}, -14 ${guardY}, 12 ${guardY} L ${gutterX - 20} ${guardY} C ${gutterX} ${guardY}, ${gutterX} ${endY}, ${endX} ${endY}`);
        } else wirePath.setAttribute("d", `M 0 ${startY} C ${endX * .4} ${startY}, ${endX * .65} ${endY}, ${endX} ${endY}`);
        wireDot.setAttribute("cx", String(endX)); wireDot.setAttribute("cy", String(endY));
      }
    }
  }
  temperatureButtons.forEach((button) => button.addEventListener("click", () => {
    const changed = button.getAttribute("aria-pressed") !== "true";
    if (!changed) return;
    cancelSceneSound("narrative-palette");
    temperature = button.dataset.sceneTemperature;
    const to = temperature === "cool" ? 0 : 1;
    if (motionPaused()) warmthWeight = roundnessWeight = to;
    else {
      paletteTween = { from: warmthWeight, corners: roundnessWeight, to, start: performance.now() };
      if (!paletteFrame) paletteFrame = requestAnimationFrame(paletteTick);
    }
    render(lastCursor, lastPaused);
    emitSceneSound("palette", { scope: "narrative-palette", accentMs: motionPaused() || lastPaused ? 0 : 60, durationMs: 180, variant: to });
  }));
  choiceButtons.forEach((button) => button.addEventListener("click", () => {
    const changed = choice !== button.dataset.sceneChoice;
    if (!changed) return;
    cancelSceneSound("narrative-choice");
    choice = button.dataset.sceneChoice;
    choiceButtons.forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.sceneChoice === choice)));
    if (outcome) outcome.textContent = responses[choice];
    root.dataset.response = choice;
    emitSceneSound("confirm", { scope: "narrative-choice" });
    const previousPose = outcome && outcomeAnimation?.playState === "running" ? getComputedStyle(outcome) : null;
    const startPose = { opacity: previousPose ? previousPose.opacity : .65, translate: previousPose ? previousPose.translate : "0 3px" };
    outcomeAnimation?.cancel();
    if (outcome && !motionPaused() && !lastPaused) {
      outcomeAnimation = outcome.animate([
        startPose, { opacity: 1, translate: "0 -1px", offset: responseMotion.offset }, { opacity: 1, translate: "0 0" }
      ], { duration: responseMotion.duration, easing: `cubic-bezier(${responseMotion.curve.join(",")})` });
      emitSceneSound("response-land", { scope: "narrative-choice", accentMs: responseAccentMs, durationMs: 90 });
    }
  }));
  function stopFeedback() {
    if (!motionPaused() && !document.hidden) return;
    cancelSceneSound("narrative-palette");
    cancelSceneSound("narrative-choice");
    outcomeAnimation?.cancel();
    if (paletteTween) {
      warmthWeight = roundnessWeight = paletteTween.to;
      paletteTween = null; cancelAnimationFrame(paletteFrame); paletteFrame = 0;
      paintPalette(lastCursor, motionPaused());
    }
  }
  reduced.addEventListener("change", stopFeedback);
  document.addEventListener("visibilitychange", stopFeedback);
  new MutationObserver(stopFeedback).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  root.querySelector("[data-prepare-match]")?.addEventListener("click", () => {
    if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
  });
  window.uiNarrativeScene = { render };
})();
