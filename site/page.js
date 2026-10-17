// Page extras around the studio: the strung sun and floor, the motion switch,
// copy buttons on code, and the command line that matches the settings.

const SVG = 'http://www.w3.org/2000/svg';

function line(parent, x1, y1, x2, y2, cls) {
  const l = document.createElementNS(SVG, 'line');
  l.setAttribute('x1', x1.toFixed(1));
  l.setAttribute('y1', y1.toFixed(1));
  l.setAttribute('x2', x2.toFixed(1));
  l.setAttribute('y2', y2.toFixed(1));
  if (cls) l.setAttribute('class', cls);
  parent.appendChild(l);
}

// The sun is a circular string frame: 48 pegs, each strung to the peg 17 along.
function stringSun(svg) {
  const n = 48;
  const peg = (i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [100 + 98 * Math.cos(a), 100 + 98 * Math.sin(a)];
  };
  for (let i = 0; i < n; i++) {
    const [x1, y1] = peg(i);
    const [x2, y2] = peg(i + 17);
    line(svg, x1, y1, x2, y2);
  }
}

// The floor is threads from pegs on the horizon to pegs along the bottom edge,
// each horizon peg strung straight down and to its neighbours' far pegs.
function stringFloor(svg) {
  const top = 25;
  const bottomSpan = 3.2; // the bottom row is wider than the screen
  for (let i = 0; i <= top; i++) {
    const t = i / top;
    const x = t * 1200;
    const xb = 600 + (t - 0.5) * 1200 * bottomSpan;
    line(svg, x, 0, xb, 400, i % 5 === 0 ? 'hot' : '');
    if (i < top) {
      const xn = 600 + ((i + 1) / top - 0.5) * 1200 * bottomSpan;
      line(svg, x, 0, xn, 400);
    }
  }
}

const sun = document.getElementById('sun-chords');
const floor = document.getElementById('floor');
if (sun) stringSun(sun);
if (floor) stringFloor(floor);

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
