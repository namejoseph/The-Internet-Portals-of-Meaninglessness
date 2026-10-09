(() => {
  const canvas = document.querySelector('#ticker-display .ticker-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COLORS = {
    bg: '#000000',
    hatch: '#e9dfc9',
    hatchDim: '#b8ad96',
    scratch: '#f6f1e6',
    glyphBlue: '#3a7cb8',
    glyphPale: '#d6e4e6',
  };

  const GLYPH_COUNT = 4;
  const GLYPH_BAND = 0.325; // share of canvas height reserved for the glyph band
  const GLYPH_MARGIN = 0.07; // horizontal inset on each side, as a share of width

  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const chance = (p) => Math.random() < p;
  // Deterministic stepped noise: same (seed, step) always yields the same value,
  // so elements can flicker/jump in hard discontinuous steps instead of easing.
  const hash = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  let width = 0;
  let height = 0;
  let dpr = 1;
  let artBottom = 0;
  let seedCounter = 1;

  // Offscreen art buffer; the visible frame is a glitch-sliced blit of this.
  const art = document.createElement('canvas');
  const actx = art.getContext('2d');

  // ---------- Fragment system ----------
  // Fragments are short-lived: hatched regions, loose arcs, curved lines,
  // jagged scratches and solid shards. They appear and vanish in steps.

  let fragments = [];

  const blobPath = (cx, cy, rx, ry, points, roughness) => {
    const path = new Path2D();
    const wobble = Array.from({ length: points }, () => rand(1 - roughness, 1 + roughness * 0.4));
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2;
      const w = wobble[i % points];
      const x = cx + Math.cos(a) * rx * w;
      const y = cy + Math.sin(a) * ry * w;
      i === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
    }
    path.closePath();
    return path;
  };

  const chordPath = (cx, cy, rx, ry) => {
    // An ellipse sliced by one or two straight chords.
    const path = new Path2D();
    const a0 = rand(0, Math.PI * 2);
    const sweep = rand(Math.PI * 0.6, Math.PI * 1.7);
    path.ellipse(cx, cy, rx, ry, 0, a0, a0 + sweep);
    if (chance(0.5)) path.lineTo(cx, cy);
    path.closePath();
    return path;
  };

  const rectPath = (cx, cy, rx, ry) => {
    const path = new Path2D();
    path.rect(cx - rx, cy - ry, rx * 2, ry * 2);
    return path;
  };

  const spawnFragment = (t) => {
    const seed = seedCounter++;
    const roll = Math.random();
    const kind = roll < 0.34 ? 'hatch' : roll < 0.56 ? 'arc' : roll < 0.72 ? 'curve' : roll < 0.9 ? 'scratch' : 'shard';
    const cx = width * rand(0.1, 0.9);
    const cy = artBottom * rand(0.1, 0.9);
    const base = {
      seed,
      kind,
      cx,
      cy,
      born: t + rand(0, 0.4),
      life: chance(0.3) ? rand(0.15, 0.6) : rand(0.8, 4.5),
      enter: rand(0.05, 0.6),
      exit: rand(0.05, 0.6),
      flicker: rand(2, 14),
      dropout: chance(0.4) ? rand(0.25, 0.6) : rand(0, 0.15),
      jumpRate: rand(1, 8),
      jumpAmp: chance(0.5) ? rand(0, 6) : rand(10, 40),
    };

    if (kind === 'hatch') {
      const rx = width * rand(0.1, 0.42);
      const ry = artBottom * rand(0.08, 0.4);
      const shape = pick(['blob', 'blob', 'chord', 'rect', 'circle']);
      const path =
        shape === 'blob' ? blobPath(cx, cy, rx, ry, Math.floor(rand(7, 18)), rand(0.05, 0.3))
        : shape === 'chord' ? chordPath(cx, cy, rx, ry)
        : shape === 'rect' ? rectPath(cx, cy, rx, ry)
        : blobPath(cx, cy, rx, ry, 40, 0.01);
      return {
        ...base,
        rx, ry, path,
        spacing: rand(2.2, 5),
        lw: chance(0.2) ? rand(1.5, 2.6) : 1,
        dim: chance(0.3),
        outline: chance(0.6),
        bands: Array.from({ length: Math.floor(rand(0, 4)) }, () => ({ h: rand(3, ry * 0.4), rate: rand(0.5, 6), seed: Math.random() * 1000 })),
        tearRate: rand(0.5, 5),
        tearAmp: rand(0, 25),
        revealDir: pick([-1, 1]),
        columnDrop: rand(0, 0.35),
      };
    }

    if (kind === 'arc') {
      const rx = width * rand(0.08, 0.5);
      return {
        ...base,
        rx,
        ry: rx * rand(0.6, 1.4),
        a0: rand(0, Math.PI * 2),
        sweep: rand(0.4, Math.PI * 1.9),
        sweepRate: rand(0.2, 2),
        lw: chance(0.25) ? rand(2, 4) : rand(0.6, 1.4),
        rings: Math.floor(rand(1, 4)),
        ringGap: rand(3, 14),
        dash: chance(0.3) ? [rand(2, 12), rand(2, 20)] : null,
      };
    }

    if (kind === 'curve') {
      const span = width * rand(0.2, 0.9);
      return {
        ...base,
        pts: Array.from({ length: 4 }, (_, i) => [cx - span / 2 + (span * i) / 3 + rand(-30, 30), cy + rand(-artBottom * 0.35, artBottom * 0.35)]),
        wave: rand(0.3, 3),
        waveAmp: rand(4, 40),
        lw: chance(0.3) ? rand(1.8, 3.5) : rand(0.5, 1.2),
        copies: Math.floor(rand(1, 5)),
        copyGap: rand(2, 9),
      };
    }

    if (kind === 'scratch') {
      const steps = Math.floor(rand(2, 9));
      return {
        ...base,
        a: rand(0, Math.PI * 2),
        segs: Array.from({ length: steps }, () => ({ len: rand(8, width * 0.18), turn: chance(0.35) ? rand(-1.6, 1.6) : rand(-0.3, 0.3) })),
        lw: chance(0.2) ? rand(1.8, 3.5) : rand(0.5, 1.2),
        grow: rand(0.3, 2),
        drift: rand(0.1, 1),
        driftAmp: rand(0.02, 0.4),
      };
    }

    // shard: a solid tapered sliver, sometimes black so it cuts through hatch.
    return {
      ...base,
      a: rand(0, Math.PI * 2),
      len: rand(10, width * 0.35),
      w: rand(2, 18),
      black: chance(0.45),
      spin: rand(-0.6, 0.6),
    };
  };

  // Stepped reveal: hard-edged progress in 0..1 with irregular steps.
  const reveal = (f, t) => {
    const age = t - f.born;
    if (age < 0 || age > f.life) return 0;
    const inProgress = Math.min(1, age / f.enter);
    const outProgress = Math.min(1, (f.life - age) / f.exit);
    const p = Math.min(inProgress, outProgress);
    const steps = 4 + Math.floor(hash(f.seed, 7) * 6);
    return Math.ceil(p * steps) / steps;
  };

  const visibleNow = (f, t) => hash(f.seed, Math.floor(t * f.flicker)) >= f.dropout;

  const jumpX = (f, t) => (hash(f.seed + 0.5, Math.floor(t * f.jumpRate)) - 0.5) * f.jumpAmp;

  const drawHatch = (c, f, t, r) => {
    c.save();
    c.clip(f.path);
    const left = f.cx - f.rx * 1.2;
    const right = f.cx + f.rx * 1.2;
    const top = f.cy - f.ry * 1.3;
    const h = f.ry * 2.6;
    const revealEdge = f.revealDir > 0 ? left + (right - left) * r : right - (right - left) * r;
    const tearStep = Math.floor(t * f.tearRate);
    const tearY = top + hash(f.seed + 2, tearStep) * h;
    const tearH = hash(f.seed + 3, tearStep) * h * 0.5;
    const tearDx = (hash(f.seed + 4, tearStep) - 0.5) * f.tearAmp;
    c.fillStyle = f.dim ? COLORS.hatchDim : COLORS.hatch;
    let i = 0;
    for (let x = left; x < right; x += f.spacing, i++) {
      if (f.revealDir > 0 ? x > revealEdge : x < revealEdge) continue;
      if (hash(f.seed + 5 + i, Math.floor(t * 3)) < f.columnDrop) continue;
      const w = hash(f.seed + 9, i) < 0.1 ? f.lw * 2.2 : f.lw;
      c.fillRect(x, top, w, tearY - top);
      c.fillRect(x + tearDx, tearY, w, tearH);
      c.fillRect(x, tearY + tearH, w, top + h - tearY - tearH);
    }
    c.fillStyle = COLORS.bg;
    f.bands.forEach((b) => {
      const y = top + hash(b.seed, Math.floor(t * b.rate)) * h;
      c.fillRect(left, y, right - left, b.h);
    });
    c.restore();
    if (f.outline && r > 0.5) {
      c.strokeStyle = COLORS.hatch;
      c.lineWidth = 1;
      c.setLineDash(hash(f.seed, 11) < 0.4 ? [rand(4, 30), rand(4, 40)] : []);
      c.stroke(f.path);
      c.setLineDash([]);
    }
  };

  const drawArc = (c, f, t, r) => {
    c.strokeStyle = COLORS.scratch;
    c.lineWidth = f.lw;
    c.setLineDash(f.dash || []);
    const sweep = f.sweep * r * (0.6 + 0.4 * Math.abs(Math.sin(t * f.sweepRate + f.seed)));
    const a0 = f.a0 + Math.sin(t * 0.3 + f.seed) * 0.4;
    for (let k = 0; k < f.rings; k++) {
      if (hash(f.seed + k, Math.floor(t * 4)) < 0.25) continue;
      c.beginPath();
      c.ellipse(f.cx, f.cy, Math.max(1, f.rx + k * f.ringGap), Math.max(1, f.ry + k * f.ringGap), 0, a0, a0 + sweep);
      c.stroke();
    }
    c.setLineDash([]);
  };

  const drawCurve = (c, f, t, r) => {
    c.strokeStyle = COLORS.scratch;
    c.lineWidth = f.lw;
    const [p0, p1, p2, p3] = f.pts.map(([x, y], i) => [x, y + Math.sin(t * f.wave + i * 1.7 + f.seed) * f.waveAmp]);
    for (let k = 0; k < f.copies; k++) {
      if (hash(f.seed + k * 3, Math.floor(t * 6)) < 0.3) continue;
      const dy = k * f.copyGap;
      c.beginPath();
      c.moveTo(p0[0], p0[1] + dy);
      // Only trace the revealed portion by shortening the end point.
      const ex = p0[0] + (p3[0] - p0[0]) * r;
      const ey = p0[1] + (p3[1] - p0[1]) * r + dy;
      c.bezierCurveTo(p1[0], p1[1] + dy, p2[0], p2[1] + dy, ex, ey);
      c.stroke();
    }
  };

  const drawScratch = (c, f, t, r) => {
    c.strokeStyle = COLORS.scratch;
    c.lineWidth = f.lw;
    c.lineJoin = 'miter';
    let dir = f.a + Math.sin(t * f.drift + f.seed) * f.driftAmp;
    let x = f.cx;
    let y = f.cy;
    const growth = r * (0.7 + 0.3 * Math.sin(t * f.grow + f.seed));
    c.beginPath();
    c.moveTo(x, y);
    f.segs.forEach((seg) => {
      dir += seg.turn;
      x += Math.cos(dir) * seg.len * growth;
      y += Math.sin(dir) * seg.len * growth;
      c.lineTo(x, y);
    });
    c.stroke();
  };

  const drawShard = (c, f, t, r) => {
    c.fillStyle = f.black ? COLORS.bg : COLORS.scratch;
    const a = f.a + t * f.spin;
    const len = f.len * r;
    const nx = -Math.sin(a) * f.w * 0.5;
    const ny = Math.cos(a) * f.w * 0.5;
    c.beginPath();
    c.moveTo(f.cx + nx, f.cy + ny);
    c.lineTo(f.cx - nx, f.cy - ny);
    c.lineTo(f.cx + Math.cos(a) * len, f.cy + Math.sin(a) * len);
    c.closePath();
    c.fill();
  };

  const DRAWERS = { hatch: drawHatch, arc: drawArc, curve: drawCurve, scratch: drawScratch, shard: drawShard };

  const updateFragments = (t) => {
    fragments = fragments.filter((f) => t <= f.born + f.life);
    // Target population jumps in steps, so the scene swings between sparse and dense.
    const target = 3 + Math.floor(hash(99, Math.floor(t / 2.5)) * 11);
    if (fragments.length < target && chance(0.35)) fragments.push(spawnFragment(t));
    // Occasional burst: several fragments at once.
    if (hash(42, Math.floor(t * 2)) > 0.93 && chance(0.2)) {
      for (let i = 0; i < 4; i++) fragments.push(spawnFragment(t));
    }
  };

  const drawArt = (t) => {
    actx.setTransform(dpr, 0, 0, dpr, 0, 0);
    actx.fillStyle = COLORS.bg;
    actx.fillRect(0, 0, width, height);
    actx.save();
    actx.beginPath();
    actx.rect(0, 0, width, artBottom);
    actx.clip();
    // Shards go last so black ones can cut through everything else.
    const ordered = [...fragments].sort((a, b) => (a.kind === 'shard') - (b.kind === 'shard'));
    ordered.forEach((f) => {
      const r = reveal(f, t);
      if (r === 0 || !visibleNow(f, t)) return;
      actx.save();
      actx.translate(jumpX(f, t), 0);
      DRAWERS[f.kind](actx, f, t, r);
      actx.restore();
    });
    actx.restore();
  };

  // Blit the art buffer with horizontal glitch slices displaced sideways.
  const blitWithGlitch = (t) => {
    const step = Math.floor(t * 9);
    ctx.drawImage(art, 0, 0, width, height);
    if (hash(7, step) > 0.55) return;
    const slices = 1 + Math.floor(hash(8, step) * 5);
    for (let i = 0; i < slices; i++) {
      const y = hash(9 + i, step) * artBottom;
      const h = 2 + hash(20 + i, step) * artBottom * 0.18;
      const dx = (hash(31 + i, step) - 0.5) * width * 0.25;
      ctx.drawImage(art, 0, y * dpr, width * dpr, h * dpr, dx, y, width, h);
      ctx.fillStyle = COLORS.bg;
      if (dx > 0) ctx.fillRect(0, y, dx, h);
      else ctx.fillRect(width + dx, y, -dx, h);
    }
  };

  // ---------- Asemic seven-segment glyphs ----------

  // Node grid: 3 columns x 3 rows (like a 7-seg digit), plus diagonals.
  const NODES = [
    [0, 0], [1, 0], [2, 0],
    [0, 1], [1, 1], [2, 1],
    [0, 2], [1, 2], [2, 2],
  ];
  const SEGMENTS = [
    [0, 2], [3, 5], [6, 8],          // horizontals
    [0, 3], [3, 6], [2, 5], [5, 8],  // verticals
    [1, 4], [4, 7],                  // center verticals
    [0, 4], [2, 4], [4, 6], [4, 8],  // diagonals
  ];

  const makeGlyph = () => {
    const on = SEGMENTS.filter(() => chance(0.42));
    if (on.length === 0) on.push(pick(SEGMENTS));
    const jitter = NODES.map(() => [rand(-0.14, 0.14), rand(-0.1, 0.1)]);
    return {
      segments: on,
      jitter,
      skew: rand(-0.35, 0.35),
      squash: rand(0.8, 1.1),
      color: chance(0.6) ? COLORS.glyphPale : COLORS.glyphBlue,
      weight: rand(0.14, 0.22),
    };
  };

  const drawGlyph = (g, x, y, w, h) => {
    const cellW = w / 2;
    const cellH = h / 2;
    const node = (i) => {
      const [gx, gy] = NODES[i];
      const [jx, jy] = g.jitter[i];
      const ny = (gy + jy) * cellH * g.squash + (h - h * g.squash) / 2;
      const nx = (gx + jx) * cellW + (h / 2 - ny) * g.skew;
      return [x + nx, y + ny];
    };
    ctx.strokeStyle = g.color;
    ctx.lineWidth = Math.max(2, w * g.weight);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    g.segments.forEach(([a, b]) => {
      const [ax, ay] = node(a);
      const [bx, by] = node(b);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    });
  };

  const glyphs = Array.from({ length: GLYPH_COUNT }, makeGlyph);

  const drawGlyphs = () => {
    const bandH = height - artBottom;
    const ratio = 0.55; // glyph width / height
    const margin = width * GLYPH_MARGIN;
    const inner = width - margin * 2;
    // Fit by height, but leave at least a small gap between glyphs.
    const maxByWidth = (inner * 0.8) / (GLYPH_COUNT * ratio);
    const glyphH = Math.min(bandH * 0.82, maxByWidth);
    const glyphW = glyphH * ratio;
    // space-between: first glyph at the left margin, last flush to the right margin.
    const gap = (inner - GLYPH_COUNT * glyphW) / (GLYPH_COUNT - 1);
    const x0 = margin;
    const y0 = artBottom + (bandH - glyphH) / 2;
    glyphs.forEach((g, i) => drawGlyph(g, x0 + i * (glyphW + gap), y0, glyphW, glyphH));
  };

  // ---------- Sizing and loop ----------

  const drawFrame = (t) => {
    updateFragments(t);
    drawArt(t);
    blitWithGlitch(t);
    drawGlyphs();
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    artBottom = height * (1 - GLYPH_BAND);
    canvas.width = art.width = Math.round(width * dpr);
    canvas.height = art.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fragments = [];
    const t = performance.now() / 1000;
    for (let i = 0; i < 8; i++) fragments.push({ ...spawnFragment(t), born: t - rand(0, 1) });
    drawFrame(t);
  };

  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 80);
  }).observe(canvas);

  resize();

  if (!reducedMotion) {
    let last = 0;
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (!width || now - last < 1000 / 30) return;
      last = now;
      drawFrame(now / 1000);
    };
    requestAnimationFrame(loop);

    setInterval(() => {
      glyphs[Math.floor(Math.random() * GLYPH_COUNT)] = makeGlyph();
    }, 900);
  }
})();
