import { STARTING_WEAPONS, UPGRADES, PULSE, ORBIT, HOMING, RICOCHET, SHIELD, BOSS, DASH } from './config.js';

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

const WEAPON_TOOLTIPS = {
  pulse: {
    desc: 'Unleash a shockwave that blasts all nearby foes. Scales with range and damage upgrades.',
    stats: `Damage: ${PULSE.damage} | Range: ${PULSE.range} | Cooldown: ${PULSE.cooldown}s`,
    path: 'Unlocks: +Damage, +Range, +Speed',
  },
  orbit: {
    desc: 'Diamond stars orbit you, shredding any enemy in their path. More stars = more coverage.',
    stats: `DPS: ${ORBIT.dps} | Stars: ${ORBIT.baseCount} | Radius: ${ORBIT.radius}`,
    path: 'Unlocks: +Stars, +Damage',
  },
  homing: {
    desc: 'Fire seeking hearts that chase down the nearest enemy. Multiple hearts = multi-target.',
    stats: `Damage: ${HOMING.damage} | Speed: ${HOMING.speed} | Cooldown: ${HOMING.cooldown}s`,
    path: 'Unlocks: +Hearts, +Fire Rate',
  },
  ricochet: {
    desc: 'Fire bullets that bounce off the planet surface up to 3 times, hitting enemies on each pass.',
    stats: `Damage: ${RICOCHET.damage} | Bounces: ${RICOCHET.bounces} | Cooldown: ${RICOCHET.cooldown}s`,
    path: 'Unlocks: +Bullets, +Damage, +Bounces',
  },
  shield: {
    desc: 'Orbiting pickle shards that damage enemies on contact AND block incoming projectiles. Recharges after use.',
    stats: `DPS: ${SHIELD.dps} | Shards: ${SHIELD.shardCount} | Blocks: ${SHIELD.absorbCount} | Recharge: ${SHIELD.rechargeTime}s`,
    path: 'Unlocks: +Shards, +Damage, +Recharge Speed',
  },
};

const WEAPON_ICONS = { pulse: '🌀', orbit: '✨', homing: '💘', ricochet: '🔵', shield: '🛡️' };

