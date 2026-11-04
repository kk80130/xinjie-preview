(() => {
  "use strict";

  // 从双球的经纬交错、轨道切线与连接节点抽象，不另造球体或接管现有动画。
  const namespace = "http://www.w3.org/2000/svg";
  const path = (d, part = "main") => ["path", { d, class: `ui-art-${part}` }];
  const node = (cx, cy, r = 2, part = "node") => ["circle", { cx, cy, r, class: `ui-art-${part}` }];
  const geometry = {
    enter: [path("M3 22C8 22 8 10 15 10H27", "warm"), path("M5 26C13 26 14 16 21 16H29", "cool"), path("M15 10V16M21 10V16"), node(21, 16)],
    explore: [path("M12 3C25 9 5 14 16 21C20 24 20 26 18 29", "warm"), path("M12 23L18 29L24 23"), node(16, 16, 1.7)],
    home: [path("M5 25C5 10 11 4 19 6C25 8 27 17 27 25H5", "warm"), path("M3 18C10 11 23 12 30 17", "cool"), path("M12 8C10 15 11 21 16 25"), node(24, 14, 1.7)],
    research: [path("M7 5C14 9 14 23 7 27M15 4C20 11 20 22 15 28", "warm"), path("M4 10C11 14 22 14 28 10M4 20C12 17 22 17 28 20", "cool"), path("M25 6V25"), node(19, 18)],
    system: [path("M4 18C4 5 24 1 27 13C30 25 10 29 4 18Z", "warm"), path("M9 7C19 8 24 16 21 24M17 5C9 13 8 20 14 26", "cool"), path("M3 21C10 10 19 9 30 13"), node(20, 12, 1.7)],
    motion: [path("M4 25C4 14 17 17 17 7C17 4 15 3 13 3", "warm"), path("M9 28C9 18 27 20 27 8", "cool"), path("M17 7L23 11L17 15"), node(16, 18, 1.7)],
    flow: [path("M4 7H12C20 7 12 25 21 25H29", "warm"), path("M4 25H10C18 25 18 7 27 7", "cool"), node(5, 7), node(16, 16), node(27, 25)],
    process: [path("M5 5H16V12H25V27H15V20H5Z", "warm"), path("M5 13H15V27M16 5V12H25", "cool"), path("M8 9H12M19 17H22M18 22H22"), node(15, 20, 1.7)],
    feedback: [path("M5 5H27V23H15C8 23 10 29 5 29V5Z", "cool"), path("M9 11H22M9 16H18", "warm"), path("M25 3C18 7 20 17 28 20"), node(23, 20, 1.7)],
    play: [path("M12 7L25 16L12 25Z"), path("M7 3C1 12 3 24 9 29", "warm"), path("M6 26C16 29 27 25 29 19", "cool"), node(7, 25, 1.5)],
    pause: [path("M11 7V25M21 5V23"), path("M5 8C14 1 27 5 28 17", "warm"), path("M4 19C6 27 18 30 26 24", "cool"), node(21, 23, 1.5)],
    still: [path("M5 16H27M11 8V24M21 8V24", "cool"), path("M6 10C14 3 25 8 27 16", "warm"), node(16, 16)],
    replay: [path("M7 11C10 3 24 3 27 14C30 25 13 30 7 21", "warm"), path("M7 4V11H14"), path("M4 22C12 25 21 20 23 12", "cool"), node(7, 21, 1.7)],
    return: [path("M27 7C27 23 8 26 6 16H23", "cool"), path("M12 9L5 16L12 23", "warm"), node(23, 16, 1.6)],
    close: [path("M7 5C10 12 20 20 27 27", "warm"), path("M25 5C22 13 13 21 5 26", "cool"), node(16, 16, 1.7)],
    growth: [path("M6 26C2 15 7 5 17 5C25 5 28 12 27 18", "warm"), path("M11 25C7 17 10 9 17 5M18 25C21 17 21 10 17 5", "cool"), path("M5 15C12 19 21 19 27 15"), node(18, 25, 1.6)],
    anticipation: [path("M4 9C10 9 11 22 17 22H28", "warm"), path("M4 23C10 23 11 10 17 10H28", "cool"), path("M14 13V19M20 12V20"), node(14, 16, 1.7)],
    rebound: [path("M3 11C8 11 12 21 16 21C21 21 23 7 29 7", "warm"), path("M3 21C8 21 12 11 16 11C21 11 23 25 29 25", "cool"), node(11, 16), node(22, 16)],
    settle: [path("M3 6C3 22 18 27 28 23", "warm"), path("M7 4C7 17 19 22 28 18", "cool"), path("M22 27H29V20"), node(24, 24, 1.6)]
  };

  function makeMark(kind, chapter = false) {
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.4");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", chapter ? "ui-chapter-mark" : "ui-art-icon");
    svg.dataset.uiArtKind = kind;
    // 即使样式尚未加载，装饰也不占用行高、不扩大命中范围或改变滚动测量。
    svg.style.position = "absolute";
    svg.style.pointerEvents = "none";
    svg.style.overflow = "hidden";
    for (const [tag, attributes] of geometry[kind] || geometry.flow) {
      const part = document.createElementNS(namespace, tag);
      for (const [name, value] of Object.entries(attributes)) part.setAttribute(name, String(value));
      part.setAttribute("vector-effect", "non-scaling-stroke");
      svg.append(part);
    }
    return svg;
  }

  function decorate(element, kind, description = "", chapter = false) {
    if (!element) return;
    const className = chapter ? "ui-chapter-mark" : "ui-art-icon";
    const current = element.querySelector(`:scope > .${className}`);
    element.dataset.uiArt = kind;
    if (description && !element.hasAttribute("aria-description")) element.setAttribute("aria-description", description);
    if (current?.dataset.uiArtKind === kind) return;
    const mark = makeMark(kind, chapter);
    if (current) current.replaceWith(mark);
    else element.prepend(mark);
  }

  const chapters = { concept: "flow", research: "research", system: "system", motion: "motion", flow: "flow", process: "process", deliverables: "feedback" };
  function decorateStatic() {
    document.querySelectorAll(".hero-enter,.narrative-footer [data-prepare-match]").forEach((element) => decorate(element, "enter", "打开对局简报，查看规则与自己的资源。"));
    document.querySelectorAll(".primary-nav [data-view-target]").forEach((element) => {
      const target = element.dataset.viewTarget;
      element.dataset.uiChapter = target;
      decorate(element, target === "home" ? "home" : chapters[target] || "flow");
    });
    document.querySelectorAll(".story-chapter").forEach((section) => {
      const kind = chapters[section.id] || "flow";
      section.querySelectorAll(".story-eyebrow,.narrative-kicker").forEach((eyebrow) => {
        eyebrow.dataset.uiChapter = section.id;
        decorate(eyebrow, kind, "", true);
      });
    });
    document.querySelectorAll("#introReplay,#replayWholeIntro").forEach((element) => decorate(element, "replay"));
    document.querySelectorAll("[data-motion-phase]").forEach((element) => decorate(element, element.dataset.motionPhase));
    decorate(document.querySelector(".story-footer [data-view-target='home']"), "return");
  }

  function decorateDetails() {
    const dialog = document.getElementById("storyDetail");
    if (!dialog) return;
    dialog.querySelectorAll("[data-close-detail]").forEach((element) => decorate(element, "close"));
    dialog.querySelectorAll(".detail-breadcrumb button,.detail-explorer-footer button").forEach((element) => decorate(element, "return"));
    dialog.querySelectorAll(".detail-path-link").forEach((element) => decorate(element, "flow"));
  }

  function syncMotionMark() {
    const toggle = document.getElementById("motionToggle");
    if (!toggle) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paused = toggle.getAttribute("aria-pressed") === "true";
    toggle.dataset.uiMotionState = reduced ? "reduced" : paused ? "paused" : "running";
    decorate(toggle, reduced ? "still" : paused ? "play" : "pause");
  }

  function isOwnDecoration(nodeToCheck) {
    return nodeToCheck.nodeType === 1 && nodeToCheck.matches(".ui-art-icon,.ui-chapter-mark");
  }

  function start() {
    decorateStatic();
    decorateDetails();
    syncMotionMark();
    // 现有播放逻辑会重写整个按钮文字，只在该按钮内补回静态符号，保持原状态来源。
    const toggle = document.getElementById("motionToggle");
    if (toggle) new MutationObserver((records) => {
      if (records.some((record) => record.type === "attributes" || [...record.addedNodes, ...record.removedNodes].some((changed) => !isOwnDecoration(changed)))) syncMotionMark();
    }).observe(toggle, { childList: true, attributes: true, attributeFilter: ["aria-pressed", "disabled"] });

    // 详情按层级重建；仅观察这一小块结构，忽略本脚本插入的 SVG，避免自触发循环。
    const dialog = document.getElementById("storyDetail");
    if (dialog) new MutationObserver((records) => {
      if (records.some((record) => [...record.addedNodes].some((added) => added.nodeType === 1 && !isOwnDecoration(added)))) decorateDetails();
    }).observe(dialog, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
