const stageContent = document.querySelector("#stageContent");
const stageControls = document.querySelector("#stageControls");
const chatStage = document.querySelector("#chatStage");
const game = { round: 0, result: null, messages: [], matchId: "" };
const presentedMessages = new WeakSet();
const audibleMessages = new WeakSet();
const messageElements = new WeakMap();
const stagePulseJobs = new Map();

function cancelMatchSound() {
  ["match", "match-card", "match-entry"].forEach((scope) => {
    document.dispatchEvent(new CustomEvent("ui-sound-cancel", { detail: { scope } }));
  });
}

function emitMatchSound(name, detail = {}, matchId = game.matchId) {
  const mode = document.getElementById("home").dataset.mode;
  const scope = detail.scope || "match";
  const preparing = name === "open" && scope === "match-entry" && mode === "briefing";
  // 游戏仍可在后台推进，但离开对局或重开后，不播放旧动作的提示。
  if (document.hidden || matchId !== game.matchId || (mode !== "playing" && !preparing)) {
    return false;
  }
  document.dispatchEvent(new CustomEvent("ui-sound", { detail: { name, ...detail, scope, matchId } }));
  return true;
}

function addMessage(side, text, time = "", extra = {}, audible = true) {
  const message = { side, text, time, ...extra };
  game.messages.push(message);
  // 抵达数据不等于已经可见；声音由提交后的新消息节点决定。
  if (audible && (side === "ai" || side === "transaction")) {
    audibleMessages.add(message);
  }
}

function animationTiming(element) {
  const style = getComputedStyle(element);
  const milliseconds = (value) => {
    const first = String(value || "0s")
      .split(",")[0]
      .trim();
    return (parseFloat(first) || 0) * (first.endsWith("ms") ? 1 : 1000);
  };
  if (style.animationName === "none") {
    return { accentMs: 0, durationMs: 0 };
  }
  const durationMs = Math.max(0, milliseconds(style.animationDuration));
  const delayMs = Math.max(0, milliseconds(style.animationDelay));
  return { accentMs: delayMs + Math.min(65, durationMs * 0.15), durationMs };
}

function clearStagePulses() {
  stagePulseJobs.forEach((job, className) => {
    cancelAnimationFrame(job.frame);
    clearTimeout(job.timer);
    chatStage.classList.remove(className);
  });
  stagePulseJobs.clear();
}

function settleMatchPresentation() {
  cancelMatchSound();
  clearStagePulses();
  stageContent.querySelectorAll(".is-new").forEach((element) => element.classList.remove("is-new"));
}

function pulseStage(className) {
  const previous = stagePulseJobs.get(className);
  if (previous) {
    cancelAnimationFrame(previous.frame);
    clearTimeout(previous.timer);
  }
  chatStage.classList.remove(className);
  stagePulseJobs.delete(className);
  if (
    document.hidden ||
    document.getElementById("home").dataset.mode !== "playing" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("visual-paused")
  ) {
    return;
  }
  const job = { frame: 0, timer: 0, matchId: game.matchId };
  stagePulseJobs.set(className, job);
  job.frame = requestAnimationFrame(() => {
    if (stagePulseJobs.get(className) !== job || job.matchId !== game.matchId) {
      return;
    }
    chatStage.classList.add(className);
    const style = getComputedStyle(chatStage);
    const durations = style.animationDuration
      .split(",")
      .map((value) => (parseFloat(value) || 0) * (value.trim().endsWith("ms") ? 1 : 1000));
    const delays = style.animationDelay
      .split(",")
      .map((value) => (parseFloat(value) || 0) * (value.trim().endsWith("ms") ? 1 : 1000));
    const duration = Math.max(
      0,
      ...durations.map((value, index) => value + (delays[index % delays.length] || 0)),
    );
    // 清理跟随实际 CSS 时长；同类新动作会撤销旧任务，不能截断后一次脉冲。
    job.timer = window.setTimeout(() => {
      if (stagePulseJobs.get(className) !== job) {
        return;
      }
      chatStage.classList.remove(className);
      stagePulseJobs.delete(className);
    }, duration);
  });
}

function renderMessage(message, index) {
  const fresh = presentedMessages.has(message) ? "" : " is-new";
  if (message.side === "transaction") {
    return `<div class="transaction-slip${fresh}" style="--message-index:${index}">
      <span>${message.label}</span><strong>${message.amount}</strong><span>${message.status}</span>
    </div>`;
  }
  const sideClass =
    message.side === "player" ? " is-player" : message.side === "system" ? " is-system" : "";
  return `<div class="message-row${sideClass}${fresh}" style="--message-index:${index}">
    <div class="message-bubble">${message.text}</div>
    ${message.time ? `<span class="message-time">${message.time}</span>` : ""}
  </div>`;
}

function renderMessages() {
  const messages = game.messages.map(renderMessage).join("");
  return `<div class="message-list" role="log" aria-live="polite"
    aria-relevant="additions">${messages}</div>`;
}

