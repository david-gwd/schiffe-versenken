# Schiffe versenken

Online-Multiplayer im Browser (Node.js + WebSockets, Frontend ohne Build-Tools).

## Starten
```
npm install
npm start
```
Dann `http://localhost:3000` öffnen. Spiel erstellen, den Link an den Mitspieler schicken.
Im selben WLAN: `http://<IP-des-Mac>:3000`.

## Tests
```
npm test
```

## Regeln
Spielfeld beim Erstellen wählbar (Schiffe dürfen sich nie berühren):

| Variante | Feld | Schiffe |
|---|---|---|
| Mini | 5×5 | 3, 2, 2 |
| Normal | 10×10 | 5, 4, 3, 3, 2 |
| Groß – Schwer | 15×15 | 5, 5, 4, 4, 3, 3, 3, 2, 2, 2 |
| Groß – Experte | 15×15 | 5, 4, 3, 3, 2 |

Nach einem Treffer darf man nochmal schießen (`EXTRA_SHOT_ON_HIT` in `shared/rules.js`).
Varianten werden in `MODES` in `shared/rules.js` definiert.
