import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════════════
   CONFIG — all tuning lives here. Pure data, no game logic.
   ═══════════════════════════════════════════════════════════════ */

export const UP = new THREE.Vector3(0, 1, 0);

// The planet is large relative to the character, so the world feels vast.
export const PLANET_R = 30;

// Camera, fixed above the north pole where the player stands. The view angle
// is driven by an adjustable elevation (degrees above horizontal): low =
// cinematic over-the-shoulder, 90 = straight-down top-down.
export const CAMERA = {
  fov: 50,
  dist: 26,            // distance from the player along the view arc
  lookY: PLANET_R - 2, // point the camera aims at
  minElev: 22,
  maxElev: 90,
  defaultElev: 46,     // slightly elevated default
};

// Weapons the player can start the run with (one is chosen on the start screen).
export const STARTING_WEAPONS = [
  { id: 'pulse', icon: '🌀', name: 'AOE Pulse', desc: 'Hits all nearby foes' },
  { id: 'orbit', icon: '✨', name: 'Sparkles', desc: 'Stars orbit you' },
  { id: 'homing', icon: '💘', name: 'Hearts', desc: 'Seek nearest foe' },
  { id: 'ricochet', icon: '🔵', name: 'Ricochet', desc: 'Bouncing bullets' },
  { id: 'shield', icon: '🛡️', name: 'Pickle Shield', desc: 'Orbiting shards that block and damage' },
];

export const PLAYER = {
  maxHp: 100,
  speed: 7,
  bobSpeed: 5,
  bobAmount: 0.05,
};

// Auto-attack AOE pulse — the starting weapon.
export const PULSE = {
  damage: 20,
  range: 4,
  cooldown: 1.2,
};

// Orbiting sparkles — spin around the player, damaging on contact.
export const ORBIT = {
  baseCount: 2,    // stars at level 1; +1 per extra level
  radius: 5,       // surface units from the player
  spin: 2.2,       // radians/sec
  dps: 26,         // damage per second per star to enemies in touch range
  hitRange: 1.4,
};

// Homing hearts — periodically fire seeking projectiles at the nearest enemy.
export const HOMING = {
  cooldown: 1.5,   // seconds between volleys
  damage: 34,
  speed: 16,       // surface units/sec
  life: 3.5,
  hitRange: 1.0,
};

export const ENEMY_TEMPLATES = [
  { color: 0xce93d8, eye: 0x4a148c, blush: 0xf48fb1, hpMult: 1 },    // Purple blob
  { color: 0x80deea, eye: 0x006064, blush: 0x4dd0e1, hpMult: 1.2 },  // Blue blob
  { color: 0xa5d6a7, eye: 0x1b5e20, blush: 0x81c784, hpMult: 0.8 },  // Green blob
  { color: 0xffcc80, eye: 0xe65100, blush: 0xffab91, hpMult: 1.5 },  // Orange blob
  { color: 0xf06292, eye: 0x880e4f, blush: 0xce93d8, hpMult: 0.7 },  // Pink spitter
];

export const SPITTER = {
  color: 0xf06292,      // pink/magenta
  eye: 0x880e4f,
  blush: 0xce93d8,
  hpMult: 0.7,          // slightly squishier than average
  speedMult: 0.3,       // much slower than normal — ranged enemy should be easily kited
  range: 8,             // surface units — tries to keep this distance
  preferredAng: 0.7,    // radians from player (spawn angle range)
  fireInterval: 2.5,    // seconds between shots
  projectileDamage: 8,  // damage per hit to player
  projectileSpeed: 10,  // surface units/sec
  projectileLife: 2.5,  // seconds
  // Spitter share of spawns ramps up with time instead of being a flat rate.
  spawnDelay: 30,         // seconds before any spitter can appear
  spawnWeightStart: 0.04, // share of spawns right after the delay
  spawnWeightMax: 0.16,   // cap on the spitter share
  spawnWeightRampSec: 150,// seconds (after the delay) to reach the cap
};

export const DIFFICULTY = {
  enemyHpBase: 30,
  enemySpeedBase: 2.0,
  spawnIntervalStart: 2.5,
  spawnIntervalMin: 0.6,
  spawnRampSec: 90,          // how fast the spawn interval shrinks
  contactDps: 15,            // damage to player per second of enemy contact
  // Enemies appear over the horizon: angular distance (rad) from the player.
  spawnAngMin: 0.6,
  spawnAngMax: 0.95,
  // Early game (first 30s) is easier to give new players breathing room.
  spawnIntervalEarlyGame: 4.0,  // slower spawns at the start
  earlyGameEnd: 30,             // seconds before normal spawn rate kicks in
  earlySpeedRampEnd: 15,        // enemies reach full speed by this time
};

export const BOSS = {
  interval: 90,              // seconds between boss spawns
  hpMult: 10,               // HP multiplier vs normal enemy
  scale: 3,                  // visual size multiplier
  speedMult: 0.7,           // 30% slower than normal enemies
  gemValueMult: 10,         // XP gem value multiplier
  deathParticlesGold: 30,
  deathParticlesPink: 20,
};

export const RICOCHET = {
  damage: 18,
  speed: 22,
  life: 3.0,
  hitRange: 1.0,
  cooldown: 1.8,
  bounces: 2,
};

export const SHIELD = {
  cooldown: 12,        // seconds between activations
  rechargeTime: 8,     // seconds to recharge after absorption
  absorbCount: 1,      // projectiles blocked per activation
  shardCount: 3,       // shards at level 1; +1 per extra level
  radius: 4,            // orbit radius from player
  spin: 1.8,           // radians/sec
  dps: 18,             // damage per second per shard to enemies in touch range
  hitRange: 1.2,       // contact range for shard damage
};

