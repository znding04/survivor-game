import * as THREE from 'three';
import {
  PLANET_R, UP, ORBIT, HOMING, ENEMY_TEMPLATES, DIFFICULTY, LEVEL, UPGRADES, COMBO, BOSS, SPITTER,
} from './config.js';

/* ═══════════════════════════════════════════════════════════════
   LOGIC — the back-end simulation. Operates on `state`, asks the
   engine to show entities/effects, but contains no Three.js scene
   or DOM code. All world math is angular distance on the sphere.
   ═══════════════════════════════════════════════════════════════ */

const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _pole = new THREE.Vector3();

function angBetween(a, b) { return Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)); }

// Slerp unit `dir` toward unit `target` by up to `step` radians (mutates dir).
function slerpToward(dir, target, step) {
  const angle = angBetween(dir, target);
  if (angle < 1e-5) return;
  const t = Math.min(1, step / angle);
  const s = Math.sin(angle);
  const a = Math.sin((1 - t) * angle) / s, b = Math.sin(t * angle) / s;
  dir.set(dir.x * a + target.x * b, dir.y * a + target.y * b, dir.z * a + target.z * b).normalize();
}

function randomPerp(n) {
  const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
  return v.sub(n.clone().multiplyScalar(v.dot(n))).normalize();
}

// Planet-local dir → world position on the surface.
function worldPos(localDir, state) {
  return localDir.clone().multiplyScalar(PLANET_R).applyQuaternion(state.planetQuat);
}

function nearestEnemy(state, fromDir) {
  let best = null, bestAng = Infinity;
  for (const e of state.enemies) {
    if (e.dying) continue;
    const a = angBetween(e.localDir, fromDir);
    if (a < bestAng) { bestAng = a; best = e; }
  }
  return best;
}

