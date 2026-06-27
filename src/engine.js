import * as THREE from 'three';
import { PLANET_R, UP, CAMERA, PLAYER, ENEMY_TEMPLATES, MAGNET_LINE, BOSS, SPITTER, ELITE, LIGHTNING } from './config.js';

// Phones get lighter settings (fewer pixels, smaller shadows, less foliage).
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window);

/* ═══════════════════════════════════════════════════════════════
   ENGINE — front-end rendering. Owns the Three.js scene, camera,
   object pools, mesh factories and visual effects. Knows nothing
   about game rules; it mirrors the simulation state each frame.
   ═══════════════════════════════════════════════════════════════ */

const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _x = new THREE.Vector3(), _z = new THREE.Vector3();
const _face = new THREE.Vector3();

// Orient an object standing on the sphere (local +Y = normal) facing `travel`.
function orientOnSphere(obj, normal, travel) {
  _z.copy(travel).sub(normal.clone().multiplyScalar(travel.dot(normal)));
  if (_z.lengthSq() < 1e-6) { obj.quaternion.setFromUnitVectors(UP, normal); return; }
  _z.normalize();
  _x.crossVectors(normal, _z).normalize();
  _m.makeBasis(_x, normal, _z);
  obj.quaternion.setFromRotationMatrix(_m);
}

// Minimal object pool: meshes stay parented and toggle visibility.
function makePool(factory) {
  const free = [];
  return {
    acquire() { const o = free.length ? free.pop() : factory(); o.visible = true; return o; },
    release(o) { o.visible = false; free.push(o); },
  };
}

