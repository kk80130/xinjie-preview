(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof define === "function" && define.amd)
    define([], function () {
      return api;
    });
  // 工程的 .js 属于 ESM；import/require 均可副作用加载，再从此入口取 API。
  root.uiMatchRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_CONFIG = Object.freeze({
    initialWallet: 100,
    deals: 5,
    baseUnit: 4,
    responseMs: 8000,
    challengeFee: 1,
    exitFee: 0.5,
    withdrawalFee: 1,
    honestYield: 1.5,
    bluffPenalty: 1,
    aiChallengeScale: 0.4,
    aiCaughtWeight: 0.8,
    signalReliability: 0.95,
  });
  const TRAITS = Object.freeze(["question", "calm", "reserve"]);
  const STYLES = {
    lin: { bluff: 0.32, challenge: 0.26, raise: 0.1, exit: 0.05, retreat: 0.3 },
    cheng: { bluff: 0.52, challenge: 0.24, raise: 0.35, exit: 0.04, retreat: 0.18 },
    xu: { bluff: 0.32, challenge: 0.23, raise: 0.19, exit: 0.1, retreat: 0.48 },
  };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const other = (actor) => (actor === "player" ? "opponent" : "player");
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function requireThat(condition, message) {
    if (!condition) throw new Error(message);
  }
  function createSeededRandom(seed = 1) {
    requireThat(Number.isSafeInteger(seed), "种子必须是安全整数");
    let state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function checkedRandom(source) {
    return function () {
      const value = source();
      requireThat(Number.isFinite(value) && value >= 0 && value < 1, "随机数必须在 [0, 1)");
      return value;
    };
  }
  function configFrom(input = {}) {
    for (const key of Object.keys(input))
      requireThat(Object.hasOwn(DEFAULT_CONFIG, key), `未知配置：${key}`);
    const config = { ...DEFAULT_CONFIG, ...input };
    requireThat(config.signalReliability < 1, "信号概率必须小于 1，不能成为确定性揭晓");
    for (const value of Object.values(config))
      requireThat(Number.isFinite(value) && value > 0, "配置必须是正有限数");
    requireThat(Number.isSafeInteger(config.deals) && config.deals <= 100, "交易数必须是 1–100 的整数");
    requireThat(Number.isSafeInteger(config.responseMs), "响应时间必须为整数毫秒");
    // 留后手可能产生 2.5 币；保持半币精度，不靠显示时四舍五入掩盖误差。
    for (const key of ["initialWallet", "baseUnit"])
      requireThat(Number.isSafeInteger(config[key]) && config[key] % 2 === 0, `${key} 必须为正偶数`);
    for (const key of ["challengeFee", "exitFee", "withdrawalFee", "honestYield", "bluffPenalty"]) {
      requireThat(Number.isSafeInteger(config[key] * 2), `${key} 必须为半整数`);
    }
    return config;
  }
  function calculateSettlement(input, overrides = {}) {
    const config = configFrom(overrides);
    const { bottom, claim, multiplier = 1, outcome, responderTrait = null, priceLevel = claim } = input;
    requireThat([1, 2, 3].includes(bottom) && [1, 2, 3].includes(claim), "底与说法必须为 1/2/3");
    requireThat([1, 2, 3].includes(priceLevel) && priceLevel <= claim, "成交价格档位不能高于说法");
    requireThat([1, 2, 4].includes(multiplier), "倍率必须为 1/2/4");
    requireThat(responderTrait === null || TRAITS.includes(responderTrait), "未知应手特质");
    const unit = config.baseUnit * multiplier;
    const bluff = claim > bottom;
    let lead = 0;
    let response = 0;
    if (outcome === "accept" || (outcome === "challenge" && !bluff)) {
      lead = priceLevel * unit;
      response = (config.honestYield * bottom - priceLevel) * unit;
      if (outcome === "challenge") {
        const fee = config.challengeFee * unit * (responderTrait === "question" ? 0.5 : 1);
        lead += fee;
        response -= fee;
      }
    } else if (outcome === "challenge") {
      response = (claim - bottom + config.bluffPenalty) * unit;
      lead = -response;
    } else if (outcome === "fold") {
      lead = unit * (responderTrait === "reserve" ? 0.25 : config.exitFee);
      response = -lead;
    } else if (outcome === "withdraw") {
      requireThat(
        [1, 2].includes(input.originalMultiplier) && multiplier === input.originalMultiplier * 2,
        "撤回必须对应最近一次加码",
      );
      response = config.withdrawalFee * config.baseUnit * input.originalMultiplier;
      lead = -response;
    } else throw new Error("未知结算方式");
    return { lead, response, revealed: outcome === "challenge" };
  }

  function weightedChoice(items, weight, random) {
    let ticket = random() * items.reduce((sum, item) => sum + weight(item), 0);
    for (const item of items) {
      ticket -= weight(item);
      if (ticket < 0) return item;
    }
    return items[items.length - 1];
  }
  function dialogue(catalog, id, bottom, claim, random, situation = "offer", reliability = 0.7, role = "buyer") {
    const character = catalog.opponents[id];
    const condition =
      bottom !== null && (character.tell.condition === "poor" ? bottom === 1 : claim > bottom);
    const pool = character.lines[role]?.[situation] || character.lines[situation];
    const line = weightedChoice(
      pool,
      (entry) => {
        if (situation === "offer") {
          return entry.signal === condition ? reliability : 1 - reliability;
        }
        return condition ? entry.bluff : entry.honest;
      },
      random,
    );
    return {
      text: line.text,
      delayMs: Math.round(line.delayMs[0] + random() * (line.delayMs[1] - line.delayMs[0])),
      signal: line.signal,
      condition,
    };
  }
  // 只从公开观察取信息；调用方不传手牌、底、诈唬标签或整份内部状态。
  function chooseAiResponse(observation, id, source, config = DEFAULT_CONFIG) {
    requireThat(Object.hasOwn(STYLES, id), "未知对手");
    const random = checkedRandom(source);
    const style = STYLES[id];
    const claim = observation.claim;
    requireThat([1, 2, 3].includes(claim), "应手需要公开说法");
    const caught = clamp(observation.playerBluffsCaught || 0, 0, 5);
    const challenge = clamp(
      (style.challenge + (claim - 2) * 0.07) * config.aiChallengeScale + caught * config.aiCaughtWeight,
      0.01,
      0.9,
    );
    const raise = observation.canRaise ? style.raise : 0;
    const exit = style.exit + (observation.wallet < observation.unit * 2 ? 0.13 : 0);
    if (observation.canHaggle && random() < { lin: 0.22, cheng: 0.48, xu: 0.36 }[id]) return "haggle";
    const value = random();
    if (value < challenge) return "challenge";
    if (value < challenge + raise) return "raise";
    if (value < challenge + raise + exit) return "fold";
    return "accept";
  }

  function createMatch(options = {}) {
    const id = options.opponent || "lin";
    const trait = options.trait || "question";
    const catalog = clone(options.content || globalThis.uiMatchContent || null);
    requireThat(
      catalog?.items?.length === 12 && catalog.opponents,
      "请先加载 match-content.js 或注入内容",
    );
    requireThat(Object.hasOwn(catalog.opponents, id) && TRAITS.includes(trait), "未知对手或特质");
    const config = configFrom(options.config);
    const rng = checkedRandom(options.random || createSeededRandom(options.seed ?? 1));
    const firstLeader = options.firstLeader ?? (rng() < 0.5 ? "player" : "opponent");
    requireThat(["player", "opponent"].includes(firstLeader), "未知先手");
    // 先发完各单手牌，使前一单是否加码不影响下一单发牌；分开台词和决策随机流。
    const hands = Array.from({ length: config.deals }, () => {
      const items = [...catalog.items];
      return Array.from({ length: 3 }, () => ({
        itemId: items.splice(Math.floor(rng() * items.length), 1)[0].id,
        bottom: 1 + Math.floor(rng() * 3),
      }));
    });
    const stream = (number, salt) =>
      options.random
        ? rng
        : createSeededRandom(((options.seed ?? 1) ^ Math.imul(number, 0x9e3779b1) ^ salt) >>> 0);
    const wallets = { player: config.initialWallet, opponent: config.initialWallet };
    const events = [];
    const history = [];
    let playerBluffsCaught = 0;
    let paused = false;
    let turn;
    let result = null;
    function emit(type, data) {
      events.push({ type, deal: turn?.number || 0, ...clone(data) });
    }
    function actor() {
      if (["offer", "stand", "haggle"].includes(turn.phase)) return turn.leader;
      if (turn.phase === "response") return other(turn.leader);
      return null;
    }
    function raiseLimit() {
      return other(turn.leader) === "player" && trait === "calm" ? 2 : 1;
    }
    function legal() {
      if (turn.phase === "offer") return ["offer"];
      if (turn.phase === "stand") return ["stand", "withdraw"];
      if (turn.phase === "haggle") return ["concede", "hold"];
      if (turn.phase === "response")
        return [
          "accept",
          "challenge",
          ...(turn.raises < raiseLimit() ? ["raise"] : []),
          "fold",
          ...(!turn.haggled && turn.raises === 0 && turn.claim > 1 ? ["haggle"] : []),
        ];
      return turn.phase === "deal-end" ? ["advance"] : [];
    }
    function startDeal(number) {
      turn = {
        number,
        leader: number % 2 === 1 ? firstLeader : other(firstLeader),
        phase: "offer",
        hand: hands[number - 1],
        random: stream(number, 0x39d62415),
        speechRandom: stream(number, 0xaf175023),
        bottom: null,
        claim: null,
        priceLevel: null,
        haggled: false,
        multiplier: 1,
        originalMultiplier: null,
        raises: 0,
        itemId: null,
        remainingMs: config.responseMs,
        cue: null,
        resolution: null,
        utterance: null,
      };
      emit("deal_start", { leader: turn.leader });
    }
    function say(situation) {
      const ownOffer = turn.leader === "opponent";
      const utterance = dialogue(
        catalog,
        id,
        ownOffer ? turn.bottom : null,
        turn.claim,
        turn.speechRandom,
        situation,
        config.signalReliability,
        ownOffer ? "seller" : "buyer",
      );
      turn.utterance = {
        text: utterance.text,
        delayMs: utterance.delayMs,
        situation,
        actor: "opponent",
      };
      emit("dialogue", turn.utterance);
      return utterance;
    }
    function finish() {
      turn.phase = "finished";
      result = {
        wallet: wallets.player,
        opponentWallet: wallets.opponent,
        outcome:
          wallets.player === wallets.opponent
            ? "draw"
            : wallets.player > wallets.opponent
              ? "win"
              : "loss",
        deals: history.length,
        bluffsCaught: playerBluffsCaught,
        jointGrowth: wallets.player + wallets.opponent - 2 * config.initialWallet,
      };
      emit("match_end", result);
    }
    function settle(outcome, timedOut = false) {
      const responder = other(turn.leader);
      const delta = calculateSettlement(
        {
          bottom: turn.bottom,
          claim: turn.claim,
          multiplier: turn.multiplier,
          originalMultiplier: turn.originalMultiplier,
          priceLevel: turn.priceLevel,
          outcome,
          responderTrait: responder === "player" ? trait : null,
        },
        config,
      );
      let leadDelta = delta.lead;
      let responseDelta = delta.response;
      // 赔付只用已有钱包，少付部分同时从收款方扣除，禁止凭空补足或出现负余额。
      if (leadDelta < -wallets[turn.leader]) {
        responseDelta -= -leadDelta - wallets[turn.leader];
        leadDelta = -wallets[turn.leader];
      }
      if (responseDelta < -wallets[responder]) {
        leadDelta -= -responseDelta - wallets[responder];
        responseDelta = -wallets[responder];
      }
      wallets[turn.leader] += leadDelta;
      wallets[responder] += responseDelta;
      if (outcome === "challenge" && turn.claim > turn.bottom && turn.leader === "player")
        playerBluffsCaught += 1;
      turn.resolution = {
        outcome,
        leadDelta,
        responseDelta,
        wallets: { ...wallets },
        ...(delta.revealed ? { revealedBottom: turn.bottom } : {}),
      };
      if (outcome === "challenge")
        say(turn.leader === "opponent" && turn.claim > turn.bottom ? "caught" : "challenge");
      else say(timedOut ? "timeout" : outcome);
      history.push({
        deal: turn.number,
        leader: turn.leader,
        bottom: turn.bottom,
        claim: turn.claim,
        priceLevel: turn.priceLevel,
        itemId: turn.itemId,
        truth: catalog.items.find((item) => item.id === turn.itemId).truths[turn.bottom],
        bluff: turn.claim > turn.bottom,
        multiplier: turn.multiplier,
        cue: turn.cue ? { ...turn.cue } : null,
        ...clone(turn.resolution),
      });
      turn.phase = "deal-end";
      emit("deal_end", turn.resolution);
      if (wallets.player === 0 || wallets.opponent === 0 || turn.number === config.deals) finish();
    }
    function apply(action) {
      requireThat(action && legal().includes(action.type), "当前阶段不能执行该操作");
      if (action.type === "advance") {
        startDeal(turn.number + 1);
        return;
      }
      if (action.type === "offer") {
        requireThat(
          Number.isInteger(action.cardIndex) && action.cardIndex >= 0 && action.cardIndex < 3,
          "必须选择手牌中的一张",
        );
        requireThat([1, 2, 3].includes(action.claim), "说法必须为 1/2/3");
        const card = turn.hand[action.cardIndex];
        turn.bottom = card.bottom;
        turn.itemId = card.itemId;
        turn.claim = action.claim;
        turn.priceLevel = action.claim;
        turn.cue = turn.leader === "opponent" ? say("offer") : null;
        turn.phase = "response";
        turn.remainingMs = config.responseMs;
        emit("offer", {
          leader: turn.leader,
          claim: turn.claim,
          itemId: turn.itemId,
          ...(turn.cue ? { text: turn.cue.text, delayMs: turn.cue.delayMs } : {}),
        });
      } else if (action.type === "raise") {
        if (actor() === "opponent") say("raise");
        turn.originalMultiplier = turn.multiplier;
        turn.multiplier *= 2;
        turn.raises += 1;
        turn.phase = "stand";
        emit("raise", { multiplier: turn.multiplier, actor: other(turn.leader) });
      } else if (action.type === "stand") {
        if (actor() === "opponent") say("stand");
        turn.phase = "response";
        turn.remainingMs = config.responseMs;
        emit("stand", { actor: turn.leader, multiplier: turn.multiplier });
      } else if (action.type === "haggle") {
        if (actor() === "opponent") say("haggle");
        turn.haggled = true;
        turn.phase = "haggle";
        emit("haggle", { actor: other(turn.leader), proposedPriceLevel: turn.claim - 1 });
      } else if (action.type === "concede" || action.type === "hold") {
        if (actor() === "opponent") say(action.type);
        if (action.type === "concede") turn.priceLevel = turn.claim - 1;
        turn.phase = "response";
        emit(action.type, { actor: turn.leader, priceLevel: turn.priceLevel });
      } else settle(action.type);
    }
    function view() {
      return clone({
        opponent: id,
        trait,
        config,
        wallets,
        deal: turn.number,
        leader: turn.leader,
        actor: actor(),
        phase: turn.phase,
        multiplier: turn.multiplier,
        unit: config.baseUnit * turn.multiplier,
        raises: turn.raises,
        remainingMs: turn.phase === "response" ? turn.remainingMs : null,
        paused,
        legalActions: legal(),
        claim: turn.claim,
        priceLevel: turn.priceLevel,
        haggled: turn.haggled,
        playerBluffsCaught,
        // 完整描述与真相仅供玩家自己的卖家手牌，买家看不到对手手牌。
        hand:
          turn.leader === "player" && turn.phase === "offer"
            ? turn.hand.map((card) => {
                const item = catalog.items.find((item) => item.id === card.itemId);
                return {
                  ...card,
                  name: item.name,
                  iconId: item.iconId,
                  truth: item.truths[card.bottom],
                  descriptions: item.descriptions,
                };
              })
            : [],
        ownBottom: turn.leader === "player" ? turn.bottom : null,
        item: turn.itemId
          ? (() => {
              const item = catalog.items.find((item) => item.id === turn.itemId);
              return {
                id: item.id,
                name: item.name,
                iconId: item.iconId,
                description: item.descriptions[turn.claim],
                ...(turn.resolution?.revealedBottom ? { truth: item.truths[turn.bottom] } : {}),
              };
            })()
          : null,
        dialogue: turn.cue ? { text: turn.cue.text, delayMs: turn.cue.delayMs } : null,
        utterance: turn.utterance,
        resolution: turn.resolution,
        result,
      });
    }
    startDeal(1);
    say("greeting");
    return Object.freeze({
      getView: view,
      act(action) {
        requireThat(!paused, "暂停中不能操作");
        requireThat(
          actor() === "player" || (action?.type === "advance" && turn.phase === "deal-end"),
          "当前不是玩家行动",
        );
        apply(action);
        return view();
      },
      stepAI() {
        requireThat(!paused && actor() === "opponent", "当前不是对手行动");
        if (turn.phase === "offer") {
          const bluff = turn.random() < STYLES[id].bluff;
          const eligible = turn.hand
            .map((card, index) => ({ bottom: card.bottom, index }))
            .filter((card) => !bluff || card.bottom < 3);
          const card =
            bluff && eligible.length
              ? weightedChoice(eligible, (entry) => (entry.bottom === 1 ? 9 : 1), turn.random)
              : turn.hand
                  .map((card, index) => ({ bottom: card.bottom, index }))
                  .sort((a, b) => b.bottom - a.bottom)[0];
          apply({
            type: "offer",
            cardIndex: card.index,
            claim: bluff && card.bottom < 3 ? 3 : card.bottom,
          });
        } else if (turn.phase === "response") {
          apply({
            type: chooseAiResponse(
              {
                claim: turn.claim,
                unit: config.baseUnit * turn.multiplier,
                playerBluffsCaught,
                wallet: wallets.opponent,
                canRaise: legal().includes("raise"),
                canHaggle: legal().includes("haggle"),
              },
              id,
              turn.random,
              config,
            ),
          });
        } else if (turn.phase === "haggle") {
          const concession =
            { lin: 0.6, cheng: 0.2, xu: 0.38 }[id] + (turn.claim > turn.bottom ? 0.15 : 0);
          apply({ type: turn.random() < concession ? "concede" : "hold" });
        } else {
          const bluff = turn.claim > turn.bottom;
          const retreat = bluff ? STYLES[id].retreat : 0.025;
          apply({ type: turn.random() < retreat ? "withdraw" : "stand" });
        }
        return view();
      },
      elapse(milliseconds) {
        requireThat(Number.isFinite(milliseconds) && milliseconds >= 0, "时间必须是非负有限毫秒");
        // 由界面传入有效经过时间；暂停、等待消息和非应手阶段均不消耗倒计时。
        if (!paused && turn.phase === "response") {
          turn.remainingMs = Math.max(0, turn.remainingMs - milliseconds);
          if (turn.remainingMs === 0) {
            emit("timeout", { actor: other(turn.leader) });
            settle("fold", true);
          }
        }
        return view();
      },
      setPaused(value) {
        requireThat(typeof value === "boolean", "暂停标记必须是布尔值");
        paused = value;
        return view();
      },
      drainEvents() {
        return events.splice(0).map(clone);
      },
      getReview() {
        requireThat(turn.phase === "finished", "局末才能查看复盘");
        return clone({
          ...result,
          history,
          tell: {
            reliability: config.signalReliability,
            description: catalog.opponents[id].tell.description,
            meaning: `条件成立时信号出现概率 ${config.signalReliability * 100}%，这不等于见到信号就确定诈唬。`,
          },
        });
      },
    });
  }
  return Object.freeze({
    DEFAULT_CONFIG,
    TRAITS,
    createSeededRandom,
    calculateSettlement,
    chooseAiResponse,
    createMatch,
  });
});