export const CRIT = {
  chance: 0.15,
  multiplier: 2.0,
};

export const WEAPON_SWITCH_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];

export const LEVEL = {
  xpToNextStart: 10,
  xpGrowth: 1.5,
  gemValue: 1,
};

export const COMBO = {
  window: 2.0,          // seconds between kills to keep combo alive
  killsPerTier: 5,      // every N kills adds +0.5x multiplier
  tierBonus: 0.5,       // multiplier bonus per tier
};

export const MAGNET_LINE = {
  poolSize: 10,
  color: 0x64ffda,
  opacity: 0.35,
};

/* ── Upgrade pool ───────────────────────────────────────────────
   Each upgrade is data + small pure mutators on state. `available`
   lets weapon unlocks/level-ups appear contextually. */
export const UPGRADES = [
  {
    id: 'pulse', icon: '🌀', name: 'AOE Pulse',
    desc: (s) => s.pulse.level === 0 ? 'Unlock the pulse' : '+20% pulse damage',
    available: () => true,
    apply: (s) => { s.pulse.level += 1; if (s.pulse.level > 1) s.pulse.damage *= 1.2; },
  },
  {
    id: 'pulse-dmg', icon: '⚔️', name: 'Sharper Pulse',
    desc: () => '+25% pulse damage',
    available: (s) => s.pulse.level > 0,
    apply: (s) => { s.pulse.damage *= 1.25; },
  },
  {
    id: 'pulse-range', icon: '💥', name: 'Wider Pulse',
    desc: () => '+20% pulse range',
    available: (s) => s.pulse.level > 0,
    apply: (s) => { s.pulse.range *= 1.2; },
  },
  {
    id: 'pulse-cd', icon: '⏩', name: 'Faster Pulse',
    desc: () => '+20% attack speed',
    available: (s) => s.pulse.level > 0,
    apply: (s) => { s.pulse.cooldown *= 0.8; },
  },
  {
    id: 'speed', icon: '💨', name: 'Quick Feet',
    desc: () => '+15% move speed',
    available: () => true,
    apply: (s) => { s.speed *= 1.15; },
  },
  {
    id: 'maxhp', icon: '💖', name: 'Big Heart',
    desc: () => '+30 max HP & heal',
    available: () => true,
    apply: (s) => { s.maxHp += 30; s.hp = Math.min(s.hp + 30, s.maxHp); },
  },
  {
    id: 'pickup', icon: '🧲', name: 'Magnet',
    desc: () => '+35% pickup range',
    available: () => true,
    apply: (s) => { s.pickupRange *= 1.35; },
  },
  {
    id: 'regen', icon: '🍀', name: 'Regrowth',
    desc: () => '+0.8 HP/sec regen',
    available: () => true,
    apply: (s) => { s.regen += 0.8; },
  },
  {
    id: 'orbit', icon: '✨', name: 'Orbiting Sparkles',
    desc: (s) => s.orbit.level === 0 ? 'Unlock spinning stars' : '+1 star',
    available: () => true,
    apply: (s) => { s.orbit.level += 1; },
  },
  {
    id: 'orbit-power', icon: '💫', name: 'Brighter Sparkles',
    desc: () => '+40% sparkle damage',
    available: (s) => s.orbit.level > 0,
    apply: (s) => { s.orbit.dps *= 1.4; },
  },
  {
    id: 'homing', icon: '💘', name: 'Homing Hearts',
    desc: (s) => s.homing.level === 0 ? 'Unlock seeking hearts' : '+1 heart per volley',
    available: () => true,
    apply: (s) => { s.homing.level += 1; },
  },
  {
    id: 'homing-cd', icon: '💕', name: 'Rapid Hearts',
    desc: () => '+25% heart fire rate',
    available: (s) => s.homing.level > 0,
    apply: (s) => { s.homing.cooldown *= 0.8; },
  },
  {
    id: 'ricochet', icon: '🔵', name: 'Ricochet Bullets',
    desc: (s) => s.ricochet.level === 0 ? 'Unlock bouncing bullets' : '+1 bullet per volley',
    available: () => true,
    apply: (s) => { s.ricochet.level += 1; },
  },
  {
    id: 'ricochet-dmg', icon: '🔷', name: 'Harder Bounces',
    desc: () => '+25% ricochet damage',
    available: (s) => s.ricochet.level > 0,
    apply: (s) => { s.ricochet.damage *= 1.25; },
  },
  {
    id: 'ricochet-bounce', icon: '↗️', name: 'Extra Bounce',
    desc: () => '+1 bounce per shot',
    available: (s) => s.ricochet.level > 0,
    apply: (s) => { s.ricochet.bounces += 1; },
  },
  {
    id: 'shield', icon: '🛡️', name: 'Pickle Shield',
    desc: (s) => s.shield.level === 0 ? 'Unlock orbiting shards' : '+1 shard & +1 block',
    available: () => true,
    apply: (s) => {
      s.shield.level += 1;
      if (s.shield.level > 1) { s.shield.shardCount += 1; s.shield.absorbCount += 1; }
    },
  },
  {
    id: 'shield-power', icon: '⚔️', name: 'Sharper Shards',
    desc: () => '+35% shard damage',
    available: (s) => s.shield.level > 0,
    apply: (s) => { s.shield.dps *= 1.35; },
  },
  {
    id: 'shield-recharge', icon: '🔋', name: 'Faster Recharge',
    desc: () => '+25% faster shield recharge',
    available: (s) => s.shield.level > 0,
    apply: (s) => { s.shield.rechargeTime *= 0.75; },
  },
];