/* ═══ Main step ═══════════════════════════════════════════════ */
export function update(state, dt, engine, move) {
  state.time += dt;

  // ── Movement: rotate the planet beneath the fixed player ──
  _v.set(move.x, 0, move.z);
  if (_v.lengthSq() > 0) {
    _v.normalize();
    _axis.crossVectors(_v, UP).normalize();
    _q.setFromAxisAngle(_axis, (state.speed / PLANET_R) * dt);
    state.planetQuat.premultiply(_q);
    state.playerFace = Math.atan2(_v.x, _v.z);
  }
  // Player's foot point (north pole) in planet-local space — every AI target.
  state.targetLocal.copy(UP).applyQuaternion(_q.copy(state.planetQuat).invert());
  const target = state.targetLocal;
  _pole.set(0, PLANET_R, 0);

  // ── Regen ──
  if (state.regen) state.hp = Math.min(state.maxHp, state.hp + state.regen * dt);

  // ── Combo decay ──
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) { state.combo = 0; state.comboMultiplier = 1; }
  }

  // ── Difficulty (derived from time, not stored) ──
  const t = state.time;
  const spawnInterval = Math.max(DIFFICULTY.spawnIntervalMin,
    DIFFICULTY.spawnIntervalStart - t / DIFFICULTY.spawnRampSec);
  const enemiesPerSpawn = Math.floor(2 + t / 30);
  const enemySpeed = DIFFICULTY.enemySpeedBase + t / 120;
  const hpScale = 1 + t / 120;

  // ── Spawn ──
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    state.spawnTimer = spawnInterval;
    const count = enemiesPerSpawn + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) spawnEnemy(state, engine, enemySpeed, hpScale);
  }

  // ── Boss spawn ──
  state.bossTimer -= dt;
  if (state.bossTimer <= 0) {
    state.bossTimer = BOSS.interval;
    spawnBoss(state, engine, enemySpeed, hpScale);
  }

  // ── Weapons (only fire the active one; inactive timers freeze) ──
  const active = state.activeWeaponId;
  if (active === 'pulse') stepPulse(state, dt, engine, target);
  if (active === 'orbit') stepOrbit(state, dt, engine, target);
  else state.orbitStars.length = 0; // hide stars when orbit is inactive
  if (active === 'homing') stepHoming(state, dt, engine, target);

  // ── Enemy AI ──
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.hitTimer > 0) e.hitTimer -= dt;

    if (e.dying) {
      e.deathTimer -= dt;
      if (e.deathTimer <= 0) { engine.despawnEnemyView(e.view); state.enemies.splice(i, 1); }
      continue;
    }

    // Spitter: maintain range and fire projectiles
    if (e.spitter && !e.dying) {
      const surfDist = angBetween(e.localDir, target) * PLANET_R;
      e.bobTime += dt * 4;

      if (surfDist < SPITTER.range - 1) {
        // Too close — back up
        slerpToward(e.localDir, target, -(state.speed * 0.6 / PLANET_R) * dt);
      } else if (surfDist > SPITTER.range + 1) {
        // Too far — approach
        slerpToward(e.localDir, target, (e.speed / PLANET_R) * dt);
      }
      // else in range — hold position

      // Contact damage still applies if player runs into spitter
      if (surfDist < 1.0) {
        state.hp -= DIFFICULTY.contactDps * dt;
        state.shake = 0.3;
        engine.flashDamage();
        slerpToward(e.localDir, target, -(2 / PLANET_R) * dt);
      }

      // Fire projectile
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        e.fireTimer = SPITTER.fireInterval;
        state.spitterProjectiles.push({
          localDir: e.localDir.clone(),
          damage: SPITTER.projectileDamage,
          speed: SPITTER.projectileSpeed,
          life: SPITTER.projectileLife,
          view: engine.spawnSpitterProjView(),
        });
      }
    } else if (!e.dying) {
      slerpToward(e.localDir, target, (e.speed / PLANET_R) * dt);
      e.bobTime += dt * 4;

      // Contact damage
      const surfDist = angBetween(e.localDir, target) * PLANET_R;
      if (surfDist < 1.0) {
        state.hp -= DIFFICULTY.contactDps * dt;
        state.shake = 0.3;
        engine.flashDamage();
        slerpToward(e.localDir, target, -(2 / PLANET_R) * dt); // push back
      }
    }

    if (e.hp <= 0) {
      e.dying = true; e.deathTimer = 0.35;
      const w = worldPos(e.localDir, state);
      if (e.boss) {
        state.bossKills++;
        engine.spawnParticles(w, 0xffd54f, BOSS.deathParticlesGold);
        engine.spawnParticles(w, 0xffb3d9, BOSS.deathParticlesPink);
        spawnGem(state, engine, e.localDir, BOSS.gemValueMult);
      } else {
        state.kills++;
        state.combo++;
        state.comboTimer = COMBO.window;
        state.comboMultiplier = 1 + Math.floor(state.combo / COMBO.killsPerTier) * COMBO.tierBonus;
        engine.spawnParticles(w, 0xffd54f, 10);
        engine.spawnParticles(w, 0xffb3d9, 6);
        spawnGem(state, engine, e.localDir);
      }
    }
  }

  // ── Spitter projectiles ──
  for (let i = state.spitterProjectiles.length - 1; i >= 0; i--) {
    const p = state.spitterProjectiles[i];
    p.life -= dt;
    // Move along great circle in fixed direction (no tracking)
    slerpToward(p.localDir, p.localDir, (p.speed / PLANET_R) * dt);

    // Check hit on player
    const surfDist = angBetween(p.localDir, target) * PLANET_R;
    if (surfDist < 0.9) {
      state.hp -= p.damage;
      state.shake = 0.2;
      engine.flashDamage();
      engine.spawnDamageNumber(new THREE.Vector3(0, PLANET_R, 0), p.damage, 0xff4444);
      engine.despawnSpitterProjView(p.view);
      state.spitterProjectiles.splice(i, 1);
      continue;
    }

    if (p.life <= 0) { engine.despawnSpitterProjView(p.view); state.spitterProjectiles.splice(i, 1); }
  }

  // ── Gems ──
  for (let i = state.gems.length - 1; i >= 0; i--) {
    const g = state.gems[i];
    g.bobTime += dt * 3;
    const d = angBetween(g.localDir, target) * PLANET_R;
    if (d < state.pickupRange) g.attracted = true;
    if (g.attracted) slerpToward(g.localDir, target, (10 / PLANET_R) * dt);
    if (d < 0.8) {
      engine.despawnGemView(g.view);
      state.gems.splice(i, 1);
      gainXp(state, engine, g.value);
    }
  }

  // ── Game over ──
  if (state.hp <= 0) { state.hp = 0; state.over = true; }
}