export const engine = {
  scene: null, camera: null, renderer: null, planet: null, player: null,

  _pools: {}, _fx: { particles: [], damage: [], pulses: [], stars: [], magnetLines: [], shards: [], bossHp: [], chainLightnings: [] },
  _ambient: [],
  _bossHpPool: [],
  _bossEnrage: 0, // current boss enrage level (seconds)

  /* ── Setup ──────────────────────────────────────────── */
  init() {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH ? 1.5 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, PLANET_R + 18, PLANET_R + 48);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(
      CAMERA.fov, window.innerWidth / window.innerHeight, 0.1, 300);
    this.camera = camera;
    this._camBase = new THREE.Vector3();
    this._camLook = new THREE.Vector3(0, CAMERA.lookY, 0);
    const saved = parseFloat(localStorage.getItem('survivor-campitch'));
    this._camPitch = Number.isFinite(saved) ? saved
      : (CAMERA.defaultElev - CAMERA.minElev) / (CAMERA.maxElev - CAMERA.minElev);
    this._applyCamera();
    camera.position.copy(this._camBase);
    camera.lookAt(this._camLook);

    scene.add(new THREE.AmbientLight(0xfff0f5, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(20, 40, 20);
    dir.castShadow = true;
    dir.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
    const sc = dir.shadow.camera;
    sc.left = -PLANET_R; sc.right = PLANET_R; sc.top = PLANET_R; sc.bottom = -PLANET_R;
    sc.near = 1; sc.far = 120;
    scene.add(dir);
    scene.add(new THREE.HemisphereLight(0xfce4ec, 0xc8e6c9, 0.5));

    this._buildPlanet();
    this._initPools();
    this._initAmbient();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  },

  _buildPlanet() {
    const planet = new THREE.Group();
    this.scene.add(planet);
    this.planet = planet;

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(PLANET_R, 64, 64),
      new THREE.MeshLambertMaterial({ color: 0xa8e6a1 }));
    ball.receiveShadow = true;
    ball.castShadow = true;
    planet.add(ball);

    const randDir = () => new THREE.Vector3(
      Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const place = (obj, dir, r) => {
      obj.position.copy(dir).multiplyScalar(r);
      obj.quaternion.setFromUnitVectors(UP, dir);
    };

    const flowerColors = [0xff9ecb, 0xffe082, 0xb39ddb, 0x80deea, 0xf48fb1];
    const stemGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6);
    const petalGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x66bb6a });
    const flowerCount = IS_TOUCH ? 150 : 320;
    const bushCount = IS_TOUCH ? 45 : 100;
    for (let i = 0; i < flowerCount; i++) {
      const f = new THREE.Group();
      const stem = new THREE.Mesh(stemGeo, stemMat); stem.position.y = 0.2; f.add(stem);
      const petal = new THREE.Mesh(petalGeo,
        new THREE.MeshLambertMaterial({ color: flowerColors[i % flowerColors.length] }));
      petal.position.y = 0.45; petal.scale.y = 0.6; f.add(petal);
      place(f, randDir(), PLANET_R);
      planet.add(f);
    }
    for (let i = 0; i < bushCount; i++) {
      const dir = randDir();
      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0x81c784 }));
      bush.scale.y = 0.7; bush.castShadow = true;
      place(bush, dir, PLANET_R);
      bush.position.addScaledVector(dir, 0.25);
      planet.add(bush);
    }
  },

  /* ── Player ─────────────────────────────────────────── */
  createPlayer() {
    if (this.player) { this.player.visible = true; return; }
    const p = makePickle();
    p.position.set(0, PLANET_R, 0);
    this.scene.add(p);
    this.player = p;

    // Pickup range ring — follows the player on the planet surface
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.04, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0x64ffda, transparent: true, opacity: 0.25, depthWrite: false })
    );
    ring.rotation.x = Math.PI / 2;
    this.planet.add(ring);
    this._pickupRing = ring;
  },

  /* ── Pools for dynamic entities & effects ───────────── */
  _initPools() {
    this._pools.enemy = makePool(() => { const v = makeEnemy(); this.planet.add(v); v.visible = false; return v; });
    this._pools.gem = makePool(() => { const v = makeGem(); this.planet.add(v); v.visible = false; return v; });
    this._pools.proj = makePool(() => { const v = makeHeartProj(); this.planet.add(v); v.visible = false; return v; });
    this._pools.particle = makePool(() => { const v = makeParticle(); this.scene.add(v); v.visible = false; return v; });
    this._pools.damage = makePool(() => { const v = makeDamageSprite(); this.scene.add(v); v.visible = false; return v; });
    this._pools.pulse = makePool(() => { const v = makePulseRing(); this.scene.add(v); v.visible = false; return v; });
    this._pools.star = makePool(() => { const v = makeOrbitStar(); this.scene.add(v); v.visible = false; return v; });
    this._pools.magnetLine = makePool(() => { const v = makeMagnetLine(); this.scene.add(v); v.visible = false; return v; });
    this._pools.spitterProj = makePool(() => { const v = makeSpitterProj(); this.planet.add(v); v.visible = false; return v; });
    this._pools.shard = makePool(() => { const v = makeShieldShard(); this.planet.add(v); v.visible = false; return v; });
    this._pools.chainLightning = makePool(() => { const v = makeChainLightning(); this.scene.add(v); v.visible = false; return v; });
  },

  spawnEnemyView(tmplIndex, isBoss = false, isElite = false) {
    const v = this._pools.enemy.acquire();
    applyEnemyTemplate(v, ENEMY_TEMPLATES[tmplIndex], isElite);
    v.scale.setScalar(isBoss ? BOSS.scale : (isElite ? ELITE.scale : 1));
    v.userData.isBoss = isBoss;
    v.userData.isElite = isElite;
    // Boss label
    if (isBoss) {
      if (!v.userData.bossLabel) {
        const label = makeBossLabel();
        v.add(label);
        v.userData.bossLabel = label;
      }
      v.userData.bossLabel.visible = true;
    } else if (v.userData.bossLabel) {
      v.userData.bossLabel.visible = false;
    }
    return v;
  },
  despawnEnemyView(v) {
    if (v.userData.bossLabel) v.userData.bossLabel.visible = false;
    if (v.userData.bossHpLabel) v.userData.bossHpLabel.visible = false;
    v.userData.isBoss = false;
    this._pools.enemy.release(v);
  },
  spawnGemView(big = false) {
    const v = this._pools.gem.acquire();
    v.scale.setScalar(big ? 2.5 : 1);
    return v;
  },
  despawnGemView(v) { this._pools.gem.release(v); },
  spawnProjectileView() { const v = this._pools.proj.acquire(); return v; },
  despawnProjectileView(v) { this._pools.proj.release(v); },
  spawnSpitterProjView() { return this._pools.spitterProj.acquire(); },
  despawnSpitterProjView(v) { this._pools.spitterProj.release(v); },

  /* ── Effects (called by logic; engine animates & recycles) ── */
  spawnParticles(pos, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const p = this._pools.particle.acquire();
      p.material.color.setHex(color); p.material.opacity = 1;
      const s = 0.06 + Math.random() * 0.06; p.scale.setScalar(s / 0.1);
      p.position.copy(pos);
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
      p.userData.vx = Math.cos(a) * sp;
      p.userData.vy = 2 + Math.random() * 4;
      p.userData.vz = Math.sin(a) * sp;
      p.userData.gravity = true;
      p.userData.life = p.userData.maxLife = 0.5 + Math.random() * 0.5;
      this._fx.particles.push(p);
    }
  },
  spawnHeart(pos) {
    const p = this._pools.particle.acquire();
    p.material.color.setHex(0xff6b9d); p.material.opacity = 0.85; p.scale.setScalar(0.9);
    p.position.copy(pos);
    p.userData.vx = 0; p.userData.vz = 0; p.userData.vy = 0.8 + Math.random() * 0.6;
    p.userData.gravity = false;
    p.userData.life = p.userData.maxLife = 1.4 + Math.random();
    this._fx.particles.push(p);
  },
  spawnDamageNumber(pos, dmg, colorHex = 0xffd54f) {
    const s = this._pools.damage.acquire();
    drawDamage(s, Math.round(dmg), colorHex);
    s.position.copy(pos); s.position.y += 1.4;
    s.userData.vy = 2.5; s.userData.life = s.userData.maxLife = 0.8;
    this._fx.damage.push(s);
  },
  spawnPulse(range) {
    const r = this._pools.pulse.acquire();
    r.scale.setScalar(range);
    r.material.opacity = 0.4;
    r.position.copy(this.player.position); r.position.y = PLANET_R + 0.1;
    r.userData.life = r.userData.maxLife = 0.3; r.userData.range = range;
    this._fx.pulses.push(r);
  },

  /* ── Damage flash (red vignette) ─────────────────────── */
  flashDamage() {
    const el = document.getElementById('damage-flash');
    if (!el) return;
    el.style.opacity = '1';
    clearTimeout(this._flashTimeout);
    this._flashTimeout = setTimeout(() => { el.style.opacity = '0'; }, 100);
  },

  /* ── Shield blocked projectile effect ──────────────── */
  spawnBlockedEffect(pos) {
    // Brief white flash ring at impact point
    for (let i = 0; i < 6; i++) {
      const p = this._pools.particle.acquire();
      p.material.color.setHex(0xffffff); p.material.opacity = 1;
      p.scale.setScalar(0.8);
      p.position.copy(pos);
      const a = (i / 6) * Math.PI * 2, sp = 3 + Math.random() * 2;
      p.userData.vx = Math.cos(a) * sp;
      p.userData.vy = 0.5 + Math.random() * 1;
      p.userData.vz = Math.sin(a) * sp;
      p.userData.gravity = false;
      p.userData.life = p.userData.maxLife = 0.3 + Math.random() * 0.2;
      this._fx.particles.push(p);
    }
  },

