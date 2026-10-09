(() => {
  // Fine, subtle pixie dust that drifts down from wherever the cursor is.
  // Mouse/trackpad only; skipped entirely for touch and prefers-reduced-motion.
  if (!matchMedia('(pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'cursor-trail';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const COLORS = ['#ada6b3', '#ada6b3', '#8a8292', '#4c4080', '#d6d0dc', '#ffffff'];
  const MAX = 700;
  const MOVE_DENSITY = 1 / 2.5; // particles per pixel travelled
  const IDLE_RATE = 0.35; // particles per frame while resting

  let width = 0;
  let height = 0;
  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = innerWidth;
    height = innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener('resize', resize);

  const rand = (a, b) => a + Math.random() * (b - a);
  const particles = [];
  const pointer = { x: 0, y: 0, inside: false };
  let carry = 0;
  let running = false;

  const spawn = (x, y) => {
    if (particles.length >= MAX) return;
    const life = rand(70, 180);
    const star = Math.random() < 0.1;
    particles.push({
      x: x + rand(-6, 6),
      y: y + rand(-2, 6),
      vx: rand(-0.25, 0.25),
      vy: rand(0.15, 0.7),
      size: star ? rand(1.8, 2.8) : rand(0.9, 2),
      star,
      life,
      maxLife: life,
      alpha: rand(0.55, 1),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      phase: rand(0, Math.PI * 2),
      twinkle: rand(0.08, 0.25),
    });
  };

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    const dist = pointer.inside ? Math.hypot(dx, dy) : 0;
    carry += dist * MOVE_DENSITY;
    // Spread move-spawns along the path so fast flicks leave a line, not clumps.
    const steps = Math.floor(carry);
    for (let i = 0; i < steps; i++) {
      const t = (i + 1) / (steps + 1);
      spawn(pointer.x + dx * t, pointer.y + dy * t);
    }
    carry -= steps;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.inside = true;
    start();
  }, { passive: true });

  document.addEventListener('pointerleave', () => { pointer.inside = false; });
  addEventListener('blur', () => { pointer.inside = false; });

  let idleCarry = 0;
  const frame = (time) => {
    ctx.clearRect(0, 0, width, height);

    if (pointer.inside && !document.hidden) {
      idleCarry += IDLE_RATE;
      while (idleCarry >= 1) {
        spawn(pointer.x, pointer.y);
        idleCarry -= 1;
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= 1;
      if (p.life <= 0 || p.y > height + 10) {
        particles.splice(i, 1);
        continue;
      }
      const age = 1 - p.life / p.maxLife;
      p.vy = Math.min(p.vy + 0.012, 1.4); // gentle gravity
      p.vx = p.vx * 0.985 + Math.sin(time * 0.002 + p.phase) * 0.01; // flutter
      p.x += p.vx;
      p.y += p.vy;

      const fade = age < 0.1 ? age / 0.1 : 1 - Math.max(0, age - 0.45) / 0.55;
      const sparkle = 0.65 + 0.35 * Math.sin(time * p.twinkle * 0.05 + p.phase);
      ctx.globalAlpha = Math.max(0, p.alpha * fade * sparkle);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      if (p.star) {
        // Little twinkling cross on the larger specks.
        const c = p.size / 2;
        const arm = p.size * 1.6 * sparkle;
        ctx.fillRect(p.x + c - 0.35, p.y + c - arm, 0.7, arm * 2);
        ctx.fillRect(p.x + c - arm, p.y + c - 0.35, arm * 2, 0.7);
      }
    }
    ctx.globalAlpha = 1;

    if (particles.length || pointer.inside) {
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  };

  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }
})();
