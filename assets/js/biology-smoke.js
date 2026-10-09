(() => {
  // Left column background video: hold its first frame under reduced motion.
  const video = document.querySelector('#biology .biology-video');
  if (video && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    video.removeAttribute('autoplay');
    video.pause();
  }

  const canvas = document.querySelector('#biology .biology-specimen canvas');
  if (!canvas) return;
  const out = canvas.getContext('2d');
  // Strands are drawn to an offscreen layer, then composited with blur + smoke puffs.
  const layer = document.createElement('canvas');
  const ctx = layer.getContext('2d');
  out.filter = 'blur(1px)';
  const canFilter = out.filter === 'blur(1px)';
  out.filter = 'none';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TAU = Math.PI * 2;
  const STEP_MS = 1000 / 60;
  const CORE = '#acdefb';
  const EDGE = '#0167a2';
  const THICK_STRANDS = 11;
  const THIN_STRANDS = 7; // subtle grainy #0167a2 lines

  const rand = (min, max) => min + Math.random() * (max - min);
  const smooth = (a, b, v) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  // Deterministic hash so grain sticks to the strand instead of flickering.
  const hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  // Soft round smoke texture (as in the p5 smoke example), pre-tinted.
  const SPRITE_PX = 64;
  const sprites = ['#acdefb', '#7cc4ee', '#3f95c9'].map((color) => {
    const c = document.createElement('canvas');
    c.width = c.height = SPRITE_PX;
    const g = c.getContext('2d');
    const r = SPRITE_PX / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color + 'aa');
    grad.addColorStop(0.7, color + '33');
    grad.addColorStop(1, color + '00');
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
    return c;
  });
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let strands = [];
  let puffs = [];
  let puffCarry = 0;
  let t = 0; // seconds

  // ---------- Strands ----------
  // Each strand is a long filament defined across the box by a material
  // coordinate s. Its visible stretch [tail, head] travels right; a big
  // braiding wave plus a small trochoid "curl" (which loops whenever its
  // strength passes 1) both travel right with the flow.

  // Wavelength reference: keeps the plume as wavy on a wide, short box as on a square one.
  const span = () => Math.min(width, height * 3.6);

  const makeStrand = (thin, anywhere) => {
    const len = width * rand(0.45, 1.1);
    const speed = width / rand(9, 13);
    const lambda = span() * rand(0.35, 0.75);
    const lambdaC = height * rand(0.3, 0.5);
    return {
      thin,
      seed: rand(0, 1000),
      lane: rand(-1, 1),
      amp: rand(0.5, 1),
      k: TAU / lambda,
      k2: (TAU / lambda) * rand(1.8, 2.8),
      amp2: rand(0.15, 0.4),
      phase: rand(0, TAU),
      phase2: rand(0, TAU),
      kc: TAU / lambdaC,
      phaseC: rand(0, TAU),
      q1: TAU / (span() * rand(0.3, 0.6)),
      q2: TAU / (span() * rand(0.12, 0.25)),
      m1: rand(0, TAU),
      m2: rand(0, TAU),
      curlMax: thin ? rand(0.6, 1.2) : rand(1.1, 1.7),
      w0: thin ? rand(0.7, 1.4) : height * rand(0.022, 0.045),
      len,
      speed,
      head: anywhere ? rand(0, width + len) : -rand(0, width * 0.1),
    };
  };

  const resetStrands = () => {
    strands = [];
    for (let i = 0; i < THIN_STRANDS; i++) strands.push(makeStrand(true, true));
    for (let i = 0; i < THICK_STRANDS; i++) strands.push(makeStrand(false, true));
  };

  const plumeCenter = (s) =>
    height * 0.55 +
    height * 0.07 * Math.sin((TAU * s) / (span() * 0.9) - t * 0.35) +
    height * 0.03 * Math.sin((TAU * s) / (span() * 0.37) - t * 0.6 + 1);

  const plumeHalf = (s) => height * (0.14 + 0.15 * smooth(0, span() * 0.35, s));

  const pointAt = (st, s, out) => {
    const v = st.speed;
    const braid =
      st.amp * Math.sin(st.k * s - st.k * v * t + st.phase) +
      st.amp2 * Math.sin(st.k2 * s - st.k2 * v * 0.8 * t + st.phase2);
    const y = plumeCenter(s) + plumeHalf(s) * (0.3 * st.lane + 0.55 * braid);
    // Curl strength comes and goes along the strand; loops where it exceeds 1.
    const m =
      st.curlMax *
      Math.max(0, Math.sin(s * st.q1 - t * 0.5 + st.m1)) *
      Math.sqrt(Math.max(0, Math.sin(s * st.q2 + t * 0.3 + st.m2)));
    const a = m / st.kc;
    const ang = st.kc * s - st.kc * v * 1.2 * t + st.phaseC;
    out.x = s + a * Math.cos(ang);
    out.y = y + a * 0.9 * Math.sin(ang);
  };

  const widthAt = (st, s) => {
    const tail = st.head - st.len;
    // Swells and nodules travel with the flow; tip tapers, tail thins away.
    const u = s - st.speed * t;
    const swell = 1 + 0.4 * Math.sin((TAU * u) / (height * 0.5) + st.seed) + 0.2 * Math.sin((TAU * u) / (height * 0.17) + st.seed * 3);
    const taper = smooth(st.head, st.head - st.len * 0.06, s) * smooth(tail, tail + st.len * 0.35, s);
    return Math.max(0, st.w0 * swell * taper);
  };

  // ---------- Drawing ----------

  const pt = { x: 0, y: 0 };

  const sample = (st) => {
    const tail = st.head - st.len;
    const s0 = Math.max(tail, -width * 0.05);
    const s1 = Math.min(st.head, width * 1.05);
    const ds = Math.max(1.5, width / 260);
    const pts = [];
    for (let s = s0; s <= s1; s += ds) {
      pointAt(st, s, pt);
      pts.push({ x: pt.x, y: pt.y, w: widthAt(st, s), s });
    }
    return pts;
  };

  // Variable-width stroke: batch consecutive segments of the same (quantised) width.
  const strokeVariable = (pts, color, widthFn) => {
    ctx.strokeStyle = color;
    let q = -1;
    ctx.beginPath();
    for (let i = 0; i < pts.length - 1; i++) {
      const w = widthFn(pts[i]);
      const nq = Math.round(w * 2) / 2;
      if (nq !== q) {
        if (q > 0) ctx.stroke();
        ctx.beginPath();
        ctx.lineWidth = nq;
        ctx.moveTo(pts[i].x, pts[i].y);
        q = nq;
      }
      if (q > 0) ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    }
    if (q > 0) ctx.stroke();
  };

  const edgeW = () => Math.max(1, height * 0.008);

  const drawThick = (st) => {
    const pts = sample(st);
    if (pts.length < 2) return;
    const e = edgeW();
    // Blue outline; where the strand has thinned out only this remains (dissipating).
    strokeVariable(pts, EDGE, (p) => (p.w < 0.6 ? Math.max(0, p.w * 1.5) : p.w + e * 2));
    strokeVariable(pts, CORE, (p) => (p.w < 1.2 ? 0 : p.w));
    // Blue speckle clinging to the edges.
    ctx.fillStyle = EDGE;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const id = Math.floor((p.s - st.speed * t) / 1.5) + st.seed;
      if (hash(id) > 0.12 || p.w < 1.2) continue;
      const nx = -(pts[i + 1].y - pts[i - 1].y);
      const ny = pts[i + 1].x - pts[i - 1].x;
      const nl = Math.hypot(nx, ny) || 1;
      const off = (p.w / 2 + e * (1 + hash(id + 7) * 2)) * (hash(id + 3) < 0.5 ? -1 : 1);
      ctx.fillRect(p.x + (nx / nl) * off, p.y + (ny / nl) * off, 1, 1);
    }
  };

  const drawThin = (st) => {
    const pts = sample(st);
    if (pts.length < 2) return;
    ctx.globalAlpha = 0.8;
    strokeVariable(pts, EDGE, (p) => (p.w > 0.25 ? Math.max(0.5, p.w) : 0));
    // Grainy stipple band alongside the line.
    ctx.fillStyle = EDGE;
    const spread = height * 0.02;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      if (p.w < 0.25) continue;
      const id = Math.floor((p.s - st.speed * t) / 1.5) + st.seed;
      if (hash(id) > 0.55) continue;
      const nx = -(pts[i + 1].y - pts[i - 1].y);
      const ny = pts[i + 1].x - pts[i - 1].x;
      const nl = Math.hypot(nx, ny) || 1;
      const off = (hash(id + 5) - 0.5) * spread * (p.w / st.w0);
      ctx.fillRect(p.x + (nx / nl) * off, p.y + (ny / nl) * off, 1, 1);
    }
    ctx.globalAlpha = 1;
  };

  const drawPuffs = () => {
    out.setTransform(dpr, 0, 0, dpr, 0, 0);
    out.globalCompositeOperation = 'lighter';
    for (const p of puffs) {
      const age = p.age / p.life;
      const s = p.size * (1 + age * 4);
      out.globalAlpha = Math.min(1, age / 0.15) * Math.pow(1 - age, 1.2) * 0.22;
      out.drawImage(p.sprite, p.x - s / 2, p.y - s / 2, s, s);
    }
    out.globalAlpha = 1;
    out.globalCompositeOperation = 'source-over';
  };

  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const st of strands) if (st.thin) drawThin(st);
    for (const st of strands) if (!st.thin) drawThick(st);

    out.setTransform(1, 0, 0, 1, 0, 0);
    out.clearRect(0, 0, canvas.width, canvas.height);
    if (canFilter) {
      // Wide, gently breathing haze behind the strands.
      out.filter = `blur(${Math.max(2, height * 0.035) * dpr}px)`;
      out.globalAlpha = 0.5 + 0.12 * Math.sin(t * 0.7);
      out.drawImage(layer, 0, 0);
      out.globalAlpha = 1;
      out.filter = 'none';
    }
    drawPuffs();
    // The strands themselves, softened just slightly.
    out.setTransform(1, 0, 0, 1, 0, 0);
    if (canFilter) out.filter = `blur(${0.6 * dpr}px)`;
    out.drawImage(layer, 0, 0);
    out.filter = 'none';
  };

  // ---------- Simulation ----------

  // Smoke puffs shed from the strands, mostly from the thinning tails.
  const emitPuff = () => {
    const st = strands[Math.floor(Math.random() * strands.length)];
    if (st.thin) return;
    const tail = st.head - st.len;
    const s = tail + st.len * Math.pow(Math.random(), 1.6);
    if (s < 0 || s > width) return;
    const w = widthAt(st, s);
    if (w < 0.3) return;
    pointAt(st, s, pt);
    puffs.push({
      x: pt.x,
      y: pt.y,
      vx: st.speed * rand(0.5, 0.9),
      vy: gauss() * height * 0.05,
      age: 0,
      life: rand(1.2, 2.6),
      size: Math.max(1.5, w) * 2.2,
      seed: rand(0, TAU),
      sprite: sprites[Math.floor(Math.random() * sprites.length)],
    });
  };

  const stepPuffs = (dt) => {
    puffCarry += dt * 140 * Math.min(1.5, Math.max(0.5, width / 500));
    while (puffCarry >= 1) {
      if (puffs.length < 400) emitPuff();
      puffCarry--;
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.age += dt;
      p.vx *= 0.99;
      p.vy = p.vy * 0.98 + gauss() * height * 0.01;
      p.x += p.vx * dt;
      p.y += (p.vy + Math.sin(t * 1.5 + p.seed) * height * 0.03) * dt;
      if (p.age >= p.life) puffs.splice(i, 1);
    }
  };

  const step = (dt) => {
    t += dt;
    stepPuffs(dt);
    for (let i = 0; i < strands.length; i++) {
      const st = strands[i];
      st.head += st.speed * dt;
      // Once the tail has left the box, a new strand is born at the left.
      if (st.head - st.len > width * 1.05) strands[i] = makeStrand(st.thin, false);
    }
  };

  // ---------- Sizing ----------

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const d = Math.min(window.devicePixelRatio || 1, 2);
    if (w === width && h === height && d === dpr) return;
    width = w;
    height = h;
    dpr = d;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    layer.width = canvas.width;
    layer.height = canvas.height;
    resetStrands();
    puffs = [];
    for (let i = 0; i < 150; i++) stepPuffs(STEP_MS / 1000);
    draw();
  };

  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 80);
  }).observe(canvas.parentElement);
  resize();

  // ---------- Loop (paused when off screen) ----------

  let rafId = 0;
  let last = 0;
  let acc = 0;
  const frame = (now) => {
    if (!last) last = now;
    acc = Math.min(acc + now - last, STEP_MS * 4);
    last = now;
    while (acc >= STEP_MS) {
      step(STEP_MS / 1000);
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

  window.__biologySmokeDebug = () => ({
    strands: strands.length,
    visible: strands.filter((s) => s.head > 0 && s.head - s.len < width).length,
    canvas: [width, height],
  });
})();