/* ── Chain lightning arc ─────────────────────────────────────── */
  spawnChainLightning(from, to) {
    const line = this._pools.chainLightning.acquire();
    const positions = line.geometry.attributes.position;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    line.userData.life = LIGHTNING.life;
    line.userData.maxLife = LIGHTNING.life;
    line.material.opacity = 1;
    line.visible = true;
    this._fx.chainLightnings.push(line);
  },

  /* ── Scene reset between runs ────────────────────────────────── */
  clearEntities(state) {
    for (const e of state.enemies) this.despawnEnemyView(e.view);
    for (const g of state.gems) this.despawnGemView(g.view);
    for (const pr of state.projectiles) this.despawnProjectileView(pr.view);
    for (const p of state.spitterProjectiles) this.despawnSpitterProjView(p.view);
    state.spitterProjectiles.length = 0;
    for (const p of this._fx.particles) this._pools.particle.release(p);
    for (const d of this._fx.damage) this._pools.damage.release(d);
    for (const pu of this._fx.pulses) this._pools.pulse.release(pu);
    for (const st of this._fx.stars) this._pools.star.release(st);
    for (const sh of this._fx.shards) this._pools.shard.release(sh);
    for (const ml of this._fx.magnetLines) this._pools.magnetLine.release(ml);
    for (const cl of this._fx.chainLightnings) this._pools.chainLightning.release(cl);
    this._fx.particles.length = 0; this._fx.damage.length = 0;
    this._fx.pulses.length = 0; this._fx.stars.length = 0; this._fx.shards.length = 0;
    this._fx.magnetLines.length = 0; this._fx.chainLightnings.length = 0;
  },

  /* ── Camera angle (0 = low/cinematic, 1 = top-down) ──── */
  _applyCamera() {
    const elev = CAMERA.minElev + this._camPitch * (CAMERA.maxElev - CAMERA.minElev);
    const r = THREE.MathUtils.degToRad(elev);
    // Keep a small z-offset even at 90° so lookAt never degenerates to vertical.
    this._camBase.set(0, PLANET_R + CAMERA.dist * Math.sin(r), Math.max(CAMERA.dist * Math.cos(r), 0.6));
  },
  setCameraPitch(t) {
    this._camPitch = THREE.MathUtils.clamp(t, 0, 1);
    this._applyCamera();
    localStorage.setItem('survivor-campitch', this._camPitch.toString());
  },
  getCameraPitch() { return this._camPitch; },
  setBossEnrage(t) { this._bossEnrage = t; },

  /* ── Per-frame render: mirror state onto the scene ───── */
  render(state, dt) {
    this.planet.quaternion.copy(state.planetQuat);

    if (this.player) {
      this.player.position.set(0, PLANET_R + Math.sin(state.time * PLAYER.bobSpeed) * PLAYER.bobAmount, 0);
      this.player.rotation.y = THREE.MathUtils.lerp(this.player.rotation.y, state.playerFace, 0.15);
      // squish on damage
      if (state.shake > 0.05) {
        const sq = 1 + state.shake * 0.3;
        this.player.scale.set(sq, 1 / sq, sq);
      } else {
        this.player.scale.lerp(_ONE, 5 * dt);
      }

      // Invincibility flash — cycle emissive color when invincible
      if (state.invincible) {
        const flash = Math.sin(state.time * 30) > 0;
        this.player.traverse(child => {
          if (child.isMesh && child.material && child.material.emissive) {
            child.material.emissive.setHex(flash ? 0x80d8ff : 0x000000);
            child.material.emissiveIntensity = flash ? 0.6 : 0.2;
          }
        });
      } else {
        this.player.traverse(child => {
          if (child.isMesh && child.material && child.material.emissive) {
            child.material.emissive.setHex(0x000000);
            child.material.emissiveIntensity = 0;
          }
        });
      }

      // Pickup range ring — always at the north pole (player position), radius = pickupRange
      if (this._pickupRing) {
        // Angular radius of pickup range on the sphere
        const ringAng = state.pickupRange / PLANET_R;
        // Ring lies in a plane perpendicular to the player's up (north pole)
        // Its center is ringAng away from the pole along the Z axis, so it forms a circle around the player
        const ringRadius = Math.sin(ringAng) * PLANET_R;  // world-space radius of the ring
        this._pickupRing.scale.setScalar(ringRadius);
        // Position at planet-local (0, PLANET_R, 0) = player at north pole
        // The torus is already in the XZ plane (rotated 90° on X), so scaling X gives the ring radius
        this._pickupRing.position.set(0, 0, 0); // planet-local; planet quaternion handles world pos
        // Tilt the ring slightly so it hugs the curved surface
        this._pickupRing.rotation.x = Math.PI / 2 + ringAng * 0.3;
        this._pickupRing.material.opacity = 0.18 + Math.sin(state.time * 2) * 0.07;
      }
    }

    this._syncEnemies(state, dt);
    this._syncGems(state);
    this._syncProjectiles(state);
    this._syncStars(state);
    this._syncShards(state);
    this._updateEffects(dt);
    this._updateAmbient(dt);

    // Camera: above the pole at the chosen angle + shake (engine decays it).
    this.camera.position.copy(this._camBase);
    if (state.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * state.shake;
      this.camera.position.y += (Math.random() - 0.5) * state.shake * 0.5;
      this.camera.position.z += (Math.random() - 0.5) * state.shake;
      state.shake *= 0.88;
      if (state.shake < 0.01) state.shake = 0;
    }
    this.camera.lookAt(this._camLook);

    this.renderer.render(this.scene, this.camera);
  },

  _syncEnemies(state, dt) {
    const camQ = this.camera.quaternion;
    const tgt = state.targetLocal;
    for (const e of state.enemies) {
      const v = e.view, ud = v.userData;
      v.position.copy(e.localDir).multiplyScalar(PLANET_R);

      if (e.dying) {
        v.scale.setScalar(Math.max(0, e.deathTimer / 0.3));
        v.quaternion.setFromUnitVectors(UP, e.localDir);
        ud.hpFill.visible = false;
        continue;
      }

      // Face the player along the surface — a stable great-circle tangent, so
      // the head never flips when the contact push-back reverses movement.
      _face.copy(tgt).addScaledVector(e.localDir, -e.localDir.dot(tgt));
      if (_face.lengthSq() > 1e-6) orientOnSphere(v, e.localDir, _face);
      else v.quaternion.setFromUnitVectors(UP, e.localDir);

      v.position.addScaledVector(e.localDir, Math.sin(e.bobTime) * 0.06);

      // squish recovery
      const baseScale = e.boss ? BOSS.scale : 1;
      if (e.hitTimer > 0) {
        const sq = 1 + e.hitTimer * 2;
        v.scale.set(baseScale * sq, baseScale / (sq * 0.5 + 0.5), baseScale * sq);
      } else v.scale.setScalar(baseScale);

      // hit flash (timer-driven — pause-safe, no setTimeout)
      const flash = e.hitFlash > 0;
      for (const t of ud.tint) t.mesh.material.color.setHex(flash ? 0xffffff : t.base);

      // HP bar — a single fill, only while damaged, billboarded to the camera.
      // Shrinks centered (scale only), so there is no offset to drift off-axis.
      const pct = Math.max(0, e.hp / e.maxHp);
      const showBar = pct > 0 && pct < 0.999;
      ud.hpFill.visible = showBar;
      if (showBar) {
        ud.hpFill.scale.x = pct;
        _q.copy(this.planet.quaternion).multiply(v.quaternion).invert().multiply(camQ);
        ud.hpFill.quaternion.copy(_q);
        ud.hpFill.material.color.setHex(pct < 0.3 ? 0xff4444 : pct < 0.6 ? 0xffab40 : 0xff6b9d);
      }

      // Elite ring: pulsing orange glow at the base, visible whenever HP bar shows
      if (ud.isElite) {
        ud.eliteRing.material.opacity = showBar ? (0.5 + Math.sin(state.time * 4) * 0.25) : 0;
        // Elite HP numbers — small text above the HP bar, visible while damaged
        if (showBar) {
          if (!ud.hpSprite.visible) { ud.hpSprite.visible = true; }
          const { hpCtx: ctx, hpTex: tex, hpCanvas: canvas } = ud;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.font = 'bold 20px Nunito, sans-serif';
          ctx.fillStyle = '#ff8800';
          ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
          ctx.textAlign = 'center';
          const txt = `${Math.ceil(e.hp)}`;
          ctx.strokeText(txt, 48, 24); ctx.fillText(txt, 48, 24);
          tex.needsUpdate = true;
          ud.hpSprite.quaternion.copy(_q);
        } else {
          ud.hpSprite.visible = false;
        }
      } else {
        ud.eliteRing.material.opacity = 0;
        if (ud.hpSprite) ud.hpSprite.visible = false;
      }

      // Elite ring: pulsing orange glow at the base, visible whenever elite flag is set
      if (e.elite) {
        const baseScale = ELITE.scale;
        ud.eliteRing.scale.setScalar(baseScale * (1 + Math.sin(state.time * 4) * 0.1));
        ud.eliteRing.material.opacity = 0.5 + Math.sin(state.time * 4) * 0.25;
      } else {
        ud.eliteRing.material.opacity = 0;
      }

      // Boss HP numbers — sprite above the HP bar, always visible for bosses
      if (e.boss) {
        if (!ud.bossHpLabel) {
          const lbl = makeBossHpLabel();
          lbl.position.set(0, 2.5, 0);
          v.add(lbl);
          ud.bossHpLabel = lbl;
        }
        drawBossHp(ud.bossHpLabel, e.hp, e.maxHp);
        _q.copy(this.planet.quaternion).multiply(v.quaternion).invert().multiply(camQ);
        ud.bossHpLabel.quaternion.copy(_q);

        // Boss enrage glow: body emissive intensity increases with enrage time
        const enrageLevel = Math.min(1, this._bossEnrage / 60); // max glow at 60s
        if (enrageLevel > 0) {
          ud.body.material.emissive.setHex(0xff0000);
          ud.body.material.emissiveIntensity = enrageLevel * 0.8;
        } else {
          ud.body.material.emissiveIntensity = 0;
        }
      } else if (ud.bossHpLabel) {
        ud.bossHpLabel.visible = false;
        ud.body.material.emissiveIntensity = 0; // reset in case pooled from a boss
      }
    }

    // Release any unused boss HP sprites from the pool
    // (handled by despawnEnemyView)
  },

  _syncGems(state) {
    // Release all magnet lines from previous frame
    for (const ml of this._fx.magnetLines) this._pools.magnetLine.release(ml);
    this._fx.magnetLines.length = 0;

    const playerWorld = _face.set(0, PLANET_R, 0); // player is always at the pole
    for (const g of state.gems) {
      const v = g.view;
      v.position.copy(g.localDir).multiplyScalar(PLANET_R);
      v.quaternion.setFromUnitVectors(UP, g.localDir);
      const ud = v.userData;
      ud.crystal.position.y = 0.5 + Math.sin(g.bobTime) * 0.15;
      ud.crystal.rotation.y += 0.05; ud.crystal.rotation.x += 0.025;
      ud.ring.material.opacity = 0.15 + Math.sin(g.bobTime * 2) * 0.1;
      ud.ring.scale.setScalar(1 + Math.sin(g.bobTime * 2) * 0.15);

      // Magnet line for attracted gems
      if (g.attracted && this._fx.magnetLines.length < MAGNET_LINE.poolSize) {
        const gemWorld = g.localDir.clone().multiplyScalar(PLANET_R).applyQuaternion(state.planetQuat);
        const line = this._pools.magnetLine.acquire();
        const positions = line.geometry.attributes.position;
        positions.setXYZ(0, gemWorld.x, gemWorld.y, gemWorld.z);
        positions.setXYZ(1, playerWorld.x, playerWorld.y, playerWorld.z);
        positions.needsUpdate = true;
        this._fx.magnetLines.push(line);
      }
    }
  },

  _syncProjectiles(state) {
    for (const pr of state.projectiles) {
      const v = pr.view;
      v.position.copy(pr.localDir).multiplyScalar(PLANET_R + 0.6);
      v.quaternion.setFromUnitVectors(UP, pr.localDir);
      v.rotation.z += 0.2;
    }
    for (const p of state.spitterProjectiles) {
      const v = p.view;
      v.position.copy(p.localDir).multiplyScalar(PLANET_R + 0.6);
      v.quaternion.setFromUnitVectors(UP, p.localDir);
      v.rotation.z += 0.15;
    }
  },

  _syncStars(state) {
    const want = state.orbitStars.length;
    const have = this._fx.stars;
    while (have.length < want) have.push(this._pools.star.acquire());
    while (have.length > want) this._pools.star.release(have.pop());
    for (let i = 0; i < want; i++) {
      have[i].position.copy(state.orbitStars[i]);
      have[i].rotation.y += 0.2; have[i].rotation.x += 0.12;
    }
  },

  _syncShards(state) {
    const want = state.shieldStars.length;
    const have = this._fx.shards;
    while (have.length < want) have.push(this._pools.shard.acquire());
    while (have.length > want) this._pools.shard.release(have.pop());
    for (let i = 0; i < want; i++) {
      have[i].position.copy(state.shieldStars[i]);
      have[i].rotation.y += 0.15;
    }
  },

  _updateEffects(dt) {
    const fx = this._fx;
    for (let i = fx.particles.length - 1; i >= 0; i--) {
      const p = fx.particles[i]; p.userData.life -= dt;
      if (p.userData.life <= 0) { this._pools.particle.release(p); fx.particles.splice(i, 1); continue; }
      if (p.userData.gravity) {
        p.position.x += p.userData.vx * dt;
        p.position.y += p.userData.vy * dt;
        p.position.z += p.userData.vz * dt;
        p.userData.vy -= 9 * dt;
      } else p.position.y += p.userData.vy * dt;
      p.material.opacity = p.userData.life / p.userData.maxLife;
    }
    for (let i = fx.damage.length - 1; i >= 0; i--) {
      const d = fx.damage[i]; d.userData.life -= dt;
      if (d.userData.life <= 0) { this._pools.damage.release(d); fx.damage.splice(i, 1); continue; }
      d.position.y += d.userData.vy * dt;
      d.material.opacity = d.userData.life / d.userData.maxLife;
    }
    for (let i = fx.pulses.length - 1; i >= 0; i--) {
      const pu = fx.pulses[i]; pu.userData.life -= dt;
      if (pu.userData.life <= 0) { this._pools.pulse.release(pu); fx.pulses.splice(i, 1); continue; }
      const t = pu.userData.life / pu.userData.maxLife;
      pu.material.opacity = t * 0.4;
      pu.scale.setScalar(pu.userData.range * (1 + (1 - t) * 0.5));
    }
    for (let i = fx.chainLightnings.length - 1; i >= 0; i--) {
      const cl = fx.chainLightnings[i]; cl.userData.life -= dt;
      if (cl.userData.life <= 0) { cl.visible = false; this._pools.chainLightning.release(cl); fx.chainLightnings.splice(i, 1); continue; }
      cl.material.opacity = (cl.userData.life / cl.userData.maxLife) * 0.9;
    }
  },

  _initAmbient() {
    const colors = [0xffb3d9, 0xffe082, 0xb39ddb, 0x80deea, 0xffffff];
    for (let i = 0; i < 60; i++) {
      const isStar = i % 3 === 0;
      const geo = isStar
        ? new THREE.IcosahedronGeometry(0.05 + Math.random() * 0.03, 0)
        : new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 6, 6);
      const p = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: colors[i % colors.length], transparent: true, opacity: 0.3 + Math.random() * 0.4 }));
      p.position.set((Math.random() - 0.5) * 70, PLANET_R - 3 + Math.random() * 16, (Math.random() - 0.5) * 70);
      p.userData = { baseY: p.position.y, phase: Math.random() * Math.PI * 2,
        speed: 0.2 + Math.random() * 0.6, drift: (Math.random() - 0.5) * 0.4,
        spin: (Math.random() - 0.5) * 2, isStar };
      this.scene.add(p);
      this._ambient.push(p);
    }
  },
  _updateAmbient(dt) {
    for (const ap of this._ambient) {
      const u = ap.userData;
      u.phase += dt * u.speed;
      ap.position.y = u.baseY + Math.sin(u.phase) * 0.7;
      ap.position.x += u.drift * dt;
      if (Math.abs(ap.position.x) > 40) u.drift *= -1;
      if (u.isStar) {
        ap.rotation.y += u.spin * dt; ap.rotation.x += u.spin * 0.7 * dt;
        ap.material.opacity = 0.3 + Math.sin(u.phase * 3) * 0.35;
      }
    }
  },
};

