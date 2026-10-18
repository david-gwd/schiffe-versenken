const Board = (() => {
  const LETTERS = 'ABCDEFGHIJKLMNO';

  // Zufälliger Hintergrundstern pro Zelle (nur im Weltraum-Theme sichtbar): Position, Größe, Helligkeit
  const rnd = (a, b) => a + Math.random() * (b - a);
  function randomStar(c) {
    if (Math.random() < 0.4) return; // ca. 40 % der Felder ohne Stern
    const s = Math.random() < 0.85 ? 1 : 2;
    c.style.setProperty('--ss', s + 'px');
    c.style.setProperty('--sx', rnd(10, 85).toFixed(0) + '%');
    c.style.setProperty('--sy', rnd(10, 85).toFixed(0) + '%');
    c.style.setProperty('--so', rnd(0.2, 0.55).toFixed(2));
    if (Math.random() < 0.2) c.style.setProperty('--s2', `${(rnd(-14, 14)).toFixed(0)}px ${(rnd(-14, 14)).toFixed(0)}px 0 #b9c4ff`);
  }

  // Baut Beschriftung (Buchstaben oben, Zahlen links) und size×size Zellen in `el`.
  function build(el, size, { onClick, onHover, onLeave } = {}) {
    el.innerHTML = '';
    el.style.setProperty('--n', size);
    el._size = size;
    const mk = (cls, parent) => { const d = document.createElement('div'); d.className = cls; parent.appendChild(d); return d; };
    mk('corner', el);
    const cols = mk('labels cols', el);
    const rows = mk('labels rows', el);
    const grid = mk('grid', el);
    for (let i = 0; i < size; i++) {
      mk('label', cols).textContent = LETTERS[i];
      mk('label', rows).textContent = i + 1;
    }
    el._cells = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const c = mk('cell fresh', grid);
      randomStar(c);
      if (onClick) c.addEventListener('click', () => onClick(x, y));
      if (onHover) c.addEventListener('mouseenter', () => onHover(x, y));
      el._cells.push(c);
    }
    if (onLeave) grid.addEventListener('mouseleave', onLeave);
  }

  const cell = (el, x, y) => el._cells[y * el._size + x];

  function clear(el, ...classes) {
    for (const c of el._cells) c.classList.remove(...classes);
  }

  function drawShips(el, ships) {
    clear(el, 'ship', 'k2', 'k3', 'k4', 'k5');
    for (const s of ships) for (const c of s.cells) cell(el, c.x, c.y).classList.add('ship', `k${Rules.tierOf(s)}`);
  }

  function mark(el, x, y, result) {
    const c = cell(el, x, y);
    c.classList.remove('fresh');
    if (result === 'miss') c.classList.add('miss');
    else c.classList.add('hit');
  }

  function markSunk(el, ship, water) {
    for (const c of ship.cells) {
      const e = cell(el, c.x, c.y);
      e.classList.add('hit', 'sunk', `k${Rules.tierOf(ship)}`); e.classList.remove('fresh');
    }
    for (const w of water || []) {
      const e = cell(el, w.x, w.y);
      if (!e.classList.contains('hit')) mark(el, w.x, w.y, 'miss');
    }
  }

  return { build, cell, clear, drawShips, mark, markSunk };
})();
