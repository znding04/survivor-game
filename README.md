# Pickle Survivor

A **Vampire Survivors-style** survival game where you play as a **pickle** (yes, *I'm Pickle Riiick!*) on a tiny round planet, built entirely with Three.js and procedural geometry. No external assets needed — everything is cute, bouncy, and made from primitives! Roll around a boundless mini-earth while adorable slimes crest the horizon. Playable on desktop **and** mobile.

## Play

The game uses ES modules, so it needs to be served over HTTP (not opened as a `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just visit the GitHub Pages deployment.

## Features

- **Spherical mini-planet world** — no walls or edges; the planet rotates beneath you as you walk, and enemies appear over the curved horizon
- **Mobile support** — floating virtual joystick, on-screen pause button, and responsive UI
- **Multiple weapons** — auto-attack AOE pulse, orbiting sparkles that spin around you, and homing hearts that seek the nearest enemy
- **Pickle Rick-inspired hero** — a bumpy green pickle with spiky gray hair, big eyes, and a worried brow
- **Cute blob enemies** (slimes) in 4 color variants that swarm toward you
- **XP gems** with glow rings — collect them to level up
- **Upgrade system** — choose 1 of 3 from a pool of 11 upgrades each level (weapon unlocks/levels, damage, speed, HP, range, pickup magnet, regen)
- **Difficulty scaling** — more enemies, faster spawns, and tougher creatures over time
- **HUD** with HP bar, XP bar, kill count, survival timer, and level display
- **Start screen** with high score display
- **Game over screen** with stats and new high score detection
- **Pause** with ESC or P
- **localStorage** high score persistence
- **Visual polish**: camera shake, damage numbers, enemy HP bars, death particles, ambient floating sparkles, squish animations, level-up celebrations

## Controls

| Input | Action |
|-----|--------|
| WASD / Arrow Keys | Move (desktop) |
| Drag (virtual joystick) | Move (mobile) |
| Auto | Attack (AOE pulse) |
| ESC / P / II button | Pause / Resume |
| Click / Tap | Select upgrade on level-up |

## Tech Stack

- **Three.js** (v0.160 via CDN, no build step)
- ES modules, Google Fonts (Nunito)
- All assets procedurally generated

## Project Structure

The code is split into a **back end** (simulation / game rules, no rendering) and a **front end** (rendering, DOM, input):

| File | Layer | Responsibility |
|------|-------|----------------|
| `index.html` | shell | DOM, CSS, import map, loads `src/main.js` |
| `src/config.js` | back end | All tuning data — planet size, enemy/weapon/upgrade definitions |
| `src/state.js` | back end | Game state object + reset |
| `src/logic.js` | back end | The simulation step: movement, AI, spawning, combat, weapons, leveling (zero Three.js scene code) |
| `src/engine.js` | front end | Three.js scene, camera, object pools, mesh factories, visual effects |
| `src/ui.js` | front end | HUD + screens (DOM) |
| `src/input.js` | front end | Keyboard + touch joystick |
| `src/main.js` | glue | Bootstrap, game loop, lifecycle |

## Aesthetic

Pastel color palette with a pickle hero, chibi slime enemies, soft rounded shapes, floating hearts and stars, and a cute meadow planet. Everything is designed to be adorable!
