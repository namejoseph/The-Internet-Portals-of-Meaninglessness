(() => {
  const panel = document.querySelector('#informatics-menu');
  const frame = panel && panel.querySelector('.informatics-frame');
  const stream = panel && panel.querySelector('.informatics-stream');
  if (!panel || !frame || !stream) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Tunables ----------

  const TITLE_LEN = [12, 18];     // title length range, chars
  const CHAR_DELAY = [9, 27];     // ms per typed character
  const LINE_PAUSE = [30, 110];   // ms between lines
  const HOLD_TIME = [3000, 4200]; // ms the filled frame rests
  const FADE_TIME = 650;          // ms; slightly longer than the CSS opacity transition
  const RESIZE_DEBOUNCE = 80;     // ms
  const HEADING_CHANCE = 0.6;     // odds a section gets a heading line
  const HEADING_CAP_CHANCE = 0.7; // odds a heading ends in = or :
  const TWO_WORD_TITLE = 0.45;    // odds the title is two short words
  const SYMBOL_CHANCE = 0.08;     // odds a "word" is digits or a symbol
  const PUNCT_CHANCE = 0.1;       // odds a word ends in , . or :
  const VOWEL_CHANCE = 0.35;      // vowel weighting for pronounceable gibberish
  const CHAR_W_SAFETY = 1.1;      // widen measured average char width for safety
  const LINE_HEIGHT_EM = 1.5;     // must match .informatics-frame line-height

  const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';
  const VOWELS = 'aeiou';
  const SYMBOLS = ['%', '§', '†', '⁄', '–'];

  const rand = (min, max) => min + Math.random() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const chance = (p) => Math.random() < p;

  // ---------- Gibberish generator ----------

  const letter = () => (chance(VOWEL_CHANCE) ? pick(VOWELS) : pick(CONSONANTS));

  const word = () => {
    if (chance(SYMBOL_CHANCE)) {
      return chance(0.7) ? String(randInt(1, 9999)) : pick(SYMBOLS);
    }
    let w = '';
    for (let i = 0, n = randInt(2, 9); i < n; i++) w += letter();
    if (chance(PUNCT_CHANCE)) w += pick([',', '.', ':']);
    return w;
  };

  const upperWord = (n) => {
    let w = '';
    for (let i = 0; i < n; i++) w += letter();
    return w.toUpperCase();
  };

  const makeTitle = (maxChars) => {
    const target = randInt(TITLE_LEN[0], TITLE_LEN[1]);
    let t;
    if (chance(TWO_WORD_TITLE)) {
      const a = randInt(4, Math.max(4, target - 6));
      t = `${upperWord(a)} ${upperWord(Math.max(3, target - a - 1))}`;
    } else {
      t = upperWord(target);
    }
    return t.slice(0, maxChars);
  };

  const makeHeading = (maxChars) => {
    const parts = [];
    for (let i = 0, n = randInt(1, 3); i < n; i++) {
      parts.push(word().replace(/[,.:]$/, ''));
    }
    let h = parts.join(' ');
    h = h.charAt(0).toUpperCase() + h.slice(1);
    if (chance(HEADING_CAP_CHANCE)) h += pick(['=', ':']);
    return h.slice(0, maxChars);
  };

  const makeBulletLine = (maxChars) => {
    const target = randInt(Math.ceil(maxChars * 0.45), maxChars);
    let line = '';
    while (line.length < target) {
      const next = line ? `${line} ${word()}` : word();
      if (next.length > maxChars) {
        if (!line) line = next.slice(0, maxChars);
        break;
      }
      line = next;
    }
    return line;
  };

  // ---------- Document generator ----------
  // Budgets in line units (1.0 = one line-height); block margins are charged
  // too, collapsing simulated via Math.max(prevBottom, nextTop).

  const buildDocument = (maxChars, maxLines) => {
    const items = [{ type: 'title', text: makeTitle(maxChars) }];
    let used = 1;
    let lastMargin = 0.9; // em — title's margin-bottom

    const fits = (lines, mt, mb) =>
      used + Math.max(lastMargin, mt) / LINE_HEIGHT_EM + lines + mb / LINE_HEIGHT_EM <= maxLines;
    const commit = (lines, mt, mb) => {
      used += Math.max(lastMargin, mt) / LINE_HEIGHT_EM + lines;
      lastMargin = mb;
    };

    while (true) {
      if (chance(HEADING_CHANCE) && fits(1, 0.9, 0.35)) {
        items.push({ type: 'heading', text: makeHeading(maxChars) });
        commit(1, 0.9, 0.35);
      }
      const room =
        maxLines - used - Math.max(lastMargin, 0) / LINE_HEIGHT_EM - 0.6 / LINE_HEIGHT_EM;
      const count = Math.min(randInt(2, 7), Math.floor(room));
      if (count <= 0) break;
      const list = [];
      for (let i = 0; i < count; i++) list.push(makeBulletLine(maxChars));
      items.push({ type: 'ul', items: list });
      commit(count, 0, 0.6);
    }
    return items;
  };

  // ---------- Fit measurement ----------

  const measureFit = () => {
    const probe = document.createElement('span');
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'nowrap';
    probe.setAttribute('aria-hidden', 'true');
    let sample = '';
    for (let i = 0; i < 40; i++) sample += letter();
    probe.textContent = sample;
    stream.append(probe);
    const charW = (probe.getBoundingClientRect().width / 40) * CHAR_W_SAFETY || 6;
    probe.remove();

    const cs = getComputedStyle(frame);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * LINE_HEIGHT_EM;
    const maxChars = Math.max(6, Math.floor((frame.clientWidth - padX) / charW) - 1);
    const maxLines = Math.max(2, Math.floor((frame.clientHeight - padY) / lineHeight));
    return { maxChars, maxLines };
  };

  // ---------- Typewriter ----------
  // Every scheduled step captures runId; bumping runId invalidates all
  // pending timeouts, which is how resize/restart cancels a run mid-type.

  let runId = 0;
  let phase = 'typing';
  let lines = [];
  let lineIndex = 0;

  const schedule = (fn, delay) => {
    const id = runId;
    setTimeout(() => {
      if (id === runId) fn();
    }, delay);
  };

  // Flatten items into one entry per line; li entries share their section's ul.
  const flatten = (items) => {
    const flat = [];
    items.forEach((item) => {
      if (item.type === 'ul') {
        const ul = document.createElement('ul');
        item.items.forEach((text) => flat.push({ ul, text }));
      } else {
        flat.push({ item, text: item.text });
      }
    });
    return flat;
  };

  const typeText = (el, text, i) => {
    schedule(() => {
      el.textContent = text.slice(0, i + 1);
      if (i + 1 < text.length) {
        typeText(el, text, i + 1);
      } else {
        schedule(step, rand(LINE_PAUSE[0], LINE_PAUSE[1]));
      }
    }, rand(CHAR_DELAY[0], CHAR_DELAY[1]));
  };

  const step = () => {
    if (lineIndex >= lines.length) {
      hold();
      return;
    }
    const line = lines[lineIndex++];
    let el;
    if (line.ul) {
      if (!line.ul.parentNode) stream.append(line.ul);
      el = document.createElement('li');
      line.ul.append(el);
    } else {
      el = document.createElement('div');
      el.className = `informatics-${line.item.type}`;
      stream.append(el);
    }
    typeText(el, line.text, 0);
  };

  const hold = () => {
    phase = 'holding';
    schedule(() => {
      phase = 'fading';
      stream.classList.add('is-fading');
      schedule(restart, FADE_TIME);
    }, rand(HOLD_TIME[0], HOLD_TIME[1]));
  };

  const renderInstant = (maxChars, maxLines) => {
    buildDocument(maxChars, maxLines).forEach((item) => {
      if (item.type === 'ul') {
        const ul = document.createElement('ul');
        item.items.forEach((text) => {
          const li = document.createElement('li');
          li.textContent = text;
          ul.append(li);
        });
        stream.append(ul);
      } else {
        const div = document.createElement('div');
        div.className = `informatics-${item.type}`;
        div.textContent = item.text;
        stream.append(div);
      }
    });
  };

  const restart = () => {
    runId += 1; // invalidate pending timeouts from the previous run
    lineIndex = 0;
    stream.innerHTML = '';
    stream.classList.remove('is-fading');
    const { maxChars, maxLines } = measureFit();
    if (reducedMotion) {
      phase = 'holding';
      renderInstant(maxChars, maxLines);
      return;
    }
    phase = 'typing';
    lines = flatten(buildDocument(maxChars, maxLines));
    step();
  };

  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(restart, RESIZE_DEBOUNCE);
  }).observe(frame);

  window.__informaticsDebug = () => ({ lines: stream.children.length, phase });

  // Measure only after the alien font is ready so maxChars is computed with
  // real glyph widths instead of the monospace fallback's.
  if (document.fonts && document.fonts.load) {
    document.fonts.load('1em "Portal Galactico"').then(restart, restart);
  } else {
    restart();
  }
})();
