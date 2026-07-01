import * as THREE from 'three';
import {
  PLANET_R, UP, ORBIT, HOMING, ENEMY_TEMPLATES, DIFFICULTY, LEVEL, UPGRADES, COMBO, BOSS, SPITTER,
  RICOCHET, CRIT, SHIELD, ELITE, LIGHTNING, DASH, HP_GLOBE, FREEZE, DUST, STREAK,
  TURTLE, POISON, XP_BEAM,
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

  // ── Dash ─────────────────────────────────────────────────────────────────
  if (state.wantsDash && !state.dash.active && state.dash.cooldownTimer <= 0) {
    state.dash.active = true;
    state.dash.timer = DASH.duration;
    state.wantsDash = false;
  }
  if (state.wantsDash && !state.dash.active) state.wantsDash = false; // clear if on cooldown

  if (state.dash.active) {
    state.invincible = true;
    state.dash.timer -= dt;
    // Move at dash speed in the current move direction
    const dashMove = move.x !== 0 || move.z !== 0 ? move : { x: 0, z: 1 };
    _v.set(dashMove.x, 0, dashMove.z);
    if (_v.lengthSq() > 0) {
      _v.normalize();
      _axis.crossVectors(_v, UP).normalize();
      const dashSpeed = state.speed * DASH.speedMult;
      _q.setFromAxisAngle(_axis, (dashSpeed / PLANET_R) * dt);
      state.planetQuat.premultiply(_q);
      state.playerFace = Math.atan2(_v.x, _v.z);
    }
    if (state.dash.timer <= 0) {
      state.dash.active = false;
      state.invincible = false;
      state.dash.cooldownTimer = DASH.cooldown;
    }
  } else if (state.dash.cooldownTimer > 0) {
    state.dash.cooldownTimer -= dt;
  }

  // ── Pet Turtle ──
  if (state.turtle.active) {
    // Slerp turtle toward the player (target = player's local dir on sphere)
    const turtleMoveStep = (TURTLE.speed / PLANET_R) * dt;
    slerpToward(state.turtle.localDir, target, turtleMoveStep);
    state.turtle.angle += dt * 1.5;

    // Turtle attacks enemies within range
    const turtleAngRange = TURTLE.range / PLANET_R;
    for (const e of state.enemies) {
      if (e.dying) continue;
      const ang = angBetween(e.localDir, state.turtle.localDir);
      if (ang < turtleAngRange) {
        e.hp -= TURTLE.dps * dt;
        e.hitTimer = 0.1;
        e.hitFlash = 0.05;
      }
    }
  }

  // ── Movement: rotate the planet beneath the fixed player ──
  _v.set(move.x, 0, move.z);
  const isMoving = _v.lengthSq() > 0;
  if (isMoving) {
    _v.normalize();
    _axis.crossVectors(_v, UP).normalize();
    _q.setFromAxisAngle(_axis, (state.speed / PLANET_R) * dt);
    state.planetQuat.premultiply(_q);
    state.playerFace = Math.atan2(_v.x, _v.z);

    // ── Footstep dust particles ──────────────────────────────────────────────
    state.dustTimer -= dt;
    if (state.dustTimer <= 0) {
      state.dustTimer = DUST.spawnInterval;
      const playerWorld = new THREE.Vector3(0, PLANET_R, 0);
      for (let i = 0; i < DUST.particleCount; i++) {
        const offset = (Math.random() - 0.5) * 1.2;
        const angle = Math.random() * Math.PI * 2;
        const dustPos = playerWorld.clone().add(
          new THREE.Vector3(Math.cos(angle) * 0.6, -0.3 + Math.random() * 0.2, Math.sin(angle) * 0.6)
        );
        engine.spawnDustParticle(dustPos);
      }
    }
  } else {
    state.dustTimer = 0; // reset so dust starts immediately on next move
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
  // Early game: easier spawn rate (first 30s) and slower enemies (first 15s).
  const spawnInterval = t < DIFFICULTY.earlyGameEnd
    ? DIFFICULTY.spawnIntervalEarlyGame
    : Math.max(DIFFICULTY.spawnIntervalMin,
        DIFFICULTY.spawnIntervalStart - t / DIFFICULTY.spawnRampSec);
  const enemiesPerSpawn = Math.floor(2 + t / 30);
  // Speed ramps from 60% at spawn to full speed by earlySpeedRampEnd seconds.
  const speedScale = t < DIFFICULTY.earlySpeedRampEnd
    ? 0.6 + (t / DIFFICULTY.earlySpeedRampEnd) * 0.4
    : 1 + (t - DIFFICULTY.earlySpeedRampEnd) / 120;
  const enemySpeed = DIFFICULTY.enemySpeedBase * speedScale;
  const hpScale = 1 + t / 120;

  // ── Spawn ──
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    state.spawnTimer = spawnInterval;
    const count = enemiesPerSpawn + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) spawnEnemy(state, engine, enemySpeed, hpScale, t);
  }

  // ── Boss spawn ──
  state.bossTimer -= dt;
  if (state.bossTimer <= 0) {
    state.bossTimer = BOSS.interval;
    state.bossEnrageTimer = 0; // reset enrage timer on new boss spawn
    spawnBoss(state, engine, enemySpeed, hpScale);
  }

  // ── Boss enrage tracker ─────────────────────────────────────────────────────
  // While any boss is alive, increment the enrage timer for speed/fire rate bonuses.
  const aliveBoss = state.enemies.find(e => e.boss && !e.dying);
  if (aliveBoss) {
    state.bossEnrageTimer += dt;
    // Speed enrage: +10% per 10s, cap at 1.5x
    const speedBonus = Math.min(
      BOSS.enrageSpeedCap,
      1 + Math.floor(state.bossEnrageTimer / 10) * BOSS.enrageSpeedBonus
    );
    aliveBoss.speed = (DIFFICULTY.enemySpeedBase * speedScale * BOSS.speedMult) * speedBonus;
    // Fire rate enrage for spitter component (boss uses normal enemy AI + spitter if applicable)
    if (aliveBoss.spitter) {
      const fireBonus = Math.min(
        BOSS.enrageFireRateCap,
        1 + Math.floor(state.bossEnrageTimer / 15) * BOSS.enrageFireRateBonus
      );
      // aliveBoss.fireTimer is already used by spitter logic; scale its interval via a stored multiplier
      if (aliveBoss.enrageFireMult === undefined) aliveBoss.enrageFireMult = 1;
      aliveBoss.enrageFireMult = fireBonus;
    }
    // Pass enrage level to engine for visual glow
    engine.setBossEnrage(state.bossEnrageTimer);
  } else {
    engine.setBossEnrage(0);
  }

  // ── Weapons (only fire the active one; inactive timers freeze) ──
  const active = state.activeWeaponId;
  if (active === 'pulse') stepPulse(state, dt, engine, target);
  if (active === 'orbit') stepOrbit(state, dt, engine, target);
  else state.orbitStars.length = 0; // hide stars when orbit is inactive
  if (active === 'homing') stepHoming(state, dt, engine, target);
  if (active === 'ricochet') stepRicochet(state, dt, engine, target);
  if (active === 'shield') stepShield(state, dt, engine, target);
  else state.shieldStars.length = 0; // hide shards when shield is inactive

  // ── Enemy AI ──
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.hitTimer > 0) e.hitTimer -= dt;

    // Freeze countdown & ice particles
    if (e.frozen) {
      e.frozenTimer -= dt;
      if (e.frozenTimer <= 0) { e.frozen = false; e.frozenTimer = 0; }
      // Ice particles while frozen (~8/second via timer accumulator)
      if (!e._iceAcc) e._iceAcc = 0;
      e._iceAcc += dt;
      const iceInterval = 1 / 8;
      while (e._iceAcc >= iceInterval) {
        e._iceAcc -= iceInterval;
        const wp = worldPos(e.localDir, state);
        engine.spawnFreezeParticles(wp);
      }
    }

    // Poison tick damage
    if (e.poison && e.poison.active) {
      e.poison.timer -= dt;
      e.hp -= e.poison.damage * dt;
      e.hitTimer = 0.1;
      e.hitFlash = 0.05;
      // Show poison damage number periodically
      if (!e._poisonAcc) e._poisonAcc = 0;
      e._poisonAcc += dt;
      const poisonInterval = 0.5;
      while (e._poisonAcc >= poisonInterval) {
        e._poisonAcc -= poisonInterval;
        const wp = worldPos(e.localDir, state);
        engine.spawnPoisonParticles(wp);
        engine.spawnDamageNumber(wp, Math.round(e.poison.damage * poisonInterval), 0x76ff03);
      }
      if (e.poison.timer <= 0) e.poison = null;
    }

    if (e.dying) {
      e.deathTimer -= dt;
      if (e.deathTimer <= 0) { engine.despawnEnemyView(e.view); state.enemies.splice(i, 1); }
      continue;
    }

    // Effective speed: reduced while frozen
    const frozenMult = e.frozen ? FREEZE.speedMult : 1;

    // Spitter: maintain range and fire projectiles
    if (e.spitter && !e.dying) {
      const surfDist = angBetween(e.localDir, target) * PLANET_R;
      e.bobTime += dt * 4;

      if (surfDist < SPITTER.range - 1) {
        // Too close — back up
        slerpToward(e.localDir, target, -(e.speed * frozenMult / PLANET_R) * dt);
      } else if (surfDist > SPITTER.range + 1) {
        // Too far — approach
        slerpToward(e.localDir, target, (e.speed * frozenMult / PLANET_R) * dt);
      }
      // else in range — hold position

      // Contact damage still applies if player runs into spitter
      if (surfDist < 1.0 && !state.invincible) {
        state.hp -= DIFFICULTY.contactDps * dt;
        state.shake = 0.3;
        engine.flashDamage();
        slerpToward(e.localDir, target, -(2 / PLANET_R) * dt);
      } else if (surfDist < 1.0 && state.invincible) {
        slerpToward(e.localDir, target, -(2 / PLANET_R) * dt);
      }

      // Fire projectile
      const fireMult = e.enrageFireMult !== undefined ? e.enrageFireMult : 1;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        e.fireTimer = SPITTER.fireInterval / fireMult;
        const aimDir = target.clone(); // direction toward player
        state.spitterProjectiles.push({
          localDir: e.localDir.clone(),
          moveDir: aimDir, // aimed at player at moment of fire
          tangent: e.localDir.clone().cross(aimDir).normalize(), // rotation axis: E × P moves E toward P
          damage: SPITTER.projectileDamage,
          speed: SPITTER.projectileSpeed,
          life: SPITTER.projectileLife,
          view: engine.spawnSpitterProjView(),
        });
      }
    } else if (!e.dying) {
      slerpToward(e.localDir, target, (e.speed * frozenMult / PLANET_R) * dt);
      e.bobTime += dt * 4;

      // Contact damage
      const surfDist = angBetween(e.localDir, target) * PLANET_R;
      if (surfDist < 1.0 && !state.invincible) {
        state.hp -= DIFFICULTY.contactDps * dt;
        state.shake = 0.3;
        engine.flashDamage();
        slerpToward(e.localDir, target, -(2 / PLANET_R) * dt); // push back
      } else if (surfDist < 1.0 && state.invincible) {
        slerpToward(e.localDir, target, -(2 / PLANET_R) * dt);
      }
    }

    if (e.hp <= 0) {
      e.dying = true; e.deathTimer = 0.35;
      const w = worldPos(e.localDir, state);
      if (e.boss) {
        state.bossKills++;
        state.bossEnrageTimer = 0; // reset enrage timer on boss death
        engine.spawnParticles(w, 0xffd54f, BOSS.deathParticlesGold);
        engine.spawnParticles(w, 0xffb3d9, BOSS.deathParticlesPink);
        spawnGem(state, engine, e.localDir, BOSS.gemValueMult);
        triggerStreakAnnouncement(state, engine);
      } else if (e.elite) {
        state.kills++;
        state.combo++;
        state.comboTimer = COMBO.window;
        state.comboMultiplier = 1 + Math.floor(state.combo / COMBO.killsPerTier) * COMBO.tierBonus;
        state.weaponKills[state.activeWeaponId] = (state.weaponKills[state.activeWeaponId] || 0) + 1;
        engine.spawnParticles(w, 0xff9800, ELITE.deathParticlesGold);
        engine.spawnParticles(w, 0xffb74d, ELITE.deathParticlesPink);
        spawnGem(state, engine, e.localDir, ELITE.gemValueMult);
        // Chain lightning from elite death
        triggerChainLightning(state, engine, e, e.maxHp * 0.3, w);
        triggerPoison(state, engine, e, w);
        triggerStreakAnnouncement(state, engine);
      } else {
        state.kills++;
        state.combo++;
        state.comboTimer = COMBO.window;
        state.comboMultiplier = 1 + Math.floor(state.combo / COMBO.killsPerTier) * COMBO.tierBonus;
        // Track kills per active weapon
        state.weaponKills[state.activeWeaponId] = (state.weaponKills[state.activeWeaponId] || 0) + 1;
        engine.spawnParticles(w, 0xffd54f, 10);
        engine.spawnParticles(w, 0xffb3d9, 6);
        spawnGem(state, engine, e.localDir);
        // HP globe drop chance (normal enemies only, not bosses/elites)
        if (!e.boss && !e.elite && Math.random() < HP_GLOBE.dropChance) {
          spawnHpGlobe(state, engine, e.localDir);
        }
        // Chain lightning from normal kill
        triggerChainLightning(state, engine, e, DIFFICULTY.enemyHpBase * hpScale * 0.3, w);
        triggerPoison(state, engine, e, w);
        triggerStreakAnnouncement(state, engine);
      }
    }
  }

  // ── Spitter projectiles ──
  for (let i = state.spitterProjectiles.length - 1; i >= 0; i--) {
    const p = state.spitterProjectiles[i];
    p.life -= dt;
    // Rotate localDir around the tangent axis by a fixed step — no tracking
    const step = (p.speed / PLANET_R) * dt;
    _q.setFromAxisAngle(p.tangent, step);
    p.localDir.applyQuaternion(_q);

    // Check hit on player (or shield absorption)
    const surfDist = angBetween(p.localDir, target) * PLANET_R;
    if (surfDist < 0.9) {
      // Skip damage if player is invincible
      if (!state.invincible) {
        // Check if shield is active and can absorb
        if (state.shield.level > 0 && state.shield.timer > 0 && state.shield.absorbed > 0) {
          // Shield absorbs this projectile
          state.shield.absorbed--;
          if (state.shield.absorbed <= 0) state.shield.timer = 0; // deactivate shield early
          engine.spawnBlockedEffect(worldPos(p.localDir, state));
          engine.despawnSpitterProjView(p.view);
          state.spitterProjectiles.splice(i, 1);
          continue;
        }
        state.hp -= p.damage;
        state.shake = 0.2;
        engine.flashDamage();
        engine.spawnDamageNumber(new THREE.Vector3(0, PLANET_R, 0), p.damage, 0xff4444);
      }
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

  // ── XP Beam: draw lines from gems to player when 3+ gems nearby ──
  state.xpBeamLines.length = 0;
  if (state.gems.length >= XP_BEAM.requiredGems) {
    const angRange = XP_BEAM.range / PLANET_R;
    const playerWorld = new THREE.Vector3(0, PLANET_R, 0);
    let count = 0;
    for (const g of state.gems) {
      if (count >= XP_BEAM.poolSize) break;
      const d = angBetween(g.localDir, target);
      if (d <= angRange) {
        const gemWorld = g.localDir.clone().multiplyScalar(PLANET_R).applyQuaternion(state.planetQuat);
        state.xpBeamLines.push({ from: gemWorld.clone(), to: playerWorld.clone(), life: 0.3 });
        count++;
      }
    }
  }

  // ── HP Globes ──
  for (let i = state.hpGlobes.length - 1; i >= 0; i--) {
    const g = state.hpGlobes[i];
    g.bobTime += dt * HP_GLOBE.bobSpeed;
    const d = angBetween(g.localDir, target) * PLANET_R;
    if (d < state.pickupRange) slerpToward(g.localDir, target, (10 / PLANET_R) * dt);
    if (d < 0.9) {
      // Heal the player
      state.hp = Math.min(state.maxHp, state.hp + HP_GLOBE.healAmount);
      engine.spawnParticles(worldPos(g.localDir, state), 0x4caf50, 8);
      engine.spawnDamageNumber(worldPos(g.localDir, state), HP_GLOBE.healAmount, 0x4caf50);
      engine.despawnHpGlobeView(g.view);
      state.hpGlobes.splice(i, 1);
    }
  }

  // ── Game over ──
  if (state.hp <= 0) { state.hp = 0; state.over = true; }
}

/* ═══ Chain Lightning ══════════════════════════════════════════ */
// Find nearby enemies and arc lightning to them, dealing damage.
function triggerChainLightning(state, engine, victim, damage, worldPos) {
  let chains = 0;
  const angRange = LIGHTNING.chainRange / PLANET_R;
  for (const e of state.enemies) {
    if (e === victim || e.dying) continue;
    const ang = angBetween(victim.localDir, e.localDir);
    if (ang <= angRange && chains < LIGHTNING.chainCount) {
      const chainDmg = damage * LIGHTNING.damageRatio;
      e.hp -= chainDmg;
      e.hitTimer = 0.1;
      e.hitFlash = 0.08;
      const wp = worldPos(e.localDir, state);
      engine.spawnChainLightning(worldPos, wp);
      engine.spawnDamageNumber(wp, Math.round(chainDmg), 0x80d8ff);
      chains++;
    }
  }
}

/* ═══ Poison ════════════════════════════════════════════════ */
// On enemy death, roll chance to poison a nearby enemy.
function triggerPoison(state, engine, victim, worldPos) {
  if (Math.random() >= POISON.chance) return;
  const angRange = POISON.range / PLANET_R;
  let best = null, bestAng = Infinity;
  for (const e of state.enemies) {
    if (e === victim || e.dying) continue;
    const ang = angBetween(victim.localDir, e.localDir);
    if (ang < bestAng && ang <= angRange) { bestAng = ang; best = e; }
  }
  if (best) {
    best.poison = { active: true, timer: POISON.duration, damage: POISON.dps };
    engine.spawnParticles(worldPos, POISON.particleColor, POISON.particleCount);
  }
}

/* ═══ Spawning ════════════════════════════════════════════════ */
function spawnEnemy(state, engine, speed, hpScale, t) {
  // Spitters stay away early, then grow as a share of spawns over time.
  if (t >= SPITTER.spawnDelay) {
    const ramp = Math.min(1, (t - SPITTER.spawnDelay) / SPITTER.spawnWeightRampSec);
    const weight = SPITTER.spawnWeightStart +
      (SPITTER.spawnWeightMax - SPITTER.spawnWeightStart) * ramp;
    if (Math.random() < weight) {
      spawnSpitter(state, engine, speed, hpScale);
      return;
    }
  }

  // 5% chance to spawn an elite instead of a normal blob
  if (Math.random() < ELITE.spawnChance) {
    spawnElite(state, engine, speed, hpScale);
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
    frozen: false, frozenTimer: 0,
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
    frozen: false, frozenTimer: 0,
    view: engine.spawnEnemyView(4), // template index 4 = spitter template
  });
}