/* ═══ Spawning ════════════════════════════════════════════════ */
function spawnEnemy(state, engine, speed, hpScale) {
  // 15% chance to spawn a spitter
  if (Math.random() < SPITTER.spawnWeight) {
    spawnSpitter(state, engine, speed, hpScale);
    return;
  }
  const tmplIndex = Math.floor(Math.random() * 4); // normal blobs use templates 0-3
  const tmpl = ENEMY_TEMPLATES[tmplIndex];
  const ang = DIFFICULTY.spawnAngMin + Math.random() * (DIFFICULTY.spawnAngMax - DIFFICULTY.spawnAngMin);
  const localDir = state.targetLocal.clone().applyAxisAngle(randomPerp(state.targetLocal), ang).normalize();
  const hp = DIFFICULTY.enemyHpBase * tmpl.hpMult * hpScale;
  state.enemies.push({
    localDir,
    hp, maxHp: hp,
    speed: speed * (0.8 + Math.random() * 0.4),
    bobTime: Math.random() * Math.PI * 2,
    dying: false, deathTimer: 0, hitTimer: 0, hitFlash: 0,
    view: engine.spawnEnemyView(tmplIndex),
  });
}

function spawnSpitter(state, engine, speed, hpScale) {
  const ang = DIFFICULTY.spawnAngMin + Math.random() * (DIFFICULTY.spawnAngMax - DIFFICULTY.spawnAngMin);
  const localDir = state.targetLocal.clone().applyAxisAngle(randomPerp(state.targetLocal), ang).normalize();
  const hp = DIFFICULTY.enemyHpBase * SPITTER.hpMult * hpScale;
  state.enemies.push({
    localDir,
    hp, maxHp: hp,
    speed: speed * SPITTER.speedMult,
    bobTime: Math.random() * Math.PI * 2,
    dying: false, deathTimer: 0, hitTimer: 0, hitFlash: 0,
    spitter: true,
    fireTimer: SPITTER.fireInterval * 0.5, // stagger initial fire
    view: engine.spawnEnemyView(4), // template index 4 = spitter template
  });
}

function spawnBoss(state, engine, speed, hpScale) {
  const tmplIndex = Math.floor(Math.random() * ENEMY_TEMPLATES.length);
  const tmpl = ENEMY_TEMPLATES[tmplIndex];
  const ang = DIFFICULTY.spawnAngMin + Math.random() * (DIFFICULTY.spawnAngMax - DIFFICULTY.spawnAngMin);
  const localDir = state.targetLocal.clone().applyAxisAngle(randomPerp(state.targetLocal), ang).normalize();
  const hp = DIFFICULTY.enemyHpBase * tmpl.hpMult * hpScale * BOSS.hpMult;
  const enemy = {
    localDir,
    hp, maxHp: hp,
    speed: speed * BOSS.speedMult,
    bobTime: Math.random() * Math.PI * 2,
    dying: false, deathTimer: 0, hitTimer: 0, hitFlash: 0,
    boss: true,
    view: engine.spawnEnemyView(tmplIndex, true),
  };
  state.enemies.push(enemy);
  // Dramatic spawn burst
  const w = worldPos(localDir, state);
  engine.spawnParticles(w, 0xffd54f, 30);
  engine.spawnParticles(w, 0xff6b9d, 20);
}

function spawnGem(state, engine, localDir, valueMult = 1) {
  const big = valueMult > 1;
  state.gems.push({
    localDir: localDir.clone(),
    value: LEVEL.gemValue * valueMult,
    bobTime: Math.random() * Math.PI * 2,
    attracted: false,
    view: engine.spawnGemView(big),
  });
}

function damageEnemy(state, engine, e, dmg, showNumber = true) {
  e.hp -= dmg;
  e.hitTimer = 0.15;
  e.hitFlash = 0.08;
  if (showNumber) engine.spawnDamageNumber(worldPos(e.localDir, state), dmg);
}

