import { STARTING_WEAPONS, UPGRADES } from './config.js';

// id -> {icon, name} for the loadout panel; weapon ids get a gold border.
const UP_META = Object.fromEntries(UPGRADES.map(u => [u.id, { icon: u.icon, name: u.name }]));
const WEAPON_IDS = new Set(STARTING_WEAPONS.map(w => w.id));

/* ═══════════════════════════════════════════════════════════════
   UI — front-end DOM: HUD, start / pause / upgrade / game-over
   screens, starting-weapon picker, camera slider, high scores.
   No game rules.
   ═══════════════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);
const fmtTime = (t) => {
  const m = Math.floor(t / 60).toString().padStart(2, '0');
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export const ui = {
  selectedWeapon: STARTING_WEAPONS[0].id,

  init({ onStart, engine }) {
    $('start-btn').addEventListener('click', onStart);
    $('restart-btn').addEventListener('click', onStart);
    this._buildWeaponPicker();
    this._initCamSlider(engine);
    this.refreshHighScore();
  },

  _buildWeaponPicker() {
    const opts = $('weapon-options');
    opts.innerHTML = '';
    for (const w of STARTING_WEAPONS) {
      const card = document.createElement('div');
      card.className = 'weapon-card' + (w.id === this.selectedWeapon ? ' selected' : '');
      card.dataset.weapon = w.id;
      card.innerHTML =
        `<div class="wicon">${w.icon}</div><div class="wname">${w.name}</div><div class="wdesc">${w.desc}</div>`;
      card.onclick = () => {
        this.selectedWeapon = w.id;
        for (const el of opts.children) el.classList.toggle('selected', el.dataset.weapon === w.id);
      };
      opts.appendChild(card);
    }
  },

  _initCamSlider(engine) {
    const slider = $('cam-slider');
    slider.value = Math.round(engine.getCameraPitch() * 100);
    slider.addEventListener('input', () => engine.setCameraPitch(slider.value / 100));
  },

  updateHUD(state) {
    $('hud-time').textContent = fmtTime(state.time);
    $('hud-kills').textContent = `Kills: ${state.kills}`;
    const hpPct = Math.max(0, state.hp / state.maxHp * 100);
    document.querySelector('#hp-bar .bar-fill').style.width = hpPct + '%';
    $('hp-label').textContent = `HP  ${Math.ceil(state.hp)} / ${state.maxHp}`;
    document.querySelector('#xp-bar .bar-fill').style.width = (state.xp / state.xpToNext * 100) + '%';
    $('xp-label').textContent = `XP — Lv ${state.level}`;
    const comboEl = $('hud-combo');
    if (state.combo > 1) {
      comboEl.textContent = `${state.combo}x combo!`;
      comboEl.style.display = 'block';
      if (!comboEl.classList.contains('combo-pulse')) {
        comboEl.classList.add('combo-pulse');
        setTimeout(() => comboEl.classList.remove('combo-pulse'), 200);
      }
    } else {
      comboEl.style.display = 'none';
    }
  },

  // Rebuild the loadout panel (weapons first, then passive upgrades).
  updateLoadout(state) {
    const el = $('loadout');
    el.innerHTML = '';
    const ids = Object.keys(state.upgrades)
      .sort((a, b) => (WEAPON_IDS.has(b) ? 1 : 0) - (WEAPON_IDS.has(a) ? 1 : 0));
    for (const id of ids) {
      const meta = UP_META[id];
      if (!meta) continue;
      const chip = document.createElement('div');
      chip.className = 'lo-chip' + (WEAPON_IDS.has(id) ? ' lo-weapon' : '');
      chip.innerHTML =
        `<span class="lo-ic">${meta.icon}</span>` +
        `<span class="lo-nm">${meta.name}</span>` +
        `<span class="lo-lv">Lv${state.upgrades[id]}</span>`;
      el.appendChild(chip);
    }
  },

  enterGame(showTouch) {
    $('start-screen').style.display = 'none';
    $('gameover-screen').style.display = 'none';
    $('hud').style.display = 'block';
    $('cam-control').style.display = 'flex';
    if (showTouch) $('pause-btn').style.display = 'block';
  },

  showPause(paused) {
    $('pause-screen').style.display = paused ? 'flex' : 'none';
  },

  showUpgrades(choices, state, onPick) {
    const screen = $('upgrade-screen');
    const wrap = $('upgrade-choices');
    wrap.innerHTML = '';
    for (const up of choices) {
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.innerHTML =
        `<div class="icon">${up.icon}</div>` +
        `<div class="name">${up.name}</div>` +
        `<div class="desc">${up.desc(state)}</div>`;
      card.onclick = () => { screen.style.display = 'none'; onPick(up); };
      wrap.appendChild(card);
    }
    screen.style.display = 'flex';
  },

  showGameOver(state) {
    const prevBest = parseInt(localStorage.getItem('survivor-highscore') || '0');
    const isNew = state.kills > prevBest;
    if (isNew) localStorage.setItem('survivor-highscore', state.kills.toString());

    const prevTime = parseFloat(localStorage.getItem('survivor-besttime') || '0');
    if (state.time > prevTime) localStorage.setItem('survivor-besttime', state.time.toString());

    $('gameover-stats').innerHTML = `
      Survived: <span>${fmtTime(state.time)}</span><br>
      Kills: <span>${state.kills}</span><br>
      Level: <span>${state.level}</span><br>
      Best Kills: <span>${Math.max(state.kills, prevBest)}</span><br>
      Best Time: <span>${fmtTime(Math.max(state.time, prevTime))}</span>`;
    $('high-score-msg').style.display = isNew ? 'block' : 'none';
    $('gameover-screen').style.display = 'flex';
    $('hud').style.display = 'none';
    $('pause-btn').style.display = 'none';
    $('joystick').style.display = 'none';
    $('cam-control').style.display = 'none';
    this.refreshHighScore();
  },

  refreshHighScore() {
    const hs = parseInt(localStorage.getItem('survivor-highscore') || '0');
    const bt = parseFloat(localStorage.getItem('survivor-besttime') || '0');
    if (hs > 0) $('start-highscore').textContent = `Best: ${hs} kills — ${fmtTime(bt)} survived`;
  },
};
