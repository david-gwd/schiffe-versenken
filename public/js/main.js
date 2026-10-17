(() => {
  const $ = (id) => document.getElementById(id);
  const screens = ['start', 'lobby', 'place', 'game'];
  const show = (name) => screens.forEach((s) => ($('screen-' + s).hidden = s !== name));
  const ownEl = $('own-board'), oppEl = $('opp-board');
  let ws, myTurn = false, active = false, myShips = [], myName = 'Kapitän', cfg = Rules.getConfig('normal');

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
    Placement.setConfig(cfg);
    $('btn-ready').disabled = true;
    $('place-info').textContent = 'Platziere deine Flotte';
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
    $('over').hidden = true;
    active = true; myTurn = yourTurn;
    show('game'); setStatus();
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
        cfg = Rules.getConfig(m.mode);
        $('mode-label').textContent = `Spielfeld: ${cfg.label}`;
        store.set({ code: m.code, playerId: m.playerId });
        $('room-code').textContent = m.code;
        $('link').value = `${location.origin}/?room=${m.code}`;
        show('lobby'); break;
      case 'joined':
        cfg = Rules.getConfig(m.mode);
        store.set({ code: m.code, playerId: m.playerId });
        toast(`Beigetreten – Gegner: ${m.opponent} (${cfg.label})`);
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
        $('status').textContent = m.winner === 'you' ? '🎉 Du hast gewonnen!' : '💥 Du hast verloren.';
        if (m.winner !== 'you') {
          // reveal opponent's remaining ships on the right board
          for (const s of m.opponentShips) for (const c of Rules.cellsOf(s)) {
            const e = Board.cell(oppEl, c.x, c.y);
            if (!e.classList.contains('hit')) e.classList.add('ship');
          }
        }
        $('over').hidden = false; $('btn-rematch').disabled = false; break;
      }
      case 'opponent_wants_rematch': toast('Gegner möchte eine Revanche'); break;
      case 'rematch_start': enterPlacing(); break;
      case 'opponent_left': toast('Gegner hat die Verbindung verloren – warte …'); break;
      case 'opponent_back': toast('Gegner ist zurück'); break;
      case 'resumed':
        cfg = Rules.getConfig(m.mode);
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
    store.clear(); active = false;
    if (ws) { ws.onclose = null; ws.close(); }
    history.replaceState(null, '', '/');
    show('start');
  }

  const name = () => (myName = $('name').value.trim() || 'Kapitän');
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
    connect(() => send({ type: 'create', name: name(), mode }));
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

  const room = new URLSearchParams(location.search).get('room');
  if (room) $('code').value = room.toUpperCase();
  if (store.get()) resume();
  else show('start');
})();
