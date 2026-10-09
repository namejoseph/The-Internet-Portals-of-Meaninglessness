(() => {
  const welcome = document.getElementById('welcome');
  if (!welcome) return;
  const title = welcome.querySelector('.welcome-title');
  const credit = welcome.querySelector('.welcome-credit');
  const enter = welcome.querySelector('.welcome-enter');
  const audio = document.getElementById('welcome-audio');

  const randInt = (n) => Math.floor(Math.random() * n);
  const activate = (el, fn) => {
    el.addEventListener('click', fn);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fn();
      }
    });
  };

  // ---------- Title: click n swaps n random pairs of letters (capped at letter count) ----------

  const chars = title.textContent.split('');
  const letterIdx = chars.map((c, i) => (c.trim() ? i : -1)).filter((i) => i >= 0);
  let swaps = 0;

  activate(title, () => {
    swaps = Math.min(swaps + 1, letterIdx.length);
    for (let k = 0; k < swaps; k++) {
      const a = letterIdx[randInt(letterIdx.length)];
      let b = a;
      while (b === a) b = letterIdx[randInt(letterIdx.length)];
      [chars[a], chars[b]] = [chars[b], chars[a]];
    }
    title.textContent = chars.join('');
  });

  // ---------- Credit line: toggle random letters flipping upside down ----------

  const originalText = credit.textContent.trim() || 'created by joseph salazar';
  credit.innerHTML = '';
  const spans = Array.from(originalText).map((c) => {
    const s = document.createElement('span');
    s.textContent = c === ' ' ? '\u00a0' : c;
    credit.appendChild(s);
    return s;
  });
  const letters = spans.filter((s) => s.textContent.trim());
  const timers = new Map();

  const scheduleFlip = (s) => {
    timers.set(
      s,
      setTimeout(() => {
        s.classList.toggle('is-flipped');
        scheduleFlip(s);
      }, 250 + Math.random() * 2200)
    );
  };

  activate(credit, () => {
    const on = credit.getAttribute('aria-pressed') !== 'true';
    credit.setAttribute('aria-pressed', String(on));
    if (on) {
      letters.forEach(scheduleFlip);
    } else {
      timers.forEach(clearTimeout);
      timers.clear();
      letters.forEach((s) => s.classList.remove('is-flipped'));
    }
  });

  // ---------- Enter button: optically centre the label ----------
  // With line-height 1 the browser centres the font's ascent+descent box, not the ink.
  // Measure both with canvas (same metrics the browser uses) and shift by the difference.

  const centreEnterLabel = () => {
    const label = enter.firstElementChild;
    if (!label) return;
    const cs = getComputedStyle(enter);
    const size = 100;
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    const m = ctx.measureText(label.textContent);
    if (m.fontBoundingBoxAscent === undefined) return;
    const baseline = (size - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    const inkCentre = baseline - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    enter.style.setProperty('--enter-nudge', `${((size / 2 - inkCentre) / size).toFixed(3)}em`);
  };
  centreEnterLabel();
  if (document.fonts) document.fonts.ready.then(centreEnterLabel);

  // ---------- Enter: fade out, reveal the site, start the music ----------

  enter.addEventListener('click', () => {
    if (audio) audio.play().catch(() => {});
    welcome.classList.add('is-leaving');
    document.body.classList.remove('welcome-open');
    const done = () => {
      welcome.hidden = true;
      timers.forEach(clearTimeout);
      timers.clear();
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else {
      const onEnd = (e) => {
        if (e.target !== welcome) return;
        welcome.removeEventListener('transitionend', onEnd);
        done();
      };
      welcome.addEventListener('transitionend', onEnd);
    }
  });

  enter.focus({ preventScroll: true });
})();
