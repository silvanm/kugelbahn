# Kugelbahn

Realistische Kugelbahn im Browser: Three.js (Darstellung) und cannon-es (Physik), ohne Build-Schritt.
Die Bibliotheken kommen per Import-Map von jsDelivr.

## Starten

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Dann <http://127.0.0.1:8765> öffnen. Nach Code-Änderungen mit **Cmd+Shift+R** neu laden, sonst liefert der
Browser alte Module aus dem Cache.

Nur an `127.0.0.1` binden: der einfache Python-Server liefert jede Datei im Ordner aus, auch `.env`.

## Aufbau

`index.html` enthält nur Oberfläche (HUD, Knöpfe), Styles und die Import-Map. Der Code liegt in `src/`:

| Modul | Inhalt |
|---|---|
| `main.js` | Einstieg: Import-Reihenfolge, Bedienelemente, Physikschritt, Render-Schleife, `window.__kb` (Debug) |
| `core.js` | Konstanten, Renderer, Szene, Kamera, Licht, Physik-Welt, gemeinsamer Zustand (`balls`, `state`) |
| `materials.js` | Acryl-Shader mit Gebrauchsspuren, Metalle, Kunststoffe |
| `geometry.js` | Bauteil-Helfer: Boxen, Trimesh-Gitter, Rohre, Pfosten mit Fuss, Halbrohr-Rinnen, Rampen |
| `track.js` | Bahn: Sammelrinne, Einlauf + Helix, Weiche, Äste, Trichter, Drahtschienen mit Looping und Schanze |
| `chimes.js` | Klangrinne (13 gestimmte Stäbe), Kehre und Rücklaufrinne zum Lift; löst die Stabtöne aus |
| `bell.js` | Glocke als Pendel am Faden |
| `base.js` | Grundplatte und Tisch mit prozeduralen Holztexturen |
| `lift.js` | Kippkübel-Lift mit Zahnriemen und Klappe (kinematisch, alles aus der Schlittenhöhe) |
| `balls.js` | Kugeln erzeugen, in den Einlauf fallen lassen, vom Tisch zurückholen |
| `audio.js` | Web Audio: Rollgeräusche, Stösse, Liftmotor, Glocke, synthetische Klangstäbe |
| `interaction.js` | Kugel antippen & halten, Kugel am Boden antippen |
| `lights.js` | LED-Licht (umschaltbar): Abendstimmung, LED-Streifen und -Ringe, leuchtende Murmeln |
| `ballcam.js` | Kugelkamera: fährt hinter einer Kugel mit, Blick in Fahrtrichtung |
| `assembly.js` | Aufbau-Animation beim Start |
| `postfx.js` | Kontaktschatten (GTAO), Tiefenschärfe (Bokeh), Leuchten (Bloom) |

Wichtig:

- **Reihenfolge der Imports in `main.js`:** Jedes Modul legt beim Laden seine Teile in Szene und Physik-Welt
  an. `makeBase()` läuft danach, weil sich die Grösse der Grundplatte nach allem richtet, was bis dahin in der
  Szene steht.
- **Veränderlicher Zustand:** Was mehrere Module ändern, liegt in Objekten (`state.paused`, `state.laps`,
  `spawner`, `lift`) oder im Array `balls`. Exportierte `let`-Variablen lassen sich von aussen nicht neu
  zuweisen.
- **Klänge:** Die Dateien in `sounds/` wurden mit der ElevenLabs Sound-Effects-API erzeugt. Der API-Key steht
  in `.env` und wird von der App nicht gebraucht.

## Debug

In der Browser-Konsole:

- `__kb.fastForward(60)` simuliert 60 s ohne Rendering.
- `__kb.balls`, `__kb.lift`, `__kb.laps` zeigen den Zustand.

---

Stand: 2026-11-06 · erster Commit (Basis für spätere SHA-Angaben)
