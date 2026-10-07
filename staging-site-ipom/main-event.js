(() => {
  const canvases = Array.from(document.querySelectorAll('#main-event .main-event-dots canvas'));
  if (!canvases.length) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const DOT_COLOR = '#0167a2';
  const RADIUS_SHARE = 0.4; // dot radius as a share of canvas height
  const SPEED_SHARE = 0.12; // px/s as a share of canvas width (crosses in ~8s)
  const GAP_MIN = 2.2; // spawn gap, in canvas heights
  const GAP_MAX = 4.5;
  const FRAME_MS = 1000 / 30;

  const rand = (min, max) => min + Math.random() * (max - min);

  // ---------- Per-canvas dot rows ----------

  const rows = canvases.map((canvas) => ({
    canvas,
    ctx: canvas.getContext('2d'),
    width: 0,
    height: 0,
    dpr: 1,
    dots: [], // x positions in CSS px, sorted ascending (leftmost first)
    nextGap: 0, // distance the rightmost dot must travel before another spawns
  }));

  const newGap = (row) => rand(GAP_MIN, GAP_MAX) * row.height;
  const radius = (row) => row.height * RADIUS_SHARE;

  // Fill the whole width using the same gap rule so the row is never empty at load.
  const seed = (row) => {
    row.dots = [];
    if (!row.width || !row.height) return;
    const r = radius(row);
    let x = row.width + r - rand(0, newGap(row));
    while (x > -r) {
      row.dots.unshift(x);
      x -= newGap(row);
    }
    row.nextGap = newGap(row);
  };

  const resize = (row) => {
    const rect = row.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (width === row.width && height === row.height && dpr === row.dpr && row.dots.length) return;
    const prevWidth = row.width;
    row.width = width;
    row.height = height;
    row.dpr = dpr;
    row.canvas.width = Math.round(width * dpr);
    row.canvas.height = Math.round(height * dpr);
    if (!row.dots.length || !prevWidth) {
      seed(row);
    } else {
      // Keep relative positions across a resize.
      const scale = width / prevWidth;
      row.dots = row.dots.map((x) => x * scale);
      row.nextGap = newGap(row);
    }
    draw(row);
  };

  const step = (row, dt) => {
    if (!row.width || !row.height) return;
    const r = radius(row);
    const dx = row.width * SPEED_SHARE * dt;
    row.dots = row.dots.map((x) => x - dx).filter((x) => x >= -r);

    const spawnX = row.width + r;
    if (!row.dots.length) {
      row.dots.push(spawnX);
      row.nextGap = newGap(row);
      return;
    }
    // Spawn once the rightmost dot has travelled further than the current gap.
    let rightmost = row.dots[row.dots.length - 1];
    while (spawnX - rightmost > row.nextGap) {
      rightmost = rightmost + row.nextGap;
      row.dots.push(rightmost);
      row.nextGap = newGap(row);
    }
  };

  const draw = (row) => {
    const { ctx, width, height, dpr } = row;
    if (!width || !height) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = DOT_COLOR;
    const r = radius(row);
    const cy = height / 2;
    for (const x of row.dots) {
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // ---------- Sizing ----------

  let resizeTimer = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => rows.forEach(resize), 80);
  });
  rows.forEach((row) => ro.observe(row.canvas.parentElement));
  rows.forEach(resize);

  // ---------- Loop (shared, 30fps) ----------

  let last = performance.now();
  let acc = 0;
  const loop = (now) => {
    const elapsed = now - last;
    last = now;
    acc += elapsed;
    if (acc >= FRAME_MS) {
      const dt = Math.min(acc, 250) / 1000;
      acc = 0;
      for (const row of rows) {
        step(row, dt);
        draw(row);
      }
    }
    requestAnimationFrame(loop);
  };

  if (!reducedMotion) requestAnimationFrame(loop);

  window.__mainEventDebug = () => rows.map((row) => row.dots.length);
  window.__mainEventDots = () => rows.map((row) => row.dots.map((x) => Math.round(x)));
})();
