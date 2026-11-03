(() => {
  "use strict";
  const canvas = document.getElementById("relationCanvas");
  const hero = document.querySelector(".attraction-hero");
  const toggle = document.getElementById("motionToggle");
  const replay = document.getElementById("introReplay");
  if (!canvas || !hero || !toggle) return;
  let ctx = canvas.getContext("2d");
  if (!ctx) {
    toggle.hidden = true;
    hero.classList.add("visual-fallback");
    return;
  }
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let width = 1, height = 1, clock = 0, lastTime = 0, frame = 0;
  let paused = reduced.matches, visible = true;
  let playing = false;
  let cinematicActive = false;
  let cinematicScene = null;
  const canvasParent = canvas.parentNode;
  const canvasNext = canvas.nextSibling;
  const target = { x: 0, y: 0, strength: 0 };
  const follower = { x: 0, y: 0, strength: 0, vx: 0, vy: 0 };
  const secondary = { x: 0, y: 0 };
  let impulseAge = 10, hoverAge = 10;
  const warm = [184, 91, 68], cool = [64, 106, 116];
  const tiltSin = Math.sin(0.48), tiltCos = Math.cos(0.48);
  let projectedAngle = NaN, rotationSin = 0, rotationCos = 1;
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const ease = (x) => {
    const v = Math.max(0, Math.min(1, x));
    return v * v * (3 - 2 * v);
  };

  // 弹簧位移与滞后的第二层分开，形成主动作、跟随和重叠，而非所有元素同步追随鼠标。
  function update(dt) {
    const step = Math.min(dt, 0.035);
    hoverAge += step;
    // 指针首次靠近时先轻微反向蓄力；之后追随连续输入，移出沿当前速度收束。
    const ready = target.strength && hoverAge < .08 ? -.12 * Math.sin(hoverAge / .08 * Math.PI) : 1;
    follower.vx += ((target.x * ready - follower.x) * 45 - follower.vx * 11) * step;
    follower.vy += ((target.y * ready - follower.y) * 45 - follower.vy * 11) * step;
    follower.x += follower.vx * step;
    follower.y += follower.vy * step;
    follower.strength += (target.strength - follower.strength) * (1 - Math.exp(-step * 3));
    secondary.x += (follower.x - secondary.x) * (1 - Math.exp(-step * 5));
    secondary.y += (follower.y - secondary.y) * (1 - Math.exp(-step * 5));
    impulseAge += step;
  }

  function project(x, y, z, center, radius, angle) {
    // 一圈线框共享旋转矩阵，缓存三角函数，避免每个顶点重复计算。
    if (angle !== projectedAngle) {
      projectedAngle = angle; rotationSin = Math.sin(angle); rotationCos = Math.cos(angle);
    }
    const yy = y * tiltCos - z * tiltSin;
    const zz = y * tiltSin + z * tiltCos;
    const xx = x * rotationCos + zz * rotationSin;
    const depth = -x * rotationSin + zz * rotationCos;
    const perspective = 3.7 / (3.7 - depth);
    return { x: center.x + xx * radius * perspective,
      y: center.y + yy * radius * perspective, depth };
  }

  function orb(center, radius, color, direction, growth, deformation = 1, reactive = false, miniature = false) {
    const spin = clock * 0.115 * direction + direction * 0.5 + follower.x * 0.11;
    const squash = deformation * (1 + (reactive ? impulse(direction === 1 ? 0 : .06) : 0));
    // 两个水平轴取平方根，竖轴取倒数，三轴乘积为1，保持空间体积。
    const breadth = Math.sqrt(Math.max(.7, squash));
    const rings = miniature ? 8 : 19, segments = miniature ? 24 : 64;
    const meridians = miniature ? 10 : 22, meridianSegments = miniature ? 18 : 42;
    const orbitSegments = miniature ? 32 : 100;
    ctx.lineWidth = 0.8;
    for (let r = 0; r < rings; r++) {
      const latitude = Math.PI * (r + 1) / (rings + 1);
      // 先长出中部轮廓，再向两极铺开，避免所有线条同时淡入。
      const order = Math.abs(r - (rings - 1) / 2) / ((rings - 1) / 2);
      const reveal = ease((growth - order * 0.60) * 3);
      if (!reveal) continue;
      ctx.beginPath();
      for (let s = 0; s <= Math.ceil(segments * reveal); s++) {
        const longitude = Math.min(s, segments * reveal) / segments * Math.PI * 2;
        const faceting = 1 + 0.085 * Math.cos(longitude * 6 + latitude * 4 + clock * 0.2 * direction);
        const p = project(Math.sin(latitude) * Math.cos(longitude) * faceting * breadth,
          Math.cos(latitude) / squash, Math.sin(latitude) * Math.sin(longitude) * faceting * breadth,
          center, radius, spin);
        if (!s) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = rgba(color, 0.24 + Math.sin(latitude) * 0.32);
      ctx.stroke();
      if (growth < 1 && reveal < 1 && r % 3 === 0) {
        const longitude = reveal * Math.PI * 2;
        const faceting = 1 + 0.085 * Math.cos(longitude * 6 + latitude * 4 + clock * 0.2 * direction);
        const tip = project(Math.sin(latitude) * Math.cos(longitude) * faceting * breadth,
          Math.cos(latitude) / squash, Math.sin(latitude) * Math.sin(longitude) * faceting * breadth,
          center, radius, spin);
        ctx.beginPath(); ctx.arc(tip.x, tip.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = rgba(color, 0.8); ctx.fill();
      }
    }
    for (let m = 0; m < meridians; m++) {
      const longitude = m / meridians * Math.PI * 2;
      const reveal = ease((growth - m / meridians * 0.5) * 3);
      if (!reveal) continue;
      ctx.beginPath();
      for (let s = 0; s <= Math.ceil(meridianSegments * reveal); s++) {
        const latitude = Math.min(s, meridianSegments * reveal) / meridianSegments * Math.PI;
        const twist = longitude + Math.sin(latitude * 3 + clock * 0.15) * 0.18;
        const p = project(Math.sin(latitude) * Math.cos(twist) * breadth,
          Math.cos(latitude) / squash, Math.sin(latitude) * Math.sin(twist) * breadth,
          center, radius * 1.025, spin);
        if (!s) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = rgba(color, 0.30);
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius * 1.6);
    glow.addColorStop(0, rgba(color, 0.08 * growth)); glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow; ctx.fillRect(center.x - radius * 2, center.y - radius * 2, radius * 4, radius * 4);
    // 外轨道使用倾斜的空间圆弧，为两个核心保留独立的轮廓和运动方向。
    for (let k = 0; k < 3; k++) {
      const reveal = ease((growth - k * 0.1) * 1.4);
      if (!reveal) continue;
      ctx.beginPath();
      for (let s = 0; s <= Math.ceil(orbitSegments * reveal); s++) {
        const a = Math.min(s, orbitSegments * reveal) / orbitSegments * Math.PI * 2;
        const p = project(Math.cos(a) * (1.25 + k * 0.12), Math.sin(a) * 0.35,
          Math.sin(a) * (1.1 + k * 0.1), center, radius, spin + k * 0.7);
        if (!s) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = rgba(color, k ? 0.12 : 0.38); ctx.stroke();
    }
  }

  function impulse(delay = 0) {
    // 按下先短暂收缩，随后伸展回弹；面积近似守恒，避免把挤压拉伸变成任意缩放。
    const age = Math.max(0, impulseAge - delay);
    if (age < 0.1) return -0.045 * ease(age / .1);
    const t = age - .1;
    // 释放从蓄力的末姿势开始，避免旧曲线在0.12秒处跳变。
    return Math.exp(-t * 5) * (-.045 * Math.cos(t * 13) + .075 * Math.sin(t * 13));
  }

  function landingLayout() {
    const rect = hero.getBoundingClientRect();
    const small = rect.width < 700;
    return { x: rect.left + rect.width * (small ? 0.55 : 0.74),
      y: rect.top + rect.height * (small ? 0.70 : 0.48),
      radius: Math.min(rect.width * (small ? 0.22 : 0.145), rect.height * 0.245) };
  }
  function draw(scene = null) {
    ctx.clearRect(0, 0, width, height);
    if (scene) {
      ctx.fillStyle = `rgba(238,231,220,${scene.cover})`;
      ctx.fillRect(0, 0, width, height);
    }
    const small = width < 700;
    const radius = scene ? scene.radius : Math.min(width * (small ? 0.22 : 0.145), height * 0.245);
    const growthA = scene ? scene.growthA : 1;
    const growthB = scene ? scene.growthB : 1;
    const ox = follower.x * radius * 0.15;
    const oy = follower.y * radius * 0.15;
    const baseX = scene ? scene.x : width * (small ? 0.55 : 0.74);
    const baseY = scene ? scene.y : height * (small ? 0.70 : 0.48);
    const distance = scene ? scene.distance : 1;
    const a = { x: baseX - radius * 0.60 * distance + ox,
      y: baseY - radius * 0.50 * distance + oy };
    const distanceB = scene ? scene.distanceB : 1;
    const b = { x: baseX + radius * 0.56 * distanceB - secondary.x * radius * 0.14,
      y: baseY + radius * 0.59 * distanceB - secondary.y * radius * 0.18 };
    const breathe = 1 + Math.sin(clock * 0.65) * 0.025;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    const hoverSquash = follower.vx * .018 + follower.vy * .012;
    orb(a, radius * breathe, warm, 1, growthA, scene ? scene.squashA : 1 + hoverSquash, !scene);
    orb(b, radius * 0.86 / breathe, cool, -1, growthB, scene ? scene.squashB : 1 - hoverSquash * .65, !scene);
    const connectionColor = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    connectionColor.addColorStop(0, rgba(warm, 0.11));
    connectionColor.addColorStop(0.5, `rgba(133,113,105,${0.16 + follower.strength * 0.13})`);
    connectionColor.addColorStop(1, rgba(cool, 0.15));
    // 连线从两端共同生长；相位差让“连接”保留微小的不一致。
    for (let i = 0; i < 28; i++) {
      const phase = i / 28 * Math.PI * 2;
      const tension = Math.sin(clock * 0.45 + phase) * radius * 0.14;
      const start = { x: a.x + Math.cos(phase) * radius * 0.45,
        y: a.y + Math.sin(phase) * radius * 0.6 };
      const end = { x: b.x + Math.cos(phase + 0.22) * radius * 0.45,
        y: b.y + Math.sin(phase + 0.22) * radius * 0.55 };
      const c1 = { x: start.x + radius * 0.65, y: start.y + tension };
      const c2 = { x: end.x - radius * 0.65, y: end.y - tension };
      const delay = i / 28 * 0.14;
      const pathGrowth = ease(((scene ? scene.connection : 1) - delay) / (1 - delay));
      if (!pathGrowth) continue;
      // 未交汇时分别从两端生长，交汇后恢复整条曲线，首页沿用相同路径。
      const spans = pathGrowth === 1 ? [[0, 1]] : [[0, pathGrowth / 2], [1 - pathGrowth / 2, 1]];
      ctx.beginPath();
      for (const [from, to] of spans) {
        const steps = Math.max(1, Math.ceil((to - from) * 50));
        for (let s = 0; s <= steps; s++) {
          const p = bezier(start, c1, c2, end, from + (to - from) * s / steps);
          if (!s) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
      }
      ctx.strokeStyle = connectionColor; ctx.lineWidth = 0.7; ctx.stroke();
      const travel = (clock * (i % 2 ? 0.075 : -0.06) + i / 28 + 1000) % 1;
      if (pathGrowth === 1 || travel < pathGrowth / 2 || travel > 1 - pathGrowth / 2) {
        const p = bezier(start, c1, c2, end, travel);
        ctx.beginPath(); ctx.arc(p.x, p.y, i % 5 ? 1.15 : 2, 0, Math.PI * 2);
        ctx.fillStyle = rgba(i % 2 ? cool : warm, 0.75); ctx.fill();
      }
    }
    // 少量轨道碎片属于次要动作，避免持续噪点争夺标题和入口的注意力。
    for (let i = 0; i < 36; i++) {
      const angle = i * 2.39996 + clock * 0.045 * (i % 2 ? 1 : -1);
      const orbit = radius * (1.45 + i % 5 * 0.17);
      const x = baseX + Math.cos(angle) * orbit;
      const y = baseY + Math.sin(angle) * orbit * 0.72;
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle + clock * 0.06);
      ctx.strokeStyle = rgba(i % 2 ? warm : cool, 0.17 * Math.min(growthA, growthB));
      ctx.strokeRect(-2, -2, 4 + i % 3 * 2, 4 + i % 3 * 2); ctx.restore();
    }
    ctx.restore();
  }
  function bezier(a, b, c, d, t) {
    const u = 1 - t;
    return { x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
      y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y };
  }
  function tick(now) {
    frame = 0;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.035) : 0.016;
    lastTime = now;
    clock += dt; update(dt); draw();
    if (!paused && visible && !playing && !cinematicActive && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function schedule() {
    if (!frame && !paused && !reduced.matches && visible && !playing && !cinematicActive && !document.hidden) {
      lastTime = 0; frame = requestAnimationFrame(tick);
    }
  }
  function resize() {
    const rect = hero.getBoundingClientRect();
    width = cinematicActive ? innerWidth : rect.width;
    height = cinematicActive ? innerHeight : rect.height;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(cinematicScene);
  }
  function syncMotion() {
    if (reduced.matches) paused = true;
    toggle.disabled = reduced.matches;
    toggle.textContent = reduced.matches ? "已减少动态" : paused ? "播放动画" : "暂停动画";
    toggle.setAttribute("aria-pressed", String(paused));
    document.documentElement.classList.toggle("visual-paused", paused);
    if (paused) {
      cancelAnimationFrame(frame); frame = 0; resetInteraction(); draw();
    } else schedule();
  }
  hero.addEventListener("pointermove", (event) => {
    if (paused || reduced.matches || playing || cinematicActive || event.pointerType === "touch") return;
    if (event.target.closest("button,a,input,select,textarea")) { releasePointer(); return; }
    const rect = hero.getBoundingClientRect();
    const small = width < 700;
    const x = (event.clientX - rect.left - width * (small ? .55 : .74)) / (width * .3);
    const y = (event.clientY - rect.top - height * (small ? .70 : .48)) / (height * .4);
    const strength = ease((1.8 - Math.hypot(x, y)) / .8);
    if (target.strength <= .05 && strength > .05) hoverAge = 0;
    target.x = Math.max(-1, Math.min(1, x)) * strength;
    target.y = Math.max(-1, Math.min(1, y)) * strength;
    target.strength = strength;
  });
  function releasePointer() { target.x = target.y = target.strength = 0; }
  function resetInteraction() {
    releasePointer(); hoverAge = impulseAge = 10;
    follower.x = follower.y = follower.vx = follower.vy = follower.strength = 0;
    secondary.x = secondary.y = 0;
  }
  hero.addEventListener("pointerleave", releasePointer);
  hero.addEventListener("pointercancel", releasePointer);
  window.addEventListener("blur", releasePointer);
  hero.addEventListener("pointerdown", (event) => {
    if (!paused && !reduced.matches && !playing && !cinematicActive && !event.target.closest("button,a,input,select,textarea")) impulseAge = 0;
  });
  toggle.addEventListener("click", () => { paused = !paused; syncMotion(); });
  reduced.addEventListener("change", () => {
    paused = reduced.matches;
    if (replay) { replay.disabled = reduced.matches; replay.title = reduced.matches ? "已启用减少动态效果" : ""; }
    syncMotion();
  });
  new ResizeObserver(resize).observe(hero);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) { cancelAnimationFrame(frame); frame = 0; resetInteraction(); } else schedule();
  }).observe(hero);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; resetInteraction(); } else schedule();
  });
  document.addEventListener("site-mode-change", (event) => {
    playing = event.detail === "playing";
    if (playing) { cancelAnimationFrame(frame); frame = 0; resetInteraction(); } else schedule();
  });
  // 开场只改变相机与动作参数，沿用同一个画布、球体模型、旋转时钟和连线。
  window.uiRelationVisual = {
    canvas, ctx, landingLayout,
    guide(targetCanvas, progress, elapsed = 0) {
      const guideContext = targetCanvas.getContext("2d");
      if (!guideContext) return;
      const previous = { ctx, clock, x: follower.x, impulseAge };
      try {
        const size = 84, dpr = Math.min(devicePixelRatio || 1, 1.5);
        if (targetCanvas.width !== Math.round(size * dpr)) {
          targetCanvas.width = Math.round(size * dpr);
          targetCanvas.height = Math.round(size * dpr);
        }
        ctx = guideContext; clock = 3.2 + progress * 8 + elapsed;
        follower.x = 0; impulseAge = 10;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size, size);
        // 共用首页线框模型；公转独立于滚动，路径位置仍由滚动决定。
        const angle = .78 + elapsed * .55;
        const ox = Math.cos(angle) * 13, oy = Math.sin(angle) * 10;
        ctx.beginPath(); ctx.ellipse(42, 42, 25, 17, .35, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(warm, .13); ctx.lineWidth = .6; ctx.stroke();
        orb({ x: 42 - ox, y: 42 - oy }, 18, warm, 1, 1, 1, false, true);
        orb({ x: 42 + ox, y: 42 + oy }, 15.5, cool, -1, 1, 1, false, true);
      } finally {
        ctx = previous.ctx; clock = previous.clock;
        follower.x = previous.x; impulseAge = previous.impulseAge;
      }
    },
    preview(targetCanvas, pose, time) {
      if (cinematicActive) return;
      const previewContext = targetCanvas.getContext("2d");
      if (!previewContext) return;
      const rect = targetCanvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const previous = { ctx, width, height, clock, follower: { ...follower }, secondary: { ...secondary }, impulseAge };
      try {
        // 局部演示必须独立于首页尚未收束的鼠标状态，避免同一姿势因悬停历史而改变。
        Object.keys(follower).forEach((key) => { follower[key] = 0; });
        secondary.x = secondary.y = 0; impulseAge = 10;
        const dpr = Math.min(devicePixelRatio || 1, 1.5);
        const pixelWidth = Math.round(rect.width * dpr), pixelHeight = Math.round(rect.height * dpr);
        if (targetCanvas.width !== pixelWidth || targetCanvas.height !== pixelHeight) {
          targetCanvas.width = pixelWidth; targetCanvas.height = pixelHeight;
        }
        ctx = previewContext; width = rect.width; height = rect.height; clock = time;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // 局部演示共享球体、投影与线框生长，不再引入另一套几何造型。
        const centerX = width * (0.5 + (pose.x || 0));
        const centerY = height * (0.5 + (pose.y || 0));
        // 包络包含最大蓄力间距、透视轨道、碎片与1.35倍姿势；先统一适配再播放，避免逐帧缩放抽动。
        const padding = 10;
        const baseRadius = Math.max(1, Math.min((width * .38 - padding) / 4.8, (height * .41 - padding) / 3.2));
        draw({ x: centerX, y: centerY,
          radius: baseRadius * (pose.scale || 1),
          distance: pose.distance ?? 1, distanceB: pose.distanceB ?? 1,
          growthA: pose.growthA ?? 1, growthB: pose.growthB ?? 1,
          squashA: pose.squashA ?? 1, squashB: pose.squashB ?? 1,
          connection: pose.connection ?? 1, cover: 1 });
      } finally {
        ctx = previous.ctx; width = previous.width; height = previous.height; clock = previous.clock;
        Object.assign(follower, previous.follower); Object.assign(secondary, previous.secondary); impulseAge = previous.impulseAge;
      }
    },
    begin(container) {
      cinematicActive = true;
      cancelAnimationFrame(frame); frame = 0;
      target.x = target.y = target.strength = 0;
      follower.x = follower.y = follower.vx = follower.vy = follower.strength = 0;
      secondary.x = secondary.y = 0; impulseAge = 10;
      container.prepend(canvas); resize();
    },
    render(scene, dt) {
      clock += Math.max(0, dt);
      cinematicScene = scene; draw(scene);
    },
    end() {
      cinematicActive = false; cinematicScene = null;
      canvasParent.insertBefore(canvas, canvasNext);
      resize(); schedule();
    }
  };
  if (replay) { replay.disabled = reduced.matches; replay.title = reduced.matches ? "已启用减少动态效果" : ""; }
  clock = 3.2;
  resize(); syncMotion();
})();
