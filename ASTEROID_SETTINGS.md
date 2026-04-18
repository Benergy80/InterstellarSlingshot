# Local Asteroid Belt Settings

## Creation Parameters

### Count & Distribution
- **Asteroids per belt:** 75-112 (randomized)
- **Belts per galaxy:** 1-2 (random)
- **Belt radius:** 1600-2600 units from black hole
- **Belt width:** 400-1200 units (thickness)
- **Belt height variation:** ±200 units

### Local Galaxy (Galaxy 7) Offset
- **Y-axis offset:** ±600-1000 units above/below solar plane
- Purpose: Keep asteroid belts away from starting planets

### Distance Thresholds
- **Creation distance:** 80,000 units (only create if player nearby)
- **Cleanup distance:** 80,000 units (remove if player farther)

## Update Rates

### Per-Frame Updates
- **Orbit speed:** 0.0005-0.0015 per frame (~60fps = 0.03-0.09/sec)
- **Rotation speed:** ±0.015 per frame (asteroid spin)
- **Belt group rotation:** Stored in userData.rotationSpeed

### Visibility
- **Frustum culling:** DISABLED (both belt group and individual asteroids)
- **Belt group visible:** Always true
- **Individual asteroids:** Always rendered

## Performance Settings
- **Shared geometries:** 3 base shapes (reused across all asteroids)
- **Shared materials:** Multiple emissive materials (self-lit)
- **Scale:** 3-9 units (randomized per asteroid)

## Code Locations

**Creation:** `js/game-objects.js` lines 9471-9605 (createAsteroidBelts)
**Loading:** `js/game-objects.js` lines 9616-9741 (loadAsteroidsForGalaxy)
**Cleanup:** `js/game-objects.js` lines 10055-10135 (cleanupDistantAsteroids)
**Update:** `js/game-core.js` lines 1430-1436 (rotation only)

## Potential Issues

1. **Load/Cleanup Timing:** Called during black hole warp with 500-1000ms delays
2. **No per-frame position updates:** Asteroids stay in belt-relative positions
3. **Low orbit speed:** Would take ~10,000 frames to complete one orbit
