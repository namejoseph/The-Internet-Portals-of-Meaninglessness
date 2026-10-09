(() => {
  const root = document.querySelector('#footer-fine-print .fine-print');
  if (!root) return;

  const sides = [...root.querySelectorAll('.fine-print-side')];
  const center = root.querySelector('.fine-print-center');
  const GLYPH_COUNT = 8; // ipom-img-footerfineprint-c1 ... c8
  const SPACING = 2.4; // slot width as a multiple of glyph size
  const MIN_COUNT = 2; // always at least two glyphs per side
  const MIN_SPACING = 1.3; // tightest slot allowed when forcing MIN_COUNT

  // Persistent random picks so resizing only adds/removes glyphs at the ends
  // instead of reshuffling the whole row.
  const picks = sides.map(() => []);
  const pickFor = (side, index) => {
    while (picks[side].length <= index) {
      picks[side].push(1 + Math.floor(Math.random() * GLYPH_COUNT));
    }
    return picks[side][index];
  };

  const makeGlyph = (n) => {
    const img = document.createElement('img');
    img.className = 'fine-print-glyph';
    img.src = `ipom-img-footerfineprint-c${n}.svg`;
    img.alt = '';
    return img;
  };

  const layout = () => {
    // Measure at full size, then shrink the row (via --fine-print-scale) only if
    // MIN_COUNT glyphs per side can't fit beside the centre graphic.
    root.style.setProperty('--fine-print-scale', 1);
    const rootWidth = root.getBoundingClientRect().width;
    const centerWidth = center.getBoundingClientRect().width;
    const glyphSize = parseFloat(getComputedStyle(center).height) || 0;
    const gap = parseFloat(getComputedStyle(root).columnGap) || 0;
    if (!rootWidth || !centerWidth || !glyphSize) return;
    const scale = Math.min(1, (rootWidth - 2 * gap) / (centerWidth + 2 * MIN_COUNT * MIN_SPACING * glyphSize));
    root.style.setProperty('--fine-print-scale', scale.toFixed(3));
    const sideWidth = sides[0].getBoundingClientRect().width;
    const count = Math.max(MIN_COUNT, Math.floor(sideWidth / (glyphSize * scale * SPACING)));
    sides.forEach((side, s) => {
      while (side.children.length > count) side.lastElementChild.remove();
      while (side.children.length < count) side.append(makeGlyph(pickFor(s, side.children.length)));
    });
  };

  let timer = 0;
  new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(layout, 60);
  }).observe(root);

  layout();
})();