const _ONE = new THREE.Vector3(1, 1, 1);

/* ═══════════════════════════════════════════════════════════════
   MESH FACTORIES (procedural — no external assets)
   ═══════════════════════════════════════════════════════════════ */
// Pickle Rick! A bumpy green pickle with big eyes, worried brows and spiky hair.
function makePickle() {
  const g = new THREE.Group();
  const SKIN = 0x6ba23a, BUMP = 0x4e7a2e, HAIR = 0xc6d2d8, DARK = 0x2c3a1c;

  // Body — a vertical capsule (base at y≈0, top ≈1.85)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.0, 8, 16),
    new THREE.MeshLambertMaterial({ color: SKIN }));
  body.position.y = 0.92; body.castShadow = true; g.add(body);

  // Cucumber bumps (kept off the face, which is the front +Z)
  const bumpMat = new THREE.MeshLambertMaterial({ color: BUMP });
  for (let i = 0; i < 22; i++) {
    const ang = Math.random() * Math.PI * 2;
    const yy = 0.4 + Math.random() * 1.05;
    if (Math.sin(ang) > 0.55 && yy > 1.0) continue; // leave the face clear
    const bump = new THREE.Mesh(new THREE.SphereGeometry(0.045 + Math.random() * 0.04, 6, 6), bumpMat);
    bump.position.set(Math.cos(ang) * 0.4, yy, Math.sin(ang) * 0.4);
    g.add(bump);
  }

  // Eyes (big, on the front)
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const pupilMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  for (const side of [-1, 1]) {
    const ew = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), whiteMat);
    ew.position.set(side * 0.17, 1.34, 0.3); g.add(ew);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), pupilMat);
    e.position.set(side * 0.17, 1.32, 0.44); g.add(e);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(side * 0.17 + 0.05, 1.37, 0.47); g.add(shine);
    // worried Rick brow
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.04),
      new THREE.MeshLambertMaterial({ color: DARK }));
    brow.position.set(side * 0.17, 1.52, 0.36); brow.rotation.z = side * 0.32; g.add(brow);
  }

  // Mouth (small grimace line)
  const mouth = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(
      new THREE.EllipseCurve(0, 0, 0.13, 0.06, Math.PI, 2 * Math.PI, false, 0).getPoints(14)),
    new THREE.LineBasicMaterial({ color: DARK }));
  mouth.position.set(0, 1.12, 0.42); g.add(mouth);

  // Spiky gray hair (Rick's do)
  const hairMat = new THREE.MeshLambertMaterial({ color: HAIR });
  const spikes = [[0, 1.92, 0, 0, 0], [0.14, 1.86, 0.04, 0.5, -0.2], [-0.14, 1.86, 0.02, -0.5, -0.1],
    [0.06, 1.88, -0.14, 0.2, 0.5], [-0.08, 1.88, 0.13, -0.2, -0.5], [0, 1.85, 0.16, 0, -0.6]];
  for (const [hx, hy, hz, rz, rx] of spikes) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 6), hairMat);
    spike.position.set(hx, hy, hz); spike.rotation.z = rz; spike.rotation.x = rx;
    spike.castShadow = true; g.add(spike);
  }

  // Ground shadow blob
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; g.add(shadow);
  return g;
}

