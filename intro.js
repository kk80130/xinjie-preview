(() => {
  "use strict";
  const overlay = document.getElementById("introOverlay");
  const visual = window.uiRelationVisual;
  const canvas = visual?.canvas;
  const skip = document.getElementById("introOverlaySkip");
  const replay = document.getElementById("introReplay");
  const main = document.querySelector("main");
  const header = document.querySelector(".topbar");
  if (!overlay || !canvas || !skip || !replay) return;
  const ctx = visual.ctx;
  if (!ctx) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const duration = 6;
  const storageKey = "ui-cinematic-v4-seen";
  const warm = "#b85b44", cool = "#406a74", ink = "#2d2925";
  let w = 1, h = 1, active = false, raf = 0, startedAt = 0, hiddenAt = 0;
  let returnFocus = null, elapsed = 0, previousElapsed = 0;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const smooth = (v) => { const x = clamp(v); return x * x * (3 - 2 * x); };
  const cubicOut = (v) => 1 - (1 - clamp(v)) ** 3;
  // 使用固定种子，重播保持相同构图，不在逐帧绘制中随机闪烁。
  const waveParticles = Array.from({ length: 176 }, (_, i) => ({
    angle: i * 2.399963,
    lag: i % 4 === 3 ? 0.16 + (i % 7) * 0.018 : (i % 5) * 0.012,
    speed: 1 + Math.sin(i * 2.17) * 0.045,
    size: 0.85 + ((i * 7) % 9) / 8 * 0.8,
    warm: i % 2 === 0
  }));

  function wavePoint(particle, age, unit) {
    const radius = unit * (0.018 + cubicOut(age / 1.18) * 0.78) * particle.speed;
    const angle = particle.angle + Math.sin(age * 1.45) * 0.16;
    const px = Math.cos(angle) * radius, py = Math.sin(angle) * radius * 0.58;
    return { x: px * 0.9553 + py * 0.2955, y: py * 0.9553 - px * 0.2955 };
  }


  function resize() {
    w = innerWidth; h = innerHeight;
    if (active) draw(elapsed);
  }

  function draw(t) {
    const mobile = w < 700, unit = Math.min(w, h);
    const growthA = 0.14 + 0.86 * smooth(t / 1.05);
    const growthB = 0.06 + 0.94 * smooth((t - 0.12) / 1.08);
    const connection = smooth((t - 0.55) / 1.45);
    const prepare = smooth((t - 1.2) / 0.28);
    const rush = smooth((t - 1.48) / 0.52);
    const recoilAge = Math.max(0, t - 2);
    const rebound = (lag) => {
      const age = t - 2 - lag;
      return age > 0 ? Math.sin(age * 9) * Math.exp(-age * 2.9) : 0;
    };
    const recoilA = rebound(0), recoilB = rebound(0.09);
    const settle = smooth((t - 3.2) / 2.3);
    const landing = visual.landingLayout();
    const radius = unit * 0.48 * (1 - settle) + landing.radius * settle;
    const arc = Math.sin(settle * Math.PI);
    const x = w * 0.5 * (1 - settle) + landing.x * settle + arc * unit * 0.025;
    const y = h * 0.5 * (1 - settle) + landing.y * settle - arc * unit * 0.07;
    const opening = smooth((t - 4.4) / 1.1);
    const separation = (1.45 + prepare * 0.20) * (1 - rush) + 0.48 * rush;
    const distance = (separation + recoilA * 0.20) * (1 - settle) + settle;
    const distanceB = (separation + recoilB * 0.17) * (1 - settle) + settle;
    const squashA = 1 - Math.sin(rush * Math.PI) * 0.10 + recoilA * 0.09 * (1 - settle);
    const squashB = 1 - Math.sin(rush * Math.PI) * 0.08 + recoilB * 0.08 * (1 - settle);
    // 生长只改变同一模型的可见线段；结尾参数全部归一，沿用首页的旋转时钟。
    visual.render({ x, y, radius, distance, distanceB, squashA, squashB,
      growthA, growthB, connection, cover: 1 - opening }, t - previousElapsed);
    previousElapsed = t;

    ctx.save();
    if (t > 2 && t < 3.9) {
      // 两球连接的交汇处发出粒子前沿，延迟的碎粒跟随同一弧线，没有实体圆环。
      const originX = x + radius * (-0.60 * distance + 0.56 * distanceB) / 2;
      const originY = y + radius * (-0.50 * distance + 0.59 * distanceB) / 2;
      const count = mobile ? 112 : waveParticles.length;
      for (let i = 0; i < count; i++) {
        const particle = waveParticles[i];
        const age = recoilAge - particle.lag;
        if (age <= 0 || age >= 1.6) continue;
        const opacity = smooth(age / 0.075) * (1 - smooth((age - 0.46) / 1.14));
        const point = wavePoint(particle, age, unit);
        const tail = wavePoint(particle, Math.max(0, age - 0.035), unit);
        const color = particle.warm ? warm : cool;
        ctx.globalAlpha = opacity * 0.45;
        ctx.strokeStyle = color; ctx.lineWidth = particle.size * 0.65;
        ctx.beginPath(); ctx.moveTo(originX + tail.x, originY + tail.y);
        ctx.lineTo(originX + point.x, originY + point.y); ctx.stroke();
        ctx.globalAlpha = opacity * 0.92; ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(originX + point.x, originY + point.y,
          particle.size * (1.1 + 0.3 * Math.exp(-age * 3)), 0, Math.PI * 2); ctx.fill();
      }
    }
    const typeSize = unit * (mobile ? 0.32 : 0.31);
    ctx.font = `400 ${typeSize}px Impact, "Arial Narrow", sans-serif`;
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    const typeOpacity = 1 - smooth((t - 1.55) / 0.85);
    ctx.globalAlpha = typeOpacity;
    const letterGap = unit * (0.37 * (1 - rush) + 0.22 * rush);
    ctx.fillStyle = ink;
    ctx.fillText("YOU", w * 0.5 - letterGap * (mobile ? 0.6 : 0.95), h * 0.5 - (mobile ? unit * 0.2 : 0));
    ctx.fillStyle = warm;
    ctx.fillText("I", w * 0.5 + letterGap * (mobile ? 0.75 : 1.05), h * 0.5 + (mobile ? unit * 0.25 : 0));
    ctx.globalAlpha = typeOpacity * rush;
    ctx.font = `italic ${typeSize * 0.62}px Georgia, serif`; ctx.fillStyle = cool;
    ctx.fillText("&", w * 0.5 + unit * 0.055, h * 0.5);
    ctx.restore();
    overlay.dataset.phase = t < 1.2 ? "生长" : t < 1.48 ? "蓄力" : t < 2 ? "牵引" : t < 3.2 ? "粒子扩散" : "收束";
  }

  const soundMarks = [
    { at: .12, name: "pose" },
    { at: 1.2, name: "motion-prepare" },
    { at: 1.48, name: "motion-pull", accentMs: 260, durationMs: 520 },
    { at: 2, name: "motion-land" },
    { at: 4.15, name: "motion-settle", accentMs: 180, durationMs: 420 },
    { at: 5.5, name: "ack", gain: .65 }
  ];
  let soundAt = 0;
  function tick(now) {
    raf = 0;
    if (!active || document.hidden) return;
    // 时间轴使用真实经过时间，掉帧只跳过中间帧，不把6秒动画拖成长等待。
    elapsed = (now - startedAt) / 1000;
    for (const cue of soundMarks) if (cue.at > soundAt && cue.at <= elapsed && elapsed - cue.at < .15) {
      window.uiSiteAudio?.play(cue.name, { ...cue, scope: "intro", accentMs: Math.max(0, (cue.accentMs || 0) - (elapsed - cue.at) * 1000) });
    }
    soundAt = elapsed;
    if (elapsed >= duration) { draw(duration); finish(); return; }
    draw(elapsed);
    raf = requestAnimationFrame(tick);
  }
  function finish() {
    window.uiSiteAudio?.cancel("intro");
    active = false; cancelAnimationFrame(raf); raf = 0;
    try { visual.end(); }
    finally {
      overlay.hidden = true;
      main.inert = false; header.inert = false;
      document.documentElement.classList.remove("intro-running");
      // 开场落位对应首页，不能让浏览器恢复到尚未展开的章节空帧。
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    try { sessionStorage.setItem(storageKey, "yes"); } catch {}
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function play(fromReplay) {
    if (reduced.matches) return;
    returnFocus = fromReplay ? replay : document.querySelector(".hero-enter");
    // 预览地址可能保留章节锚点；播放开场时清除，防止加载后再次自动跳转。
    if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
    window.scrollTo({ top: 0, behavior: "instant" });
    window.uiSiteAudio?.cancel("intro"); soundAt = 0;
    active = true; elapsed = 0; previousElapsed = 0; hiddenAt = 0;
    overlay.hidden = false;
    main.inert = true; header.inert = true;
    document.documentElement.classList.add("intro-running");
    visual.begin(overlay);
    resize(); startedAt = performance.now(); draw(0);
    skip.focus({ preventScroll: true });
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  skip.addEventListener("click", () => { finish(); window.uiSiteAudio?.play("pause"); });
  replay.addEventListener("click", () => play(true));
  document.addEventListener("keydown", (event) => {
    if (active && event.key === "Escape") { event.preventDefault(); finish(); }
  });
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (!active) return;
    if (document.hidden) { hiddenAt = performance.now(); cancelAnimationFrame(raf); raf = 0; window.uiSiteAudio?.cancel("intro"); }
    else {
      if (hiddenAt) startedAt += performance.now() - hiddenAt;
      hiddenAt = 0; raf = requestAnimationFrame(tick);
    }
  });
  reduced.addEventListener("change", () => { if (reduced.matches && active) finish(); });
  let seen = false;
  try { seen = sessionStorage.getItem(storageKey) === "yes"; } catch {}
  if (!seen && !reduced.matches) play(false);
})();
