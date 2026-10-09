(() => {
  const panel = document.querySelector('#glyph-deterioration');
  const canvas = panel && panel.querySelector('.deterioration-canvas');
  const text = panel && panel.querySelector('.deterioration-text');
  if (!panel || !canvas || !text) return;

  const ctx = canvas.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COLORS = {
    pale: '#acdefb',
    deep: '#0167a2',
  };

  const BOX = '\uE000'; // the single notdef-style box glyph in portal-glyph.*
  const WORD_COUNTS = [4, 5, 4, 4];
  const GRID_DIVISIONS = 72; // cell = panel width / 72, min 3px
  const CLEAR_RADIUS = 0.3; // central ellipse (share of width/height) kept free of particles

  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const chance = (p) => Math.random() < p;

  // ---------- Redacted text ----------

  // Word lengths 1-7, weighted toward 2-5. The box glyph is a full em wide, so
  // each line is also capped at MAX_LINE_GLYPHS boxes to keep it inside the plate.
  const MAX_LINE_GLYPHS = 16;
  const wordLength = () => pick([1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 7]);

  const fitLine = (lengths) => {
    let total = lengths.reduce((a, b) => a + b, 0);
    while (total > MAX_LINE_GLYPHS) {
      const i = lengths.indexOf(Math.max(...lengths));
      lengths[i] -= 1;
      total -= 1;
    }
    return lengths;
  };

  const renderLine = (line) => {
    line.textContent = fitLine(line.lengths).map((n) => BOX.repeat(n)).join(' ');
  };

  // All lines are built once; how many are shown depends on the body's aspect
  // ratio (wide panels get fewer lines so the glyph keeps its height).
  const lines = WORD_COUNTS.map((count) => {
    const line = document.createElement('div');
    line.className = 'deterioration-line';
    line.lengths = Array.from({ length: count }, wordLength);
    renderLine(line);
    return line;
  });

  const body = panel.querySelector('.deterioration-body');
  let lineCount = 0;
  const layoutText = () => {
    const r = body.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const aspect = r.width / r.height;
    const n = aspect >= 1.6 ? 2 : aspect >= 1.2 ? 3 : 4;
    if (n === lineCount) return;
    lineCount = n;
    text.replaceChildren(...lines.slice(0, n));
  };

  // ---------- Particles ----------

  let width = 0;
  let height = 0;
  let dpr = 1;
  let cell = 3;
  let cols = 0;
  let rows = 0;
  let particles = [];

  // Hover intensity 0..1; ramps up on enter and decays on leave (~1.5s each).
  let intensity = 0;
  let hovering = false;
  const pointer = { x: 0, y: 0 };

  const MEAN_LIFE = 2.4; // seconds; midpoint of the 0.8-4s life range
  const baseCap = () => Math.round(cols * rows * 0.06);
  // Spawn attempts per second at rest; roughly a third are rejected (clear zone,
  // out of bounds), so the resting population settles near a quarter of the cap.
  const baseRate = () => cols * rows * 0.016;
  const restingCount = () => Math.round(Math.min(baseCap(), baseRate() * MEAN_LIFE * 0.65));

  const inClearZone = (col, row) => {
    const dx = ((col + 0.5) * cell - width / 2) / (width * CLEAR_RADIUS);
    const dy = ((row + 0.5) * cell - height / 2) / (height * CLEAR_RADIUS);
    return dx * dx + dy * dy < 1;
  };

  // Edge-biased anchor: corners, then edge bands, rarely anywhere.
  const anchor = () => {
    const roll = Math.random();
    if (roll < 0.7) {
      const left = chance(0.5);
      const top = chance(0.5);
      const c = Math.floor(rand(0, cols * 0.28));
      const r = Math.floor(rand(0, rows * 0.28));
      return [left ? c : cols - 1 - c, top ? r : rows - 1 - r];
    }
    if (roll < 0.95) {
      const band = Math.floor(rand(0, Math.max(1, cols * 0.12)));
      const bandR = Math.floor(rand(0, Math.max(1, rows * 0.12)));
      switch (Math.floor(rand(0, 4))) {
        case 0: return [band, Math.floor(rand(0, rows))];
        case 1: return [cols - 1 - band, Math.floor(rand(0, rows))];
        case 2: return [Math.floor(rand(0, cols)), bandR];
        default: return [Math.floor(rand(0, cols)), rows - 1 - bandR];
      }
    }
    return [Math.floor(rand(0, cols)), Math.floor(rand(0, rows))];
  };

  const spawn = (t, adjacentP) => {
    let col;
    let row;
    if (particles.length && chance(adjacentP)) {
      const p = pick(particles);
      col = p.col + Math.floor(rand(-1, 2));
      row = p.row + Math.floor(rand(-1, 2));
    } else {
      [col, row] = anchor();
    }
    if (col < 0 || row < 0 || col >= cols || row >= rows) return;
    if (inClearZone(col, row)) return;
    particles.push({
      col,
      row,
      color: chance(0.55) ? COLORS.pale : COLORS.deep,
      born: t,
      life: rand(0.8, 4),
    });
  };

  // Pointer cluster: a gaussian-ish blob around the cursor, built from short-lived
  // squares that mostly attach to neighbours so it reads as a growing clump.
  // It deliberately ignores the central clear zone: the user is pointing there.
  const MOUSE_RADIUS = 0.11; // share of canvas width
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // ~[-1,1], centre-weighted
  const spawnNearPointer = (t) => {
    const radius = Math.max(2, cols * MOUSE_RADIUS);
    const pc = Math.floor(pointer.x / cell);
    const pr = Math.floor(pointer.y / cell);
    let col;
    let row;
    const near = particles.filter((p) => p.mouse && Math.abs(p.col - pc) <= radius && Math.abs(p.row - pr) <= radius);
    if (near.length && chance(0.7)) {
      const p = pick(near);
      col = p.col + Math.floor(rand(-1, 2));
      row = p.row + Math.floor(rand(-1, 2));
    } else {
      col = pc + Math.round(gauss() * radius);
      row = pr + Math.round(gauss() * radius);
    }
    if (col < 0 || row < 0 || col >= cols || row >= rows) return;
    particles.push({
      col,
      row,
      mouse: true,
      color: chance(0.55) ? COLORS.pale : COLORS.deep,
      born: t,
      life: rand(0.4, 1.6),
    });
  };

  let lastT = 0;

  const update = (t) => {
    const dt = lastT ? Math.min(0.2, t - lastT) : 1 / 30;
    lastT = t;

    const target = hovering ? 1 : 0;
    const tau = hovering ? 1.5 : 0.6;
    intensity += (target - intensity) * (1 - Math.exp(-dt / tau));

    particles = particles.filter((p) => t <= p.born + p.life);
    let mouseCount = 0;
    particles.forEach((p) => { if (p.mouse) mouseCount += 1; });
    let restCount = particles.length - mouseCount;

    // Resting field: unchanged by hover.
    const cap = baseCap();
    const rate = baseRate() * dt;
    const adjacentP = 0.75;
    let budget = Math.floor(rate) + (chance(rate % 1) ? 1 : 0);
    while (budget-- > 0 && restCount < cap) {
      const before = particles.length;
      spawn(t, adjacentP);
      if (particles.length > before) restCount += 1;
    }

    // Pointer cluster on a separate budget so the resting field isn't starved.
    if (intensity > 0.01) {
      const mouseRate = baseRate() * 4 * intensity * dt;
      const mouseCap = baseCap();
      let mb = Math.floor(mouseRate) + (chance(mouseRate % 1) ? 1 : 0);
      while (mb-- > 0 && mouseCount < mouseCap) {
        const before = particles.length;
        spawnNearPointer(t);
        if (particles.length > before) mouseCount += 1;
      }
    }
  };

  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    particles.forEach((p) => {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.col * cell, p.row * cell, cell, cell);
    });
  };

  // Pre-populate to the resting level (or the full cap for the static
  // reduced-motion frame) so the first seconds don't look empty or thin out.
  const seed = (t) => {
    particles = [];
    const n = reducedMotion ? baseCap() : restingCount();
    for (let i = 0; i < n * 3 && particles.length < n; i++) {
      const before = particles.length;
      spawn(t, 0.75);
      // Spread birth times so the seeded particles don't all expire at once.
      if (particles.length > before) {
        const p = particles[particles.length - 1];
        p.born = t - rand(0, p.life * 0.8);
      }
    }
  };

  // ---------- Sizing and loop ----------

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    cell = Math.max(3, Math.round(width / GRID_DIVISIONS));
    cols = Math.ceil(width / cell);
    rows = Math.ceil(height / cell);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutText();
    seed(performance.now() / 1000);
    draw();
  };

  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 80);
  }).observe(canvas);

  layoutText();
  resize();

  window.__deteriorationDebug = () => ({
    total: particles.length,
    mouse: particles.filter((p) => p.mouse).length,
    lines: lineCount,
  });

  if (reducedMotion) return;

  const trackPointer = (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
  };
  panel.addEventListener('pointerenter', (e) => { hovering = true; trackPointer(e); });
  panel.addEventListener('pointermove', trackPointer);
  panel.addEventListener('pointerleave', () => { hovering = false; });

  let last = 0;
  const loop = (now) => {
    requestAnimationFrame(loop);
    if (!width || now - last < 1000 / 30) return;
    last = now;
    const t = now / 1000;
    update(t);
    draw();
  };
  requestAnimationFrame(loop);
})();