function commitMessages() {
  const matchId = game.matchId;
  let list = stageContent.querySelector(":scope > .message-list");
  const created = [];
  if (!list) {
    stageContent.innerHTML = renderMessages();
    list = stageContent.querySelector(":scope > .message-list");
    [...list.children].forEach((element, index) =>
      created.push({ message: game.messages[index], element }),
    );
  } else {
    game.messages.forEach((message, index) => {
      if (messageElements.get(message)?.parentElement === list) {
        return;
      }
      list.insertAdjacentHTML("beforeend", renderMessage(message, index));
      created.push({ message, element: list.lastElementChild });
    });
  }
  const fresh = [];
  created.forEach(({ message, element }) => {
    const firstPresentation = !presentedMessages.has(message);
    presentedMessages.add(message);
    messageElements.set(message, element);
    if (!firstPresentation) {
      return;
    }
    if (
      document.hidden ||
      document.getElementById("home").dataset.mode !== "playing" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("visual-paused")
    ) {
      element.classList.remove("is-new");
    }
    const timing = animationTiming(element);
    fresh.push({ message, element, ...timing });
    const finish = (event) => {
      if (event.target !== element) {
        return;
      }
      element.classList.remove("is-new");
      element.removeEventListener("animationend", finish);
    };
    element.addEventListener("animationend", finish);
  });
  // 同一批回应与凭据属于一次抵达，取最后的可见落点，避免并排响两次通知。
  const incoming = fresh.filter(({ message }) => audibleMessages.has(message)).at(-1);
  if (incoming) {
    emitMatchSound(
      "message",
      {
        accentMs: incoming.accentMs,
        durationMs: incoming.durationMs,
        variant: incoming.message.side === "transaction" ? "transaction" : "incoming",
      },
      matchId,
    );
  }
  return fresh;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    settleMatchPresentation();
  }
});
new MutationObserver(() => {
  if (document.documentElement.classList.contains("visual-paused")) {
    settleMatchPresentation();
  }
}).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

function syncEntryLabels() {
  const label = game.result ? "查看结算" : game.round > 0 ? "继续对局" : "进入对局";
  document.querySelectorAll("[data-prepare-match]").forEach((button) => {
    if (button.classList.contains("hero-enter")) {
      button.querySelector("span").textContent = label;
      button.setAttribute("aria-label", label);
    } else {
      button.innerHTML = `${label} <span aria-hidden="true">↗</span>`;
    }
  });
}

function setSiteMode(mode) {
  const home = document.getElementById("home");
  if (mode !== "playing") {
    settleMatchPresentation();
  }
  home.dataset.mode = mode;
  document.getElementById("experience").hidden = mode === "landing";
  document.querySelectorAll("[data-prepare-match]").forEach((button) => {
    button.setAttribute("aria-expanded", String(mode !== "landing"));
    button.setAttribute("aria-controls", "experience");
  });
  document.dispatchEvent(new CustomEvent("site-mode-change", { detail: mode }));
}

function prepareMatch() {
  const nextMode = game.round > 0 ? "playing" : "briefing";
  const entering = document.getElementById("home").dataset.mode !== nextMode;
  setSiteMode(nextMode);
  if (entering) {
    emitMatchSound("open", { scope: "match-entry", accentMs: 0, durationMs: 300, variant: "enter" });
  }
  window.scrollTo({ top: 0, behavior: "instant" });
  requestAnimationFrame(() => {
    const control = game.round > 0 ? chatStage : stageControls.querySelector("[data-start-match]");
    control?.focus({ preventScroll: true });
  });
}

document.querySelectorAll("[data-prepare-match]").forEach((button) => {
  button.addEventListener("click", prepareMatch);
});
chatStage.setAttribute("tabindex", "-1");

function setView(viewName) {
  if (viewName === "experience") {
    prepareMatch();
    return;
  }
  setSiteMode("landing");
  const target = document.querySelector(`[data-view="${viewName}"]`);
  if (target) {
    if (viewName !== "home" && window.uiStoryScene?.navigate(viewName)) {
      return;
    }
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = reduceMotion ? "auto" : "smooth";
    if (viewName === "home") {
      window.scrollTo({ top: 0, behavior });
    } else {
      target.scrollIntoView({ behavior, block: "start" });
    }
  }
}

document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewTarget));
});

const navigationSections = [...document.querySelectorAll(".view[data-view]:not(#experience)")];
let navigationFrame = 0;
function syncSectionNavigation() {
  navigationFrame = 0;
  const header = document.querySelector(".topbar");
  // 手机顶栏会随页面离开视口，不能用负数位置把阅读落点带回首页。
  const headerBottom = Math.max(0, header.getBoundingClientRect().bottom);
  const readingY = Math.min(innerHeight * 0.5, headerBottom + innerHeight * 0.2);
  const current = navigationSections.find((section) => {
    const box = section.getBoundingClientRect();
    return box.top <= readingY && box.bottom > readingY;
  });
  if (!current) {
    return;
  }
  // 长滚动章节的可见比例很小，不能按整章相交比例选导航；概念归首页、过程归交互流程。
  const activeView = { concept: "home", process: "flow" }[current.dataset.view] || current.dataset.view;
  document.querySelectorAll(".nav-button[data-view-target]").forEach((button) => {
    const isActive = button.dataset.viewTarget === activeView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });
}
function scheduleSectionNavigation() {
  if (!navigationFrame) {
    navigationFrame = requestAnimationFrame(syncSectionNavigation);
  }
}
window.addEventListener("scroll", scheduleSectionNavigation, { passive: true });
window.addEventListener("resize", scheduleSectionNavigation);
new ResizeObserver(scheduleSectionNavigation).observe(document.getElementById("main-content"));
scheduleSectionNavigation();

document.documentElement.classList.add("motion-ready");

const revealObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  },
  {
    rootMargin: "0px 0px -12% 0px",
    threshold: 0.12,
  },
);

document
  .querySelectorAll(".document-hero, .document-band")
  .forEach((block) => revealObserver.observe(block));