function spawnElite(state, engine, speed, hpScale) {
  // Elites use a random normal template but get elite flag, 3x HP, 1.5x scale
  const tmplIndex = Math.floor(Math.random() * 4);
  const tmpl = ENEMY_TEMPLATES[tmplIndex];
  const ang = DIFFICULTY.spawnAngMin + Math.random() * (DIFFICULTY.spawnAngMax - DIFFICULTY.spawnAngMin);
  const localDir = state.targetLocal.clone().applyAxisAngle(randomPerp(state.targetLocal), ang).normalize();
  const hp = DIFFICULTY.enemyHpBase * tmpl.hpMult * hpScale * ELITE.hpMult;
  state.enemies.push({
    localDir,
    hp, maxHp: hp,
    speed: speed * (0.8 + Math.random() * 0.4),
    bobTime: Math.random() * Math.PI * 2,
    dying: false, deathTimer: 0, hitTimer: 0, hitFlash: 0,
    elite: true,
    frozen: false, frozenTimer: 0,
    view: engine.spawnEnemyView(tmplIndex, false, true), // third arg = isElite
  });
  const w = worldPos(localDir, state);
  engine.spawnParticles(w, 0xff9800, 8); // orange burst on elite spawn
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
    frozen: false, frozenTimer: 0,
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

function spawnHpGlobe(state, engine, localDir) {
  state.hpGlobes.push({
    localDir: localDir.clone(),
    bobTime: Math.random() * Math.PI * 2,
    view: engine.spawnHpGlobeView(),
  });
}

function damageEnemy(state, engine, e, dmg, showNumber = true) {
  const isCrit = CRIT.chance > 0 && Math.random() < CRIT.chance;
  const finalDmg = isCrit ? dmg * CRIT.multiplier : dmg;
  e.hp -= finalDmg;
  e.hitTimer = 0.15;
  e.hitFlash = 0.08;
  if (showNumber) {
    const colorHex = isCrit ? 0xffd700 : 0xffd54f; // gold for crit, amber for normal
    engine.spawnDamageNumber(worldPos(e.localDir, state), Math.round(finalDmg), colorHex);
    // Big "CRIT!" text above for critical hits
    if (isCrit) {
      const wp = worldPos(e.localDir, state);
      engine.spawnCritText(new THREE.Vector3(wp.x, wp.y + 1.8, wp.z));
    }
  }
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
      // Freeze chance — roll after each hit
      if (Math.random() < FREEZE.chance) {
        e.frozen = true;
        e.frozenTimer = FREEZE.duration;
        const wp = worldPos(e.localDir, state);
        engine.spawnFreezeParticles(wp);
      }
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

    // ── Ricochet bounce: reflect when hitting the planet "floor" ──
    if (p.bounces !== undefined && p.bounces > 0) {
      // localDir.y < 0 means the projectile has gone "below the equator" toward south pole
      // This means it hit the planet surface — reflect back
      if (p.localDir.y < -(1.5 / PLANET_R)) {
        p.localDir.y = -p.localDir.y;
        // also neutralize tangential components to prevent spiral drift
        const horizLen = Math.sqrt(p.localDir.x * p.localDir.x + p.localDir.z * p.localDir.z);
        if (horizLen > 1e-6) {
          p.localDir.x = (p.localDir.x / horizLen) * 0.5;
          p.localDir.z = (p.localDir.z / horizLen) * 0.5;
          p.localDir.normalize();
        }
        p.bounces--;
      }
    }

    let tgt = p.target;
    if (!tgt || tgt.dying || tgt.hp <= 0 || state.enemies.indexOf(tgt) < 0) {
      tgt = nearestEnemy(state, p.localDir); p.target = tgt;
    }
    if (tgt) {
      slerpToward(p.localDir, tgt.localDir, (p.speed / PLANET_R) * dt);
      const hitRange = p.bounces !== undefined ? RICOCHET.hitRange : HOMING.hitRange;
      if (angBetween(p.localDir, tgt.localDir) * PLANET_R < hitRange) {
        damageEnemy(state, engine, tgt, p.damage);
        p.life = 0;
      }
    }
    if (p.life <= 0) { engine.despawnProjectileView(p.view); state.projectiles.splice(i, 1); }
  }
}

