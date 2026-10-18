(() => {
  const $ = (id) => document.getElementById(id);
  const screens = ['start', 'lobby', 'place', 'game'];
  const show = (name) => {
    screens.forEach((s) => ($('screen-' + s).hidden = s !== name));
    $('theme-switch').hidden = name !== 'start';
  };
  const ownEl = $('own-board'), oppEl = $('opp-board');
  let ws, myTurn = false, active = false, myShips = [], myName = 'Kapitän', cfg = Rules.getConfig('normal', 'classic');

  const TXT = {
    classic: { place: 'Platziere deine Flotte', win: 'Du hast gewonnen!', lose: 'Du hast verloren.', winHead: 'Sieg', loseHead: 'Niederlage', winText: 'Die gegnerische Flotte liegt auf dem Grund.', loseText: 'Deine Flotte wurde versenkt.', bar: 'SPIEL_VORBEI.EXE', icon: 'ship.png', title: 'Schiffe versenken', themeName: 'Klassisch', defaultName: 'Kapitän' },
    space: { place: 'Platziere deine Objekte im Weltraum', win: 'Du hast gewonnen – alle Objekte zerstört!', lose: 'Du hast verloren – dein Sektor ist leer.', winHead: 'Sieg', loseHead: 'Niederlage', winText: 'Der gegnerische Sektor ist ausgelöscht.', loseText: 'Dein Sektor ist leer.', bar: 'MISSION_ENDE.EXE', icon: 'rocket.png', title: 'Weltraum-Schlacht', themeName: 'Weltraum', defaultName: 'Astronaut' },
  };
  let theme = 'classic';

  function applyTheme(t) {
    theme = t;
    document.body.classList.toggle('theme-space', t === 'space');
    document.body.classList.toggle('theme-classic', t === 'classic');
    for (const el of document.querySelectorAll('[data-classic]')) el.textContent = el.dataset[t];
    document.title = TXT[t].title;
    $('name').placeholder = TXT[t].defaultName;
    $('favicon').href = t === 'space' ? 'rocket.png' : 'ship.png';
    $('theme-switch').setAttribute('aria-checked', t === 'space');
  }

  // Konfiguration + Theme aus einer Server-Nachricht übernehmen
  function useConfig(m) {
    cfg = Rules.getConfig(m.mode, m.theme);
    applyTheme(cfg.theme);
  }

  const store = {
    get() { try { return JSON.parse(sessionStorage.getItem('sv') || 'null'); } catch { return null; } },
    set(v) { try { sessionStorage.setItem('sv', JSON.stringify(v)); } catch {} },
    clear() { try { sessionStorage.removeItem('sv'); } catch {} },
  };

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2500);
  }

  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

  function setStatus() {
    if (!active) return;
    $('status').textContent = myTurn ? 'Du bist dran – schieße aufs rechte Feld!' : 'Gegner ist dran …';
    oppEl.classList.toggle('target', myTurn);
  }

  function enterPlacing() {
    $('end-modal').hidden = true;
    Placement.setConfig(cfg);
    $('btn-ready').disabled = true;
    $('place-info').textContent = TXT[theme].place;
    show('place');
  }

  function enterGame(yourTurn) {
    myShips = Placement.ships();
    $('own-title').textContent = `${myName} (du)`;
    Board.build(ownEl, cfg.size);
    Board.drawShips(ownEl, myShips);
    Board.build(oppEl, cfg.size, { onClick: (x, y) => {
      if (!active || !myTurn) return;
      if (!Board.cell(oppEl, x, y).classList.contains('fresh')) return;
      send({ type: 'shoot', x, y });
    } });
    $('over').hidden = true; $('end-row-game').hidden = false;
    active = true; myTurn = yourTurn;
    show('game'); setStatus();
  }

  function showEndModal(won) {
    const t = TXT[theme];
    $('end-bar').textContent = t.bar;
    $('end-icon').src = t.icon;
    $('end-title').textContent = won ? t.winHead : t.loseHead;
    $('end-text').textContent = won ? t.winText : t.loseText;
    const body = $('end-modal').querySelector('.end-body');
    body.classList.toggle('win-state', won); body.classList.toggle('lose-state', !won);
    $('pop-rematch').disabled = false;
    $('end-modal').hidden = false;
  }

  function onShot(m) {
    const target = m.by === 'you' ? oppEl : ownEl;
    if (m.result === 'sunk') Board.markSunk(target, m.sunkShip, m.water);
    else Board.mark(target, m.x, m.y, m.result);
    myTurn = m.yourTurn;
    setStatus();
  }

  function connect(first) {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    ws.onopen = first;
    ws.onmessage = (ev) => handle(JSON.parse(ev.data));
    ws.onclose = () => { if (store.get()) { toast('Verbindung verloren – versuche erneut …'); setTimeout(resume, 2000); } };
  }

  function resume() {
    const s = store.get();
    if (!s) return;
    connect(() => send({ type: 'resume', code: s.code, playerId: s.playerId }));
  }

  function handle(m) {
    switch (m.type) {
      case 'created':
        useConfig(m);
        $('mode-label').textContent = `${TXT[theme].themeName} · ${cfg.label}`;
        store.set({ code: m.code, playerId: m.playerId });
        $('room-code').textContent = m.code;
        $('link').value = `${location.origin}/?room=${m.code}`;
        show('lobby'); break;
      case 'joined':
        useConfig(m);
        store.set({ code: m.code, playerId: m.playerId });
        toast(`Beigetreten – Gegner: ${m.opponent} (${TXT[theme].themeName} · ${cfg.label})`);
        $('opp-title').textContent = m.opponent;
        enterPlacing(); break;
      case 'opponent_joined':
        toast(`${m.name} ist beigetreten`);
        $('opp-title').textContent = m.name;
        enterPlacing(); break;
      case 'placed_ok':
        $('place-info').textContent = 'Warte auf den Gegner …';
        $('btn-ready').disabled = true; break;
      case 'opponent_ready': toast('Gegner ist bereit'); break;
      case 'start': enterGame(m.yourTurn); break;
      case 'shot': onShot(m); break;
      case 'game_over': {
        active = false; oppEl.classList.remove('target');
        $('status').textContent = m.winner === 'you' ? TXT[theme].win : TXT[theme].lose;
        if (m.winner !== 'you') {
          // reveal opponent's remaining ships on the right board
          for (const s of m.opponentShips) for (const c of s.cells) {
            const e = Board.cell(oppEl, c.x, c.y);
            if (!e.classList.contains('hit')) e.classList.add('ship', `k${Rules.tierOf(s)}`);
          }
        }
        showEndModal(m.winner === 'you');
        $('over').hidden = false; $('end-row-game').hidden = true; $('btn-rematch').disabled = false; break;
      }
      case 'opponent_wants_rematch': toast('Gegner möchte eine Revanche'); break;
      case 'rematch_start': enterPlacing(); break;
      case 'game_ended': toast('Gegner hat das Spiel beendet'); leave(); break;
      case 'opponent_left': toast('Gegner hat die Verbindung verloren – warte …'); break;
      case 'opponent_back': toast('Gegner ist zurück'); break;
      case 'resumed':
        useConfig(m);
        if (m.phase === 'game' || m.phase === 'playing') {
          toast('Verbindung wiederhergestellt – Spielstand kann nicht geladen werden, bitte neues Spiel starten.');
          leave();
        } else if (m.phase === 'lobby') show('lobby');
        else enterPlacing();
        break;
      case 'resume_failed': leave(); break;
      case 'error': toast(m.msg); break;
    }
  }

  function leave() {
    store.clear(); active = false; $('end-modal').hidden = true;
    if (ws) { ws.onclose = null; ws.close(); }
    history.replaceState(null, '', '/');
    show('start');
  }

  $('theme-switch').onclick = () => applyTheme(theme === 'space' ? 'classic' : 'space');

  const name = () => (myName = $('name').value.trim() || TXT[theme].defaultName);
  const chosen = (id) => { const b = $(id).querySelector('button.active'); return b ? b.dataset.value : null; };
  const selectedMode = () => (chosen('size') === 'large' ? chosen('difficulty') : chosen('size'));
  for (const group of document.querySelectorAll('.choice')) {
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      for (const b of group.querySelectorAll('button')) {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-checked', b === btn);
      }
      $('difficulty-row').hidden = chosen('size') !== 'large';
    });
  }
  $('btn-create').onclick = () => {
    const mode = selectedMode();
    if (!mode) return toast(chosen('size') ? 'Bitte Schwierigkeit wählen' : 'Bitte Spielfeld wählen');
    connect(() => send({ type: 'create', name: name(), mode, theme }));
  };
  $('btn-join').onclick = () => {
    const code = $('code').value.trim().toUpperCase();
    if (!code) return toast('Bitte Raum-Code eingeben');
    connect(() => send({ type: 'join', code, name: name() }));
  };
  $('btn-copy').onclick = () => { navigator.clipboard.writeText($('link').value).then(() => toast('Link kopiert')); };
  $('btn-ready').onclick = () => { if (Placement.isComplete()) send({ type: 'place', ships: Placement.ships() }); };
  $('btn-rematch').onclick = () => { send({ type: 'rematch' }); $('btn-rematch').disabled = true; $('status').textContent = 'Warte auf Revanche-Zusage …'; };
  $('btn-leave').onclick = leave;
  $('pop-rematch').onclick = () => { $('btn-rematch').click(); $('end-modal').hidden = true; };
  $('pop-leave').onclick = leave;
  $('pop-view').onclick = $('pop-close').onclick = () => { $('end-modal').hidden = true; };
  for (const b of document.querySelectorAll('.btn-end')) b.onclick = () => {
    if (confirm('Spiel wirklich beenden? Das Spiel wird auch für deinen Gegner beendet.')) { send({ type: 'leave' }); leave(); }
  };
  $('btn-cancel').onclick = () => { send({ type: 'leave' }); leave(); };

  // Raum-Code → Variante des Raums anzeigen (Theme wechselt passend mit)
  async function lookupRoom() {
    const code = $('code').value.trim().toUpperCase();
    const info = $('room-info');
    if (code.length !== 6) { info.hidden = true; return; }
    try {
      const r = await fetch(`/api/room/${encodeURIComponent(code)}`);
      if ($('code').value.trim().toUpperCase() !== code) return; // inzwischen geändert
      if (!r.ok) { info.textContent = 'Raum nicht gefunden'; info.hidden = false; return; }
      const d = await r.json();
      applyTheme(d.theme);
      info.textContent = `${TXT[d.theme].themeName} · ${d.label}${d.full ? ' (voll)' : ''}`;
      info.hidden = false;
    } catch { info.hidden = true; }
  }
  $('code').addEventListener('input', lookupRoom);
  $('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });

  const room = new URLSearchParams(location.search).get('room');
  if (room) { $('code').value = room.toUpperCase(); }
  applyTheme('classic');
  if (store.get()) resume();
  else { show('start'); lookupRoom(); }
})();
