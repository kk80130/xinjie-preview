(() => {
  "use strict";
  const dialog = document.getElementById("storyDetail");
  if (!dialog) return;
  const body = document.getElementById("detailBody");
  const title = document.getElementById("detailTitle");
  const header = dialog.querySelector(".detail-header");
  const nav = document.createElement("nav");
  nav.className = "detail-breadcrumb"; nav.setAttribute("aria-label", "详情阅读路径");
  header.before(nav);
  title.tabIndex = -1;
  let history = [], trigger = null, savedY = 0;
  const emitDetailSound = (name, detail = {}) => {
    if (!document.hidden) document.dispatchEvent(new CustomEvent("ui-sound", { detail: { name, scope: "detail", ...detail } }));
  };
  const cancelDetailSound = () => document.dispatchEvent(new CustomEvent("ui-sound-cancel", { detail: { scope: "detail" } }));
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const button = (label, action, cls) => {
    const node = el("button", label, cls); node.type = "button"; node.addEventListener("click", action); return node;
  };
  function visit(id) {
    if (!window.uiStoryDetails?.[id]) return;
    cancelDetailSound();
    if (history.length) history[history.length - 1].scroll = dialog.scrollTop;
    history.push({ id, scroll: 0 }); render(true);
    emitDetailSound("open");
  }
  function back(index) {
    if (index < 0 || index >= history.length - 1) return;
    cancelDetailSound();
    history.length = index + 1; render(true, true);
    emitDetailSound("back");
  }
  function exercise(type) {
    const box = el("section", null, "detail-exercise");
    if (type === "comparison") {
      box.append(el("p", "同一句请求 · 只比较视觉", "detail-eyebrow"));
      const quote = el("p", "这台相机还在，可以再补一张近照。", "detail-quote");
      const controls = el("div", null, "detail-local-controls");
      ["暖色轮廓", "冷色轮廓"].forEach((label, index) => {
        const control = button(label, () => {
          if (control.getAttribute("aria-pressed") === "true") return;
          cancelDetailSound();
          box.dataset.tone = index ? "cool" : "warm";
          controls.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === control)));
          emitDetailSound("palette", { variant: index });
        });
        control.setAttribute("aria-pressed", String(index === 0)); controls.append(control);
      });
      box.dataset.tone = "warm"; box.append(quote, controls, el("p", "切换没有改变文字、请求金额或选择规则。", "detail-caption"));
    }
    if (type === "poses") {
      box.append(el("p", "静止关键姿势 · 点击查看", "detail-eyebrow"));
      const stage = el("div", null, "detail-pose-stage");
      stage.setAttribute("aria-hidden", "true"); stage.append(el("i", null, "detail-pose-a"), el("span", null, "detail-pose-line"), el("i", null, "detail-pose-b"));
      const caption = el("p", "进入：小幅拉开，交代下一步靠近的方向。", "detail-caption");
      caption.setAttribute("aria-live", "polite");
      const controls = el("div", null, "detail-local-controls");
      ["进入", "保持", "退出"].forEach((label, index) => {
        const control = button(label, () => {
          if (control.getAttribute("aria-pressed") === "true") return;
          cancelDetailSound();
          stage.dataset.pose = String(index);
          caption.textContent = ["进入：小幅拉开，交代下一步靠近的方向。", "保持：主体靠近，文字与命中范围保持稳定。", "退出：回到可辨认的轮廓，不留过期悬停。"][index];
          controls.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === control)));
          emitDetailSound("pose", { variant: index });
        });
        control.setAttribute("aria-pressed", String(index === 0)); controls.append(control);
      });
      stage.dataset.pose = "0"; box.append(stage, controls, caption);
    }
    return box;
  }
  function linkList(entries, label) {
    const group = el("section", null, "detail-links"); group.append(el("h3", label));
    entries.forEach((entry) => {
      const id = typeof entry === "string" ? entry : entry.id;
      const target = window.uiStoryDetails[id]; if (!target) return;
      const item = button(typeof entry === "string" ? target.title : entry.label, () => visit(id), "detail-path-link");
      if (entry.note) item.append(el("small", entry.note));
      item.append(el("span", "↗", "detail-path-arrow")); group.append(item);
    });
    return group;
  }
  function render(focus, restore = false) {
    const current = history[history.length - 1];
    const content = window.uiStoryDetails[current.id];
    title.textContent = content.title;
    document.getElementById("detailKicker").textContent = content.kicker;
    nav.replaceChildren();
    history.forEach((item, index) => {
      const crumb = index === history.length - 1 ? el("span", window.uiStoryDetails[item.id].title) : button(window.uiStoryDetails[item.id].title, () => back(index));
      if (index === history.length - 1) crumb.setAttribute("aria-current", "page");
      nav.append(crumb);
    });
    body.replaceChildren();
    (content.sections || []).forEach((item) => {
      const section = el("section", null, "detail-section"); section.append(el("h3", item.title), el("p", item.text));
      if (item.items?.length) { const list = el("ul"); item.items.forEach((text) => list.append(el("li", text))); section.append(list); }
      body.append(section);
    });
    if (content.facts?.length) {
      const facts = el("dl", null, "detail-facts");
      content.facts.forEach((fact) => { const row = el("div"); row.append(el("dt", fact.label), el("dd", fact.value)); facts.append(row); }); body.append(facts);
    }
    if (content.interactive) body.append(exercise(content.interactive));
    if (content.children?.length) body.append(linkList(content.children, "继续展开"));
    if (content.related?.length) body.append(linkList(content.related, "沿着这条线看"));
    const footer = el("footer", null, "detail-explorer-footer");
    if (history.length > 1) footer.append(button("← 返回上层", () => back(history.length - 2)));
    footer.append(button("回到主线", () => dialog.close())); body.append(footer);
    if (focus) title.focus({ preventScroll: true });
    dialog.scrollTop = restore ? current.scroll : 0;
  }
  function open(id, source) {
    if (!window.uiStoryDetails?.[id]) return;
    if (dialog.open) { visit(id); return; }
    cancelDetailSound();
    trigger = source || document.activeElement; savedY = window.scrollY;
    history = [{ id, scroll: 0 }]; render(false);
    window.uiStoryScene?.setDetailOpen(true);
    document.documentElement.classList.add("story-detail-open");
    dialog.showModal(); title.focus({ preventScroll: true }); dialog.scrollTop = 0;
    emitDetailSound("open");
  }
  document.addEventListener("click", (event) => {
    const source = event.target.closest?.("[data-detail]");
    if (source && window.uiStoryDetails?.[source.dataset.detail]) { event.preventDefault(); open(source.dataset.detail, source); }
  });
  dialog.querySelector("[data-close-detail]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    cancelDetailSound();
    if (history.length) emitDetailSound("close");
    document.documentElement.classList.remove("story-detail-open");
    window.scrollTo({ top: savedY, behavior: "instant" });
    window.uiStoryScene?.setDetailOpen(false);
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    history = [];
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancelDetailSound(); });
  window.uiDetailExplorer = { open };
})();
