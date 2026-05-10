# 🎯 Interstellar Slingshot - Mission Progression System

## Overview
The game features a structured 8-galaxy liberation campaign with clear phases and victory conditions.

---

## 🌌 Galaxy Structure

**8 Galaxies (Twin-Core System)**
1. **Spiral** → Federation (Human)
2. **Elliptical** → Klingon Empire (Klingon)
3. **Irregular** → Rebel Alliance (Mon Calamari)
4. **Ring** → Romulan Star Empire (Romulan)
5. **Dwarf** → Galactic Empire (Imperial)
6. **Lenticular** → Cardassian Union (Cardassian)
7. **Quasar** → Sith Empire (Sith)
8. **Ancient** → Vulcan High Command (Vulcan)

---

## 📋 Mission Progression (Per Galaxy)

### **Phase 1: Initial Combat**
- **Objective:** Clear all regular enemies in galaxy
- **Enemy Spawn:** Proximity-based clusters (max 3000 units apart)
- **Intel System:** Nebula tracking per faction
- **Mechanics:**
  - Enemies patrol nebulas and cosmic features
  - Distress beacons trigger when civilians attacked
  - Mission Command provides navigation hints

**Code Location:** `js/game-objects.js` (lines 613-876)
- `createEnemyClusters()` - Groups enemies by faction/proximity
- `assignFactionsToNebulas()` - Links nebulas to galaxy factions
- `updateClusterStatus()` - Tracks cluster defeats, updates intel lines

---

### **Phase 2: Boss Battle**
- **Trigger:** All regular enemies defeated in galaxy
- **Boss Spawn:** Area boss + support ships (spawns 5s after faction cleared)
- **Boss Types:** Unique flagship per faction (elite vessels)
- **Difficulty Scaling:** Boss health/damage increases with `gameState.galaxiesCleared`

**Code Location:** `js/game-objects.js` (lines 1029-1370)
- `checkAndSpawnAreaBosses()` - Spawns boss when area cleared
- `spawnBossForArea()` - Creates boss mesh + stats
- `spawnBossSupport()` - Spawns escort ships
- `checkBossVictory()` - Handles boss defeat, triggers Phase 3

**Victory Notification:**
```
"Boss Defeated! [Galaxy Name] Galaxy boss eliminated! Guardians remain..."
```

**Code Location:** `js/game-controls.js` (line 3970)
- `checkGalaxyClear()` - Monitors regular enemy + boss defeat

---

### **Phase 3: Guardian Hunt**
- **Trigger:** Boss defeated
- **Guardian Spawn:** Black hole guardians appear (elite enemies guarding galactic cores)
- **Count:** Varies by galaxy (typically 3-5 guardians)
- **Objective:** Eliminate all guardians to fully liberate galaxy

**Code Location:** `js/game-objects.js` (lines 8398-8672)
- `checkAndSpawnEliteGuardians()` - Spawns guardians at last kill positions
- `spawnEliteGuardian()` - Creates guardian mesh (2x boss size, unique models)
- `loadGuardiansForGalaxy()` - Manages guardian spawning per galaxy

**Victory Check:** `js/game-controls.js` (line 4045)
- `checkGuardianVictory()` - **NOW WIRED UP** (called after every enemy death)
- Increments `gameState.galaxiesCleared` when all guardians defeated

**Victory Notification:**
```
"Galaxy Liberation Complete - [Galaxy Name]"
"[Galaxy Name] Galaxy ([Faction]) completely liberated!"
"[X] hostile galaxies remain. Continue the mission!"
```

---

### **Phase 4: Campaign Victory**
- **Trigger:** `gameState.galaxiesCleared >= 8`
- **Victory Screen:** Shows mission statistics, galaxy count, player stats
- **Music:** Victory fanfare plays
- **Option:** Restart for new campaign

**Code Location:** `js/game-ui.js` (lines 2039-2107)
- `checkVictoryCondition()` - Called every UI update
- `showVictoryScreen()` - Creates victory overlay

---

## 🎮 Gameplay Systems

### **Navigation & Intel**
- **Nebula Intel Lines:** Dotted lines from galaxy black holes → tracking nebulas
- **Line Colors:**
  - **Faction Color (Dashed):** Active threats remain
  - **White (Solid):** Faction cleared (future feature)
- **Mission Command Alerts:** Provide narrative context + next objectives

**Code Location:** `js/game-objects.js` (lines 754-853)
- `showFactionClearedMission()` - Triggers after cluster defeat
- `createGalaxyToNebulaLine()` - Creates visual intel paths

---

