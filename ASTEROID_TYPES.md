# Complete Asteroid Type Breakdown

## 1. Belt Asteroids (Galaxy/Local)
**Type:** `'asteroid'`  
**Location:** `js/game-objects.js` (lines 9471-9741)

### Spawning
- **Where:** Around galaxy black holes (8 galaxies, including local)
- **When:** 
  - Initial game load: `createAsteroidBelts()` - creates for nearby galaxies (<80k units)
  - Dynamic loading: `loadAsteroidsForGalaxy()` - loads when warping to new galaxy
- **Trigger:** Player proximity to galaxy center

### Configuration
- **Count:** 75-112 asteroids per belt
- **Belts per galaxy:** 1-2 (random)
- **Distance from black hole:** 1600-2600 units (belt radius)
- **Belt thickness:** 400-1200 units (belt width)
- **Height variation:** ±200 units

### Special: Local Galaxy (Galaxy 7)
- **Y-axis offset:** ±600-1000 units above/below solar plane
- **Purpose:** Keep away from starting planets

### Properties
```javascript
userData: {
    type: 'asteroid',
    health: 2,
    maxHealth: 2,
    orbitSpeed: 0.0005-0.0015,      // STORED but NOT USED!
    rotationSpeed: ±0.015,          // STORED but NOT USED!
    beltCenter: Vector3,
    orbitRadius: number,
    orbitPhase: angle,
    galaxyId: 0-7,
    isTargetable: true,
    isDestructible: true,
    beltGroup: Group reference
}
```

### Behavior
- **Position:** Static in belt group (no orbital movement)
- **Rotation:** NONE (individual asteroids don't rotate)
- **Belt rotation:** Group rotates via `belt.rotation.y += userData.rotationSpeed` (game-core.js:1432)
- **Shared resources:** Yes (3 geometries, multiple materials)
- **Size:** Scale 3-9 units
- **Frustum culling:** DISABLED

### Update Rate
- **Per-frame:** Belt group rotation only
- **Individual movement:** NONE
- **Added to:** `planets` array, child of `beltGroup`

---

## 2. Interstellar Asteroids (Roaming)
**Type:** `'interstellar_asteroid'`  
**Location:** `js/interstellar-asteroids.js`

### Spawning
- **Where:** Empty space between galaxies
- **When:** `createInterstellarAsteroidFields()` - called at game init
- **Count:** 8 fields × 15 asteroids = 120 total
- **Field spread:** 3000 units radius per field

### Configuration
- **Base size:** 50-100 units (10x larger than belt asteroids!)
- **Velocity:** 0.05-0.3 units/frame (moves through space)
- **Health:** size / 10 (larger = more hits to destroy)
- **Minimum breakup size:** 10 units

### Properties
```javascript
userData: {
    type: 'interstellar_asteroid',
    name: string,
    size: 50-100,
    velocity: Vector3 (constant movement),
    fieldIndex: 0-7,
    health: ceil(size/10),
    rotationSpeed: Vector3(±0.01, ±0.01, ±0.01),
    generation: number (tracks splits)
}
```

### Behavior
- **Movement:** LINEAR - moves continuously via `position.add(velocity)` every frame
- **Rotation:** Continuous 3-axis rotation every frame
- **Breakup:** Splits into 3 smaller fragments when shot
- **Destruction:** Disappears when too small (<10 units) or health depleted
- **Update function:** `updateInterstellarAsteroids()` - called every frame (game-core.js:1437)

### Update Rate
- **Per-frame:** Position + rotation updated
- **Movement speed:** 0.05-0.3 units/frame (~3-18 units/sec at 60fps)
- **Added to:** `interstellarAsteroids` array (separate from planets)

### Collision Detection
- **Function:** `checkInterstellarAsteroidCollisions()` 
- **Throttled:** Every 5 frames (game-core.js:1443)
- **Checks:** Player ship vs asteroids

---

## 3. Outer System Asteroids
**Type:** `'outer_asteroid'`  
**Location:** `js/outer-systems.js` (lines 154, 520-545)

### Spawning
- **Where:** Outer interstellar systems (distant, exotic locations)
- **When:** `createOuterInterstellarSystems()` - game init
- **Count:** 1-2 per outer system

### Configuration
- **Size:** 15-35 units
- **Orbit radius:** Around outer system center
- **Orbit speed:** 0.0007-0.0015

### Properties
```javascript
userData: {
    type: 'outer_asteroid',
    orbitCenter: Vector3,
    orbitRadius: number,
    orbitSpeed: 0.0007-0.0015,
    orbitAngle: radians,
    rotationSpeed: Vector3,
    health: 2,
    name: string
}
```

### Behavior
- **Movement:** ORBITAL - circles around outer system center
- **Rotation:** 3-axis rotation
- **Update function:** `updateOuterSystems()` - called every frame (game-core.js:1448)
- **Orbit calculation:** Updates orbitAngle, recalculates position
- **Added to:** Outer system group

### Update Rate
- **Per-frame:** Orbital position + rotation updated
- **Orbital period:** ~4200-9000 frames (~70-150 seconds at 60fps)

---

## Comparison Summary

| Type | Count | Size | Movement | Rotation | Health | Update Frequency |
|------|-------|------|----------|----------|--------|-----------------|
| **Belt** | 600-896 | 3-9 | NONE (belt group only) | NONE | 2 | Belt rotation only |
| **Interstellar** | 120 | 50-100 | Linear (0.05-0.3/frame) | 3-axis continuous | 5-10 | Every frame |
| **Outer** | ~15-30 | 15-35 | Orbital | 3-axis continuous | 2 | Every frame |

---

## The Problem You're Seeing

**Belt Asteroids (Local):**
- ❌ Individual asteroids don't move
- ❌ Individual asteroids don't rotate
- ✅ Belt group rotates slowly
- ⚠️ Only visual: asteroids stay in fixed positions relative to belt

**Result:** Asteroids "appear then reappear nearby" because the belt group is rotating around the black hole, making asteroids shift position slowly, but they're not smoothly orbiting—they're rigidly attached to the rotating group.

**Other asteroid types (Interstellar, Outer) work fine:**
- ✅ Move continuously
- ✅ Rotate continuously
- ✅ Update every frame

---

## Fix Options

1. **Add orbital movement to belt asteroids** - update position based on orbitSpeed
2. **Add rotation to belt asteroids** - apply rotationSpeed per frame
3. **Keep belt group rotation only** - current "lazy" approach (low CPU)

Which behavior do you want for local belt asteroids?
