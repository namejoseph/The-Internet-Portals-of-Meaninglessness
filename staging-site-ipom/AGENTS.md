# Project information

- This is a static page: `index.html` and `style.css`. There is no package manager, build step, or committed test suite.
- Serve locally from this directory with `python3 -m http.server 8000 --bind 127.0.0.1`.
- Verify layout changes in a browser at desktop, tablet, and mobile widths, including 1024px, 768px, 576px, and 320px. Check panel order, viewport-height fit, absence of page overflow, and internal panel scrolling with long content.
- Above 56rem the page uses a fixed `100dvh` height with a `100vh` fallback. Keep grid row minimums at zero so panels can shrink; overflowing content should scroll inside panels instead of expanding the page.
- At 56rem and below the page scrolls vertically: every `.row .panel` is forced to `aspect-ratio: 1 / 1` (at least square) and grid rows are `auto`.
- `#footer-fine-print` glyph row is populated by `footer-fine-print.js` (random `ipom-img-footerfineprint-c1..c8.svg` per slot, count derived from available width).
- `#ticker-display` content lives in `ticker-display.js` (canvas, `ResizeObserver`-driven, 30fps rAF loop; respects `prefers-reduced-motion`).
- Layout colors and spacing are CSS custom properties in `:root`. Responsive breakpoints are 56rem and 36rem.
- The header SVG switches `viewBox` width per breakpoint in `script.js` (`LAYOUTS`: 2730.67 desktop, 2048 tablet, 1288 mobile) and shifts each `[data-strip-group]` along x. `--strip-height` in `style.css` must use the same width per breakpoint (height = 100vw * 90 / viewWidth) or `preserveAspectRatio="meet"` letterboxes the strip.