function makeEnemy() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12),
    new THREE.MeshLambertMaterial({ color: 0xffffff }));
  body.position.y = 0.4; body.scale.set(1, 0.85, 1); body.castShadow = true; g.add(body);

  const pupilMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (const side of [-1, 1]) {
    const ew = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), whiteMat);
    ew.position.set(side * 0.15, 0.5, 0.35); g.add(ew);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), pupilMat);
    e.position.set(side * 0.15, 0.5, 0.4); g.add(e);
  }
  const smile = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(
      new THREE.EllipseCurve(0, 0, 0.08, 0.04, 0, Math.PI, false, 0).getPoints(10)),
    new THREE.LineBasicMaterial({ color: 0x222222 }));
  smile.position.set(0, 0.38, 0.42); g.add(smile);

  const blush = [];
  for (const side of [-1, 1]) {
    const bl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
    bl.position.set(side * 0.3, 0.4, 0.3); bl.scale.set(1, 0.6, 0.5); g.add(bl); blush.push(bl);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; g.add(shadow);

  // A single fill bar (no background track) — shrinks centered, billboarded.
  const hpFill = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.07),
    new THREE.MeshBasicMaterial({ color: 0xff6b9d }));
  hpFill.position.set(0, 1.0, 0); g.add(hpFill);

  // Elite ring: thin glowing ring at the base, hidden by default
  const eliteRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.04, 6, 24),
    new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0 })
  );
  eliteRing.rotation.x = -Math.PI / 2;
  eliteRing.position.y = 0.03;
  g.add(eliteRing);

  // HP number text sprite for elites (and bosses via bossHpLabel path)
  const hpCanvas = document.createElement('canvas');
  hpCanvas.width = 96; hpCanvas.height = 32;
  const hpCtx = hpCanvas.getContext('2d');
  const hpTex = new THREE.CanvasTexture(hpCanvas);
  const hpSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTex, transparent: true, depthTest: false }));
  hpSprite.scale.set(1.2, 0.4, 1);
  hpSprite.position.set(0, 1.4, 0);
  hpSprite.visible = false;
  g.add(hpSprite);

  g.userData = { body, smile, blush, hpFill, tint: [], eliteRing, hpSprite, hpCtx, hpTex, hpCanvas };
  return g;
}

