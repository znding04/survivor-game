import * as THREE from 'three';
import { engine } from './engine.js';
import { ui } from './ui.js';
import { input } from './input.js';
import { createState, resetState } from './state.js';
import { update, pickUpgradeChoices, applyUpgrade } from './logic.js';
import { WEAPON_SWITCH_KEYS } from './config.js';

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

const WEAPON_ORDER = ['pulse', 'orbit', 'homing', 'ricochet'];

function startGame() {
  engine.clearEntities(state);
  resetState(state);
  state[ui.selectedWeapon].level = 1;        // chosen starting weapon
  state.upgrades[ui.selectedWeapon] = 1;     // show it in the loadout
  state.activeWeaponId = ui.selectedWeapon;  // start with chosen weapon active
  engine.createPlayer();
  ui.enterGame(input.isTouch);
  ui.updateLoadout(state);
  ui.updateWeaponSwitcher(state);
  input.reset();
  clock.getDelta(); // drop the idle delta
}

// Weapon switch via number keys 1/2/3
window.addEventListener('keydown', (e) => {
  if (!state.running || state.paused || state.upgrading) return;
  const idx = WEAPON_SWITCH_KEYS.indexOf(e.code);
  if (idx >= 0) {
    ui.switchWeapon(WEAPON_ORDER[idx], state);
  }
});

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
    ui.updateWeaponSwitcher(state);
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
