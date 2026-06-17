# Survivor Game — Cute Survivors!

A Vampire Survivors-style 3D arena survival game built with Three.js. Hosted at ljding.app/game or a standalone deployment.

## Project Structure

```
survivor-game/
├── index.html          — Entry point, loads all modules
├── src/
│   ├── main.js         — Game initialization & loop
│   ├── config.js       — All tunable constants (speeds, costs, scales)
│   ├── state.js        — Central game state object
│   ├── engine.js       — Three.js scene, camera, renderer, lighting, effects
│   ├── logic.js        — Combat, XP, leveling, enemy waves, difficulty scaling
│   ├── input.js        — Keyboard (WASD/arrows) and mouse/click handlers
│   └── ui.js           — HUD, start/pause/gameover/upgrade screens
└── README.md
```

## Critical Rule: ALWAYS Pull Before Editing

```bash
git pull origin main
```

**This project is actively developed by Lijie.** Before ANY edit, improvement, or feature work, you MUST pull the latest changes. Never push directly without pulling first. Use `git stash` if needed to preserve local changes during a pull.

## Architecture Notes

- **State-driven**: All game state lives in `state.js` as a single `gameState` object (phase, player, enemies[], gems[], particles[], wave, upgrades, etc.)
- **Phases**: `start` → `playing` → `upgrade` → `playing` → ... → `gameover`
- **Enemies**: Blob slimes built from Three.js primitives (SphereGeometry body + eyes + blush)
- **Player**: Chibi character — big sphere head, small body, crown, big eyes
- **Auto-attack**: Periodic AOE pulse centered on player, damages all enemies in range
- **XP gems**: Float/bob, magnetic attraction when player is close
- **Difficulty**: Scales via `difficultyMultiplier` — increases enemy count, HP, and spawn rate over time
- **No build step**: Vanilla JS modules loaded via `<script type="module">`, Three.js via CDN
- **LocalStorage**: High score persistence

## Key Commands

```bash
# Serve locally (any static server works)
npx serve .

# Deploy: drop index.html + src/ on any static host (Cloudflare Pages, Netlify, etc.)
```

## Conventions

- All lengths/speeds/healths defined as constants in `config.js` — don't hardcode magic numbers
- Enemy HP bars via CSS `width: ${hpPercent}%` updated each frame in `ui.js`
- Particle system: pooled objects with `mesh.visible = false` when inactive
- Camera follows player with lerp smoothing (factor ~0.08)

## Owner

GitHub: znding04
Remote: https://github.com/znding04/survivor-game.git
