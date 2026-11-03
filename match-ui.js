const DEBUG_MATCH_LOG = new URLSearchParams(location.search).get("matchDebug") === "1";
const money = (value) => Number(value || 0).toFixed(1);
const escapeText = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const names = {
  offer: "挂出旧物",
  accept: "成交",
  challenge: "要实拍",
  raise: "要担保",
  fold: "不买了",
  haggle: "砍价",
  stand: "答应担保",
  withdraw: "改口不卖",
  concede: "让价",
  hold: "不让",
  advance: "下一单",
};
const levels = { 1: "有小毛病", 2: "有使用痕迹", 3: "完好" };
const traits = {
  question: ["追问", "实拍费减半"],
  calm: ["镇定", "可担保两次"],
  reserve: ["留后手", "退出费减半"],
};
let match = null;
let selection = { opponent: "lin", trait: "question" };
let selectedCard = null;
let pendingAi = null;
let pendingView = null;
let aiLeft = 0;
let lastTick = performance.now();
let panelKey = "";
let hasShownFirstBuyerHint = false;

function scrollConversation() {
  // 只滚动聊天历史，当前物品与操作保持在各自固定区域。
  const list = stageContent.querySelector(".message-list");
  if (list) list.scrollTop = list.scrollHeight;
}
function publicEvent(type, action = "", summary) {
  const detail = {
    type,
    matchId: game.matchId,
    round: game.round,
    action,
    ...(type === "match_start"
      ? {
          opponent: selection.opponent,
          trait: selection.trait,
          skin: document.querySelector("#experience").dataset.skin,
        }
      : {}),
    ...(summary ? { summary } : {}),
  };
  document.dispatchEvent(new CustomEvent("ui-match-event", { detail }));
  // 显式启用也只记录公开摘要，不打印模型或复盘对象。
  if (DEBUG_MATCH_LOG) {
    console.info("[信界 match]", detail);
  }
}
function icon(id) {
  const item = window.uiMatchContent?.items.find((item) => item.id === id);
  return item?.iconPath
    ? `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="${escapeText(item.iconPath)}"/></svg>`
    : '<span aria-hidden="true">◇</span>';
}
function marks(count, kind) {
  const nodes = Array.from({ length: count || 0 }, () => "<i></i>").join("");
  return `<span class="level-marks ${kind}" aria-hidden="true">${nodes}</span>`;
}
function addSystem(text) {
  addMessage("system", escapeText(text), "", {}, false);
}
function collectEvents(events) {
  for (const event of events) {
    if (event.type === "offer") {
      const v = match.getView();
      addMessage(
        event.leader === "player" ? "player" : "ai",
        [
          escapeText(event.text || v.item?.name),
        ].join(""),
      );
    } else if (event.type === "timeout") {
      addSystem("回应时间到了，本单按不买了处理。");
    } else if (event.type === "dialogue" && event.situation !== "offer") {
      addMessage("ai", escapeText(event.text));
    } else if (event.type === "deal_end") {
      const v = match.getView();
      const mine = v.leader === "player" ? event.leadDelta : event.responseDelta;
      addMessage("transaction", "", "", {
        label: `第 ${event.deal} 单 · ${names[event.outcome] || event.outcome}`,
        amount: `你 ${mine >= 0 ? "+" : ""}${money(mine)}`,
        status: `双方钱包 ${money(event.wallets.player)} / ${money(event.wallets.opponent)}`,
      });
    }
  }
  commitMessages();
  scrollConversation();
}
function syncRuleCopy() {
  const config = window.uiMatchRules.DEFAULT_CONFIG;
  const fields = {
    walletValue: config.initialWallet,
    stakeValue: config.initialWallet,
    pendingValue: config.baseUnit,
  };
  Object.entries(fields).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) field.textContent = money(value);
  });
  const examplePrice = document.querySelector(".narrative-request-amount strong");
  if (examplePrice) {
    examplePrice.textContent = money(3 * config.baseUnit);
  }
}
function resetGame() {
  settleMatchPresentation();
  match = null;
  pendingAi = null;
  pendingView = null;
  selectedCard = null;
  panelKey = "";
  delete chatStage.dataset.phase;
  delete chatStage.dataset.actor;
  game.round = 0;
  game.result = null;
  game.messages = [];
  game.matchId = "";
  document.querySelector("#experience").dataset.skin = Math.random() < 0.5 ? "warm" : "cool";
  syncRuleCopy();
  renderBriefing();
  syncEntryLabels();
  if (document.getElementById("home").dataset.mode === "playing") {
    setSiteMode("briefing");
  }
}
function renderPickerEntry(id, name, description, kind, current) {
  return `<button type="button" data-${kind}="${id}" aria-pressed="${current === id}">
    <b>${escapeText(name)}</b><span>${escapeText(description)}</span>
  </button>`;
}
function renderRulesButton() {
  return `<button type="button" class="match-help-button" data-match-help aria-haspopup="dialog" aria-controls="matchRulesDialog" aria-expanded="${Boolean(chatStage.querySelector('.match-help-card')?.open)}" aria-label="查看游戏规则">?</button>`;
}
function ensureRulesCard() {
  let card = chatStage.querySelector(".match-help-card");
  if (card) return card;
  card = document.createElement("dialog");
  card.id = "matchRulesDialog";
  card.className = "match-help-card";
  card.setAttribute("aria-label", "游戏规则");
  card.innerHTML = `<header><strong>怎么玩</strong><button type="button" data-close-match-help aria-label="关闭规则">×</button></header><ol></ol>`;
  chatStage.append(card);
  card.querySelector("[data-close-match-help]").addEventListener("click", () => setRulesOpen(false));
  card.addEventListener("close", () => {
    chatStage.querySelectorAll("[data-match-help]").forEach((button) => button.setAttribute("aria-expanded", "false"));
    syncPause();
  });
  return card;
}
function setRulesOpen(open) {
  const card = ensureRulesCard();
  const view = pendingView || match?.getView();
  const config = view?.config || window.uiMatchRules.DEFAULT_CONFIG;
  const unit = view?.unit || config.baseUnit;
  const trait = view?.trait || selection.trait;
  const challengeCost = money(config.challengeFee * unit * (trait === "question" ? 0.5 : 1));
  const exitCost = money(unit * (trait === "reserve" ? 0.25 : config.exitFee));
  card.querySelector("ol").innerHTML = `
      <li>轮流当卖家，${config.deals} 单后钱多者赢。</li>
      <li>卖家知道成色，可以如实说，也可以说得更好。</li>
      <li>成交：卖家拿报价，买家拿“实际价值 − 报价”。</li>
      <li>要实拍：拍穿了卖家赔，看走眼付 ${challengeCost} 枚。</li>
      <li>要担保：筹码翻倍，卖家可以改口不卖。</li>
      <li>砍价降一档；不买了付 ${exitCost} 枚占用费。</li>
    `;
  if (open && !card.open) card.showModal();
  if (!open && card.open) card.close();
  chatStage.querySelectorAll("[data-match-help]").forEach((button) => {
    button.setAttribute("aria-expanded", String(open));
  });
  syncPause();
}
function bindRulesButtons() {
  ensureRulesCard();
  stageControls.querySelectorAll("[data-match-help]").forEach((button) => {
    button.addEventListener("click", () => setRulesOpen(!ensureRulesCard().open));
  });
}
function renderBriefing() {
  const config = window.uiMatchRules.DEFAULT_CONFIG;
  const people = Object.entries(window.uiMatchContent.opponents)
    .map(([id, person]) =>
      renderPickerEntry(id, person.name, person.description, "opponent", selection.opponent),
    )
    .join("");
  const habits = Object.entries(traits)
    .map(([id, text]) => renderPickerEntry(id, text[0], text[1], "trait", selection.trait))
    .join("");
  stageContent.innerHTML = `<div class="launch-screen">
    <p class="launch-kicker">旧物交换群 / PRIVATE DEALS</p>
    <h2>东西有成色，话也有分寸。</h2>
    <fieldset class="match-picker"><legend>这次，和谁聊？</legend>${people}</fieldset>
    <fieldset class="match-picker traits"><legend>带着一种习惯入场</legend>${habits}</fieldset>
  </div>`;
  stageControls.innerHTML = `<div class="single-action">
    ${renderRulesButton()}
    <button type="button" class="secondary-action" data-return-home>返回</button>
    <button type="button" class="primary-action" data-start-match>开始</button>
  </div>`;
  stageContent.querySelectorAll("[data-opponent]").forEach((entry) => {
    entry.addEventListener("click", () => {
      selection.opponent = entry.dataset.opponent;
      renderBriefing();
      stageContent.querySelector(`[data-opponent="${selection.opponent}"]`)?.focus({ preventScroll: true });
    });
  });
  stageContent.querySelectorAll("[data-trait]").forEach((entry) => {
    entry.addEventListener("click", () => {
      selection.trait = entry.dataset.trait;
      renderBriefing();
      stageContent.querySelector(`[data-trait="${selection.trait}"]`)?.focus({ preventScroll: true });
    });
  });
  stageControls.querySelector("[data-return-home]").addEventListener("click", () => setView("home"));
  stageControls.querySelector("[data-start-match]").addEventListener("click", startMatch);
  bindRulesButtons();
  setRulesOpen(false);
  document.querySelector("#contactStatus").textContent = "选择对手与特质";
  document.querySelector("#matchScoreboard").hidden = true;
  document.querySelector("#dealDots").innerHTML = "";
}
function startMatch() {
  setRulesOpen(false);
  match = window.uiMatchRules.createMatch({
    ...selection,
    seed: crypto.getRandomValues(new Uint32Array(1))[0],
  });
  game.matchId = `match-${crypto.randomUUID()}`;
  game.messages = [];
  game.round = 1;
  syncEntryLabels();
  panelKey = "";
  selectedCard = null;
  hasShownFirstBuyerHint = false;
  stageContent.innerHTML = "";
  setSiteMode("playing");
  publicEvent("match_start");
  collectEvents(match.drainEvents());
  renderMatch();
  queueAI();
}
function button(type, extra = "") {
  return `<button type="button" data-action="${type}" ${extra}>${names[type]}</button>`;
}
function renderStatusBar(view) {
  const bar = document.querySelector("#matchScoreboard");
  const role = view.leader === "player" ? "卖家" : "买家";
  bar.hidden = false;
  bar.innerHTML = `<span class="status-role">你是${role}</span>
    <span>你 <b>${money(view.wallets.player)}</b></span>
    <span>对方 <b>${money(view.wallets.opponent)}</b></span>
    ${view.multiplier > 1 ? `<span class="status-multiplier">×${view.multiplier}</span>` : ""}`;
  document.querySelector("#dealDots").innerHTML = Array.from(
    { length: view.config.deals },
    (_, index) => `<li class="${index + 1 < view.deal ? "is-done" : ""} ${index + 1 === view.deal ? "is-active" : ""}"
      ${index + 1 === view.deal ? 'aria-current="step"' : ""}><span class="sr-only">第 ${index + 1} 单</span></li>`,
  ).join("");
}
function renderMatch() {
  // 对方台词抵达前保留此前可见状态，不能提前显示内部已计算的结算钱包。
  if (!match) {
    return;
  }
  const v = pendingView || match.getView();
  chatStage.dataset.phase = v.phase;
  chatStage.dataset.actor = v.actor;
  if (v.phase === "offer" && v.actor === "player" && selectedCard === null) selectedCard = 0;
  game.round = v.deal;
  game.result = v.result;
  renderStatusBar(v);
  const person = window.uiMatchContent.opponents[v.opponent];
  document.querySelector(".contact-copy strong").textContent = person.name;
  document.querySelector(".contact-avatar").textContent = person.name.slice(0, 1);
  document.querySelector("#contactStatus").textContent = pendingAi
    ? "对方正在输入…"
    : v.phase === "finished"
      ? "本局结束"
      : v.actor === "player"
        ? "轮到你了"
        : "等待对方";
  if (pendingAi) {
    stageControls.innerHTML =
      `<div class="control-utility"><div class="match-wait" role="status">对方正在输入<span aria-hidden="true"> · · ·</span></div>${renderRulesButton()}</div>`;
    bindRulesButtons();
    return;
  }
  const key = `${v.deal}-${v.phase}-${v.multiplier}-${v.priceLevel}-${selectedCard}`;
  if (key !== panelKey) {
    panelKey = key;
    stageContent.querySelector(".deal-panel")?.remove();
    const panel = document.createElement("div");
    panel.className = "deal-panel";
    if (v.phase === "finished") {
      stageContent.querySelector(".message-list")?.remove();
      renderResult(panel, v);
    } else if (v.item) {
      panel.innerHTML = renderObjectCard(v);
    } else if (v.phase === "offer" && v.actor === "player") {
      panel.innerHTML = renderHandPreview(v);
    }
    stageContent.append(panel);
    if (v.phase === "finished") stageContent.scrollTop = 0;
  }
  if (v.phase === "finished") {
    stageControls.innerHTML =
      `<div class="single-action">${renderRulesButton()}<button type="button" class="primary-action" data-restart>再来一局</button></div>`;
    stageControls.querySelector("[data-restart]").addEventListener("click", resetGame);
    bindRulesButtons();
    syncEntryLabels();
    return;
  }
  if (v.phase === "offer" && v.actor === "player") {
    stageControls.innerHTML = renderSellerHand(v);
    bindRulesButtons();
    stageControls.querySelectorAll("[data-card]").forEach((b) =>
      b.addEventListener("click", () => {
        selectedCard = Number(b.dataset.card);
        emitMatchSound("card-prepare", { scope: "match-card" });
        renderMatch();
        stageControls.querySelector(`[data-card="${selectedCard}"]`)?.focus({ preventScroll: true });
      }),
    );
    stageControls
      .querySelectorAll("[data-claim]")
      .forEach((b) => {
        const preview = () => {
          const panel = stageContent.querySelector(".deal-panel");
          if (panel) panel.innerHTML = renderHandPreview(v, Number(b.dataset.claim));
        };
        b.addEventListener("pointerenter", preview);
        b.addEventListener("focus", preview);
        b.addEventListener("click", () =>
          act({ type: "offer", cardIndex: selectedCard, claim: Number(b.dataset.claim) }),
        );
      });
  } else if (v.actor === "player" || v.phase === "deal-end") {
    stageControls.innerHTML = renderResponseControls(v);
    bindRulesButtons();
    stageControls
      .querySelectorAll("[data-action]")
      .forEach((b) => b.addEventListener("click", () => act({ type: b.dataset.action })));
    updateClock(v);
  } else {
    stageControls.innerHTML = `<div class="control-utility"><div class="match-wait">等待对方…</div>${renderRulesButton()}</div>`;
    bindRulesButtons();
  }
  scrollConversation();
}
function renderTruthFace(view) {
  if (!view.resolution?.revealedBottom) {
    return "";
  }
  return `<div class="truth-face">${marks(view.resolution.revealedBottom, "truth")}
    <b>实拍</b><p>${escapeText(view.item.truth)}</p></div>`;
}
function renderObjectCard(view) {
  const identity = view.leader === "player" ? "你是卖家" : "你是买家";
  const price = money((view.priceLevel || view.claim) * view.unit);
  return `<div class="match-object">${icon(view.item.id)}<div>
    <small>挂出旧物 / ${identity}</small><h3>${escapeText(view.item.name)}</h3>
    <p>${escapeText(view.item.description)}</p>${marks(view.claim, "claim")}
    <span class="price">${price} 枚</span>${renderTruthFace(view)}
  </div></div>`;
}
function renderHandCard(card, index) {
  return `<button type="button" data-card="${index}" aria-pressed="${selectedCard === index}">
    ${icon(card.itemId)}<b>${escapeText(card.name)}</b>${marks(card.bottom, "truth")}
    <small>${escapeText(card.truth)}</small></button>`;
}
function renderHandPreview(view, claim) {
  const card = view.hand[selectedCard];
  const level = claim || card.bottom;
  return `<div class="match-object seller-preview">${icon(card.itemId)}<div>
    <small>仅你可见 · 实际成色</small><h3>${escapeText(card.name)}</h3>
    ${marks(card.bottom, "truth")}<p>${escapeText(card.truth)}</p>
    <div class="seller-claim-preview"><small>发出的描述</small><p>${escapeText(card.descriptions[level])}</p>
    ${marks(level, "claim")}<span class="price">${money(level * view.unit)} 枚</span></div>
  </div></div>`;
}
function renderClaimOption(card, level, unit) {
  const warning = level > card.bottom ? '<em aria-label="描述高于实际成色">抬高</em>' : "";
  return `<button type="button" data-claim="${level}">
    ${marks(level, "claim")}<b>${levels[level]}</b><span class="claim-price">${money(level * unit)} 枚</span>${warning}</button>`;
}
function renderClaimPicker(view) {
  if (selectedCard === null) {
    return "";
  }
  const options = [1, 2, 3].map((level) => renderClaimOption(view.hand[selectedCard], level, view.unit)).join("");
  return `<fieldset class="claim-picker"><legend>你打算怎么描述？</legend>${options}</fieldset>`;
}
function renderSellerHand(view) {
  const cards = view.hand.map(renderHandCard).join("");
  return `<div class="control-utility"><p class="control-title">选一件旧物</p>${renderRulesButton()}</div>
    <div class="object-hand">${cards}</div>${renderClaimPicker(view)}`;
}
function renderResponseControls(view) {
  const time = view.config.responseMs;
  const clock =
    view.phase === "response"
      ? `<div class="response-clock">
    <span>你的回应</span><strong data-seconds></strong>
    <progress data-timer max="${time}" value="${time}" aria-label="回应剩余时间"></progress></div>`
      : "";
  const haggle = view.legalActions.includes("haggle")
    ? `<button type="button"
    class="haggle-action" data-action="haggle">砍价</button>`
    : "";
  const actions = view.legalActions.filter((action) => !["haggle", "offer"].includes(action));
  const showHint = view.deal === 1 && view.leader === "opponent" && view.phase === "response" && !hasShownFirstBuyerHint;
  if (showHint) hasShownFirstBuyerHint = true;
  return `${clock}<div class="response-tools">${haggle}${renderRulesButton()}</div>
    <div class="match-actions">${actions.map((action) => button(action, showHint && action === "challenge" ? 'data-first-hint="拿不准？要实拍"' : "")).join("")}</div>`;
}
function renderReviewRow(row) {
  const item = window.uiMatchContent.items.find((entry) => entry.id === row.itemId);
  const identity = row.leader === "player" ? "你" : "对方";
  const mine = row.leader === "player" ? row.leadDelta : row.responseDelta;
  const theirs = row.leader === "player" ? row.responseDelta : row.leadDelta;
  const verdict = row.bluff ? "说得比实际好" : "描述没有抬高";
  return `<details><summary><span>第 ${row.deal} 单 · ${escapeText(item?.name || "旧物")}</span>
    <b>${verdict}</b><small>${names[row.outcome] || row.outcome} ↗</small></summary>
    <p>${identity}当卖家 · 担保 ×${row.multiplier}</p>
    <div class="review-levels"><span>${marks(row.claim, "claim")}说法：${levels[row.claim]}</span>
    <span>${marks(row.bottom, "truth")}成色：${levels[row.bottom]}</span></div>
    <p>${escapeText(row.truth || item?.truths[row.bottom])}</p>
    <p>你 ${money(mine)} / 对方 ${money(theirs)}</p></details>`;
}
function renderResult(panel, view) {
  const review = match.getReview();
  const title = { win: "这局，你领先。", loss: "这局，对方领先。", draw: "这局，平手。" };
  const person = window.uiMatchContent.opponents[view.opponent];
  panel.innerHTML = `<div class="result-screen"><p class="launch-kicker">交易结束 / THE REVEAL</p>
    <h2>${title[view.result.outcome]}</h2><div class="match-totals">
    <span>你<strong>${money(view.wallets.player)}</strong></span>
    <span>对方<strong>${money(view.wallets.opponent)}</strong></span>
    <span>双方共同增长<strong>${money(view.result.jointGrowth)}</strong></span></div>
    <h3>把每一件，重新看一遍。</h3>
    <div class="match-review">${review.history.map(renderReviewRow).join("")}</div>
    <div class="tell-note"><h3>${escapeText(person.name)}的一个习惯</h3>
    <p>${escapeText(review.tell.description)}</p><small>线索不保证真假</small></div></div>`;
}
function act(action) {
  if (!match || pendingAi) {
    return;
  }
  const v = match.getView();
  try {
    match.act(action);
  } catch {
    return;
  }
  if (action.type === "advance") {
    game.messages = [];
    stageContent.innerHTML = "";
    selectedCard = null;
  }
  publicEvent(action.type === "offer" ? "player_card" : "player_response", action.type);
  collectEvents(match.drainEvents());
  panelKey = "";
  renderMatch();
  emitMatchSound(
    action.type === "offer"
      ? "card"
      : action.type === "challenge"
        ? "open"
        : ["withdraw", "fold"].includes(action.type)
          ? "back"
          : "confirm",
    { scope: "match-card", durationMs: 240 },
  );
  if (match.getView().phase === "finished" && !v.result) {
    publicEvent("settlement", "", match.getView().result);
    emitMatchSound("settle", { durationMs: 420 });
  }
  queueAI();
}
function queueAI() {
  if (!match || pendingAi || match.getView().actor !== "opponent") {
    return;
  }
  pendingView = match.getView();
  match.stepAI();
  const v = match.getView();
  pendingAi = match.drainEvents();
  aiLeft = v.dialogue?.delayMs || v.utterance?.delayMs || 700;
  renderMatch();
}
function updateClock(v) {
  const seconds = stageControls.querySelector("[data-seconds]");
  if (seconds) {
    seconds.textContent = `${Math.ceil(v.remainingMs / 1000)} 秒`;
  }
  const timer = stageControls.querySelector("[data-timer]");
  if (timer) {
    timer.value = v.remainingMs;
  }
}
document.addEventListener("site-mode-change", (event) => {
  document.getElementById("experience").dataset.matchMode = event.detail;
  // 对局占满视口并锁住背景；退出时同时恢复文档滚动。
  document.documentElement.classList.toggle("is-playing-match", event.detail === "playing");
  document.documentElement.classList.toggle("is-preparing-match", event.detail === "briefing");
  if (event.detail !== "landing") window.scrollTo({ top: 0, behavior: "instant" });
  if (event.detail !== "playing") setRulesOpen(false);
  syncPause();
});
function syncPause() {
  const active = !document.hidden && document.getElementById("home").dataset.mode === "playing" && !chatStage.querySelector(".match-help-card")?.open;
  if (match) {
    match.setPaused(!active);
  }
  return active;
}
function tickAiReply(elapsed) {
  aiLeft -= elapsed;
  if (aiLeft > 0) {
    return;
  }
  const events = pendingAi;
  pendingAi = null;
  pendingView = null;
  collectEvents(events);
  panelKey = "";
  renderMatch();
  if (match.getView().phase === "finished") {
    publicEvent("settlement", "", match.getView().result);
    emitMatchSound("settle", { durationMs: 420 });
  }
  queueAI();
}
function tickPlayerClock(elapsed) {
  const before = match.getView();
  if (before.phase !== "response" || before.actor !== "player") {
    return;
  }
  const view = match.elapse(elapsed);
  updateClock(view);
  if (view.phase !== before.phase) {
    collectEvents(match.drainEvents());
    panelKey = "";
    renderMatch();
    if (view.phase === "finished") {
      publicEvent("settlement", "", view.result);
    }
  }
}
function tickMatch() {
  const now = performance.now();
  const elapsed = now - lastTick;
  lastTick = now;
  if (!match || !syncPause()) {
    return;
  }
  if (pendingAi) {
    tickAiReply(elapsed);
  } else {
    tickPlayerClock(elapsed);
  }
}
setInterval(tickMatch, 100);

document.querySelector("[data-match-home]").addEventListener("click", () => setView("home"));
resetGame();
