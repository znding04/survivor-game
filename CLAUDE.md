# Pickle Survivor

A Vampire Survivors-style survival game built with Three.js, where you play as a
**pickle** (Pickle Rick) on a tiny round planet. No build step, no external
assets — everything is procedural geometry. Deployed on Cloudflare Pages.

## Project Structure

The code is split into a **back end** (simulation / rules, no Three.js scene
code) and a **front end** (rendering, DOM, input):

```
survivor-game/
├── index.html        — Shell: DOM, CSS, import map; loads src/main.js
├── src/
│   ├── main.js       — Bootstrap, game loop, lifecycle (start/pause/levelUp/gameOver)
│   ├── config.js     — back end: all tuning data (planet, weapons, upgrades, combo, magnet)
│   ├── state.js      — back end: the single game-state object + reset
│   ├── logic.js      — back end: simulation step (movement, AI, spawning, combat, weapons,
│   │                   leveling, difficulty, combo). No scene/DOM code.
│   ├── engine.js     — front end: Three.js scene, camera, object pools, mesh factories, effects
│   ├── ui.js         — front end: HUD, screens, loadout panel, weapon picker, camera slider
│   └── input.js      — front end: keyboard (WASD/arrows) + touch virtual joystick
└── README.md
```

## Critical Rule: ALWAYS Pull Before Editing

```bash
git pull origin main
```

**This project is actively developed by multiple people.** Before ANY edit,
improvement, or feature work, you MUST pull the latest changes. Never push
without pulling first. Use `git stash` if needed to preserve local changes
during a pull.

## Architecture Notes

- **State-driven**: all mutable game state lives in `state.js` as one object
  (flags, player stats, weapons, `enemies[]`, `gems[]`, `projectiles[]`,
  combo, etc.). Entities are plain logic objects; each one's `.view` (a Three.js
  mesh) is owned by the engine and only referenced from state.
- **Run flags / phases**: `running`, `paused`, `upgrading`, `over` gate the loop
  (start → playing → upgrade → playing → … → gameover).
- **Spherical world (no boundaries)**: a planet of radius `PLANET_R`. The player
  stays fixed at the north pole; walking **rotates the planet beneath** them.
  Enemies/gems are planet-local unit-direction vectors that move along great
  circles toward the player (all distances are angular). Enemies crest the horizon.
- **Player**: Pickle Rick — a green bumpy capsule with spiky gray hair, big eyes
  and worried brows (`makePickle` in engine.js).
- **Enemies**: cute blob slimes (4 color templates), pooled.
- **Weapons**: AOE Pulse, Orbiting Sparkles, Homing Hearts. You pick a starting
  weapon on the start screen; all weapons have levels and are unlocked/leveled
  via the upgrade pool. The loadout panel shows owned weapons + passive levels.
- **Camera**: fixed above the pole, looking down. Elevation is adjustable via an
  on-screen slider (low cinematic → top-down) and persisted to localStorage.
  Shake on hit. (No follow-lerp — the player is always centered at the pole.)
- **XP gems**: float/bob, magnetically attracted when the player is close
  (magnet lines drawn to the player).
- **Combo**: kills within a time window build a combo; the multiplier boosts XP.
  Taking damage triggers a red vignette flash.
- **Difficulty**: derived from elapsed time (spawn rate, enemy speed, HP scale) —
  not stored.
- **Mobile**: floating virtual joystick, tap-to-resume pause, responsive HUD with
  safe-area insets, and lighter render settings (pixel ratio / shadows / foliage)
  on touch devices.
- **No build step**: vanilla ES modules loaded via `<script type="module">`,
  Three.js via CDN import map. Must be served over HTTP (not `file://`).
- **LocalStorage**: high score, best time, camera pitch.

## Key Commands

```bash
# Serve locally (ES modules need HTTP, not file://)
python3 -m http.server 8000      # or: npx serve .

# Deploy: Cloudflare Pages auto-builds from `main`; static files at repo root
# (index.html + src/), no build command or output dir needed.
```

## Conventions

- All lengths/speeds/healths/tunables live as constants in `config.js` — don't
  hardcode magic numbers.
- `logic.js` contains zero Three.js scene code; `engine.js` contains zero game
  rules. Logic asks the engine to spawn/recycle views and play effects.
- Object pooling for all dynamic objects (enemies, gems, projectiles, particles,
  damage numbers, pulses, stars, magnet lines): pooled meshes stay parented and
  toggle `visible` instead of being created/destroyed.
- Enemy HP bars are 3D billboarded fill bars (shown only while damaged), not DOM.
- All sphere movement/targeting is angular (great-circle) math in `logic.js`.

## Owner

GitHub: znding04
Remote: https://github.com/znding04/survivor-game.git