function applyEnemyTemplate(v, tmpl, isElite = false) {
  const ud = v.userData;
  ud.body.material.color.setHex(tmpl.color);
  ud.smile.material.color.setHex(tmpl.eye);
  for (const b of ud.blush) b.material.color.setHex(tmpl.blush);
  // tint targets restore to these base colors when not flashing
  ud.tint = [
    { mesh: ud.body, base: tmpl.color },
    { mesh: ud.blush[0], base: tmpl.blush },
    { mesh: ud.blush[1], base: tmpl.blush },
  ];
  // isElite flag (from spawnElite) takes precedence over template-based detection
  ud.isElite = isElite;
  ud.eliteRing.material.opacity = 0; // always reset; shown in _syncEnemies when appropriate
  ud.hpSprite.visible = false;
  if (isElite) {
    ud.eliteRing.material.color.setHex(0xff8800);
  }
}

function makeGem() {
  const g = new THREE.Group();
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0),
    new THREE.MeshLambertMaterial({ color: 0x64ffda, emissive: 0x64ffda, emissiveIntensity: 0.3 }));
  crystal.position.y = 0.5; crystal.castShadow = true; g.add(crystal);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.35, 16),
    new THREE.MeshBasicMaterial({ color: 0x64ffda, transparent: true, opacity: 0.2, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  g.userData = { crystal, ring };
  return g;
}

function makeHeartProj() {
  const g = new THREE.Group();
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10),
    new THREE.MeshLambertMaterial({ color: 0xff6b9d, emissive: 0xff4081, emissiveIntensity: 0.4 }));
  heart.scale.set(1.1, 1, 0.8); g.add(heart);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff80ab, transparent: true, opacity: 0.3 }));
  g.add(glow);
  return g;
}

