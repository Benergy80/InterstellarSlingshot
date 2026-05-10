# Remaining Gameplay Improvements

## ✅ Completed
1. Double-tap W for energy-based short warp (uses 25% energy)
2. O key for emergency warp
3. CAPS LOCK for fast turning
4. Increased civilian traffic (15-25 ships/nebula, 8-15 miners)
5. Black hole mining expeditions (5-12 ships per black hole)
6. Enemy attacks on civilians (destroyed after 8 hits)
7. Distress call system (5000 unit detection range)
8. Civilians show on map when within 3000 units

## 🔨 TODO - Mission System

### Faction Tracking & Victory System
**Location:** Create new `js/mission-system.js`

**Features needed:**
1. Track all enemies by faction type
2. Monitor 4000-unit radius around player
3. Detect when all enemies of a faction cleared in area
4. Show congratulations message from Mission Command:
   - "Nebula X has been liberated from FACTION_NAME!"
   - "X FACTION_NAME enemies remain in the galaxy"
   - "Continue hunting - follow the white trail"

5. Create dotted line to nearby nebula with clues
6. Turn completed mission lines from nebula color → white
7. Remove/fix any dotted lines that don't lead to enemies

**Implementation sketch:**
```javascript
// Track active missions per galaxy
const activeMissions = new Map(); // galaxyId -> { faction, nebulaTarget, lineObject }

function checkFactionCleared() {
    const nearbyEnemies = enemies.filter(e => 
        camera.position.distanceTo(e.position) < 4000
    );
    
    // Group by faction
    const factionCounts = {};
    nearbyEnemies.forEach(e => {
        const faction = e.userData.faction;
        factionCounts[faction] = (factionCounts[faction] || 0) + 1;
    });
    
    // Check if any faction dropped to zero
    // ...trigger victory message
    // ...create new dotted line to nebula
    // ...turn old line white
}
```

## 🎨 TODO - Cosmic Feature Simplification

### 1. Plasma Storms - Remove Lightning
**File:** `js/cosmic-features.js`, line ~1250

**Action:** Comment out or remove lightning tendril creation:
```javascript
// In createPlasmaStorms(), remove this section:
// const tendrilGroup = new THREE.Group();
// for (let tendril = 0; tendril < 12; tendril++) {
//     ... tendril creation code ...
// }
// stormCloudGroup.add(tendrilGroup);
```

Keep only:
- Outer cloud spheres
- Energy core (glowing center sphere)
- Plasma light (flickering effect)

### 2. Solar Storms - Remove Cones/Spikes
**File:** `js/cosmic-features.js`, search for `createSolarStorms`

**Action:** Find and remove any:
- `ConeGeometry` creation
- Spike/ray geometry
- Keep only the main storm body and glow

### 3. Supernovas - Remove Spikes  
**File:** Could be in `js/exotic-systems.js` or `js/cosmic-features.js`

**Action:** Search for supernova creation, remove:
- Any spike/ray/cone geometry
- Keep simple sphere + expanding rings

## 🧪 Testing Checklist

### Warp System
- [ ] Double-tap W triggers 2-second boost
- [ ] Uses 25% energy (not warp charge)
- [ ] Shows energy remaining in notification
- [ ] O key still works for full emergency warp

### Civilian System
- [ ] Enemies attack nearby civilians
- [ ] Civilians destroyed after 8 hits
- [ ] Distress calls appear when under attack
- [ ] Player notified within 5000 units
- [ ] Civilians show on map (green/orange dots)

### Turning
- [ ] Default turning is slower
- [ ] CAPS LOCK enables fast turning
- [ ] Smooth transition between modes

## 📝 Notes

- Mission system is complex - may need 2-3 hours of focused work
- Consider creating dedicated `missionSystem` object to track state
- Dotted line color changes require finding line materials and updating them
- Victory messages should feel rewarding - consider adding sound/visual effects

## 🔗 Branch Status

Current branch: `feature/mission-system-improvements`
Previous branch: `feature/gameplay-improvements` (merged)

Push when mission system complete, then create PR for Ben to test.
