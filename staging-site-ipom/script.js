(() => {
  const svg = document.querySelector('.top-strip-svg');
  if (!svg) return;

  const activateOnKey = (element, handler) => {
    element.addEventListener('click', handler);
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handler(event);
      }
    });
  };

  // 0. Responsive layout: the viewBox width sets how large the controls render,
  // so each breakpoint gets its own width and per-group x offsets. Must stay in
  // sync with --strip-height in style.css (height = 100vw * 90 / viewWidth).
  const LAYOUTS = [
    { query: '(max-width: 36rem)', width: 1288, offsets: { commas: 0, target: 0, 'dot-dash': -5, 'minus-plus': -125, brightness: -170, slider: -290, bars: -760 } },
    { query: '(max-width: 56rem)', width: 2048, offsets: {} },
    { query: null, width: 2730.67, offsets: { commas: 6, target: 135, 'dot-dash': 166, 'minus-plus': 240, brightness: 283, slider: 415, bars: 682.67 } },
  ];
  const groups = [...svg.querySelectorAll('[data-strip-group]')];
  const queries = LAYOUTS.filter((l) => l.query).map((l) => matchMedia(l.query));

  const applyLayout = () => {
    const layout = LAYOUTS.find((l, i) => !l.query || queries[i].matches);
    svg.setAttribute('viewBox', `0 0 ${layout.width} 90`);
    groups.forEach((g) => {
      const dx = layout.offsets[g.dataset.stripGroup] || 0;
      g.setAttribute('transform', `translate(${dx} 0)`);
    });
  };

  queries.forEach((q) => q.addEventListener('change', applyLayout));
  applyLayout();

  // 1. Commas: move the marker box to the clicked comma.
  const marker = svg.querySelector('#comma-marker');
  const commas = [...svg.querySelectorAll('.comma')];
  const markerWidth = Number(marker.getAttribute('width'));
  const stripCenterY = 45;

  const centerCommas = () => {
    const style = getComputedStyle(commas[0]);
    const context = document.createElement('canvas').getContext('2d');
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const glyph = context.measureText(',');
    const baseline = stripCenterY + (glyph.actualBoundingBoxAscent - glyph.actualBoundingBoxDescent) / 2;
    commas.forEach((comma) => comma.setAttribute('y', baseline.toFixed(2)));
  };

  centerCommas();
  document.fonts?.ready.then(centerCommas);

  const selectComma = (comma) => {
    const box = comma.getBBox();
    marker.setAttribute('x', box.x + box.width / 2 - markerWidth / 2);
    commas.forEach((item) => item.setAttribute('aria-pressed', String(item === comma)));
  };

  commas.forEach((comma) => activateOnKey(comma, () => selectComma(comma)));
  selectComma(commas[1]);

  // 2. Target: rotate which color sits outside, middle, and inside.
  const target = svg.querySelector('#target-control');
  const rings = [...target.querySelectorAll('circle')];
  const ringColors = rings.map((ring) => ring.getAttribute('fill'));

  activateOnKey(target, () => {
    ringColors.unshift(ringColors.pop());
    rings.forEach((ring, index) => ring.setAttribute('fill', ringColors[index]));
  });

  // 3. Dot and dash: toggle between filled and outlined.
  svg.querySelectorAll('.toggle-outline').forEach((mark) => {
    activateOnKey(mark, () => {
      const outlined = mark.classList.toggle('is-outlined');
      mark.setAttribute('aria-pressed', String(outlined));
    });
  });

  // 4. Minus and plus: rotate 45 degrees per click.
  svg.querySelectorAll('.rotates').forEach((mark) => {
    let turns = 0;
    activateOnKey(mark, () => {
      turns += 1;
      mark.style.transform = `rotate(${turns * 45}deg)`;
    });
  });

  // 5. Dot: random brightness per click.
  const brightnessDot = svg.querySelector('#brightness-dot');
  activateOnKey(brightnessDot, () => {
    const lightness = 35 + Math.random() * 60;
    brightnessDot.style.fill = `hsl(205 92% ${lightness.toFixed(1)}%)`;
  });

  // 6. Slider: click or drag the knob along the track.
  const slider = svg.querySelector('#main-slider');
  const track = slider.querySelector('.slider-track');
  const knob = slider.querySelector('#slider-knob');
  const min = Number(track.getAttribute('x1'));
  const max = Number(track.getAttribute('x2'));

  const setKnob = (x) => {
    const clamped = Math.min(max, Math.max(min, x));
    knob.setAttribute('cx', clamped);
    knob.setAttribute('aria-valuenow', Math.round(((clamped - min) / (max - min)) * 100));
  };

  const pointerToSvgX = (event) => {
    const point = new DOMPoint(event.clientX, event.clientY);
    return point.matrixTransform(track.getScreenCTM().inverse()).x;
  };

  slider.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    knob.setPointerCapture(event.pointerId);
    slider.classList.add('is-dragging');
    setKnob(pointerToSvgX(event));
    knob.focus({ preventScroll: true });
  });

  knob.addEventListener('pointermove', (event) => {
    if (slider.classList.contains('is-dragging')) setKnob(pointerToSvgX(event));
  });

  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
    knob.addEventListener(type, () => slider.classList.remove('is-dragging'));
  });

  knob.addEventListener('keydown', (event) => {
    const step = (max - min) / 50;
    const current = Number(knob.getAttribute('cx'));
    const moves = {
      ArrowLeft: current - step,
      ArrowDown: current - step,
      ArrowRight: current + step,
      ArrowUp: current + step,
      Home: min,
      End: max,
    };
    if (event.key in moves) {
      event.preventDefault();
      setKnob(moves[event.key]);
    }
  });

  // 7. Bars button: swap the box color with the bars.
  const bars = svg.querySelector('#bars-control');
  activateOnKey(bars, () => {
    const swapped = bars.classList.toggle('is-swapped');
    bars.setAttribute('aria-pressed', String(swapped));
  });
})();
