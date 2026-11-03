(() => {
  "use strict";
  const root = document.documentElement;
  // 变体按信息用途和动作次序分配，不随机改变操作的含义。
  const cues = {
    tick: { clips: ["cursor-2", "cursor-4"], gain: .3, priority: 1 },
    navigation: { clips: ["cursor-1"], gain: .3, priority: 2 },
    palette: { clips: ["cursor-4"], gain: .3, priority: 2 },
    pose: { clips: ["cursor-3"], gain: .28, priority: 2 },
    "card-prepare": { clips: ["cursor-2"], gain: .22, priority: 2 },
    confirm: { clips: ["select-1"], gain: .53, priority: 3 },
    ack: { clips: ["select-2"], gain: .5, priority: 4 },
    settle: { clips: ["select-2"], gain: .6, priority: 5 },
    card: { clips: ["swipe-1"], gain: .4, priority: 4, tempo: true },
    message: { clips: ["cursor-5"], gain: .33, priority: 2 },
    open: { clips: ["open"], gain: .42, priority: 3 },
    back: { clips: ["cancel-1"], gain: .4, priority: 3 },
    close: { clips: ["close"], gain: .4, priority: 3 },
    pause: { clips: ["cancel-2"], gain: .32, priority: 3 },
    error: { clips: ["error"], gain: .44, priority: 5 },
    "response-land": { clips: ["cursor-3", "cursor-4"], gain: .16, priority: 1 },
    "motion-prepare": { clips: ["cancel-1"], gain: .19, priority: 1 },
    "motion-pull": { clips: ["swipe-1"], gain: .3, priority: 2, tempo: true },
    "motion-land": { clips: ["cursor-3"], gain: .29, priority: 2 },
    "motion-follow": { clips: ["cursor-5"], gain: .13, priority: 1 },
    "motion-settle": { clips: ["close"], gain: .24, priority: 1 },
    "scroll-enter": { clips: ["swipe-1"], gain: .26, priority: 1, scroll: true, tempo: true },
    "scroll-expand": { clips: ["cursor-2", "cursor-3", "cursor-4"], gain: .28, priority: 1, scroll: true },
    "scroll-retract": { clips: ["swipe-2"], gain: .22, priority: 1, scroll: true, tempo: true },
    "scroll-leave": { clips: ["cancel-1"], gain: .27, priority: 1, scroll: true }
  };
  let context = null, master = null, loading = null, ready = false;
  let loadFailed = false, unsupported = false, lastLoadAt = -Infinity, resumePending = null, wheelResumeAttempted = false;
  let lastName = "", lastScrollAt = -Infinity, lastDirection = 0;
  let played = 0, scrollPlayed = 0;
  let contextTransition = null, pageDormant = false;
  const buffers = new Map(), clipPeaks = new Map(), voices = new Set(), lastEvents = new Map(), variants = new Map();
  const clipNames = [...new Set(Object.values(cues).flatMap((cue) => cue.clips))];
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const now = () => performance.now();
  const state = () => unsupported ? "unsupported" : document.hidden || pageDormant ? "paused" : loadFailed ? "error" : !ready ? "loading" : context?.state === "running" ? "on" : "waiting";
  function publishState() {
    root.dataset.audioState = state();
    root.dataset.audioContext = context?.state || "uninitialized";
    if (context?.state === "running") wheelResumeAttempted = false;
  }
  function stopVoice(voice) {
    if (voice.stopping) return;
    voice.stopping = true;
    // 被撤回的声音立即交还活动槽，尾部淡出独立完成，不挤占后续有效操作。
    voices.delete(voice);
    const at = context.currentTime;
    if (voice.start > at) {
      voice.gain.gain.cancelScheduledValues(at);
      try { voice.source.stop(at); } catch { /* 尚未起声的动作直接撤回，不留下短促漏音。 */ }
      return;
    }
    voice.gain.gain.cancelScheduledValues(at);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, at);
    voice.gain.gain.linearRampToValueAtTime(0, at + .018);
    try { voice.source.stop(at + .022); } catch { /* 已自然结束的声音无需再次停止。 */ }
  }
  function stopAll(scrollOnly = false) {
    for (const voice of voices) if (!scrollOnly || voice.scroll) stopVoice(voice);
  }
  function cancel(scope) {
    if (!scope) return;
    for (const voice of voices) if (voice.scope === scope || voice.scope.startsWith(`${scope}:`)) stopVoice(voice);
    for (const key of lastEvents.keys()) if (key.startsWith(`${scope}|`) || key.startsWith(`${scope}:`)) lastEvents.delete(key);
  }
  async function loadBank() {
    const response = await fetch("assets/ui-sounds.bank?v=20261021-rhythm35");
    if (!response.ok) throw new Error("声音资源未载入");
    const data = await response.arrayBuffer();
    const bytes = new Uint8Array(data);
    if (new TextDecoder().decode(bytes.subarray(0, 8)) !== "UIASFX01") throw new Error("声音资源格式不匹配");
    const length = new DataView(data).getUint32(8, true), start = 12 + length;
    if (start > data.byteLength) throw new Error("声音资源不完整");
    const manifest = JSON.parse(new TextDecoder().decode(bytes.subarray(12, start)));
    if (manifest.version !== 1) throw new Error("声音资源版本不匹配");
    const decoded = await Promise.all(clipNames.map(async (name) => {
      const clip = manifest.clips[name];
      if (!clip || !Number.isInteger(clip.offset) || !Number.isInteger(clip.length) || clip.offset < 0 || clip.length < 44 || start + clip.offset + clip.length > data.byteLength) throw new Error("声音片段不完整");
      if (!Number.isFinite(clip.peakSeconds) || clip.peakSeconds < 0 || clip.peakSeconds > clip.durationSeconds) throw new Error("声音强调点无效");
      return [name, await context.decodeAudioData(data.slice(start + clip.offset, start + clip.offset + clip.length)), clip.peakSeconds];
    }));
    decoded.forEach(([name, buffer, peak]) => { buffers.set(name, buffer); clipPeaks.set(name, peak); });
    ready = true;
  }
  function play(name, detail = {}) {
    const cue = cues[name];
    // 未准备好的旧操作直接丢弃，资源载入后不补播过去的点击或滚动。
    if (!cue || !ready || document.hidden || pageDormant || context?.state !== "running") return false;
    const at = now();
    const scope = detail.scope || (cue.scroll ? "scroll" : name);
    const eventKey = `${scope}|${name}`;
    if (at - (lastEvents.get(eventKey) ?? -Infinity) < (detail.cooldownMs ?? 70)) return false;
    if (cue.scroll) {
      const direction = detail.direction || 0;
      if (direction && lastDirection && direction !== lastDirection) stopAll(true);
      lastDirection = direction;
      if (at - lastScrollAt < clamp(detail.intervalMs || 180, 100, 260)) return false;
    }
    if (cue.priority > 1) stopAll(true);
    const count = variants.get(name) || 0;
    const index = Number.isFinite(detail.variant) ? Math.abs(Math.trunc(detail.variant)) : count;
    const clip = cue.clips[index % cue.clips.length], buffer = buffers.get(clip);
    if (!buffer) return false;
    // 一帧跨过多项只保留当前声；高优先级操作可以替代仍在收束的滚动声。
    if (cue.scroll) stopAll(true);
    if (voices.size >= 4) {
      const oldest = [...voices].sort((a, b) => a.priority - b.priority || a.start - b.start)[0];
      if (oldest.priority > cue.priority) return false;
      stopVoice(oldest);
    }
    const source = context.createBufferSource(), gain = context.createGain();
    const tempo = cue.tempo && detail.durationMs > 0 ? clamp(buffer.duration * 1000 / detail.durationMs, .88, 1.18) : 1;
    const rate = clamp(tempo * (detail.rate || 1) * [1, .98, 1.025][index % 3], .86, 1.2);
    source.buffer = buffer; source.playbackRate.value = rate;
    // 用实测能量强调点对齐动作落点，而不是把文件起点机械对齐按钮点击。
    const accent = clamp(Number(detail.accentMs) || 0, 0, 600) / 1000;
    const start = context.currentTime + Math.max(0, accent - clipPeaks.get(clip) / rate);
    const duration = Math.min(buffer.duration / rate, detail.durationMs > 0 ? Math.max(.06, detail.durationMs / 1000 + .07) : Infinity);
    const end = start + duration, level = cue.gain * clamp(detail.gain || 1, .45, 1.25);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, Math.min(end, start + .003));
    gain.gain.setValueAtTime(level, Math.max(start + .003, end - .016));
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(gain); gain.connect(master);
    const voice = { source, gain, scope, priority: cue.priority, start, scroll: Boolean(cue.scroll), stopping: false };
    voices.add(voice);
    source.onended = () => { voices.delete(voice); source.disconnect(); gain.disconnect(); };
    source.start(start); source.stop(end + .002);
    lastEvents.set(eventKey, at); variants.set(name, count + 1);
    if (lastEvents.size > 64) lastEvents.delete(lastEvents.keys().next().value);
    lastName = name; played++;
    if (cue.scroll) { lastScrollAt = at; scrollPlayed++; }
    root.dataset.audioLastCue = name;
    root.dataset.audioLastClip = clip; root.dataset.audioAccentMs = String(Math.round(accent * 1000));
    root.dataset.audioPlayed = String(played); root.dataset.audioScrollPlayed = String(scrollPlayed);
    return true;
  }
  function requestResume(fromGesture = false) {
    if (!context || context.state === "running" || document.hidden || pageDormant) return;
    // 自动播放可能让resume一直等待；真实操作必须能重新调用，不能被旧Promise锁住。
    if (resumePending && !fromGesture) return;
    try {
      const pending = Promise.resolve(context.resume());
      resumePending = pending;
      void pending.then(() => {
        publishState();
        if (document.hidden || pageDormant) void reconcileContext();
      }, () => { publishState(); }).finally(() => { if (resumePending === pending) resumePending = null; });
    } catch { publishState(); }
  }
  function prepareAudio() {
    if (unsupported) return;
    try {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) { unsupported = true; publishState(); return; }
        context = new Audio(); master = context.createGain(); master.gain.value = .7; master.connect(context.destination);
        context.addEventListener("statechange", publishState);
      }
    } catch { unsupported = true; publishState(); return; }
    if (!ready && !loading && (!loadFailed || now() - lastLoadAt >= 800)) {
      loadFailed = false; lastLoadAt = now();
      // 解码与自动播放许可分开完成，网络就绪后普通操作即可直接使用音效。
      loading = loadBank().catch(() => { loadFailed = true; }).finally(() => { loading = null; publishState(); });
    }
    requestResume(); publishState();
  }
  function reconcileContext() {
    if (!context) return Promise.resolve();
    if (contextTransition) return contextTransition;
    if (!document.hidden && !pageDormant) { requestResume(); publishState(); return Promise.resolve(); }
    if (context.state !== "running") { publishState(); return Promise.resolve(); }
    // 只等待后台暂停；回前台时按最新可见性恢复，不等待可能被浏览器拦住的resume。
    contextTransition = context.suspend().catch(() => {}).finally(() => {
      contextTransition = null;
      if (!document.hidden && !pageDormant) requestResume();
      publishState();
    });
    return contextTransition;
  }
  function unlockOnInteraction(event) {
    if (document.hidden || pageDormant) return;
    if (ready && context?.state === "running") return;
    prepareAudio();
    // 捕获阶段同步解锁，原有按钮/滑动随后照常处理，不增加确认步骤。
    const retry = event.type !== "wheel" || !wheelResumeAttempted;
    if (event.type === "wheel") wheelResumeAttempted = true;
    requestResume(retry);
  }
  for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown", "wheel"]) {
    document.addEventListener(type, unlockOnInteraction, { capture: true, passive: true });
  }
  document.addEventListener("ui-sound", ({ detail }) => {
    // 部分内嵌页面会转发操作而不转发原指针事件，语义动作也保留同一次解锁机会。
    if (!ready || context?.state !== "running") { prepareAudio(); requestResume(true); }
    play(detail?.name, detail);
  });
  document.addEventListener("ui-sound-cancel", ({ detail }) => cancel(detail?.scope));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAll();
    // 返回时只恢复音频上下文，不重播离开期间的事件。
    else publishState();
    void reconcileContext();
  });
  window.addEventListener("pagehide", () => { pageDormant = true; stopAll(); void reconcileContext(); });
  window.addEventListener("pageshow", () => { pageDormant = false; void reconcileContext(); });
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-view-target],#motionToggle");
    if (!target || target.disabled) return;
    if (target.id === "motionToggle") {
      cancel("study"); cancel("scroll");
      play(document.documentElement.classList.contains("visual-paused") ? "pause" : "tick");
    } else play("navigation");
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches('input[type="range"],input[type="radio"]')) play("tick");
  });
  window.uiSiteAudio = Object.freeze({
    play, cancel,
    get status() { return { enabled: true, ready, state: state(), contextState: context?.state || "uninitialized", activeVoices: voices.size, played, scrollPlayed, lastCue: lastName, clips: buffers.size }; }
  });
  prepareAudio();
})();