export const ui = {
  selectedWeapon: STARTING_WEAPONS[0].id,
  _prevWeaponLevels: {},

  init({ onStart, engine, onWeaponSwitch }) {
    $('start-btn').addEventListener('click', onStart);
    $('restart-btn').addEventListener('click', onStart);
    this._buildWeaponPicker();
    this._buildWeaponSwitcher(onWeaponSwitch);
    this._initCamSlider(engine);
    this.refreshHighScore();
  },

  _buildWeaponPicker() {
    const opts = $('weapon-options');
    opts.innerHTML = '';
    for (const w of STARTING_WEAPONS) {
      const tip = WEAPON_TOOLTIPS[w.id];
      const card = document.createElement('div');
      card.className = 'weapon-card' + (w.id === this.selectedWeapon ? ' selected' : '');
      card.dataset.weapon = w.id;
      card.innerHTML =
        `<div class="wicon">${w.icon}</div><div class="wname">${w.name}</div><div class="wdesc">${w.desc}</div>` +
        `<div class="wtooltip"><div class="wtt-desc">${tip.desc}</div>` +
        `<div class="wtt-stats">${tip.stats}</div>` +
        `<div class="wtt-path">${tip.path}</div></div>`;
      card.onclick = () => {
        this.selectedWeapon = w.id;
        for (const el of opts.children) el.classList.toggle('selected', el.dataset.weapon === w.id);
      };
      opts.appendChild(card);
    }
  },

  _buildWeaponSwitcher(onWeaponSwitch) {
    const wrap = $('weapon-switcher');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const w of STARTING_WEAPONS) {
      const btn = document.createElement('button');
      btn.className = 'ws-btn';
      btn.dataset.weapon = w.id;
      btn.textContent = WEAPON_ICONS[w.id] ?? '⭐';
      btn.title = w.name;
      btn.onclick = () => onWeaponSwitch(w.id);
      wrap.appendChild(btn);
    }
  },

  switchWeapon(id, state) {
    const weaponIds = ['pulse', 'orbit', 'homing', 'ricochet', 'shield'];
    if (!weaponIds.includes(id)) return;
    if (state[id].level <= 0) return; // not owned
    state.activeWeaponId = id;
    this.updateWeaponSwitcher(state);
  },

  updateWeaponSwitcher(state) {
    const wrap = $('weapon-switcher');
    if (!wrap) return;
    for (const btn of wrap.children) {
      const wid = btn.dataset.weapon;
      const owned = state[wid].level > 0;
      btn.classList.toggle('ws-active', wid === state.activeWeaponId);
      btn.classList.toggle('ws-owned', owned);
      btn.disabled = !owned;
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

    // ── Boss warning countdown ────────────────────────────────────────────
    const warnEl = $('boss-warning');
    if (state.bossTimer <= 10 && state.bossTimer > 0 && state.running) {
      const secs = Math.ceil(state.bossTimer);
      warnEl.textContent = `BOSS IN ${secs}s!`;
      warnEl.style.display = 'block';
    } else {
      warnEl.style.display = 'none';
    }

    // ── Boss HP bar in HUD ────────────────────────────────────────────────
    const bossHudBar = $('boss-hud-bar');
    const boss = state.enemies.find(e => e.boss && !e.dying);
    if (boss) {
      const pct = Math.max(0, boss.hp / boss.maxHp * 100);
      document.querySelector('#boss-hp-bar .bar-fill').style.width = pct + '%';
      $('boss-hud-label').textContent = `BOSS  ${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}`;
      bossHudBar.style.display = 'block';
      // Show enrage text after the display threshold
      const enrageEl = $('boss-enrage');
      if (state.bossEnrageTimer >= BOSS.enrageDisplayTime) {
        enrageEl.style.display = 'block';
      } else {
        enrageEl.style.display = 'none';
      }
    } else {
      bossHudBar.style.display = 'none';
    }

    // ── Weapon unlock flash ───────────────────────────────────────────────
    const weaponIds = ['pulse', 'orbit', 'homing', 'ricochet', 'shield'];
    for (const wid of weaponIds) {
      const prev = this._prevWeaponLevels[wid] ?? 0;
      if (prev === 0 && state[wid].level > 0) {
        this._showWeaponUnlock(wid);
      }
      this._prevWeaponLevels[wid] = state[wid].level;
    }

    // ── Dash cooldown indicator ────────────────────────────────────────────
    const dashEl = $('dash-indicator');
    const dashFill = $('dash-bar-fill');
    if (dashEl && dashFill) {
      const cooldownRemaining = state.dash.cooldownTimer;
      const pct = Math.max(0, (1 - cooldownRemaining / DASH.cooldown) * 100);
      dashFill.style.width = pct + '%';
      dashEl.classList.toggle('cooldown', cooldownRemaining > 0);
    }
  },

  _showWeaponUnlock(weaponId) {
    const el = $('weapon-unlock');
    if (!el) return;
    const name = STARTING_WEAPONS.find(w => w.id === weaponId)?.name ?? weaponId;
    const icon = WEAPON_ICONS[weaponId] ?? '⭐';
    el.textContent = `UNLOCKED: ${icon} ${name}`;
    // Re-trigger animation by forcing reflow
    el.style.display = 'block';
    el.style.animation = 'none';
    void el.offsetWidth; // reflow
    el.style.animation = 'weaponUnlockAnim 2s ease-out forwards';
    clearTimeout(this._unlockTimeout);
    this._unlockTimeout = setTimeout(() => { el.style.display = 'none'; }, 2000);
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
      const isActive = WEAPON_IDS.has(id) && id === state.activeWeaponId;
      chip.className = 'lo-chip' + (WEAPON_IDS.has(id) ? ' lo-weapon' : '') + (isActive ? ' lo-active' : '');
      const kills = WEAPON_IDS.has(id) ? (state.weaponKills[id] || 0) : 0;
      const killsHtml = kills > 0 ? `<span class="lo-kills"> ${kills}K</span>` : '';
      chip.innerHTML =
        `<span class="lo-ic">${meta.icon}</span>` +
        `<span class="lo-nm">${meta.name}</span>` +
        `<span class="lo-lv">Lv${state.upgrades[id]}</span>${killsHtml}`;
      el.appendChild(chip);
    }
  },

  enterGame(showTouch) {
    this._prevWeaponLevels = {};
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
