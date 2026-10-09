(() => {
  const panel = document.getElementById('main-event');
  const canvas = panel && panel.querySelector('.main-event-center canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const title = panel.querySelector('.main-event-title');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TAU = Math.PI * 2;
  const STEP_MS = 1000 / 60;
  const INNER_BOTTOM = 0.78; // fallback box bottom if the title can't be measured
  const TIP_TOP = 0.05; // tallest strand tip, as a share of panel height
  const BOX_COUNT = 16; // 2 rows x 4 pairs; one strand per box

  const PARTICLE_COLORS = ['#d9f3ff', '#acdefb', '#b9dba8', '#c6a4c5', '#ffffff'];
  const STRAND_COLORS = ['#ffffff', '#ffffff', '#acdefb', '#acdefb', '#b9dba8', '#b9dba8', '#c6a4c5'];
  const BOX_STROKE = '#ffffff';

  const MIN_LIFE = 160;
  const MAX_LIFE = 330;

  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (array) => array[Math.floor(Math.random() * array.length)];
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  let width = 0;
  let height = 0;
  let dpr = 1;
  let layout = null;
  let strands = [];
  let particles = [];
  let simTime = 0;
  let spawnCarry = 0;
  let wind = 0;
  let windTarget = 0;
  let agitation = 0;
  let agitationTarget = 0;

  // ---------- Layout: two rows of four box pairs below the inner box ----------

  const computeLayout = () => {
    const u = Math.max(2, Math.min(height * 0.013, (width * 0.6) / 12));
    const bw = u;
    const bh = 1.75 * u;
    const pairGap = 0.3 * u;
    const groupGap = u;
    const rowGap = 0.35 * u;
    const pairW = 2 * bw + pairGap;
    const clusterW = 4 * pairW + 3 * groupGap;
    const x0 = (width - clusterW) / 2;
    // Gap from the boxes' bottom to the title's top equals the title's gap to the panel bottom.
    let bottom = height * INNER_BOTTOM;
    if (title) {
      const cr = canvas.getBoundingClientRect();
      const tr = title.getBoundingClientRect();
      if (tr.height) bottom = tr.top - cr.top - (cr.bottom - tr.bottom);
    }
    const top = Math.round(bottom) - (2 * bh + rowGap);
    const boxes = [];
    const cols = [];
    for (let row = 0; row < 2; row++) {
      for (let g = 0; g < 4; g++) {
        for (let b = 0; b < 2; b++) {
          const x = x0 + g * (pairW + groupGap) + b * (bw + pairGap);
          boxes.push({ x, y: top + row * (bh + rowGap), w: bw, h: bh });
          if (row === 0) cols.push(x + bw / 2);
        }
      }
    }
    return { u, boxes, cols, x0, clusterW, baseY: top, bottom: top + 2 * bh + rowGap };
  };

  // ---------- Strands: base pinned to the boxes, tips waving like flame ----------

  // One strand per box: the base sits inside its box, offset by row so the
  // bottom-row strands pass beside (not over) the top-row strands.
  const makeStrands = () => {
    strands = Array.from({ length: BOX_COUNT }, (_, i) => {
      const row = Math.floor(i / 8);
      const across = ((i % 8) + 0.5) / 8;
      return {
        box: i,
        anchorX: row ? -0.15 : 0.2, // share of box width from centre
        lenFrac: rand(0.55, 1),
        fan: rand(-0.06, 0.06) + (across - 0.5) * 0.12,
        color: pick(STRAND_COLORS),
        k1: rand(0.6, 1.2),
        k2: rand(1.5, 2.5),
        w1: rand(0.0012, 0.002),
        w2: rand(0.002, 0.0034),
        phase1: rand(0, TAU),
        phase2: rand(0, TAU),
        flick: rand(0, TAU),
        ctrl: [0, 0, 0, 0, 0], // random-walk offsets along the strand (base stays 0)
      };
    });
  };

  const gust = () =>
    0.5 * Math.sin(simTime * 0.00031) +
    0.3 * Math.sin(simTime * 0.00077 + 1.3) +
    0.2 * Math.sin(simTime * 0.0013 + 2.1);

  const stepStrands = () => {
    const jitter = 0.035 * (1 + agitation * 3);
    for (const s of strands) {
      for (let m = 1; m < 5; m++) {
        s.ctrl[m] = clamp((s.ctrl[m] + rand(-jitter, jitter)) * 0.985, -1.5, 1.5);
      }
    }
  };

  const strandOffset = (s, t, len, amp, g) => {
    const e = Math.pow(t, 1.35);
    const wave =
      0.65 * Math.sin(TAU * s.k1 * t - simTime * s.w1 + s.phase1) +
      0.35 * Math.sin(TAU * s.k2 * t - simTime * s.w2 + s.phase2);
    const f = t * 4;
    const i = Math.min(3, Math.floor(f));
    const fr = f - i;
    const c = s.ctrl[i] + (s.ctrl[i + 1] - s.ctrl[i]) * fr * fr * (3 - 2 * fr);
    return e * (amp * (wave * (1 + agitation * 0.6) + c) + s.fan * Math.min(len, width * 1.2)) + t * t * (g + wind) * amp * 1.6;
  };

  const drawStrands = () => {
    const amp = Math.min(height * 0.03, width * 0.08);
    const g = gust();
    const segments = 32;
    ctx.lineWidth = Math.max(0.8, height * 0.0028 * 0.8);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 3;
    for (const s of strands) {
      const b = layout.boxes[s.box];
      const bx = b.x + b.w * (0.5 + s.anchorX);
      const baseY = b.y + b.h * 0.6;
      const len = (baseY - height * TIP_TOP) * s.lenFrac * (1 + 0.03 * Math.sin(simTime * 0.004 + s.flick));
      const pts = [];
      for (let k = 0; k <= segments; k++) {
        const t = k / segments;
        pts.push(bx + strandOffset(s, t, len, amp, g), baseY - t * len);
      }
      ctx.strokeStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let k = 2; k < pts.length - 2; k += 2) {
        ctx.quadraticCurveTo(pts[k], pts[k + 1], (pts[k] + pts[k + 2]) / 2, (pts[k + 1] + pts[k + 3]) / 2);
      }
      ctx.lineTo(pts[pts.length - 2], pts[pts.length - 1]);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  };

  // ---------- Sparkle particles (adapted from the emitter sketch) ----------

  const velScale = () => height / 450;
  const sizeScale = () => clamp(height / 600, 0.6, 1.2);
  const spawnRate = () => 2.2 * clamp(height / 450, 0.6, 1);
  const maxParticles = () => Math.round(1800 * clamp(height / 900, 0.3, 1));

  const spawnParticle = () => {
    const { cols, u, baseY } = layout;
    const vs = velScale();
    const ss = sizeScale();
    const emitterX = pick(cols);
    const life = rand(MIN_LIFE, MAX_LIFE);
    const sparkle = Math.random() < 0.055;
    particles.push({
      x: emitterX + rand(-0.7, 0.7) * u,
      y: baseY + rand(-0.4, 2) * u,
      originX: emitterX,
      vx: rand(-0.12, 0.12) * vs,
      vy: rand(-1.25, -0.42) * vs,
      size: sparkle ? rand(1.8, 3.3) * ss : Math.max(0.7, rand(0.35, 1.35) * ss),
      life,
      maxLife: life,
      alpha: rand(0.35, 0.95),
      currentAlpha: 0,
      color: pick(PARTICLE_COLORS),
      phase: rand(0, TAU),
      frequency: rand(0.012, 0.038),
      drift: rand(0.15, 0.8),
      sparkle,
    });
  };

  const stepParticles = () => {
    spawnCarry += spawnRate();
    const cap = maxParticles();
    while (spawnCarry >= 1 && particles.length < cap) {
      spawnParticle();
      spawnCarry--;
    }
    if (spawnCarry > 1) spawnCarry = 1;

    const vs = velScale();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life--;
      const age = 1 - p.life / p.maxLife;
      const spread = age * age;
      p.vx += Math.sin(simTime * p.frequency + p.phase) * 0.002 * p.drift * vs;
      p.vx += rand(-0.0018, 0.0018) * (1 + spread * 5) * vs;
      p.vx *= 0.997;
      p.vy *= 0.9992;
      p.x += p.vx * (1 + spread * 3.5);
      p.y += p.vy;
      p.x += (p.x - p.originX) * 0.0007 * spread;
      let fade = 1;
      if (age < 0.08) fade = age / 0.08;
      if (age > 0.62) fade = 1 - (age - 0.62) / 0.38;
      p.currentAlpha = Math.max(0, fade * p.alpha);
      if (p.life <= 0 || p.y < -20 || p.x < -60 || p.x > width + 60) particles.splice(i, 1);
    }
  };

  const drawParticles = () => {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      ctx.globalAlpha = p.currentAlpha;
      ctx.fillStyle = p.color;
      if (p.sparkle) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 0.7;
        ctx.strokeStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x - p.size * 2.2, p.y);
        ctx.lineTo(p.x + p.size * 2.2, p.y);
        ctx.moveTo(p.x, p.y - p.size * 2.2);
        ctx.lineTo(p.x, p.y + p.size * 2.2);
        ctx.stroke();
      } else {
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  // ---------- Boxes ----------

  const drawBoxes = () => {
    const lw = Math.max(1, layout.u * 0.12);
    const snap = (v) => Math.round(v * dpr) / dpr + (lw * dpr) % 2 / (2 * dpr);
    ctx.lineWidth = lw;
    ctx.strokeStyle = BOX_STROKE;
    for (const b of layout.boxes) {
      ctx.strokeRect(snap(b.x), snap(b.y), Math.round(b.w * dpr) / dpr, Math.round(b.h * dpr) / dpr);
    }
  };

  // ---------- Frame ----------

  const step = () => {
    simTime += STEP_MS;
    wind += (windTarget - wind) * 0.02;
    agitation += (agitationTarget - agitation) * 0.02;
    stepStrands();
    stepParticles();
  };

  const draw = () => {
    if (!layout) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawStrands();
    drawParticles();
    drawBoxes();
  };

  const prewarm = (steps) => {
    for (let i = 0; i < steps; i++) step();
  };

  // ---------- Sizing ----------

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const d = Math.min(window.devicePixelRatio || 1, 2);
    if (w === width && h === height && d === dpr && layout) {
      layout = computeLayout();
      draw();
      return;
    }
    width = w;
    height = h;
    dpr = d;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    layout = computeLayout();
    particles = [];
    spawnCarry = 0;
    prewarm(reducedMotion ? 300 : 240);
    draw();
  };

  makeStrands();
  let resizeTimer = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 80);
  });
  ro.observe(canvas.parentElement);
  if (title) ro.observe(title);
  resize();

  // ---------- Pointer: strands lean away from the cursor and stir up ----------

  if (!reducedMotion) {
    panel.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      const d = (e.clientX - (r.left + r.width / 2)) / Math.max(1, r.width);
      const prox = Math.exp(-d * d * 2);
      windTarget = -Math.sign(d) * prox * 1.2;
      agitationTarget = prox;
    });
    panel.addEventListener('pointerleave', () => {
      windTarget = 0;
      agitationTarget = 0;
    });
  }

  // ---------- Loop (paused when off screen) ----------

  let rafId = 0;
  let last = 0;
  let acc = 0;
  const frame = (now) => {
    if (!last) last = now;
    acc = Math.min(acc + now - last, STEP_MS * 4);
    last = now;
    while (acc >= STEP_MS) {
      step();
      acc -= STEP_MS;
    }
    draw();
    rafId = requestAnimationFrame(frame);
  };
  const start = () => {
    if (rafId || reducedMotion) return;
    last = 0;
    rafId = requestAnimationFrame(frame);
  };
  const stop = () => {
    cancelAnimationFrame(rafId);
    rafId = 0;
  };
  new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop())).observe(canvas);

  window.__mainEventCenterDebug = () => ({
    particles: particles.length,
    strands: strands.length,
    unit: layout && +layout.u.toFixed(2),
    boxesTop: layout && Math.round(layout.baseY),
    boxesBottom: layout && Math.round(layout.bottom),
    titleTop: title ? Math.round(title.getBoundingClientRect().top - canvas.getBoundingClientRect().top) : null,
    canvas: [width, height],
  });
})();