function makeOrbitStar() {
  const g = new THREE.Group();
  const star = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0),
    new THREE.MeshLambertMaterial({ color: 0xffe082, emissive: 0xffd54f, emissiveIntensity: 0.5 }));
  g.add(star);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff176, transparent: true, opacity: 0.25 }));
  g.add(glow);
  return g;
}

function makeShieldShard() {
  // Elongated green shard — pickle-coloured
  const g = new THREE.Group();
  const shard = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.5, 0.1),
    new THREE.MeshLambertMaterial({ color: 0x4caf50, emissive: 0x2e7d32, emissiveIntensity: 0.3 })
  );
  g.add(shard);
  // Outline tip
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.25, 4),
    new THREE.MeshLambertMaterial({ color: 0x66bb6a })
  );
  tip.position.y = 0.35;
  g.add(tip);
  return g;
}

function makeMagnetLine() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  return new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: MAGNET_LINE.color, transparent: true, opacity: MAGNET_LINE.opacity,
  }));
}

function makeParticle() {
  return new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 }));
}

function makePulseRing() {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.05, 1, 32),
    new THREE.MeshBasicMaterial({ color: 0xff6b9d, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  r.rotation.x = -Math.PI / 2;
  return r;
}

function makeBossLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 36px Nunito, sans-serif';
  ctx.fillStyle = '#ffd54f'; ctx.strokeStyle = '#4a2040'; ctx.lineWidth = 4;
  ctx.textAlign = 'center';
  ctx.strokeText('BOSS', 64, 36); ctx.fillText('BOSS', 64, 36);
  const tex = new THREE.CanvasTexture(canvas);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(1.8, 0.7, 1);
  s.position.set(0, 1.6, 0);
  s.userData = { canvas, ctx, tex };
  return s;
}

function makeBossHpLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 40;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(2.0, 0.5, 1);
  s.userData = { canvas, ctx, tex };
  return s;
}

function drawBossHp(sprite, hp, maxHp) {
  const { canvas, ctx, tex } = sprite.userData;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 28px Nunito, sans-serif';
  const pct = Math.max(0, hp / maxHp);
  const r = Math.floor(255 * (1 - pct) * 2);
  const g = Math.floor(255 * pct * 2);
  ctx.fillStyle = `rgb(${Math.min(255, r)},${Math.min(255, g)},50)`;
  ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
  ctx.textAlign = 'center';
  const text = `${Math.ceil(hp)} / ${Math.ceil(maxHp)}`;
  ctx.strokeText(text, 80, 28); ctx.fillText(text, 80, 28);
  tex.needsUpdate = true;
}

function makeDamageSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const tex = new THREE.CanvasTexture(canvas);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(1.4, 0.7, 1);
  s.userData = { canvas, ctx: canvas.getContext('2d'), tex };
  return s;
}
function drawDamage(sprite, value, colorHex = 0xffd54f) {
  const { canvas, ctx, tex } = sprite.userData;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 48px Nunito, sans-serif';
  ctx.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
  ctx.strokeStyle = '#4a2040'; ctx.lineWidth = 4;
  ctx.textAlign = 'center';
  ctx.strokeText(value, 64, 48); ctx.fillText(value, 64, 48);
  tex.needsUpdate = true;
  sprite.material.opacity = 1;
}

function makeSpitterProj() {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0xf48fb1, emissive: 0xf06292, emissiveIntensity: 0.4 }));
  g.add(ball);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xf48fb1, transparent: true, opacity: 0.3 }));
  g.add(glow);
  return g;
}

function makeChainLightning() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  return new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: 0x80d8ff, transparent: true, opacity: 1,
  }));
}
