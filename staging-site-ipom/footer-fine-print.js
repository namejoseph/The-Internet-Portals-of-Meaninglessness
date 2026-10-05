(() => {
  const root = document.querySelector('#footer-fine-print .fine-print');
  if (!root) return;

  const sides = [...root.querySelectorAll('.fine-print-side')];
  const center = root.querySelector('.fine-print-center');
  const GLYPH_COUNT = 8; // ipom-img-footerfineprint-c1 ... c8
  const SPACING = 2.4; // slot width as a multiple of glyph size

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
    const sideWidth = sides[0].getBoundingClientRect().width;
    const glyphSize = parseFloat(getComputedStyle(center).height) || 0;
    if (!sideWidth || !glyphSize) return;
    const count = Math.max(0, Math.floor(sideWidth / (glyphSize * SPACING)));
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
