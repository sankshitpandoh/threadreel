// Page extras around the studio: the strung ornaments, the motion switch,
// copy buttons on code, and the command line that matches the settings.
//
// Every ornament is straight chords between pegs; the curves are where the
// chords pile up. Each is built once as an SVG <symbol>, one path per symbol,
// and reused with <use>, so the page stays light.

const SVG = 'http://www.w3.org/2000/svg';
const f = (n) => n.toFixed(1);

function chords(pairs) {
  return pairs.map(([[x1, y1], [x2, y2]]) => `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`).join('');
}

function dots(points, r) {
  return points.map(([x, y]) => `M${f(x - r)} ${f(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`).join('');
}

// A curve stitch: n chords from leg a to leg b, a[i] to b[i], drawing the
// quadratic curve from p0 to p1 that bows towards c.
function stitch(p0, c, p1, n) {
  const pairs = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = [p0[0] + (c[0] - p0[0]) * t, p0[1] + (c[1] - p0[1]) * t];
    const b = [c[0] + (p1[0] - c[0]) * t, c[1] + (p1[1] - c[1]) * t];
    pairs.push([a, b]);
  }
  return pairs;
}

function ring(n, cx, cy, r, from = 0, to = Math.PI * 2) {
  const closed = to - from >= Math.PI * 2 - 1e-6;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = from + ((to - from) * i) / (closed ? n : n - 1);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// The arch over the plate: 49 pegs on a flattened half ellipse, each strung
// 11 along, so the chords lay a second, inner arch of their own.
function arch() {
  const pegs = [];
  const n = 49;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (Math.PI * i) / (n - 1);
    pegs.push([100 + 96 * Math.cos(a), 62 + 58 * Math.sin(a)]);
  }
  const pairs = [];
  for (let i = 0; i + 11 < n; i++) pairs.push([pegs[i], pegs[i + 11]]);
  return { d: chords(pairs), dots: dots(pegs, 1.1) };
}

// The halo behind the wordmark: 36 pegs, each strung to the one 13 along.
function halo() {
  const pegs = ring(36, 100, 100, 96);
  const pairs = pegs.map((p, i) => [p, pegs[(i + 13) % pegs.length]]);
  return { d: chords(pairs), dots: dots(pegs, 1.4) };
}

// Three leaves on a stem: each leaf two mirrored curve stitches.
function leaf() {
  const pairs = [[[4, 20], [236, 20]]];
  const leafAt = (x0, x1, h, n) => {
    const mid = (x0 + x1) / 2;
    pairs.push(...stitch([x0, 20], [mid, 20 - h], [x1, 20], n), ...stitch([x0, 20], [mid, 20 + h], [x1, 20], n));
  };
  leafAt(30, 88, 9, 8);
  leafAt(84, 156, 15, 11);
  leafAt(152, 210, 9, 8);
  return { d: chords(pairs), dots: dots([[4, 20], [236, 20], [120, 5], [120, 35]], 1.6) };
}

// The fan over the footer: two rows of pegs strung across each other.
function fan() {
  const n = 24;
  const top = Array.from({ length: n }, (_, i) => [(400 * i) / (n - 1), 0]);
  const bottom = Array.from({ length: n }, (_, i) => [(400 * i) / (n - 1), 60]);
  const pairs = top.map((p, i) => [p, bottom[n - 1 - i]]);
  for (let i = 0; i < n; i += 3) pairs.push([top[i], bottom[i]]);
  return { d: chords(pairs), dots: '' };
}

function buildSprite() {
  const sprite = document.createElementNS(SVG, 'svg');
  sprite.setAttribute('aria-hidden', 'true');
  sprite.setAttribute('class', 'sprite');
  const symbols = { 'orn-arch': [arch(), '0 0 200 64'], 'orn-halo': [halo(), '0 0 200 200'], 'orn-leaf': [leaf(), '0 0 240 40'], 'orn-fan': [fan(), '0 0 400 60'] };
  for (const [id, [shape, box]] of Object.entries(symbols)) {
    const symbol = document.createElementNS(SVG, 'symbol');
    symbol.id = id;
    symbol.setAttribute('viewBox', box);
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', shape.d);
    path.setAttribute('class', 'orn-thread');
    symbol.appendChild(path);
    if (shape.dots) {
      const pegs = document.createElementNS(SVG, 'path');
      pegs.setAttribute('d', shape.dots);
      pegs.setAttribute('class', 'orn-peg');
      symbol.appendChild(pegs);
    }
    sprite.appendChild(symbol);
  }
  document.body.prepend(sprite);
}

buildSprite();

// Motion switch. Remembered per browser; reduced-motion users never see motion.
const toggle = document.getElementById('motion-toggle');
const root = document.documentElement;
function setCalm(on) {
  root.classList.toggle('calm', on);
  toggle.setAttribute('aria-pressed', String(on));
  toggle.textContent = on ? 'Play motion' : 'Pause motion';
  const video = document.getElementById('original');
  if (video && video.src) on ? video.pause() : video.play().catch(() => {});
}
let calm = false;
try { calm = localStorage.getItem('threadreel-calm') === '1'; } catch {}
if (calm) setCalm(true);
toggle.addEventListener('click', () => {
  calm = !root.classList.contains('calm');
  setCalm(calm);
  try { localStorage.setItem('threadreel-calm', calm ? '1' : '0'); } catch {}
});

// Copy buttons copy the code text only.
for (const button of document.querySelectorAll('.copy[data-copy]')) {
  button.addEventListener('click', async () => {
    const code = document.getElementById(button.dataset.copy);
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.textContent.trim());
      button.textContent = 'Copied';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      button.textContent = 'Selected';
    }
    button.classList.add('done');
    setTimeout(() => {
      button.textContent = 'Copy';
      button.classList.remove('done');
    }, 1600);
  });
}

// The command line that reproduces the studio's settings. Flags that match the
// command line's own defaults are left out.
const cli = document.getElementById('cli-cmd');
const value = (id) => document.getElementById(id).value;
const checked = (sel) => document.querySelector(sel).checked;

function command() {
  const [mode, bg] = document.querySelector('input[name="thread"]:checked').value.split('-');
  const shape = document.querySelector('input[name="shape"]:checked').value;
  const intro = Number(value('intro'));
  const parts = ['threadreel -i clip.mp4 -o clip-threads.mp4'];
  if (shape !== 'circle') parts.push(`-shape ${shape}`);
  if (value('pegs') !== '240') parts.push(`-p ${value('pegs')}`);
  if (value('lines') !== '2500') parts.push(`-n ${value('lines')}`);
  if (mode === 'color') parts.push('-mode color');
  if (bg === 'black') parts.push('-bg black');
  if (value('opacity') !== '0.3') parts.push(`-opacity ${value('opacity')}`);
  if (value('thickness') !== '1') parts.push(`-thickness ${value('thickness')}`);
  if (value('quality') !== '128') parts.push(`-q ${value('quality')}`);
  if (value('fps') !== '12') parts.push(`-fps ${value('fps')}`);
  parts.push(`-t ${value('duration')}`);
  if (intro > 0) parts.push(`-intro ${intro}`);
  parts.push(`-s ${value('size')}`);
  if (checked('#all-lines')) parts.push('-all-lines');
  if (checked('#pegs-visible')) parts.push('-pegs-visible');
  return parts.join(' ');
}

if (cli) {
  const update = () => (cli.textContent = command());
  const controls = document.querySelector('.controls');
  controls.addEventListener('input', update);
  controls.addEventListener('change', update);
  controls.addEventListener('click', () => requestAnimationFrame(update)); // presets set values in code
  update();
}
