(() => {
  "use strict";
  const story = document.getElementById("story");
  if (!story) return;
  const chapters = [...story.querySelectorAll("[data-story-chapter]")];
  const route = story.querySelector(".story-route");
  const base = document.getElementById("storyRouteBase");
  const progressPath = document.getElementById("storyRouteProgress");
  const guide = document.getElementById("storyGuide");
  // 短轨道固定在视口，避免超长 SVG 在手机滚动时重复栅格化。
  route.classList.add("story-progress-rail");
  document.body.append(route);
  const railLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
  railLabel.setAttribute("class", "story-progress-label");
  railLabel.setAttribute("text-anchor", "middle");
  route.append(railLabel);
  let railHeight = 300, railLeft = 0, railTop = 0, railScale = 1, railSamples = [], railLength = 1;
  function railPoint(progress) {
    if (!railSamples.length) return { x: 42, y: 42 };
    const target = Math.max(0, Math.min(1, progress)) * railLength;
    let low = 0, high = railSamples.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (railSamples[mid].length < target) low = mid; else high = mid;
    }
    const a = railSamples[low], b = railSamples[high];
    const mix = (target - a.length) / Math.max(.0001, b.length - a.length);
    return { x: a.x + (b.x - a.x) * mix, y: a.y + (b.y - a.y) * mix };
  }
  const sphereHolder = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
  sphereHolder.setAttribute("x", "-42"); sphereHolder.setAttribute("y", "-42");
  sphereHolder.setAttribute("width", "84"); sphereHolder.setAttribute("height", "84");
  const guideCanvas = document.createElement("canvas");
  guideCanvas.className = "story-guide-spheres"; guideCanvas.setAttribute("aria-hidden", "true");
  sphereHolder.append(guideCanvas); guide.prepend(sphereHolder);
  const branches = document.createElementNS("http://www.w3.org/2000/svg", "g");
  branches.setAttribute("class", "story-branches");
  route.insertBefore(branches, guide);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const smooth = (value) => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };
  let pathLength = 1, distance = 0, frame = 0, lastTime = 0;
  let viewportHeight = innerHeight, viewportWidth = innerWidth, storyHeight = 0, storyWidth = 0;
  let storyTop = 0, suspended = false, studyVisible = false, studyPlayed = false;
  let guideVisible = false, guideTime = 0, lastGuidePaint = 0;
  let wantedScroll = scrollY, renderedScroll = scrollY, sceneDirty = true, cachedHeader = 0;
  let navigationPlayback = null;
  let soundIntentUntil = 0, soundScroll = scrollY, soundNavigation = false, soundFrameAt = 0, soundDirection = 0;
  const tether = document.createElementNS("http://www.w3.org/2000/svg", "path");
  tether.setAttribute("class", "story-live-tether"); route.insertBefore(tether, guide);
  const isPaused = () => reduced.matches || document.documentElement.classList.contains("visual-paused");
  const headerHeight = () => {
    const header = document.querySelector(".topbar");
    return ["sticky", "fixed"].includes(getComputedStyle(header).position) ? header.offsetHeight : 0;
  };
  const timelines = chapters.map((chapter) => {
    const content = chapter.querySelector(".story-content");
    const narrative = content.classList.contains("narrative-content");
    const scene = document.createElement("div"); scene.className = "story-scene";
    content.before(scene); scene.append(content);
    const hint = document.createElement("p"); hint.className = "story-scroll-hint";
    hint.textContent = "继续滚动，逐项展开；下划线文字可点击"; scene.append(hint);
    const sheet = document.createElement("div"); sheet.className = "story-sheet";
    sheet.append(...content.childNodes); content.append(sheet);
    const title = sheet.querySelector(".story-title");
    const lines = title.innerHTML.split(/<br\s*\/?\s*>/i);
    title.replaceChildren();
    lines.forEach((line) => { const span = document.createElement("span"); span.className = "story-title-line"; span.innerHTML = line; title.append(span); });
    const units = [];
    function add(element) { if (!element || units.includes(element)) return; element.classList.add("timeline-item"); units.push(element); }
    if (narrative) [...sheet.querySelectorAll("[data-scene-step]")].sort((a, b) => Number(a.dataset.sceneStep) - Number(b.dataset.sceneStep)).forEach(add);
    else [...sheet.children].forEach((element) => {
      if (element.classList.contains("story-title")) [...element.children].forEach(add);
      else if (element.classList.contains("story-actions")) [...element.children].forEach(add);
      else if (element.classList.contains("story-plane")) {
        const list = element.matches(".concept-notes,.process-records,.flow-nodes,.visual-basis") ? element : element.querySelector(".story-questions");
        if (list) [...list.children].forEach(add);
        else if (element.classList.contains("visual-lab")) {
          [...element.children].forEach((child) => {
            if (child.matches(".lab-presets,.lab-controls")) [...child.children].forEach(add); else add(child);
          });
        } else [...element.children].forEach((child) => {
          if (child.matches(".motion-phases,.evidence-grid")) [...child.children].forEach(add);
          else if (!child.matches(".feedback-list")) add(child);
        });
      } else add(element);
    });
    const soundRoles = units.map((unit) => unit.matches(".story-title-line") || unit.querySelector("h3") ? 1 : unit.matches("button,fieldset,.lab-control,.story-actions") ? 2 : 0);
    return { chapter, content, scene, sheet, title, narrative, titleIndex: units.findIndex((unit) => unit.classList.contains("story-title-line")), hint, units, soundRoles, centers: [], bounds: [], maxPan: 0, step: 1 };
  });
  const railNames = ["概念", "研究", "视觉", "动画", "流程", "制作", "反馈"];
  const railStages = timelines.map((timeline, index) => {
    const make = (tag, cls) => {
      const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
      node.setAttribute("class", cls); branches.append(node); return node;
    };
    const link = make("path", "rail-page-link");
    const end = make("rect", "rail-page-end");
    end.setAttribute("width", "5"); end.setAttribute("height", "5");
    const marker = make("rect", "rail-chapter-node");
    marker.setAttribute("width", "5"); marker.setAttribute("height", "5");
    marker.setAttribute("rx", index < 2 || index === 3 ? "2.5" : "0.8");
    const name = make("text", "rail-chapter-name");
    name.setAttribute("x", "42"); name.setAttribute("y", "15");
    name.setAttribute("text-anchor", "middle"); name.textContent = railNames[index];
    return { timeline, link, end, marker, name };
  });
  function layoutRoute() {
    if (window.uiReadingInput?.active) return;
    resetScrollSound();
    const header = headerHeight();
    cachedHeader = header;
    story.style.setProperty("--reader-top", `${header}px`);
    timelines.forEach((timeline) => {
      const step = viewportHeight * (timeline.narrative ? .7 : .55);
      timeline.step = step;
      timeline.chapter.style.height = isPaused() ? "auto" : `${(timeline.units.length + 1.5) * step + viewportHeight - header}px`;
      const sheetRect = timeline.sheet.getBoundingClientRect();
      timeline.bounds = timeline.units.map((unit) => {
        const rect = unit.getBoundingClientRect();
        const transform = getComputedStyle(unit).transform;
        const matrix = transform === "none" ? null : new DOMMatrixReadOnly(transform);
        const shift = matrix ? matrix.m42 : 0;
        const scale = matrix ? matrix.a : 1;
        const center = rect.top - sheetRect.top - shift + rect.height / 2;
        const height = rect.height / Math.max(.1, scale);
        return { top: center - height / 2, bottom: center + height / 2, center };
      });
      timeline.centers = timeline.bounds.map((bound) => bound.center);
      timeline.padTop = parseFloat(getComputedStyle(timeline.content).paddingTop) || 0;
      timeline.padBottom = parseFloat(getComputedStyle(timeline.content).paddingBottom) || 0;
      // 到末尾时保留底部内边距，避免把最后一项继续抬到中央而留下半屏空白。
      timeline.sheetHeight = Math.max(timeline.sheet.offsetHeight, ...timeline.bounds.map((bound) => bound.bottom));
      timeline.maxPan = Math.max(0, timeline.sheetHeight - timeline.content.clientHeight + timeline.padTop + timeline.padBottom);
      timeline.content.style.setProperty("--read-pad", `${timeline.padTop}px`);
      timeline.viewportHeight = timeline.content.clientHeight;
    });
    const rect = story.getBoundingClientRect();
    storyTop = rect.top + scrollY;
    const height = story.offsetHeight;
    storyHeight = height; storyWidth = rect.width;
    timelines.forEach((timeline) => {
      const chapterBox = timeline.chapter.getBoundingClientRect();
      const sceneBox = timeline.scene.getBoundingClientRect();
      const contentBox = timeline.content.getBoundingClientRect();
      timeline.documentTop = chapterBox.top + scrollY;
      timeline.chapterHeight = chapterBox.height;
      timeline.sceneHeight = sceneBox.height;
      timeline.contentOffset = contentBox.top - sceneBox.top;
      timeline.contentLeft = contentBox.left - rect.left;
      timeline.contentDocumentTop = contentBox.top + scrollY;
    });
    // 这里只更新短轨道几何，章节时间轴和滚动长度保持原样。
    // 轨道与内容面共享纵向重心，拉开曲线段距，避免短轨道挤在大留白中。
    railHeight = Math.max(240, Math.min(720, (viewportHeight - header) * .78));
    railTop = header + (viewportHeight - header - railHeight) * .5;
    route.style.setProperty("--rail-top", `${railTop}px`);
    route.style.setProperty("--rail-height", `${railHeight}px`);
    route.setAttribute("viewBox", `0 0 84 ${railHeight}`);
    route.setAttribute("preserveAspectRatio", "none");
    // 每段以竖直切线接合，避免章节交界处折向；弧长缓存让点、节点与线头始终重合。
    const knots = Array.from({ length: 8 }, (_, i) => ({
      x: i === 0 || i === 7 ? 42 : 42 + (i % 2 ? 20 : -16),
      y: 42 + (railHeight - 84) * i / 7
    }));
    let d = `M ${knots[0].x} ${knots[0].y}`;
    railSamples = [{ ...knots[0], length: 0 }]; railLength = 0;
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1], b = knots[i], span = b.y - a.y;
      const c = { x: a.x, y: a.y + span * .45 }, e = { x: b.x, y: b.y - span * .45 };
      d += ` C ${c.x} ${c.y}, ${e.x} ${e.y}, ${b.x} ${b.y}`;
      for (let sample = 1; sample <= 64; sample++) {
        const t = sample / 64, u = 1 - t;
        const x = u ** 3 * a.x + 3 * u * u * t * c.x + 3 * u * t * t * e.x + t ** 3 * b.x;
        const y = u ** 3 * a.y + 3 * u * u * t * c.y + 3 * u * t * t * e.y + t ** 3 * b.y;
        const previous = railSamples.at(-1);
        railLength += Math.hypot(x - previous.x, y - previous.y);
        railSamples.push({ x, y, length: railLength });
      }
    }
    base.setAttribute("d", d); progressPath.setAttribute("d", d);
    progressPath.setAttribute("pathLength", "1");
    progressPath.style.strokeDasharray = "1";
    railLabel.setAttribute("x", "42");
    railLabel.setAttribute("y", String(railHeight - 5));
    pathLength = 1;
    const railBox = route.getBoundingClientRect();
    railLeft = railBox.left; railScale = railBox.width / 84;
    const range = Math.max(1, storyHeight - viewportHeight + cachedHeader);
    railStages.forEach(({ timeline, marker }) => {
      const position = Math.max(0, Math.min(1, (timeline.documentTop - storyTop) / range));
      const point = railPoint(position);
      marker.setAttribute("x", String(point.x - 2.5));
      marker.setAttribute("y", String(point.y - 2.5));
    });
    updateScroll(true);
  }

  function paintRoute() {
    // 真实滚动位置直接映射进度，不按章节或文字项切换落点；反向操作沿原轨道即时回退。
    const start = storyTop - cachedHeader;
    const range = Math.max(1, storyHeight - viewportHeight + cachedHeader);
    const progress = Math.max(0, Math.min(1, (scrollY - start) / range));
    const entry = smooth((scrollY - start) / Math.max(80, viewportHeight * .16));
    const visible = storyWidth > 0 && scrollY > start && scrollY < storyTop + storyHeight;
    distance = progress;
    guideVisible = visible;
    route.style.opacity = visible ? String(entry) : "0";
    guide.style.opacity = "1";
    const point = railPoint(progress);
    guide.setAttribute("transform", `translate(${point.x} ${point.y})`);
    progressPath.style.strokeDashoffset = String(1 - progress);
    railLabel.textContent = `${Math.round(progress * 100)}%`;
    tether.style.opacity = "0";
    sphereHolder.removeAttribute("transform");
    route.dataset.progress = progress.toFixed(5);
    const pointY = point.y;
    railStages.forEach(({ timeline, link, end, marker, name }) => {
      const top = timeline.documentTop - scrollY;
      const bottom = top + timeline.chapterHeight;
      // 入章和离章各自连续淡入淡出，连线换章节时不改变双球的进度坐标。
      const presence = smooth((viewportHeight * .72 - top) / (viewportHeight * .5)) * smooth((bottom - viewportHeight * .2) / (viewportHeight * .4));
      name.style.opacity = String(presence);
      marker.style.setProperty("--node-active", presence.toFixed(4));
      const chapterProgress = Number(timeline.chapter.style.getPropertyValue("--chapter-progress")) || 0;
      const amount = presence * chapterProgress;
      link.style.opacity = String(amount * .55); end.style.opacity = String(amount);
      if (amount < .001) return;
      const sceneTop = isPaused() ? top : Math.min(Math.max(cachedHeader, top), bottom - timeline.sceneHeight);
      const endY = Math.max(30, Math.min(railHeight - 25,
        sceneTop + timeline.contentOffset + timeline.viewportHeight * .45 - railTop));
      const endX = (timeline.contentLeft - railLeft - 7) / Math.max(.1, railScale);
      const bend = Math.max(8, (endX - point.x) * .48);
      link.setAttribute("d", `M ${point.x} ${pointY} C ${point.x + bend} ${pointY}, ${endX - bend} ${endY}, ${endX} ${endY}`);
      end.setAttribute("x", String(endX - 2.5)); end.setAttribute("y", String(endY - 2.5));
    });
  }
  function updateScroll(instant = false) {
    if (window.uiReadingInput?.active) return;
    if (instant) resetScrollSound();
    wantedScroll = scrollY;
    paintRoute();
    sceneDirty = true;
    if (instant || isPaused()) {
      renderedScroll = wantedScroll;
      renderScene();
    }
    schedule();
  }
  function renderScene() {
    sceneDirty = false;
    // 固定轨道不跟随内容滚动补偿，文字仍使用原来的平滑可逆时间轴。
    const paused = isPaused();
    const soundDelta = renderedScroll - soundScroll;
    const soundNow = performance.now(), soundDt = Math.max(8, soundNow - (soundFrameAt || soundNow - 16));
    const soundSpeed = Math.min(4, Math.abs(soundDelta) / soundDt);
    const soundAllowed = !paused && !suspended && !document.hidden && !window.uiReadingInput?.active &&
      (navigationPlayback || !soundNavigation && soundNow < soundIntentUntil) && Math.abs(soundDelta) > .05;
    const direction = Math.sign(soundDelta);
    if (direction && soundDirection && direction !== soundDirection) window.uiSiteAudio?.cancel("scroll");
    if (direction) soundDirection = direction;
    soundScroll = renderedScroll; soundNavigation = Boolean(navigationPlayback); soundFrameAt = soundNow;
    let sound = null;
    const offerSound = (name, priority, detail) => {
      if (!sound || priority > sound.priority || priority === sound.priority && direction > 0) sound = { name, priority, ...detail };
    };
    const geometry = timelines.map((timeline) => {
      const top = timeline.documentTop - renderedScroll;
      const bottom = top + timeline.chapterHeight;
      const sceneTop = paused ? top : Math.min(Math.max(cachedHeader, top), bottom - timeline.sceneHeight);
      return { rect: { top, bottom }, contentTop: paused ? timeline.contentDocumentTop - renderedScroll : sceneTop + timeline.contentOffset };
    });
    timelines.forEach((timeline, index) => {
      const { chapter, content, sheet, units } = timeline;
      const actualRect = geometry[index].rect;
      const rect = actualRect;
      // 远离视口的章节无需逐项写入样式；再次接近时由绝对滚动位置直接恢复，仍可逆。
      if (!paused && (rect.bottom < -viewportHeight || rect.top > viewportHeight * 2)) { timeline.soundReady = false; return; }
      const cursor = Math.max(0, (cachedHeader - rect.top) / timeline.step);
      const indexNow = Math.min(units.length - 1, Math.floor(cursor));
      const phase = Math.max(0, Math.min(1, cursor - indexNow));
      const amount = isPaused() ? 1 : smooth(cursor / .7);
      chapter.style.setProperty("--chapter-progress", amount.toFixed(4));
      const reveals = [];
      // 每项独占一段滚动距离，直接由位置求状态，倒滚严格按逆序收回。
      units.forEach((element, order) => {
        const reveal = isPaused() ? 1 : smooth((cursor - order - .26) / .48);
        reveals.push(reveal);
        const value = reveal.toFixed(4);
        if (element.style.getPropertyValue("--item-reveal") !== value) element.style.setProperty("--item-reveal", value);
        if (element.inert !== (reveal < .08)) element.inert = reveal < .08;
      });
      const previous = Math.max(0, indexNow - 1);
      const move = smooth(phase);
      const center = timeline.centers[previous] + (timeline.centers[indexNow] - timeline.centers[previous]) * move;
      // 能装下一屏时整张模块保持静止；窄屏超长内容才需要阅读镜头。
      const fits = timeline.narrative || timeline.maxPan < 1;
      const pan = isPaused() || fits ? 0 : Math.max(0, Math.min(timeline.maxPan, center - timeline.viewportHeight * .5));
      // 声音沿用同一组显现进度；双阈值锁存防止边界轻微往返时连响。
      const soundFocused = rect.top <= cachedHeader + viewportHeight * .25 && rect.bottom > cachedHeader + viewportHeight * .25;
      if (!timeline.soundReady) {
        timeline.soundUnits = reveals.map((value) => value >= .55);
        timeline.soundEntered = amount >= .5; timeline.soundReady = true;
      } else {
        if (amount >= .5 && !timeline.soundEntered) {
          timeline.soundEntered = true;
          if (soundAllowed && soundFocused && soundDelta > 0) offerSound("scroll-enter", 2, { variant: index });
        } else if (amount <= .2 && timeline.soundEntered) {
          timeline.soundEntered = false;
          if (soundAllowed && soundDelta < 0 && rect.top < viewportHeight * .75) offerSound("scroll-leave", 2, { variant: index });
        }
        reveals.forEach((value, order) => {
          const before = timeline.soundUnits[order];
          const after = value >= .55 ? true : value <= .4 ? false : before;
          timeline.soundUnits[order] = after;
          if (after === before || !soundAllowed || !soundFocused) return;
          const bound = timeline.bounds[order];
          const inView = bound.bottom + timeline.padTop - pan > 16 && bound.top + timeline.padTop - pan < timeline.viewportHeight - 12;
          if (inView && (after ? soundDelta > 0 : soundDelta < 0)) {
            offerSound(after ? "scroll-expand" : "scroll-retract", 1, { variant: timeline.soundRoles[order], rate: .97 + order % 3 * .025,
              durationMs: Math.max(85, Math.min(420, timeline.step * .48 / Math.max(.2, soundSpeed))) });
          }
        });
      }
      sheet.style.setProperty("--sheet-pan", `${pan.toFixed(3)}px`);
      // 标题整组在触及裁切边缘前退场；由镜头位置求状态，回滚仍沿原时间轴恢复。
      const titleTop = timeline.titleIndex < 0 ? 28 : timeline.padTop + timeline.bounds[timeline.titleIndex].top - pan;
      const headingView = isPaused() ? 1 : smooth((titleTop - 8) / 20);
      timeline.title.style.setProperty("--heading-view", headingView.toFixed(4));
      const eyebrowTop = timeline.padTop + timeline.bounds[0].top - pan;
      units[0].style.setProperty("--eyebrow-view", (isPaused() ? 1 : smooth((eyebrowTop - 8) / 16)).toFixed(4));
      if (timeline.narrative) window.uiNarrativeScene?.render(cursor, isPaused());
      // 双栏的控件位置不按纵向排列，整模块使用稳定落点，避免连线反复跳动。
      const readCenter = fits ? timeline.padTop + timeline.sheetHeight * (timeline.narrative ? .62 : .5) : timeline.padTop + center - pan;
      content.style.setProperty("--read-center", `${readCenter.toFixed(3)}px`);
      if (navigationPlayback?.timeline === timeline) {
        content.style.setProperty("--paper-top", "0px");
        content.style.setProperty("--paper-height", "100%");
        content.style.setProperty("--paper-origin", "50%");
      } else if (!isPaused()) {
        // 纸面只包住已显现的内容；边界也跟随同一进度，上滚时连续收回。
        let revealedBottom = timeline.bounds[0].top;
        timeline.bounds.forEach((bound, order) => {
          revealedBottom += Math.max(0, bound.bottom - revealedBottom) * reveals[order];
        });
        const paperTop = Math.max(0, Math.min(timeline.padTop + timeline.bounds[0].top - pan - 16, readCenter - 24));
        const paperBottom = Math.min(timeline.viewportHeight, Math.max(timeline.padTop + revealedBottom - pan + 22, readCenter + 24));
        content.style.setProperty("--paper-top", `${paperTop.toFixed(3)}px`);
        content.style.setProperty("--paper-height", `${Math.max(44, paperBottom - paperTop).toFixed(3)}px`);
        content.style.setProperty("--paper-origin", `${(readCenter - paperTop).toFixed(3)}px`);
      } else {
        content.style.setProperty("--paper-top", "0px");
        content.style.setProperty("--paper-height", "100%");
        content.style.setProperty("--paper-origin", "50%");
      }
      chapter.dataset.timeline = cursor.toFixed(4);
      timeline.hint.textContent = cursor > units.length + .4 ?
        (index === timelines.length - 1 ? "向上滚动，逆序收回" : "继续滚动，进入下一章") : "继续滚动，逐项展开；下划线文字可点击";
    });
    // 同帧跨过多组只响一次，已经越过的内容不进入声音队列。
    if (sound) window.uiSiteAudio?.play(sound.name, { ...sound, scope: "scroll", direction,
      gain: .85 + Math.min(.25, soundSpeed * .12), intervalMs: Math.max(110, 230 - soundSpeed * 45) });
    paintRoute();
  }

  function resetScrollSound() {
    soundIntentUntil = 0; soundScroll = renderedScroll;
    soundFrameAt = 0; soundDirection = 0;
    window.uiSiteAudio?.cancel("scroll");
    timelines.forEach((timeline) => { timeline.soundReady = false; });
  }
  function scrollSoundIntent(event) {
    if (event.type === "keydown" && (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key) || event.target.closest?.('input,textarea,select,button,[contenteditable="true"]'))) return;
    if (window.uiReadingInput?.active || suspended || document.hidden) return;
    soundIntentUntil = performance.now() + 1200;
  }

  const study = document.getElementById("motionStudyCanvas");
  const phaseButtons = [...document.querySelectorAll("[data-motion-phase]")];
  const descriptions = {
    growth: "轮廓先出现，经纬线向两极生长；青灰球稍晚跟随。",
    anticipation: "先向外蓄力，再快速靠近；横向挤压伴随纵向伸展。",
    rebound: "主体回弹逐渐衰减，青灰球延迟跟随。",
    settle: "同一组球体沿弧线缩小、落位，接上稳定构图。"
  };
  let studyPhase = "growth", studyStart = 0, studyActive = false, studyAudible = false, studySoundAt = -1;
  const studyScore = {
    growth: [{ at: .08, name: "pose" }, { at: .5, name: "open", accentMs: 180, durationMs: 240 }, { at: 1.42, name: "motion-land" }],
    anticipation: [{ at: 0, name: "motion-prepare" }, { at: .65, name: "motion-pull", accentMs: 275, durationMs: 550 }, { at: 1.2, name: "motion-land" }],
    rebound: [{ at: .14, name: "motion-land" }, { at: .23, name: "motion-follow" }],
    settle: [{ at: .12, name: "motion-settle" }, { at: 2, name: "motion-land" }]
  };
  const studyDuration = 2.6;
  function drawStudy(elapsed) {
    const t = Math.max(0, Math.min(studyDuration, elapsed));
    if (studyAudible && studyActive && !isPaused()) {
      for (const cue of studyScore[studyPhase]) if (cue.at > studySoundAt && cue.at <= t && t - cue.at < .15) {
        window.uiSiteAudio?.play(cue.name, { ...cue, scope: "study", accentMs: Math.max(0, (cue.accentMs || 0) - (t - cue.at) * 1000),
          variant: phaseButtons.findIndex((item) => item.dataset.motionPhase === studyPhase) });
      }
    }
    studySoundAt = t;
    let pose = {};
    if (studyPhase === "growth") {
      pose = { growthA: 0.14 + 0.86 * smooth(t / 1.3),
        growthB: 0.06 + 0.94 * smooth((t - 0.12) / 1.3), connection: smooth((t - 0.5) / 1.4) };
    } else if (studyPhase === "anticipation") {
      const ready = smooth(t / 0.65), pull = smooth((t - 0.65) / 0.55);
      pose = { distance: (1 + ready * 0.4) * (1 - pull) + 0.48 * pull,
        distanceB: (1 + ready * 0.4) * (1 - pull) + 0.48 * pull,
        squashA: 1 - Math.sin(pull * Math.PI) * 0.12,
        squashB: 1 - Math.sin(pull * Math.PI) * 0.09 };
    } else if (studyPhase === "rebound") {
      const a = Math.sin(t * 9) * Math.exp(-t * 2.9);
      const delay = Math.max(0, t - 0.09);
      const b = Math.sin(delay * 9) * Math.exp(-delay * 2.9);
      pose = { distance: 0.8 + a * 0.25, distanceB: 0.8 + b * 0.22,
        squashA: 1 + a * 0.12, squashB: 1 + b * 0.1 };
    } else {
      const amount = smooth(t / 2), arc = Math.sin(amount * Math.PI);
      pose = { scale: 1.35 - amount * 0.5, x: amount * 0.12,
        y: -arc * 0.09, distance: 1.2 - amount * 0.2, distanceB: 1.2 - amount * 0.2 };
    }
    window.uiRelationVisual?.preview(study, pose, 3.2 + t);
  }
  function playStudy(phase, audible = false) {
    window.uiSiteAudio?.cancel("study"); studyAudible = audible; studySoundAt = -1;
    studyPhase = phase; studyStart = performance.now(); studyActive = !isPaused();
    phaseButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.motionPhase === phase)));
    document.getElementById("motionStatus").textContent = descriptions[phase] + (isPaused() ? " 当前显示动作结束姿态。" : "");
    if (audible && !studyActive) window.uiSiteAudio?.play("pose", { scope: "study" });
    drawStudy(studyActive ? 0 : studyDuration); schedule();
  }
  phaseButtons.forEach((button) => button.addEventListener("click", () => playStudy(button.dataset.motionPhase, true)));
  new IntersectionObserver(([entry]) => {
    studyVisible = entry.isIntersecting;
    if (studyVisible && !studyPlayed) { studyPlayed = true; playStudy(studyPhase); }
    else if (!studyVisible) { studyActive = false; studyAudible = false; window.uiSiteAudio?.cancel("study"); }
    else if (studyActive) { studyStart = performance.now(); schedule(); }
  }, { threshold: 0.15 }).observe(study);
  function tick(now) {
    frame = 0;
    if (document.hidden || suspended || window.uiReadingInput?.active) return;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.06) : 0.016;
    lastTime = now;
    if (navigationPlayback) {
      const playback = navigationPlayback;
      const amount = Math.max(0, Math.min(1, (now - playback.started) / playback.duration));
      // 导航主动走过本章的同一时间轴，停下或反向操作即接回真实滚动位置。
      const cursor = playback.from + (playback.to - playback.from) * smooth(amount);
      window.scrollTo({ top: playback.timeline.documentTop - cachedHeader + cursor * playback.timeline.step, behavior: "instant" });
      wantedScroll = scrollY; renderedScroll = wantedScroll; sceneDirty = true;
      if (amount >= 1) navigationPlayback = null;
    }
    if (sceneDirty || Math.abs(wantedScroll - renderedScroll) > .05) {
      renderedScroll += (wantedScroll - renderedScroll) * (1 - Math.exp(-dt * 16));
      if (Math.abs(wantedScroll - renderedScroll) < .05) renderedScroll = wantedScroll;
      renderScene();
    }
    if (guideVisible && !isPaused()) {
      guideTime += dt;
      // 小尺寸双球按30帧更新，离开可见区域后停止，避免持续消耗绘制资源。
      if (now - lastGuidePaint >= 1000 / 30) {
        window.uiRelationVisual?.guide(guideCanvas, distance / Math.max(1, pathLength), guideTime);
        lastGuidePaint = now;
      }
    }
    if (studyActive && studyVisible) {
      const elapsed = (now - studyStart) / 1000;
      drawStudy(elapsed);
      if (elapsed >= studyDuration) studyActive = false;
    }
    if (navigationPlayback || sceneDirty || Math.abs(wantedScroll - renderedScroll) > .05 || studyActive && studyVisible || guideVisible && !isPaused()) schedule();
  }
  function schedule() {
    if (!frame && !document.hidden && !suspended) frame = requestAnimationFrame(tick);
  }
  window.addEventListener("scroll", () => updateScroll(), { passive: true });
  window.addEventListener("resize", () => {
    // 手机地址栏展开只改变动态视口，不应重排整条长时间轴。
    if (window.uiReadingInput?.active || innerWidth === viewportWidth && (innerWidth <= 640 || Math.abs(innerHeight - viewportHeight) < 160)) return;
    navigationPlayback = null;
    viewportWidth = innerWidth; viewportHeight = innerHeight;
    layoutRoute(); drawStudy(studyDuration);
  });
  window.addEventListener("ui-reading-resume", () => {
    if (innerWidth !== viewportWidth) { viewportWidth = innerWidth; viewportHeight = innerHeight; }
    lastTime = 0; layoutRoute(); updateScroll(true);
  });
  const routeResize = new ResizeObserver(layoutRoute);
  routeResize.observe(story);
  timelines.forEach((timeline) => routeResize.observe(timeline.sheet));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { navigationPlayback = null; cancelAnimationFrame(frame); frame = 0; studyActive = false; studyAudible = false; window.uiSiteAudio?.cancel("study"); }
    else { lastTime = 0; updateScroll(true); }
  });
  function syncMotion() {
    window.uiSiteAudio?.cancel("study"); studyAudible = false;
    if (isPaused()) { navigationPlayback = null; studyActive = false; drawStudy(studyDuration); }
    layoutRoute();
  }
  reduced.addEventListener("change", syncMotion);
  new MutationObserver(syncMotion).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("site-mode-change", () => requestAnimationFrame(layoutRoute));

  const textNode = (tag, text, className) => {
    const node = document.createElement(tag); node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  window.uiStoryScene = {
    navigate(id) {
      const timeline = timelines.find((item) => item.chapter.id === id);
      if (!timeline) return false;
      layoutRoute();
      const from = 1.8, to = timeline.units.length + .8;
      navigationPlayback = isPaused() ? null : {
        timeline, from, to, started: performance.now(), duration: Math.min(3200, 700 + timeline.units.length * 140)
      };
      window.scrollTo({ top: timeline.documentTop - cachedHeader + (isPaused() ? to : from) * timeline.step, behavior: "instant" });
      updateScroll(true); return true;
    },
    setDetailOpen(open) {
      navigationPlayback = null;
      suspended = Boolean(open);
      if (suspended) { cancelAnimationFrame(frame); frame = 0; studyActive = false; }
      else { lastTime = 0; layoutRoute(); updateScroll(true); }
    }
  };
  const interruptNavigation = () => { if (navigationPlayback) { navigationPlayback = null; updateScroll(true); } };
  window.addEventListener("wheel", interruptNavigation, { passive: true });
  window.addEventListener("touchstart", interruptNavigation, { passive: true });
  document.addEventListener("pointerdown", interruptNavigation, { passive: true });
  document.addEventListener("keydown", interruptNavigation);
  // 注册在导航打断之后，用户接管滚动时先重建基线，再启用当前手势的声音。
  window.addEventListener("wheel", scrollSoundIntent, { passive: true });
  window.addEventListener("touchmove", scrollSoundIntent, { passive: true });
  document.addEventListener("keydown", scrollSoundIntent);
  document.getElementById("replayWholeIntro").addEventListener("click", () => {
    window.setView("home");
    requestAnimationFrame(() => document.getElementById("introReplay").click());
  });

  const lab = document.getElementById("visualLab");
  const trust = document.getElementById("labTrust"), doubt = document.getElementById("labDoubt");
  const presets = { neutral: [25, 20], trust: [85, 15], doubt: [20, 85], conflict: [85, 85] };
  const captions = {
    neutral: "保持距离，信息清晰，情绪尚未靠近。",
    trust: "暖色与舒展的形态表达亲近，文字内容保持相同。",
    doubt: "青灰与收紧的轮廓表达警觉，文字内容保持相同。",
    conflict: "温暖与冷硬线索同时出现，表达想相信又察觉异常。"
  };
  function updateLab() {
    const t = Number(trust.value), d = Number(doubt.value);
    const state = t >= 55 ? d >= 55 ? "conflict" : "trust" : d >= 55 ? "doubt" : "neutral";
    lab.dataset.state = state;
    const color = [250 - t * 0.025 - d * 0.15, 248 - t * 0.15 - d * 0.045, 244 - t * 0.22 - d * 0.015];
    lab.style.setProperty("--lab-background", `rgb(${color.map(Math.round).join(",")})`);
    lab.style.setProperty("--lab-radius", `${Math.max(2, 5 + t * 0.18 - d * 0.10)}px`);
    document.getElementById("labTrustValue").textContent = String(t);
    document.getElementById("labDoubtValue").textContent = String(d);
    document.getElementById("labCaption").textContent = captions[state];
    document.querySelectorAll("[data-lab-state]").forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.labState === state)));
  }
  document.querySelectorAll("[data-lab-state]").forEach((button) => button.addEventListener("click", () => {
    const changed = button.getAttribute("aria-pressed") !== "true";
    [trust.value, doubt.value] = presets[button.dataset.labState]; updateLab();
    if (changed) window.uiSiteAudio?.play("tick");
  }));
  trust.addEventListener("input", updateLab); doubt.addEventListener("input", updateLab);
  updateLab();

  const storageKey = "ui-story-evidence-v1";
  const evidence = { views: 0, entry: 0, started: 0, completed: 0, startIds: [], finishIds: [], feedback: [] };
  let persistent = true, lastFeedback = "", lastRemoteSignature = "", lastRemoteId = "";
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved && typeof saved === "object") {
      for (const key of ["views", "entry", "started", "completed"])
        evidence[key] = Number.isFinite(saved[key]) ? Math.max(0, Math.floor(saved[key])) : 0;
      for (const key of ["startIds", "finishIds"])
        evidence[key] = Array.isArray(saved[key]) ? saved[key].filter((value) => typeof value === "string").slice(-200) : [];
      evidence.feedback = Array.isArray(saved.feedback) ? saved.feedback.filter((item) =>
        item && ["willing", "cautious", "uncertain"].includes(item.impression) && typeof item.comment === "string").slice(-40) : [];
    }
  } catch { persistent = false; }
  const impressions = { willing: "更愿意相信", cautious: "更谨慎", uncertain: "说不清" };
  function updateEvidence() {
    try { localStorage.setItem(storageKey, JSON.stringify(evidence)); } catch { persistent = false; }
    document.getElementById("metricViews").textContent = evidence.views;
    document.getElementById("metricEntry").textContent = evidence.entry;
    document.getElementById("metricCompleted").textContent = evidence.completed;
    document.getElementById("metricRate").textContent = evidence.started ? `${Math.round(evidence.completed / evidence.started * 100)}%` : "—";
    document.getElementById("metricRateLabel").textContent = evidence.started ? `完成率 · 开始 ${evidence.started} 局` : "尚未开始对局";
    document.getElementById("evidenceStorageNote").textContent = persistent ?
      "上方数字只属于当前浏览器；已提交反馈由设计者另行汇总，不代表全站浏览量或独立人数。" : "当前浏览器无法保存，数字仅在本次打开期间保留。";
    const list = document.getElementById("feedbackList"); list.replaceChildren();
    evidence.feedback.slice(-3).reverse().forEach((item) => {
      const entry = document.createElement("p");
      entry.append(textNode("strong", impressions[item.impression]), textNode("span", item.comment || "未补充文字。"));
      list.append(entry);
    });
  }
  evidence.views++; updateEvidence();
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-prepare-match]")) { evidence.entry++; updateEvidence(); }
  }, { capture: true });
  document.addEventListener("ui-match-event", ({ detail }) => {
    if (detail.type === "match_start" && !evidence.startIds.includes(detail.matchId)) {
      evidence.started++; evidence.startIds.push(detail.matchId); evidence.startIds = evidence.startIds.slice(-200);
    } else if (detail.type === "settlement" && !evidence.finishIds.includes(detail.matchId)) {
      evidence.completed++; evidence.finishIds.push(detail.matchId); evidence.finishIds = evidence.finishIds.slice(-200);
    } else return;
    updateEvidence();
  });
  document.getElementById("storyFeedback").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const impression = data.get("impression"), comment = String(data.get("comment") || "").trim().slice(0, 280);
    const signature = `${impression}:${comment}`;
    if (signature !== lastFeedback) {
      evidence.feedback.push({ impression, comment, timestamp: new Date().toISOString() });
      evidence.feedback = evidence.feedback.slice(-40); lastFeedback = signature; updateEvidence();
    }
    const output = document.getElementById("feedbackStatus"), submit = form.querySelector('[type="submit"]');
    if (!window.uiRecords?.sendFeedback) { output.textContent = "反馈已保存在当前浏览器，可导出本机记录。"; return; }
    submit.disabled = true; output.textContent = "正在提交给设计者…";
    try {
      const result = await window.uiRecords.sendFeedback({ impression, comment }, signature === lastRemoteSignature ? lastRemoteId : undefined);
      lastRemoteSignature = signature; lastRemoteId = result.id || "";
      output.textContent = result.state === "sent" ? "已送达设计者，谢谢你的反馈。" : result.state === "pending" ?
        result.persisted ? "暂未送达，已在本机暂存；恢复连接后自动重试。" : "暂未送达，请保持本页打开并稍后重试。" :
        result.state === "full" ? "本机待发送记录已满，请恢复连接后重试。" : "这条反馈未被接收，请检查内容后重试。";
      if (result.state === "sent") window.uiSiteAudio?.play("ack");
      else if (result.state === "full" || result.state === "rejected") window.uiSiteAudio?.play("error");
      if (result.state === "rejected") lastRemoteId = "";
    } catch { output.textContent = "暂未确认送达，本机反馈已保留，可稍后重试。"; }
    finally { submit.disabled = false; }
  });
  document.addEventListener("ui-record-saved", ({ detail }) => {
    if (detail.id === lastRemoteId) document.getElementById("feedbackStatus").textContent = "已送达设计者，谢谢你的反馈。";
  });
  document.addEventListener("ui-record-rejected", ({ detail }) => {
    if (detail.id === lastRemoteId) {
      lastRemoteId = "";
      document.getElementById("feedbackStatus").textContent = "这条反馈未被接收，请检查内容后重试。";
    }
  });
  document.getElementById("exportEvidence").addEventListener("click", () => {
    const data = { scope: "当前浏览器本机记录，非全站或独立访客统计", exportedAt: new Date().toISOString(),
      views: evidence.views, entryClicks: evidence.entry, started: evidence.started, completed: evidence.completed,
      feedback: evidence.feedback };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "信界-本机体验记录.json";
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  layoutRoute(); drawStudy(studyDuration);
})();