function stepRicochet(state, dt, engine, target) {
  if (state.ricochet.level <= 0) return;
  state.ricochet.timer -= dt;
  if (state.ricochet.timer > 0) return;
  state.ricochet.timer = state.ricochet.cooldown;

  const count = state.ricochet.level;
  for (let i = 0; i < count; i++) {
    const localDir = target.clone();
    if (count > 1) localDir.applyAxisAngle(randomPerp(target), 0.12 * (i - (count - 1) / 2));
    state.projectiles.push({
      localDir,
      target: nearestEnemy(state, target),
      damage: state.ricochet.damage,
      speed: RICOCHET.speed,
      life: RICOCHET.life,
      bounces: state.ricochet.bounces,
      view: engine.spawnProjectileView(),
    });
  }
}

function stepShield(state, dt, engine, target) {
  state.shieldStars.length = 0;
  if (state.shield.level <= 0) return;

  // Active: timer counts down; rechargeTimer tracks recharge progress
  if (state.shield.timer > 0) {
    state.shield.timer -= dt;
    state.shield.spinPhase += dt * SHIELD.spin;

    const count = state.shield.shardCount;
    const ringAng = SHIELD.radius / PLANET_R;
    for (let i = 0; i < count; i++) {
      const az = state.shield.spinPhase + (i / count) * Math.PI * 2;
      const dir = _v.copy(UP).applyAxisAngle(_axis.set(Math.cos(az), 0, Math.sin(az)), ringAng);
      const wp = dir.clone().multiplyScalar(PLANET_R + 0.5);
      state.shieldStars.push(wp);

      // Damage enemies in contact
      for (const e of state.enemies) {
        if (e.dying) continue;
        if (worldPos(e.localDir, state).distanceTo(wp) < SHIELD.hitRange) {
          e.hp -= state.shield.dps * dt;
          e.hitFlash = 0.06;
        }
      }
    }

    // Auto-deactivate when timer runs out
    if (state.shield.timer <= 0) {
      state.shield.absorbed = 0;
      state.shield.rechargeTimer = SHIELD.rechargeTime;
    }
  } else {
    // Recharging
    state.shield.rechargeTimer -= dt;
    if (state.shield.rechargeTimer <= 0) {
      // Ready — activate
      state.shield.timer = 3.0; // active duration in seconds
      state.shield.absorbed = state.shield.absorbCount;
    }
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

/* ═══ Kill Streak Announcement ════════════════════════════════ */
function triggerStreakAnnouncement(state, engine) {
  const combo = state.combo;
  for (const milestone of STREAK.milestones) {
    if (combo >= milestone && state.lastStreakMilestone < milestone) {
      state.lastStreakMilestone = milestone;
      state.streakTimer = STREAK.displayTime;
      engine.showStreak(combo);
      break;
    }
  }
}
