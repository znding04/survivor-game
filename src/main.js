import * as THREE from 'three';
import { engine } from './engine.js';
import { ui } from './ui.js';
import { input } from './input.js';
import { createState, resetState } from './state.js';
import { update, pickUpgradeChoices, applyUpgrade } from './logic.js';

/* ═══════════════════════════════════════════════════════════════
   MAIN — wires the front-end (engine, ui, input) to the back-end
   (state, logic) and runs the loop + game lifecycle.
   ═══════════════════════════════════════════════════════════════ */

const state = createState();
const clock = new THREE.Clock();

engine.init();
ui.init({ onStart: startGame, engine });
input.init({
  onPause: togglePause,
  canMove: () => state.running && !state.paused && !state.upgrading,
});
if (input.isTouch) document.body.classList.add('touch');

function startGame() {
  engine.clearEntities(state);
  resetState(state);
  state[ui.selectedWeapon].level = 1;        // chosen starting weapon
  state.upgrades[ui.selectedWeapon] = 1;     // show it in the loadout
  engine.createPlayer();
  ui.enterGame(input.isTouch);
  ui.updateLoadout(state);
  input.reset();
  clock.getDelta(); // drop the idle delta
}

function togglePause() {
  if (!state.running || state.upgrading) return;
  state.paused = !state.paused;
  ui.showPause(state.paused);
  if (state.paused) input.reset();
  else clock.getDelta();
}

function levelUp() {
  state.upgrading = true;
  ui.showUpgrades(pickUpgradeChoices(state), state, (up) => {
    applyUpgrade(state, up);
    ui.updateLoadout(state);
    state.upgrading = false;
    clock.getDelta();
  });
}

function gameOver() {
  state.running = false;
  ui.showGameOver(state);
  input.reset();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); // cap delta after tab-out/pause

  if (state.running && !state.paused && !state.upgrading) {
    update(state, dt, engine, input.sample());
    if (state.leveledUp) { state.leveledUp = false; levelUp(); }
    if (state.over) gameOver();
    ui.updateHUD(state);
  }

  engine.render(state, dt);
}
animate();