/* ═══ Weapons ═════════════════════════════════════════════════ */
function stepPulse(state, dt, engine, target) {
  if (state.pulse.level <= 0) return;
  state.pulse.timer -= dt;
  if (state.pulse.timer > 0) return;
  state.pulse.timer = state.pulse.cooldown;
  let hit = false;
  for (const e of state.enemies) {
    if (e.dying) continue;
    if (angBetween(e.localDir, target) * PLANET_R <= state.pulse.range) {
      damageEnemy(state, engine, e, state.pulse.damage);
      hit = true;
    }
  }
  if (hit) engine.spawnPulse(state.pulse.range);
}

function stepOrbit(state, dt, engine, target) {
  state.orbitStars.length = 0;
  if (state.orbit.level <= 0) return;
  const count = ORBIT.baseCount + (state.orbit.level - 1);
  state.orbit.spinPhase += dt * ORBIT.spin;
  const ringAng = ORBIT.radius / PLANET_R;
  for (let i = 0; i < count; i++) {
    const az = state.orbit.spinPhase + (i / count) * Math.PI * 2;
    // Point ringAng away from the pole, swept around it by az (player is fixed at world top).
    const dir = _v.copy(UP).applyAxisAngle(_axis.set(Math.cos(az), 0, Math.sin(az)), ringAng);
    const wp = dir.clone().multiplyScalar(PLANET_R + 0.5);
    state.orbitStars.push(wp);
    for (const e of state.enemies) {
      if (e.dying) continue;
      if (worldPos(e.localDir, state).distanceTo(wp) < ORBIT.hitRange) {
        e.hp -= state.orbit.dps * dt;
        e.hitFlash = 0.06;
      }
    }
  }
}

function stepHoming(state, dt, engine, target) {
  if (state.homing.level > 0) {
    state.homing.timer -= dt;
    if (state.homing.timer <= 0) {
      state.homing.timer = state.homing.cooldown;
      for (let i = 0; i < state.homing.level; i++) {
        const localDir = target.clone();
        if (state.homing.level > 1) localDir.applyAxisAngle(randomPerp(target), 0.06);
        state.projectiles.push({
          localDir, target: nearestEnemy(state, target),
          damage: HOMING.damage, speed: HOMING.speed, life: HOMING.life,
          view: engine.spawnProjectileView(),
        });
      }
    }
  }

  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    p.life -= dt;
    let tgt = p.target;
    if (!tgt || tgt.dying || tgt.hp <= 0 || state.enemies.indexOf(tgt) < 0) {
      tgt = nearestEnemy(state, p.localDir); p.target = tgt;
    }
    if (tgt) {
      slerpToward(p.localDir, tgt.localDir, (p.speed / PLANET_R) * dt);
      if (angBetween(p.localDir, tgt.localDir) * PLANET_R < HOMING.hitRange) {
        damageEnemy(state, engine, tgt, p.damage);
        p.life = 0;
      }
    }
    if (p.life <= 0) { engine.despawnProjectileView(p.view); state.projectiles.splice(i, 1); }
  }
}

/* ═══ Progression ═════════════════════════════════════════════ */
function gainXp(state, engine, amount) {
  amount *= state.comboMultiplier;
  engine.spawnParticles(_pole.set(0, PLANET_R, 0), 0x64ffda, 4);
  state.xp += amount;
  if (state.xp >= state.xpToNext) {
    state.xp = 0;
    state.level++;
    state.xpToNext = Math.floor(state.xpToNext * LEVEL.xpGrowth);
    state.leveledUp = true; // main shows the upgrade screen
    const p = new THREE.Vector3(0, PLANET_R, 0);
    for (let j = 0; j < 5; j++) engine.spawnHeart(p);
    engine.spawnParticles(p, 0xffd54f, 12);
    engine.spawnParticles(p, 0xff6b9d, 8);
  }
}

export function pickUpgradeChoices(state) {
  const avail = UPGRADES.filter(u => u.available(state));
  for (let i = avail.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [avail[i], avail[j]] = [avail[j], avail[i]];
  }
  return avail.slice(0, 3);
}

export function applyUpgrade(state, upgrade) {
  state.upgrades[upgrade.id] = (state.upgrades[upgrade.id] || 0) + 1;
  upgrade.apply(state);
}