### **Difficulty Scaling**
Difficulty increases with each galaxy liberated:
- **Enemy Count:** +1 per galaxy cleared (max 8)
- **Enemy Speed:** +5-10% per galaxy
- **Enemy Health:** +25% per galaxy (max 3 hits)
- **Detection Range:** +200-300 units per galaxy
- **Boss/Guardian Strength:** Scales exponentially

**Code Location:** `js/game-controls.js` (lines 453-558)
- `calculateDifficultySettings()` - Returns scaled enemy stats
- `getEnemyHealthForDifficulty()` - Calculates hit points
- `refreshEnemyDifficulty()` - Updates all enemies after galaxy clear

---

### **Controls & Mechanics**

#### **Jump (Double-Tap W)**
- **Function:** Short tactical boost (1 second)
- **Cost:** 25% energy
- **Behavior:** 
  1. 1-second warp boost at emergency warp speed
  2. Auto-brake engages after 1s
  3. Smoothly decelerates back to pre-jump speed
  4. Camera transitions smoothly (first-person → third-person)
  5. Returns full control when target speed reached
- **Visual:** Warp starfield, hyperspace effects, smooth deceleration
- **No Notification:** Silent tactical maneuver

**Code Location:** `js/game-physics.js` (lines 1388-1610)
- Captures `preJumpVelocity` before boost (direction + magnitude)
- Auto-brake applies 2% speed reduction per frame after 1s
- Restores exact velocity when target speed reached
- Flags: 
  - `gameState.emergencyWarp.isJump = true`
  - `gameState.emergencyWarp.autoBraking = true` (during deceleration)

#### **Emergency Warp (O Key)**
- **Function:** Full emergency warp (10+ seconds)
- **Cost:** 1 warp charge (limited supply)
- **Behavior:** Coast on momentum after warp
- **Notification:** "Emergency Warp Complete - use X to brake"

---

## 🔧 Future Development

### **Mission Command Improvements** (REMAINING_WORK.md)
1. Turn completed intel lines from faction color → white
2. Add universe-wide enemy count per faction
3. Create dynamic clue system (dotted lines to next nebula)
4. Remove/fix dotted lines that don't lead to enemies
5. Add victory celebration effects (fireworks, music crescendo)

### **Lore Integration**
- Each faction has unique lore (stored in `FACTION_LORE` - `game-physics.js`)
- Nebula discoveries trigger story moments
- Boss battles can trigger faction-specific dialogue
- Guardian defeats reveal galactic history

---

## 📊 Key Variables

**Game State:**
```javascript
gameState.galaxiesCleared = 0; // Increments when guardians defeated (0-8)
gameState.currentGalaxyEnemies = {}; // Tracks enemy counts per galaxy
gameState.emergencyWarp.isJump = false; // True during Jump (not emergency warp)
```

**Boss System:**
```javascript
bossSystem.galaxyBossDefeated = {}; // Per-galaxy boss defeat tracking
bossSystem.galaxyGuardiansDefeated = {}; // Per-galaxy guardian defeat tracking
bossSystem.eliteGuardians = {}; // Universe-wide elite guardians (faction-based)
```

**Intel System:**
```javascript
nebulaIntelSystem.nebulaFactions = {}; // Maps nebulas → galaxy factions
nebulaIntelSystem.enemyClusters = []; // Tracks clusters with defeat status
nebulaIntelSystem.galaxyLines = []; // Visual intel lines (galaxy → nebula)
```

---

## 🧪 Testing Checklist

- [ ] Jump returns to original speed (not coast)
- [ ] Jump duration is 1 second (not 2)
- [ ] Jump doesn't show achievement notification
- [ ] Boss defeat triggers guardian spawn
- [ ] Guardian defeat increments `galaxiesCleared`
- [ ] Guardian defeat shows "Galaxy Liberation Complete" message
- [ ] 8th galaxy liberation triggers victory screen
- [ ] Victory screen shows correct statistics
- [ ] Difficulty scaling increases with each galaxy
- [ ] Intel lines appear after faction cleared

---

## 🗂️ Code Map

**Core Files:**
- `js/game-objects.js` - Enemy spawning, bosses, guardians, intel system
- `js/game-controls.js` - Combat, victory checks, progression triggers
- `js/game-physics.js` - Movement, Jump, emergency warp
- `js/game-ui.js` - UI updates, victory screen, mission alerts

**Key Functions:**
1. `createEnemyClusters()` → Groups enemies by faction
2. `checkGalaxyClear()` → Detects boss defeat
3. `checkGuardianVictory()` → **[FIXED]** Detects galaxy liberation
4. `checkVictoryCondition()` → Triggers campaign victory

---

Last Updated: 2026-02-15
