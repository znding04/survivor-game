import * as THREE from 'three';
import { PLAYER, PULSE, ORBIT, HOMING, LEVEL, BOSS, RICOCHET, SHIELD } from './config.js';

/* ═══════════════════════════════════════════════════════════════
   STATE — the game's mutable model. No rendering, no DOM.
   Entities are plain logic objects; their `.view` (a Three.js mesh)
   is owned by the engine and only referenced here.
   ═══════════════════════════════════════════════════════════════ */

export function createState() {
  return {
    // Run flags
    running: false,
    paused: false,
    upgrading: false,
    over: false,
    leveledUp: false,

    time: 0,
    kills: 0,

    // World transform (logic-owned; engine mirrors it onto the planet mesh).
    // Walking rotates the planet beneath the player, who stays at the pole.
    planetQuat: new THREE.Quaternion(),
    targetLocal: new THREE.Vector3(0, 1, 0), // planet-local dir of the player's feet
    playerFace: 0,                            // yaw the player model turns toward
    orbitStars: [],                           // world positions of orbiting sparkles
    shieldStars: [],                           // world positions of orbiting shield shards

    // Player stats
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    speed: PLAYER.speed,
    regen: 0,
    pickupRange: 3,

    // Progression
    xp: 0,
    xpToNext: LEVEL.xpToNextStart,
    level: 1,
    upgrades: {}, // id -> level (count taken), for the loadout panel

    // Weapons (all start unowned at level 0; the chosen starting weapon is
    // set to level 1 by main.startGame).
    pulse: { level: 0, damage: PULSE.damage, range: PULSE.range, cooldown: PULSE.cooldown, timer: 0 },
    orbit: { level: 0, dps: ORBIT.dps, spinPhase: 0 },
    homing: { level: 0, cooldown: HOMING.cooldown, timer: 0 },
    ricochet: { level: 0, damage: RICOCHET.damage, cooldown: RICOCHET.cooldown, timer: 0, bounces: RICOCHET.bounces },

    // Active weapon (for weapon switching)
    activeWeaponId: 'pulse',

    // Shield (orbiting shards)
    shield: { level: 0, timer: 0, rechargeTimer: 0, absorbed: 0, spinPhase: 0, shardCount: SHIELD.shardCount, absorbCount: SHIELD.absorbCount },

    // Boss
    bossTimer: BOSS.interval,
    bossKills: 0,
    bossEnrageTimer: 0,    // seconds since last boss spawn

    // Spawning
    spawnTimer: 1,

    // Entity lists
    enemies: [],
    gems: [],
    projectiles: [],
    spitterProjectiles: [],

    // Combo
    combo: 0,
    comboTimer: 0,
    comboMultiplier: 1,

    // Weapon kill tracking
    weaponKills: { pulse: 0, orbit: 0, homing: 0, ricochet: 0, shield: 0 },

    // Transient feedback
    shake: 0,
  };
}

// Reset an existing state object in place (keeps the same reference).
export function resetState(s) {
  Object.assign(s, createState(), { running: true });
}
