// Game Objects - Creation of planets, stars, enemies, and other space objects
// DOUBLED WORLD SIZE: All distances and masses doubled while keeping player/enemy size the same
// ENHANCED: Progressive difficulty system with dynamic enemy health and advanced combat mechanics
// UPDATED: Complete integration of progressive difficulty and enhanced enemy management
// FIXED: Boss spawning system and asteroid destruction
// FIXED: Background galaxy visibility and frustum culling issues
// FIXED: Mouse controls and navigation system compatibility

// 3D GALAXY SYSTEM TRANSFORMATION
// Transform flat 2D galaxy positioning to realistic 3D spherical distribution
// =============================================================================

// =============================================================================
// GLOBAL SCALE MULTIPLIERS - ADJUST THESE TO CHANGE SIZES
// =============================================================================

const SCALE_CONFIG = {
    // Objects that get scaled UP
    planets: 10,        // Planets 2.5x larger
    stars: 10,          // Stars 2.5x larger
    blackHoles: 10,     // Black holes 2x larger
    cosmicFeatures: 10, // Pulsars, supernovas, etc. 2x larger
    moons: 10,          // Moons 2x larger
    
    // Objects that stay SAME size
    asteroids: 1.0,      // Keep same
    enemies: 1.0,        // Keep same
    player: 0.5          // Keep same (player ship is just the camera)
};

// Helper function to get scaled size
function getScaledSize(baseSize, objectType) {
    const multiplier = SCALE_CONFIG[objectType] || 1.0;
    return baseSize * multiplier;
}

// =============================================================================
// SHARED PARTICLE SPRITE — the one texture that stops every nebula, dust lane
// and accretion cloud rasterizing as a hard axis-aligned SQUARE.
// =============================================================================
// A bare THREE.PointsMaterial has no map and no alphaMap, so its fragment stage
// never looks at gl_PointCoord: WebGL fills the entire gl_PointSize quad with a
// flat colour. At size 2.5 with 5,000 particles per cloud that reads as a field
// of grey blocks — the "nebula" beat looked like JPEG macroblocking, and the
// wide vista looked compressed, because it literally was a grid of squares.
//
// The fix is one 64px radial-falloff CanvasTexture, built once and shared by
// every point cloud in the game: RGB stays pure white so vertexColors and the
// material colour survive untouched, and the falloff lives entirely in ALPHA.
// Under AdditiveBlending (SRC_ALPHA, ONE) that makes each particle contribute
// colour * opacity * falloff — a soft round puff instead of a filled square —
// and under NormalBlending it is a normal soft sprite.
//
// Cost is nil: it is ONE extra texture bind on materials that already draw, and
// every cloud that shares this texture shares the same GPU object, so the bind
// is usually already hot. No new draw calls, no new geometry.
let _POINT_SPRITE_TEX = null;
function getPointSprite() {
    if (_POINT_SPRITE_TEX) return _POINT_SPRITE_TEX;
    if (typeof THREE === 'undefined' || typeof document === 'undefined') return null;
    const S = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(S, S);
    const d = img.data;
    const c = (S - 1) / 2;
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const dx = (x - c) / c, dy = (y - c) / c;
            const r = Math.sqrt(dx * dx + dy * dy);      // 0 centre, 1 at the inscribed circle
            // Broad soft puff: a squared window that reaches exactly zero at the
            // quad edge (so no square corner can ever survive), multiplied by a
            // gaussian core that keeps the particle's centre bright enough that
            // the cloud does not just turn into haze.
            let a = 0;
            if (r < 1) {
                const win = (1 - r) * (1 - r);
                a = win * (0.35 + 0.65 * Math.exp(-2.5 * r * r));
            }
            const i = (y * S + x) * 4;
            d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;   // white: never tints vertexColors
            d[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
        }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    // Clamp so the falloff can never wrap and re-introduce an edge, and skip
    // mipmaps: these quads are 1-8 px, LinearFilter on the base level is both
    // cheaper and sharper than a mip chain here.
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    _POINT_SPRITE_TEX = tex;
    return tex;
}
// Exposed so the other particle files (cosmic-features, proc-galaxies, flair…)
// can adopt the SAME texture object rather than each minting their own — one
// shared GPU texture, one bind.
if (typeof window !== 'undefined') window.getPointSprite = getPointSprite;

// Enhanced 3D Galaxy definitions with spherical coordinates
const galaxyTypes = [
    { name: 'Spiral', color: 0x4488ff, size: 1200, arms: 3, faction: 'Federation', species: 'Human', mass: 10000 },
    { name: 'Elliptical', color: 0xff8844, size: 1600, arms: 0, faction: 'Klingon Empire', species: 'Klingon', mass: 15000 },
    { name: 'Irregular', color: 0x88ff44, size: 800, arms: 2, faction: 'Rebel Alliance', species: 'Mon Calamari', mass: 8000 },
    { name: 'Ring', color: 0xff4488, size: 1000, arms: 1, faction: 'Romulan Star Empire', species: 'Romulan', mass: 9000 },
    { name: 'Dwarf', color: 0x44ffff, size: 600, arms: 2, faction: 'Galactic Empire', species: 'Imperial', mass: 6000 },
    { name: 'Lenticular', color: 0xff44ff, size: 1100, arms: 0, faction: 'Cardassian Union', species: 'Cardassian', mass: 11000 },
    { name: 'Quasar', color: 0xff8888, size: 1800, arms: 3, faction: 'Sith Empire', species: 'Sith', mass: 20000 },
    { name: 'Ancient', color: 0xffaa88, size: 1360, arms: 2, faction: 'Vulcan High Command', species: 'Vulcan', mass: 13000 }
];

// NEW: 3D Spherical galaxy positions - replaces flat galaxyMapPositions
const galaxy3DPositions = [
    // Galaxy 0: Federation Spiral - Upper front quadrant
    { 
        distance: 0.8,        // Distance from center (0.0 to 1.0)
        phi: 0.3,             // Azimuthal angle (0 to 2Ï€)
        theta: 0.4,           // Polar angle (0 to Ï€)
        name: 'Federation Space'
    },
    // Galaxy 1: Klingon Elliptical - Right side, mid-level
    { 
        distance: 0.9, 
        phi: 1.2, 
        theta: 0.6,
        name: 'Klingon Territory'
    },
    // Galaxy 2: Rebel Irregular - Upper right
    { 
        distance: 0.7, 
        phi: 1.8, 
        theta: 0.3,
        name: 'Rebel Sectors'
    },
    // Galaxy 3: Romulan Ring - Lower left
    { 
        distance: 0.85, 
        phi: 4.5, 
        theta: 0.8,
        name: 'Romulan Empire'
    },
    // Galaxy 4: Imperial Dwarf - Lower front
    { 
        distance: 0.6, 
        phi: 0.8, 
        theta: 0.9,
        name: 'Imperial Core'
    },
    // Galaxy 5: Cardassian Lenticular - Back left
    { 
        distance: 0.75, 
        phi: 3.8, 
        theta: 0.5,
        name: 'Cardassian Union'
    },
    // Galaxy 6: Sith Quasar - Far upper back
    { 
        distance: 0.95, 
        phi: 5.2, 
        theta: 0.2,
        name: 'Sith Dominion'
    },
    // Galaxy 7: Local/Sol - Close, center-bottom (safe starting area)
    { 
        distance: 0.3, 
        phi: 0.0, 
        theta: 1.1,
        name: 'Local Group (Sol System)'
    },
    // Galaxy 8: Sagittarius A
    { 
        distance: 0.5, 
        phi: 0.0, 
        theta: 1.1,
        name: 'Sagittarius A'
    }
];

// KEEP the old galaxyMapPositions as fallback for UI
const galaxyMapPositions = [
    { x: 0.3, y: 0.2 },   // 1
    { x: 0.7, y: 0.15 },  // 2
    { x: 0.85, y: 0.4 },  // 3
    { x: 0.75, y: 0.6 },  // 4
    { x: 0.6, y: 0.8 },   // 5
    { x: 0.25, y: 0.85 }, // 6
    { x: 0.1, y: 0.7 },   // 7
    { x: 0.5, y: 0.5 }    // 8 (Sagittarius A* at center)
];

// =============================================================================
// MYTHICAL NEBULA NAMING SYSTEM
// =============================================================================

const mythicalNebulaNames = [
    // Legendary Lost Cities
    'Atlantis', 'El Dorado', 'Shangri-La', 'Shambhala', 'Avalon',
    'Camelot', 'Asgard', 'Olympus', 'Valhalla', 'Elysium',
    
    // Science Fiction Cities
    'Cloud City', 'Coruscant', 'Trantor', 'Terminus', 'Arrakeen',
    'Neo-Tokyo', 'Citadel Station', 'Rapture', 'Columbia', 'New Mombasa',
    'Zanarkand', 'Midgar', 'Insomnia', 'Piltover', 'Zaun',
    
    // Fantasy Realms
    'Rivendell', 'Gondor', 'Lothlorien', 'Erebor', 'Minas Tirith',
    'Hogwarts', 'Narnia', 'Wonderland', 'Neverland', 'Oz',
    'Xanadu', 'Hy-Brasil', 'Ys', 'Lyonesse', 'Iram',
    
    // Epic Cosmic Cities
    'Celestia', 'Astral City', 'Starfall', 'Nova Prime', 'Helios Prime',
    'Solaris', 'Lunaris', 'Cosmopolis', 'Galaxia', 'Nebulonis',
    'Stellaris', 'Astropolis', 'Quasar City', 'Pulsar Haven', 'Void Station',
    
    // Mythological Places
    'Thule', 'Hyperborea', 'Lemuria', 'Mu', 'Arcadia',
    'Babylon', 'Nineveh', 'Troy', 'Carthage', 'Petra'
];

// Track which names have been used
const usedNebulaNames = new Set();

// Function to get a mythical name for a nebula
function getMythicalNebulaName(clusterIndex) {
    // For clustered nebulas, use related names
    const clusterPrefixes = ['Greater', 'Lesser', 'New', 'Old', 'High', 'Low', 'Upper', 'Lower', 'North', 'South', 'East', 'West'];
    
    // Get available names (not yet used)
    const availableNames = mythicalNebulaNames.filter(name => !usedNebulaNames.has(name));
    
    // If we've used all names, start reusing with prefixes
    if (availableNames.length === 0) {
        usedNebulaNames.clear();
        return getMythicalNebulaName(clusterIndex);
    }
    
    // Pick a random name from available ones
    const baseName = availableNames[Math.floor(Math.random() * availableNames.length)];
    
    // For clustered nebulas (same clusterIndex), occasionally add prefix
    let finalName = baseName;
    if (clusterIndex !== undefined && Math.random() < 0.4) {
        const prefix = clusterPrefixes[clusterIndex % clusterPrefixes.length];
        finalName = `${prefix} ${baseName}`;
    }
    
    usedNebulaNames.add(baseName);
    return finalName;
}

// ✅ NEW: Convert 3D spherical coordinates to 2D map coordinates
// Projects the spherical universe onto a flat circular map
function convertSpherical3DTo2DMap(galaxyData) {
    if (!galaxyData) return { x: 0.5, y: 0.5 };
    
    const phi = galaxyData.phi;
    const theta = galaxyData.theta;
    const distance = galaxyData.distance;
    
    // Map phi (azimuthal angle 0 to 2π) to horizontal position (0 to 1)
    // Normalize phi to 0-1 range
    let x = (phi / (Math.PI * 2)) % 1.0;
    
    // Map theta (polar angle 0 to π) to vertical position (0 to 1)
    // theta = 0 is north pole (top), theta = π is south pole (bottom)
    let y = theta / Math.PI;
    
    // Apply distance factor to pull closer galaxies toward center
    // This creates a more realistic spherical projection
    const centerX = 0.5;
    const centerY = 0.5;
    
    // Pull toward center based on distance (closer = more centered)
    const distanceFactor = distance; // 0.0 to 1.0
    x = centerX + (x - centerX) * distanceFactor;
    y = centerY + (y - centerY) * distanceFactor;
    
    return { x, y };
}

// ✅ NEW: Generate accurate 2D map positions from 3D spherical data
function generateAccurateMapPositions() {
    const accuratePositions = [];
    
    for (let i = 0; i < galaxy3DPositions.length; i++) {
        const pos2D = convertSpherical3DTo2DMap(galaxy3DPositions[i]);
        accuratePositions.push(pos2D);
    }
    
    return accuratePositions;
}

// ✅ OVERRIDE: Replace old hardcoded positions with calculated positions
// Uncomment the line below to use accurate positions
// const galaxyMapPositions = generateAccurateMapPositions();

function isPositionTooClose(position, minDistance) {
    // Safety check for planets array
    if (typeof planets === 'undefined' || !planets) {
        return false;
    }
    
    for (let planet of planets) {
        if (planet && planet.position && position.distanceTo(planet.position) < minDistance) {
            return true;
        }
    }
    return false;
}

// =============================================================================
// NEW: 3D GALAXY POSITIONING FUNCTIONS
// =============================================================================

function getGalaxy3DPosition(galaxyId) {
    const galaxyData = galaxy3DPositions[galaxyId];
    if (!galaxyData) return new THREE.Vector3(0, 0, 0);
    
    const universeRadius = 100000; // Increased to accommodate exotic/borg systems (up to 85k units) with margins
    const distance = galaxyData.distance * universeRadius;
    const phi = galaxyData.phi;
    const theta = galaxyData.theta;
    
    // Convert spherical coordinates to Cartesian
    const x = distance * Math.sin(theta) * Math.cos(phi);
    const y = distance * Math.cos(theta);
    const z = distance * Math.sin(theta) * Math.sin(phi);

    // FLOATING ORIGIN: the table stores TRUE (absolute) coordinates; convert
    // to the current rebased frame so every consumer's distance math stays
    // consistent with the shifted scene.
    const _woo = (typeof window !== 'undefined' && window.worldOriginOffset) || null;
    if (_woo) return new THREE.Vector3(x - _woo.x, y - _woo.y, z - _woo.z);
    return new THREE.Vector3(x, y, z);
}

function getRandomPositionInGalaxy3D(galaxyId) {
    const galaxy = galaxyTypes[galaxyId];
    const centerPosition = getGalaxy3DPosition(galaxyId);

    // Random position within galaxy bounds in 3D
    // Limit cosmic features to 55000 units from galaxy center for discoverability
    const galaxyRadius = galaxy.size;
    const maxSpawnRadius = Math.min(galaxyRadius, 55000);
    const localPhi = Math.random() * Math.PI * 2;
    const localTheta = Math.random() * Math.PI;
    const localDistance = Math.random() * maxSpawnRadius;
    
    const localX = Math.sin(localTheta) * Math.cos(localPhi) * localDistance;
    const localY = Math.cos(localTheta) * localDistance;
    const localZ = Math.sin(localTheta) * Math.sin(localPhi) * localDistance;
    
    return new THREE.Vector3(
        centerPosition.x + localX,
        centerPosition.y + localY,
        centerPosition.z + localZ
    );
}

// =============================================================================
// UTILITY: Get Random Galaxy Position (used by cosmic features)
// =============================================================================
function getRandomGalaxyPosition(galaxyId) {
    // ENHANCED: Safety checks for undefined/invalid galaxyId
    if (galaxyId === undefined || galaxyId === null || galaxyId < 0) {
        console.warn(`Invalid galaxyId: ${galaxyId}, using default position`);
        return new THREE.Vector3(0, 0, 0);
    }
    
    // Safety check for galaxyTypes array
    if (typeof galaxyTypes === 'undefined' || !galaxyTypes[galaxyId]) {
        console.warn(`No galaxy data for galaxyId: ${galaxyId}, using default position`);
        return new THREE.Vector3(0, 0, 0);
    }
    
    const galaxy = galaxyTypes[galaxyId];
    
    // Use 3D positioning (preferred method)
    if (typeof getRandomPositionInGalaxy3D === 'function') {
        try {
            const position3D = getRandomPositionInGalaxy3D(galaxyId);
            if (position3D && position3D.x !== undefined && position3D.y !== undefined && position3D.z !== undefined) {
                return position3D;
            }
        } catch (error) {
            console.warn(`3D positioning failed for galaxy ${galaxyId}, falling back to 2D conversion:`, error);
        }
    }
    
    // FALLBACK: Enhanced 3D conversion from 2D map positions
    if (typeof galaxyMapPositions === 'undefined' || !galaxyMapPositions[galaxyId]) {
        console.warn(`No map position for galaxyId: ${galaxyId}, using default position`);
        return new THREE.Vector3(0, 0, 0);
    }
    
    const mapPos = galaxyMapPositions[galaxyId];
    
    // Enhanced 3D spherical distribution instead of flat
    const universeRadius = 100000; // Increased to accommodate exotic/borg systems (up to 85k units) with margins
    
    // Convert 2D map position to 3D spherical coordinates
    const phi = mapPos.x * Math.PI * 2; // Azimuthal angle (0 to 2π)
    const theta = mapPos.y * Math.PI; // Polar angle (0 to π)
    
    // Place galaxy center in 3D spherical space
    const galaxyDistance = universeRadius * 0.7; // Place galaxies toward outer sphere
    const galaxyBaseX = Math.sin(theta) * Math.cos(phi) * galaxyDistance;
    const galaxyBaseY = Math.cos(theta) * galaxyDistance;
    const galaxyBaseZ = Math.sin(theta) * Math.sin(phi) * galaxyDistance;
    
    // Random position within galaxy bounds (also in 3D)
    const galaxyRadius = galaxy.size || 1200; // Default size if missing
    const localPhi = Math.random() * Math.PI * 2;
    const localTheta = Math.random() * Math.PI;
    const localDistance = Math.random() * galaxyRadius;
    
    const localX = Math.sin(localTheta) * Math.cos(localPhi) * localDistance;
    const localY = Math.cos(localTheta) * localDistance;
    const localZ = Math.sin(localTheta) * Math.sin(localPhi) * localDistance;
    
    const finalPosition = new THREE.Vector3(
        galaxyBaseX + localX,
        galaxyBaseY + localY,
        galaxyBaseZ + localZ
    );
    
    // Safety check for valid position
    if (isNaN(finalPosition.x) || isNaN(finalPosition.y) || isNaN(finalPosition.z)) {
        console.warn(`Invalid position calculated for galaxy ${galaxyId}, using default`);
        return new THREE.Vector3(0, 0, 0);
    }
    
    return finalPosition;
}

// =============================================================================
// ENHANCED ENEMY PLACEMENT SYSTEM - Multiple Placement Strategies
// =============================================================================

function getEnemyPlacementPosition(galaxyId, placementType = 'random') {
    switch(placementType) {
        case 'cosmic_feature':
            return getEnemyPositionNearCosmicFeature(galaxyId);
        case 'black_hole':
            return getEnemyPositionNearBlackHole(galaxyId);
        case 'random':
        default:
            return getRandomPositionInGalaxy3D(galaxyId);
    }
}

function getEnemyPositionNearCosmicFeature(galaxyId) {
    // Try to find cosmic features in this galaxy
    const nearbyFeatures = [];
    
    if (typeof cosmicFeatures !== 'undefined') {
        // Collect all cosmic features for this galaxy
        const allFeatures = [
            ...cosmicFeatures.pulsars.filter(p => p.userData && p.userData.galaxyId === galaxyId),
            ...cosmicFeatures.supernovas.filter(s => s.userData && s.userData.galaxyId === galaxyId),
            ...cosmicFeatures.dysonSpheres.filter(d => d.userData && d.userData.galaxyId === galaxyId),
            ...cosmicFeatures.ringworlds.filter(r => r.userData && r.userData.galaxyId === galaxyId),
            ...cosmicFeatures.solarStorms.filter(ss => ss.userData && ss.userData.galaxyId === galaxyId),
            ...cosmicFeatures.crystalFormations.filter(cf => cf.userData && cf.userData.galaxyId === galaxyId),
            ...cosmicFeatures.plasmaStorms.filter(ps => ps.userData && ps.userData.galaxyId === galaxyId),
            ...cosmicFeatures.brownDwarfs.filter(bd => bd.userData && bd.userData.galaxyId === galaxyId)
        ];
        
        nearbyFeatures.push(...allFeatures);
    }
    
    // If cosmic features exist, spawn near one of them
    if (nearbyFeatures.length > 0) {
        const feature = nearbyFeatures[Math.floor(Math.random() * nearbyFeatures.length)];
        const orbitRadius = 200 + Math.random() * 400; // Orbit between 200-600 units from feature
        const angle = Math.random() * Math.PI * 2;
        const heightVariation = (Math.random() - 0.5) * 200;
        
        return new THREE.Vector3(
            feature.position.x + Math.cos(angle) * orbitRadius,
            feature.position.y + heightVariation,
            feature.position.z + Math.sin(angle) * orbitRadius
        );
    }
    
    // Fallback: use random position if no cosmic features exist
    console.log(`No cosmic features found in galaxy ${galaxyId}, using random position`);
    return getRandomPositionInGalaxy3D(galaxyId);
}

function getEnemyPositionNearBlackHole(galaxyId) {
    // Find the black hole for this galaxy
    const blackHole = planets.find(p => 
        p.userData.type === 'blackhole' && 
        p.userData.galaxyId === galaxyId &&
        !p.userData.isLocalGateway
    );
    
    if (blackHole) {
        // Use similar logic to guardian placement
        const orbitRadius = (blackHole.userData.warpThreshold || 600) + 200 + Math.random() * 400;
        const angle = Math.random() * Math.PI * 2;
        const heightVariation = (Math.random() - 0.5) * 300;
        
        return new THREE.Vector3(
            blackHole.position.x + Math.cos(angle) * orbitRadius,
            blackHole.position.y + heightVariation,
            blackHole.position.z + Math.sin(angle) * orbitRadius
        );
    }
    
    // Fallback: use random position if no black hole found
    console.log(`No black hole found in galaxy ${galaxyId}, using random position`);
    return getRandomPositionInGalaxy3D(galaxyId);
}

// Fallback function for backwards compatibility
function getGalaxyMapPosition(galaxyId) {
    return galaxyMapPositions[galaxyId] || { x: 0.5, y: 0.5 };
}

// =============================================================================
// 3D SPHERICAL UNIVERSE DISTRIBUTION SYSTEM
// =============================================================================

// Generate spherical coordinates for true 3D galaxy distribution
function generateSphericalGalaxyPositions() {
    const galaxySphericalPositions = [];
    const minRadius = 25000; // Minimum distance from Sagittarius A*
    const maxRadius = 75000; // Maximum distance for outer galaxies
    
    galaxyTypes.forEach((galaxyType, index) => {
        // Skip local galaxy (index 7) - it's at the center with Sagittarius A*
        if (index === 7) {
            galaxySphericalPositions.push({
                position: new THREE.Vector3(0, 0, 0), // Center of universe
                rotation: new THREE.Euler(0, 0, 0),
                radius: 0
            });
            return;
        }
        
        // Generate spherical coordinates for distant galaxies
        const radius = minRadius + Math.random() * (maxRadius - minRadius);
        const theta = Math.random() * Math.PI * 2; // Azimuthal angle (0 to 2Ï€)
        const phi = Math.acos(1 - 2 * Math.random()); // Polar angle (0 to Ï€) - uniform distribution
        
        // Convert spherical to Cartesian coordinates
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);
        
        // Generate random rotation for galaxy orientation
        const rotationX = Math.random() * Math.PI * 2;
        const rotationY = Math.random() * Math.PI * 2;
        const rotationZ = Math.random() * Math.PI * 2;
        
        galaxySphericalPositions.push({
            position: new THREE.Vector3(x, y, z),
            rotation: new THREE.Euler(rotationX, rotationY, rotationZ),
            radius: radius,
            sphericalCoords: { radius, theta, phi }
        });
    });
    
    return galaxySphericalPositions;
}

// Generate 3D spherical positions for nebula clusters
function generateSphericalNebulaPositions(clusterCount = 3) {
    const nebulaClusterPositions = [];
    const minRadius = 20000; // Pushed further from twin cores for performance
    const maxRadius = 45000;
    
    for (let i = 0; i < clusterCount; i++) {
        const radius = minRadius + Math.random() * (maxRadius - minRadius);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(1 - 2 * Math.random());
        
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);
        
        nebulaClusterPositions.push({
            center: new THREE.Vector3(x, y, z),
            radius: radius,
            spread: 2000 + Math.random() * 2000 // How spread out nebulas are within cluster
        });
    }
    
    return nebulaClusterPositions;
}

// Planet name generators
const starTrekPlanets = ['Vulcan', 'Andoria', 'Tellar Prime', 'Bajor', 'Cardassia Prime', 'Kronos', 'Romulus', 'Risa', 'Betazed', 'Trill'];
const starWarsPlanets = ['Tatooine', 'Coruscant', 'Naboo', 'Endor', 'Hoth', 'Dagobah', 'Kamino', 'Geonosis', 'Mustafar', 'Alderaan'];

// Enhanced enemy shapes for different galaxies (enemy size remains the same)
const enemyShapes = {
    0: { geometry: 'cone', color: 0xff3333 },       // Federation - BRIGHT RED (vs blue galaxy)
    1: { geometry: 'octahedron', color: 0x00ffff }, // Klingon - CYAN (vs orange galaxy)
    2: { geometry: 'tetrahedron', color: 0xff00ff }, // Rebel - MAGENTA (vs green galaxy)
    3: { geometry: 'cylinder', color: 0xffff00 },   // Romulan - YELLOW (vs pink galaxy)
    4: { geometry: 'sphere', color: 0xff6600 },     // Imperial - ORANGE (vs cyan galaxy)
    5: { geometry: 'box', color: 0x00ff00 },        // Cardassian - LIME GREEN (vs magenta galaxy)
    6: { geometry: 'diamond', color: 0x0088ff },    // Sith - BLUE (vs red galaxy)
    7: { geometry: 'torus', color: 0xffaa88 }       // Vulcan - torus
};

// Enhanced enemy spawning limits per galaxy
const galaxyEnemyLimits = {
    0: 24, 1: 30, 2: 20, 3: 26, 4: 18, 5: 28, 6: 36, 7: 20  // Doubled — spread in 2-3 ship groups
};

// FIXED: Boss system initialization - SINGLE DECLARATION
// ENHANCED: Area-based boss and elite guardian system
const bossSystem = {
    // Area bosses: Track by area (galaxyId + placementType)
    // Key format: "galaxyId-placementType" (e.g., "0-cosmic_feature", "3-black_hole")
    areaBosses: {},

    // Elite guardians: Track by species/faction (universe-wide)
    // Key format: faction name (e.g., "Borg Collective", "Crystalline Hive")
    eliteGuardians: {},

    // Per-galaxy progress flags: index by galaxyId (0..7).  These MUST be
    // initialized or checkGuardianVictory / checkGalaxyClear throw when
    // reading [g] on undefined.
    galaxyBossDefeated: [false, false, false, false, false, false, false, false],
    galaxyBossSpawned: [false, false, false, false, false, false, false, false],
    galaxyGuardiansDefeated: [false, false, false, false, false, false, false, false],

    activeBoss: null,
    activeBosses: [], // Track multiple active bosses
    bossThreshold: 0 // Spawn boss when 0 enemies remain in area (all cleared)
};

// Track where the last enemy of each faction was killed (for elite guardian spawning)
const lastKillPositions = {};

// =============================================================================
// NEBULA INTEL SYSTEM - Track enemy clusters and display lines to hostiles
// =============================================================================

const nebulaIntelSystem = {
    // Nebula-to-faction assignments
    nebulaFactions: {}, // nebulaId -> galaxyId (faction)
    
    // Enemy clusters - groups of enemies with center points
    enemyClusters: [], // { id, galaxyId, center, enemies[], defeated, lineObject }
    
    // Lines from nebulas to clusters
    intelLines: [], // { nebulaId, clusterId, line, defeated }
    
    initialized: false
};

// Assign each nebula to track a specific faction
function assignFactionsToNebulas() {
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) {
        console.log('No nebulas found for faction assignment');
        return;
    }
    
    console.log('📡 Assigning factions to nebulas for intel tracking...');
    
    // Get clustered nebulas (not distant/exotic - those have their own assignments)
    const clusteredNebulas = nebulaClouds.filter(n => 
        n && n.userData && !n.userData.isDistant && !n.userData.isExoticCore
    );
    
    // Distribute 8 factions across nebulas
    clusteredNebulas.forEach((nebula, index) => {
        const factionId = index % 8; // Cycle through 8 galaxy factions
        nebula.userData.assignedFaction = factionId;
        nebula.userData.factionName = galaxyTypes[factionId].faction;
        nebula.userData.factionColor = galaxyTypes[factionId].color;
        
        nebulaIntelSystem.nebulaFactions[index] = factionId;
        
        console.log(`  📡 ${nebula.userData.name} → ${galaxyTypes[factionId].faction} (Galaxy ${factionId})`);
    });
    
    nebulaIntelSystem.initialized = true;
}

// Create enemy clusters - groups of enemies by faction and proximity
function createEnemyClusters() {
    if (typeof enemies === 'undefined' || enemies.length === 0) return;
    
    console.log('📍 Creating enemy clusters for intel lines...');
    
    // Clear existing clusters
    nebulaIntelSystem.enemyClusters = [];
    
    // Group enemies by faction (galaxyId)
    const factionEnemies = {};
    enemies.forEach(enemy => {
        if (!enemy.userData || enemy.userData.health <= 0) return;
        if (enemy.userData.isBoss || enemy.userData.isBossSupport) return;
        
        const galaxyId = enemy.userData.galaxyId;
        if (galaxyId === undefined || galaxyId < 0) return;
        
        if (!factionEnemies[galaxyId]) {
            factionEnemies[galaxyId] = [];
        }
        factionEnemies[galaxyId].push(enemy);
    });
    
    // For each faction, create clusters based on proximity (max 3000 units apart)
    const clusterRadius = 3000;
    let clusterId = 0;
    
    Object.keys(factionEnemies).forEach(galaxyId => {
        const factionList = factionEnemies[galaxyId];
        const assigned = new Set();
        
        factionList.forEach(enemy => {
            if (assigned.has(enemy)) return;
            
            // Start a new cluster with this enemy
            const cluster = {
                id: clusterId++,
                galaxyId: parseInt(galaxyId),
                enemies: [enemy],
                center: enemy.position.clone(),
                defeated: false,
                lineObject: null
            };
            assigned.add(enemy);
            
            // Find nearby enemies to add to cluster
            factionList.forEach(otherEnemy => {
                if (assigned.has(otherEnemy)) return;
                if (enemy.position.distanceTo(otherEnemy.position) < clusterRadius) {
                    cluster.enemies.push(otherEnemy);
                    assigned.add(otherEnemy);
                }
            });
            
            // Calculate cluster center
            if (cluster.enemies.length > 1) {
                const centerSum = new THREE.Vector3();
                cluster.enemies.forEach(e => centerSum.add(e.position));
                cluster.center = centerSum.divideScalar(cluster.enemies.length);
            }
            
            nebulaIntelSystem.enemyClusters.push(cluster);
        });
    });
    
    console.log(`✅ Created ${nebulaIntelSystem.enemyClusters.length} enemy clusters`);
}

// Prepare intel line data but DON'T create visible lines yet
// Lines only appear when triggered (galaxy cleared)
function createNebulaIntelLines() {
    if (typeof nebulaClouds === 'undefined') return;
    
    console.log('📡 Preparing intel line data (lines hidden until triggered)...');
    
    // Clear any existing lines
    nebulaIntelSystem.intelLines.forEach(intel => {
        if (intel.line && intel.line.parent) {
            intel.line.parent.remove(intel.line);
        }
    });
    nebulaIntelSystem.intelLines = [];
    
    // Store cluster-nebula relationships but don't create visible lines
    // Lines will be created by createGalaxyToNebulaLine() when faction is cleared
    
    console.log(`✅ Intel system ready (lines will appear when factions are cleared)`);
}

// Check if a cluster is defeated and update line color
function updateClusterStatus(deadEnemy) {
    if (!nebulaIntelSystem.initialized) return;
    
    const galaxyId = deadEnemy.userData.galaxyId;
    
    // Find cluster containing this enemy
    nebulaIntelSystem.enemyClusters.forEach(cluster => {
        if (cluster.defeated) return;
        if (cluster.galaxyId !== galaxyId) return;
        
        // Check if enemy was in this cluster
        const enemyIndex = cluster.enemies.indexOf(deadEnemy);
        if (enemyIndex === -1) return;
        
        // Check if all enemies in cluster are dead
        const allDead = cluster.enemies.every(e => 
            !e.userData || e.userData.health <= 0
        );
        
        if (allDead) {
            cluster.defeated = true;
            
            console.log(`✅ Cluster ${cluster.id} (${galaxyTypes[galaxyId].faction}) defeated`);
            
            // Check if all clusters for this faction are defeated
            checkFactionCleared(galaxyId);
        }
    });
}

// True if a boss / elite guardian / BH guardian has EVER been spawned
// for this galaxy (so we don't fire the "neutralized" banner before
// the boss phase has even started).
function _galaxyBossSpawned(galaxyId) {
    if (typeof bossSystem === 'undefined') return false;
    if (bossSystem.galaxyBossSpawned && bossSystem.galaxyBossSpawned[galaxyId]) return true;
    if (bossSystem.areaBosses) {
        for (const k in bossSystem.areaBosses) {
            if (k.indexOf(galaxyId + '-') === 0) return true;
        }
    }
    const fac = (typeof galaxyTypes !== 'undefined' && galaxyTypes[galaxyId])
        ? galaxyTypes[galaxyId].faction : null;
    if (fac && bossSystem.eliteGuardians && bossSystem.eliteGuardians[fac] &&
        bossSystem.eliteGuardians[fac].spawned) return true;
    return false;
}

// True while ANY boss / elite guardian / BH guardian for this galaxy
// is still alive.
function _galaxyBossAlive(galaxyId) {
    if (typeof enemies === 'undefined') return false;
    return enemies.some(e => e && e.userData && e.userData.health > 0 &&
        e.userData.galaxyId === galaxyId &&
        (e.userData.isBoss || e.userData.isEliteGuardian || e.userData.isBlackHoleGuardian));
}

// Emit any deferred "FORCES NEUTRALIZED" banners whose galaxy now has
// its boss spawned AND fully defeated. Called from checkBossVictory.
function flushFactionClearedMessages() {
    if (!nebulaIntelSystem.pendingCleared) return;
    if (!nebulaIntelSystem.clearedAnnounced) nebulaIntelSystem.clearedAnnounced = {};
    Object.keys(nebulaIntelSystem.pendingCleared).forEach(gidStr => {
        const gid = parseInt(gidStr, 10);
        if (_galaxyBossSpawned(gid) && !_galaxyBossAlive(gid)) {
            const p = nebulaIntelSystem.pendingCleared[gid];
            delete nebulaIntelSystem.pendingCleared[gid];
            nebulaIntelSystem.clearedAnnounced[gid] = true;
            showFactionClearedMission(p.faction, p.nebulaName, p.galaxyId);
        }
    });
}
if (typeof window !== 'undefined') window.flushFactionClearedMessages = flushFactionClearedMessages;

// Check if all enemies of a faction are cleared in an area
function checkFactionCleared(galaxyId) {
    const factionClusters = nebulaIntelSystem.enemyClusters.filter(c => c.galaxyId === galaxyId);
    const allCleared = factionClusters.every(c => c.defeated);

    if (allCleared && factionClusters.length > 0) {
        const faction = galaxyTypes[galaxyId];

        // Find nearest nebula tracking this faction
        const trackingNebula = nebulaClouds.find(n =>
            n && n.userData && n.userData.assignedFaction === galaxyId
        );

        const nebulaName = (galaxyId === 7)
            ? 'the twin nebulas marked by the white path'
            : (trackingNebula ? trackingNebula.userData.name : 'nearest nebula');

        if (!nebulaIntelSystem.pendingCleared) nebulaIntelSystem.pendingCleared = {};
        if (!nebulaIntelSystem.clearedAnnounced) nebulaIntelSystem.clearedAnnounced = {};

        // DEFER the "FORCES NEUTRALIZED" banner. Clearing the regular
        // cluster enemies is what makes the boss spawn — the sector is
        // NOT actually neutralized until that boss (and any elite / BH
        // guardian) is dead. Stash it and let flushFactionClearedMessages
        // emit it once the boss phase is truly over. The intel line +
        // boss-spawn trigger still fire now so the boss appears.
        if (!nebulaIntelSystem.pendingCleared[galaxyId] &&
            !nebulaIntelSystem.clearedAnnounced[galaxyId]) {
            nebulaIntelSystem.pendingCleared[galaxyId] = { faction, nebulaName, galaxyId };
            console.log(`🎖️ ${faction.faction} clusters cleared — banner deferred until boss defeated`);
            // Intel lines only draw when the player is actually IN that
            // galaxy's region (<15,000u from its core). Galaxy 7 (Sol /
            // Sgr A*) never draws one — the white liberation path is the
            // local guidance. Without the proximity gate, remote factions
            // whose wandering ships died in the LOCAL fight (the demo's
            // swarm pull drags them in) popped their colored dashed lines
            // across the sky at the exact "Sagittarius A cleared" moment.
            let _nearThisGalaxy = false;
            if (galaxyId !== 7 && typeof planets !== 'undefined' &&
                typeof camera !== 'undefined') {
                const _core = planets.find(p => p && p.userData &&
                    p.userData.type === 'blackhole' && p.userData.isGalacticCore &&
                    p.userData.galaxyId === galaxyId);
                if (_core) _nearThisGalaxy =
                    camera.position.distanceTo(_core.position) < 15000;
            }
            if (_nearThisGalaxy && typeof createGalaxyToNebulaLine === 'function') {
                createGalaxyToNebulaLine(galaxyId);
            }
            if (typeof checkAndSpawnAreaBosses === 'function') {
                setTimeout(() => checkAndSpawnAreaBosses(), 5000);
            }
        }
        // Edge case: boss already came and went — flush immediately.
        flushFactionClearedMessages();
    }
}

// Show Mission Command when a faction's sector is TRULY cleared (every
// regular cluster + the boss + any elite / BH guardian dead). The line
// + boss spawn are handled earlier in checkFactionCleared's deferred
// path, so this function is now purely the victory banner.
function showFactionClearedMission(faction, nebulaName, galaxyId) {
    console.log(`🎖️ ${faction.faction} sector fully neutralized (boss down)! Directing to ${nebulaName}`);

    if (typeof showMissionCommandAlert === 'function') {
        const title = `${faction.faction.toUpperCase()} FORCES NEUTRALIZED`;
        const message = `Outstanding, Captain! The ${faction.faction} fleet AND their flagship commander have been destroyed in this sector.\n\n` +
            `Navigate to ${nebulaName} for intel on remaining hostile activity across the galaxy.`;

        showMissionCommandAlert(title, message, faction.color);
    } else if (typeof showAchievement === 'function') {
        showAchievement(
            `🎖️ ${faction.faction} SECTOR CLEARED`,
            `Flagship down. Seek ${nebulaName} for intel on remaining hostiles`
        );
    }
}

// Create a line from galaxy black hole to the nebula tracking that faction
function createGalaxyToNebulaLine(galaxyId) {
    if (typeof scene === 'undefined' || typeof planets === 'undefined' || typeof nebulaClouds === 'undefined') {
        console.warn('Cannot create galaxy-nebula line: missing scene/planets/nebulaClouds');
        return;
    }
    
    // Find the galaxy's black hole
    const galaxyBlackHole = planets.find(p => 
        p.userData && 
        p.userData.type === 'blackhole' && 
        p.userData.isGalacticCore && 
        p.userData.galaxyId === galaxyId
    );
    
    if (!galaxyBlackHole) {
        console.warn(`No black hole found for galaxy ${galaxyId}`);
        return;
    }
    
    // Find the nebula tracking this faction
    const trackingNebula = nebulaClouds.find(n => 
        n && n.userData && n.userData.assignedFaction === galaxyId
    );
    
    if (!trackingNebula) {
        console.warn(`No nebula tracking faction ${galaxyId}`);
        return;
    }
    
    const faction = galaxyTypes[galaxyId];
    
    // Create DASHED line from black hole to nebula (like nebula lore triggers)
    const points = [galaxyBlackHole.position.clone(), trackingNebula.position.clone()];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    
    // Use faction color with dashed style. Alpha discipline (PewPew-style):
    // background-tier guidance sits at ~0.6 so gameplay objects remain the
    // only full-saturation elements on screen (orbit lines 0.3, discovery
    // paths 0.7, this 0.6).
    const lineMaterial = new THREE.LineDashedMaterial({
        color: faction.color,
        transparent: true,
        opacity: 0.6,
        linewidth: 2,
        dashSize: 100,
        gapSize: 50,
        scale: 1
    });
    
    const line = new THREE.Line(geometry, lineMaterial);
    line.computeLineDistances(); // Required for dashed lines to work
    line.userData = {
        type: 'galaxy_intel_line',
        galaxyId: galaxyId,
        factionName: faction.faction,
        nebulaName: trackingNebula.userData.name
    };
    
    scene.add(line);
    
    // Store in intel system
    if (!nebulaIntelSystem.galaxyLines) {
        nebulaIntelSystem.galaxyLines = [];
    }
    nebulaIntelSystem.galaxyLines.push({
        galaxyId: galaxyId,
        line: line,
        blackHole: galaxyBlackHole,
        nebula: trackingNebula
    });
    
    console.log(`📡 Created intel line: ${faction.faction} Galaxy → ${trackingNebula.userData.name}`);
}

// Export the new function
window.createGalaxyToNebulaLine = createGalaxyToNebulaLine;

// Initialize the intel system (call after nebulas and enemies are created)
function initializeNebulaIntelSystem() {
    console.log('📡 Initializing Nebula Intel System...');
    
    assignFactionsToNebulas();
    createEnemyClusters();
    createNebulaIntelLines();
    
    console.log('✅ Nebula Intel System initialized');
}

// Export nebula intel system
window.nebulaIntelSystem = nebulaIntelSystem;
window.assignFactionsToNebulas = assignFactionsToNebulas;
window.createEnemyClusters = createEnemyClusters;
window.createNebulaIntelLines = createNebulaIntelLines;
window.updateClusterStatus = updateClusterStatus;
window.checkFactionCleared = checkFactionCleared;
window.initializeNebulaIntelSystem = initializeNebulaIntelSystem;

// =============================================================================
// PROGRESSIVE DIFFICULTY SYSTEM - ENHANCED COMBAT MECHANICS
// =============================================================================

// ENHANCED: Calculate difficulty settings based on galaxies cleared (MAX 3 HIT ENEMIES)
function calculateDifficultySettings(galaxiesCleared = 0) {
    const baseSettings = {
        // Local galaxy settings (progressive difficulty) - MAX 3 HITS
        maxLocalAttackers: Math.min(3 + galaxiesCleared, 8), // Start with 3, +1 per galaxy cleared, max 8
        localSpeedMultiplier: 0.5 + (galaxiesCleared * 0.1), // Start slow, get faster
        localHealthMultiplier: galaxiesCleared === 0 ? 1 : Math.min(1 + galaxiesCleared * 0.25, 3), // MAX 3 hits
        localDetectionRange: 2500 + (galaxiesCleared * 200), // Larger detection as difficulty increases
        localFiringRange: 500 + (galaxiesCleared * 50),  // Increased - enemies attack from further
        localAttackCooldown: Math.max(1000, 2000 - (galaxiesCleared * 100)), // Faster attacks as difficulty increases
        
        // Distant galaxy settings (always challenging) - MAX 3 HITS
        maxDistantAttackers: Math.min(5 + galaxiesCleared, 10),
        distantSpeedMultiplier: 0.8 + (galaxiesCleared * 0.05),
        distantHealthMultiplier: Math.min(2 + galaxiesCleared * 0.125, 3), // MAX 3 hits
        distantDetectionRange: 3000 + (galaxiesCleared * 150),
        distantFiringRange: 600 + (galaxiesCleared * 30),  // Increased - enemies attack from further
        distantAttackCooldown: Math.max(800, 1200 - (galaxiesCleared * 50)),
        
        // General settings
        galaxiesCleared: galaxiesCleared,
        difficultyLevel: Math.min(Math.floor(galaxiesCleared / 2), 4) // 0-4 difficulty levels
    };
    
    return baseSettings;
}

// ENHANCED: Progressive enemy health system - MAX 3 HITS FOR ALL ENEMIES
function getEnemyHealthForDifficulty(isLocal, isBoss, isBossSupport) {
    const galaxiesCleared = (typeof gameState !== 'undefined' && gameState.galaxiesCleared) ? gameState.galaxiesCleared : 0;
    
    if (isBoss) {
        // Boss health: 3 hits maximum
        return 3;
    } else if (isBossSupport) {
        // Boss support health: 2-3 hits
        return Math.min(2 + Math.floor(galaxiesCleared / 3), 3);
    } else if (isLocal) {
        // Local enemy health: 2-3 hits (was 1-3, but 1-hit kills felt too easy)
        return Math.min(2 + Math.floor(galaxiesCleared / 3), 3);
    } else {
        // Distant enemy health: 2-3 hits
        return Math.min(2 + Math.floor(galaxiesCleared / 4), 3);
    }
}

// ENHANCED: Refresh all enemy difficulty when galaxies are cleared
function refreshEnemyDifficulty() {
    // Safety check for enemies array
    if (typeof enemies === 'undefined') return;
    
    const difficultySettings = calculateDifficultySettings();
    
    // Update all existing enemies
    enemies.forEach(enemy => {
        if (!enemy.userData || enemy.userData.health <= 0) return;
        
        const isLocal = enemy.userData.isLocal || false;
        const isBoss = enemy.userData.isBoss || false;
        const isBossSupport = enemy.userData.isBossSupport || false;
        
        // Update health but don't heal damaged enemies
        const newMaxHealth = getEnemyHealthForDifficulty(isLocal, isBoss, isBossSupport);
        const healthPercentage = enemy.userData.health / (enemy.userData.maxHealth || 1);
        
        enemy.userData.maxHealth = newMaxHealth;
        enemy.userData.health = Math.max(enemy.userData.health, newMaxHealth * healthPercentage);
    });
    
    console.log(`Difficulty refreshed: Level ${difficultySettings.difficultyLevel}, Galaxies cleared: ${(typeof gameState !== 'undefined' && gameState.galaxiesCleared) ? gameState.galaxiesCleared : 0}`);
}

// ENHANCED: Difficulty display for UI
function getDifficultyStatusText() {
    const galaxiesCleared = (typeof gameState !== 'undefined' && gameState.galaxiesCleared) ? gameState.galaxiesCleared : 0;
    const difficultySettings = calculateDifficultySettings(galaxiesCleared);
    
    let difficultyLevel = 'Novice';
    if (galaxiesCleared >= 6) difficultyLevel = 'Nightmare';
    else if (galaxiesCleared >= 4) difficultyLevel = 'Expert';
    else if (galaxiesCleared >= 2) difficultyLevel = 'Veteran';
    else if (galaxiesCleared >= 1) difficultyLevel = 'Experienced';
    
    return {
        level: difficultyLevel,
        maxAttackers: difficultySettings.maxLocalAttackers,
        speedMultiplier: difficultySettings.localSpeedMultiplier.toFixed(1),
        galaxiesCleared: galaxiesCleared
    };
}

// ENHANCED: Debug function to test difficulty scaling
function testDifficultyScaling() {
    console.log('=== DIFFICULTY SCALING TEST (MAX 3 HIT ENEMIES) ===');
    for (let i = 0; i <= 8; i++) {
        const savedGalaxies = (typeof gameState !== 'undefined' && gameState.galaxiesCleared) ? gameState.galaxiesCleared : 0;
        if (typeof gameState !== 'undefined') gameState.galaxiesCleared = i;
        
        const settings = calculateDifficultySettings(i);
        const localHealth = getEnemyHealthForDifficulty(true, false, false);
        const distantHealth = getEnemyHealthForDifficulty(false, false, false);
        const bossHealth = getEnemyHealthForDifficulty(false, true, false);
        
        console.log(`Galaxies ${i}: Local(${localHealth}hp, ${settings.maxLocalAttackers}max, ${settings.localSpeedMultiplier.toFixed(1)}x) | Distant(${distantHealth}hp, ${settings.maxDistantAttackers}max, ${settings.distantSpeedMultiplier.toFixed(1)}x) | Boss(${bossHealth}hp)`);
        
        if (typeof gameState !== 'undefined') gameState.galaxiesCleared = savedGalaxies;
    }
}

// ENHANCED: Helper function to identify local vs distant enemies
function isEnemyInLocalGalaxy(enemy) {
    if (!enemy || !enemy.userData) return false;
    
    // Check if enemy is explicitly marked as local
    if (enemy.userData.isLocal !== undefined) {
        return enemy.userData.isLocal;
    }
    
    // Fallback: check position relative to origin (local galaxy center)
    const distanceFromOrigin = (window.trueDistanceFromOrigin) ? window.trueDistanceFromOrigin(enemy.position) : enemy.position.length();
    return distanceFromOrigin < 5000; // Local galaxy radius
}

// ENHANCED: Area-based boss spawning system
function checkAndSpawnAreaBosses() {
    if (typeof enemies === 'undefined' || typeof scene === 'undefined') return;

    // Persistent set of areas that have EVER had hostiles. Without
    // this, a fully-cleared area simply vanishes from the per-frame
    // count map, so the old code (which only iterated areas with >=1
    // living enemy) could never detect "area now empty" and never
    // spawned the boss. We only track the meaningful combat zones —
    // black_hole and cosmic_feature — so clearing scattered 'random'
    // filler doesn't spam bosses.
    if (!bossSystem.knownAreas) bossSystem.knownAreas = {};

    const areaEnemyCounts = {};
    enemies.forEach(enemy => {
        if (!enemy.userData || enemy.userData.health <= 0) return;
        if (enemy.userData.isBoss || enemy.userData.isBossSupport || enemy.userData.isEliteGuardian) return;

        const galaxyId = enemy.userData.galaxyId;
        const placementType = enemy.userData.placementType || 'random';
        if (placementType !== 'black_hole' && placementType !== 'cosmic_feature') return;
        const areaKey = `${galaxyId}-${placementType}`;

        areaEnemyCounts[areaKey] = (areaEnemyCounts[areaKey] || 0) + 1;
        // Remember this area existed (and how many it started with —
        // require at least 3 so a single straggler doesn't count as
        // a "zone" whose boss should spawn).
        if (!bossSystem.knownAreas[areaKey]) {
            bossSystem.knownAreas[areaKey] = { peak: 0 };
        }
        bossSystem.knownAreas[areaKey].peak = Math.max(
            bossSystem.knownAreas[areaKey].peak, areaEnemyCounts[areaKey]);
    });

    // For every area that has ever held a real cluster, spawn its boss
    // the moment the live count drops to zero.
    Object.keys(bossSystem.knownAreas).forEach(areaKey => {
        if (bossSystem.areaBosses[areaKey]) return;        // boss already handled
        if (bossSystem.knownAreas[areaKey].peak < 3) return; // never a real cluster
        const liveCount = areaEnemyCounts[areaKey] || 0;
        if (liveCount <= bossSystem.bossThreshold) {
            const sep = areaKey.indexOf('-');
            const galaxyId = parseInt(areaKey.slice(0, sep), 10);
            const placementType = areaKey.slice(sep + 1);
            console.log(`👑 Area ${areaKey} cleared — spawning area boss`);
            spawnBossForArea(galaxyId, placementType, areaKey);
            if (typeof showAchievement === 'function') {
                const gname = (typeof galaxyTypes !== 'undefined' && galaxyTypes[galaxyId])
                    ? galaxyTypes[galaxyId].name : ('Galaxy ' + galaxyId);
                const where = placementType === 'black_hole'
                    ? (gname + ' black hole') : (gname + ' patrol zone');
                showAchievement('Boss Incoming!', 'Hostiles cleared at the ' + where + ' — boss warping in!', true);
            }
        }
    });
}

// Per-species boss check: spawn a faction boss when ALL enemies of a
// given sub-species are dead, even if the broader galaxy still has enemies.
// Examples:
//   - All Martian Pirates dead in Sol → Martian Pirate boss spawns at Sol
//   - All Vulcan Patrols dead near Sagittarius A* → Vulcan boss spawns there
function checkSpeciesBossSpawn() {
    if (typeof enemies === 'undefined' || typeof scene === 'undefined') return;
    if (typeof bossSystem === 'undefined') return;

    // Initialize per-species spawn tracking on bossSystem
    if (!bossSystem.speciesBossSpawned) bossSystem.speciesBossSpawned = {};
    // Track whether each species has EVER existed in the world. The
    // enemies array gets spliced when an enemy dies, so by the time the
    // last member of a species is killed and we check, members.length is
    // already 0 — the boss would never spawn. We capture "ever existed"
    // on the first call (when all enemies are still alive) so subsequent
    // checks know the species was real.
    if (!bossSystem.speciesEverExisted) bossSystem.speciesEverExisted = {};
    // Peak roster size per species — the basis for the "majority
    // eliminated" trigger below.
    if (!bossSystem.speciesTotalCount) bossSystem.speciesTotalCount = {};

    const groups = [
        {
            key: 'martianPirate',
            label: 'Martian Pirate',
            galaxyId: 7,
            // Martian Pirates fly Federation/Human-style ships (Enemy1.glb), so
            // their boss should also be a Boss1.glb model rather than the
            // Vulcan Boss8.glb their host galaxyId would imply.
            modelGalaxyId: 0,
            factionLabel: 'Martian Pirate',
            withGuardians: false,
            // A pirate is isMartianPirate=true AND NOT a Vulcan Patrol
            isMember: (ud) => ud.isMartianPirate && !ud.isVulcanPatrol,
            // Spawn near the SOL SYSTEM (localSystemOffset) — NOT the world
            // origin. The origin is Sagittarius A*: spawning there put the
            // pirate boss 9.4k away at the galactic core, where wingmen
            // Beta/Gamma (fighting Vulcans at Sgr A* since game start)
            // could kill it OFF-SCREEN — the decapitation rout then wiped
            // every remaining pirate "at once" with no visible boss fight.
            spawnPos: () => {
                const sol = (typeof window !== 'undefined' && window.localSystemOffset)
                    ? window.localSystemOffset : { x: 8000, y: 0, z: 4800 };
                return new THREE.Vector3(sol.x, sol.y, sol.z);
            }
        },
        {
            key: 'vulcanPatrol',
            label: 'Vulcan High Command',
            galaxyId: 7,
            modelGalaxyId: 7, // Boss8.glb — matches Vulcan Patrol Enemy8.glb
            factionLabel: 'Vulcan High Command',
            withGuardians: true,   // elite guardians appear with the Vulcan boss
            isMember: (ud) => ud.isVulcanPatrol,
            // Spawn near Sagittarius A* (which is at origin)
            spawnPos: () => new THREE.Vector3(0, 0, 0)
        }
    ];

    groups.forEach(g => {
        if (bossSystem.speciesBossSpawned[g.key]) return;
        const members = enemies.filter(e =>
            e.userData && g.isMember(e.userData) &&
            !e.userData.isBoss && !e.userData.isBossSupport
        );
        // Latch "ever existed" + peak roster size while members are alive.
        if (members.length > 0) {
            bossSystem.speciesEverExisted[g.key] = true;
            bossSystem.speciesTotalCount[g.key] =
                Math.max(bossSystem.speciesTotalCount[g.key] || 0, members.length);
        }
        // If we've never seen this species, skip (truly never spawned)
        if (!bossSystem.speciesEverExisted[g.key]) return;

        const total = bossSystem.speciesTotalCount[g.key] || 0;
        const alive = members.filter(e => e.userData.health > 0).length;
        // Boss (and, for Vulcan, the elite guardians) appear TOGETHER once
        // a MAJORITY — 60% — of the species has been eliminated: not at
        // the first kill, not only after the last. Killing the boss then
        // scatters/destroys the remaining stragglers (checkBossVictory).
        if (total <= 0 || alive > Math.ceil(total * 0.4)) return;

        bossSystem.speciesBossSpawned[g.key] = true;
        const areaKey = g.galaxyId + '-' + g.key + '_boss';
        console.log('👑 ' + g.label + ' majority eliminated — spawning boss' +
                    (g.withGuardians ? ' + guardians' : ''));
        spawnBossForArea(g.galaxyId, g.key + '_boss', areaKey, g.spawnPos(), {
            modelGalaxyId: g.modelGalaxyId,
            factionLabel: g.factionLabel
        });
        // Elite guardians deploy alongside the boss (Vulcan only).
        if (g.withGuardians && typeof spawnEliteGuardian === 'function') {
            const faction = (typeof galaxyTypes !== 'undefined' && galaxyTypes[g.galaxyId])
                ? galaxyTypes[g.galaxyId].faction : g.factionLabel;
            spawnEliteGuardian(g.galaxyId, faction, g.spawnPos());
        }
        if (typeof showAchievement === 'function') {
            showAchievement(g.label + (g.withGuardians ? ' Boss & Guardians Incoming!' : ' Boss Incoming!'),
                'The leadership commits to the fight — defeat the boss to scatter the rest!', true);
        }
    });
}

// Galaxy-level boss check: when ALL regular (non-boss, non-guardian) enemies
// in a galaxy are eliminated, spawn the galaxy boss near the galaxy's core
// black hole.  Once the boss is defeated, checkGalaxyClear marks it clear.
function checkGalaxyBossSpawn() {
    if (typeof enemies === 'undefined' || typeof scene === 'undefined') return;
    for (let g = 0; g < 8; g++) {
        if (bossSystem.galaxyBossSpawned[g] || bossSystem.galaxyBossDefeated[g]) continue;
        const alive = enemies.filter(e =>
            e.userData && e.userData.health > 0 &&
            e.userData.galaxyId === g &&
            !e.userData.isBoss && !e.userData.isBossSupport &&
            !e.userData.isBlackHoleGuardian
        );
        if (alive.length === 0) {
            bossSystem.galaxyBossSpawned[g] = true;
            const areaKey = g + '-galaxy_boss';
            console.log('👑 All enemies cleared in Galaxy ' + g + ' — spawning galaxy boss');
            spawnBossForArea(g, 'galaxy_boss', areaKey);
            if (typeof showAchievement === 'function') {
                const name = (typeof galaxyTypes !== 'undefined' && galaxyTypes[g]) ? galaxyTypes[g].name : 'Galaxy ' + g;
                showAchievement('Galaxy Boss Incoming!', name + ' enemies eliminated — boss warping in!');
            }
        }
    }
}

// ENHANCED: Spawn boss for specific area
// `overridePosition` (optional Vector3) — if provided, the boss spawns there
// instead of at a random galaxy position.  Used by the discovery-path
// mission-complete trigger so the boss appears at the dotted line's endpoint.
// `bossOverrides` (optional {modelGalaxyId, factionLabel, color}) — used by
// per-species spawns (e.g. Martian Pirate boss) so the boss can use a model
// and name independent of the galaxyId-driven faction.
function spawnBossForArea(galaxyId, placementType, areaKey, overridePosition, bossOverrides) {
    // Safety check to prevent duplicate boss spawning
    if (bossSystem.areaBosses[areaKey]) return;

    console.log(`🎯 Spawning area boss for ${areaKey} (Galaxy ${galaxyId}, ${placementType})`);

    // Mark boss as spawned for this area
    bossSystem.areaBosses[areaKey] = {
        spawned: true,
        defeated: false,
        bossRef: null
    };

    const galaxyType = galaxyTypes[galaxyId];
    // Per-species overrides — fallback to galaxyId-driven defaults
    const modelGalaxyId = (bossOverrides && typeof bossOverrides.modelGalaxyId === 'number')
        ? bossOverrides.modelGalaxyId : galaxyId;
    const factionLabel = (bossOverrides && bossOverrides.factionLabel) || galaxyType.faction;

    // ENHANCED: Use 3D positioning if available, fallback to 2D
    let bossPosition;

    // Caller-supplied position takes priority — used for discovery-path
    // boss spawns so the boss appears where the player expects it.
    if (overridePosition && typeof overridePosition.clone === 'function') {
        bossPosition = overridePosition.clone();
        console.log(`Boss positioning: Using override position for galaxy ${galaxyId}`, bossPosition);
    }

    // Black-hole-area bosses spawn AT the galaxy's black hole (offset
    // out past the warp threshold) so the player who just cleared the
    // BH defenders sees the boss warp in right there, not somewhere
    // random across the galaxy.
    if (!bossPosition && placementType === 'black_hole' && typeof planets !== 'undefined') {
        const bh = planets.find(p =>
            p.userData && p.userData.type === 'blackhole' &&
            p.userData.galaxyId === galaxyId && !p.userData.isLocalGateway);
        if (bh) {
            const ang = Math.random() * Math.PI * 2;
            const r = (bh.userData.warpThreshold || 600) + 700 + Math.random() * 500;
            bossPosition = new THREE.Vector3(
                bh.position.x + Math.cos(ang) * r,
                bh.position.y + (Math.random() - 0.5) * 400,
                bh.position.z + Math.sin(ang) * r
            );
            console.log(`Boss positioning: black-hole area boss at galaxy ${galaxyId} BH`, bossPosition);
        }
    }

    // Try 3D positioning first
    if (!bossPosition && typeof getRandomPositionInGalaxy3D === 'function') {
        try {
            bossPosition = getRandomPositionInGalaxy3D(galaxyId);
            console.log(`Boss positioning: Using 3D system for galaxy ${galaxyId}`, bossPosition);
        } catch (error) {
            console.warn(`3D boss positioning failed, falling back to 2D:`, error);
            bossPosition = null;
        }
    }
    
    // FALLBACK: Use original 2D positioning system if 3D fails
    if (!bossPosition) {
        const mapPos = galaxyMapPositions[galaxyId];
        
        // PRESERVED: Safety check for undefined mapPos
        if (!mapPos) {
            console.warn(`Cannot spawn boss: No map position for galaxy ${galaxyId}`);
            return;
        }
        
        const universeRadius = 100000; // Increased to accommodate exotic/borg systems (up to 85k units) with margins
        
        const galaxyX = (mapPos.x - 0.5) * universeRadius * 2;
        const galaxyZ = (mapPos.y - 0.5) * universeRadius * 2;
        const galaxyY = (Math.random() - 0.5) * 3000; // PRESERVED: Doubled
        
        bossPosition = new THREE.Vector3(galaxyX, galaxyY, galaxyZ);
        console.log(`Boss positioning: Using 2D fallback for galaxy ${galaxyId}`, bossPosition);
    }
    
    // PRESERVED: Create boss flagship with all original features
    const bossGeometry = createEnemyGeometry(galaxyId); // PRESERVED: Use proper geometry system
    const shapeData = enemyShapes[galaxyId];

    // PRESERVED: Enhanced boss material with all original properties
    const bossMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(shapeData.color).multiplyScalar(1.3), // PRESERVED: 1.3x brighter
        roughness: 0.3,
        metalness: 0.7,
        emissive: new THREE.Color(shapeData.color).multiplyScalar(0.4), // PRESERVED: Strong emissive
        emissiveIntensity: 0.8
    });

    // Try to use 3D boss model first, fallback to geometry (modelGalaxyId+1 because models are 1-8, galaxies are 0-7)
    // Per-species bosses (Martian Pirate) override modelGalaxyId so they use their species' ship rather than the host galaxy's model.
    let boss;
    let bossIsGLB = false;
    if (typeof createBossMeshWithModel === 'function') {
        boss = createBossMeshWithModel(modelGalaxyId + 1, bossGeometry, bossMaterial);
        bossIsGLB = boss.isGroup || (boss.children && boss.children.length > 1);
    } else {
        boss = new THREE.Mesh(bossGeometry, bossMaterial);
        boss.scale.multiplyScalar(2.5); // PRESERVED: Boss scaling (only if using fallback)
    }

    // ENHANCED: Position boss using 3D coordinates
    boss.position.copy(bossPosition);

    // Procedural glow shell — only added when the boss is using fallback
    // geometry. When a GLB model loaded, the glow was a giant torus (or
    // cone/octahedron) floating around the detailed ship model.
    if (!bossIsGLB) {
        const bossGlowGeometry = bossGeometry.clone();
        const bossGlowMaterial = new THREE.MeshBasicMaterial({
            color: shapeData.color,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending
        });
        const bossGlow = new THREE.Mesh(bossGlowGeometry, bossGlowMaterial);
        bossGlow.scale.multiplyScalar(1.3);
        bossGlow.visible = true;
        bossGlow.frustumCulled = false;
        boss.add(bossGlow);
    }

    // (Boss 2× scaling tried 2026-06-10 and reverted same day — at 2× the
    // set-piece read as oversized. Boss presence now comes from the escort
    // swarm + missile volleys / laser sweeps instead.)

    // Calculate hitbox size from scaled model (like asteroids) - bosses are 144x scaled
    let bossHitboxSize = 144; // Default for 144x scaled model
    try {
        const box = new THREE.Box3().setFromObject(boss);
        const size = new THREE.Vector3();
        box.getSize(size);
        bossHitboxSize = Math.max(size.x, size.y, size.z);
    } catch (e) {
        // Use default if calculation fails
    }

    // PRESERVED: Complete boss userData with all original properties
    boss.userData = {
        name: `${factionLabel} Overlord`, // (internal placementType no longer leaked into the display name)
        type: 'enemy',
        health: getEnemyHealthForDifficulty(false, true, false), // PRESERVED: Dynamic boss health
        maxHealth: getEnemyHealthForDifficulty(false, true, false),
        speed: 0.8, // FIXED: Boss speed (800 km/s, within 200-1000 km/s range)
        aggression: 1.0, // PRESERVED: Maximum aggression
        patrolCenter: bossPosition.clone(), // ENHANCED: 3D patrol center
        patrolRadius: 800, // PRESERVED: Boss patrol radius
        lastAttack: 0,
        isActive: true,
        visible: true, // PRESERVED: Ensure boss visibility
        galaxyId: galaxyId,
        galaxyColor: shapeData.color,
        swarmTarget: null,
        circlePhase: Math.random() * Math.PI * 2,
        attackMode: 'boss_engage', // PRESERVED: Boss attack mode
        detectionRange: 4000, // PRESERVED: Boss detection range
        firingRange: 400, // PRESERVED: Boss firing range
        isLocal: false,
        isBoss: true, // PRESERVED: Mark as boss
        isBossSupport: false,
        isEliteGuardian: false, // NEW: Distinguish from elite guardians
        position3D: bossPosition.clone(), // NEW: Store 3D position for reference
        hitboxSize: bossHitboxSize, // Store hitbox size for accurate collision detection
        areaKey: areaKey, // NEW: Track which area this boss belongs to
        placementType: placementType // NEW: Track area type
    };

    // PRESERVED: Ensure boss visibility and prevent frustum culling
    boss.visible = true;
    boss.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling

    scene.add(boss);
    enemies.push(boss);

    // Spawn-in beat: materialize the hull + letterbox name card
    if (typeof materializeShip === 'function') materializeShip(boss, 800);
    if (typeof playBossIntro === 'function') {
        const _bfac = (typeof galaxyTypes !== 'undefined' && galaxyTypes[galaxyId] && galaxyTypes[galaxyId].faction) || null;
        playBossIntro(boss.userData.name, _bfac, boss.userData.galaxyColor);
    }

    // ENHANCED: Update boss system tracking
    bossSystem.areaBosses[areaKey].bossRef = boss;
    bossSystem.activeBosses.push(boss);
    bossSystem.activeBoss = boss; // Keep for backwards compatibility
    
    // Spawn the escort swarm — bumped 3 → 7 so the (now 2×-sized) boss
    // arrives with a proper entourage swirling around it.
    for (let i = 0; i < 7; i++) {
        spawnBossSupport(galaxyId, bossPosition, i, areaKey, bossOverrides);
    }
    
    // PRESERVED: Boss warning and audio systems
    if (typeof showBossWarning === 'function') {
        showBossWarning(boss.userData.name);
    } else {
        console.log(`BOSS SPAWNED: ${boss.userData.name} in ${galaxyType.name} Galaxy!`);
    }

    // PRESERVED: Play boss sound
    if (typeof playSound === 'function') {
        playSound('boss');
    }

    // PRESERVED: Switch to battle music for boss fight
    if (typeof switchToBattleMusic === 'function') {
        switchToBattleMusic();
    }

    // Attract the (demo) player toward the boss the moment it appears — the
    // autopilot consumes this flag and diverts to bossEngage regardless of
    // range (its proximity magnet only reaches 25k).
    if (typeof gameState !== 'undefined') gameState._pendingBossEngage = true;

    console.log(`Boss spawned: ${boss.userData.name} in ${galaxyType.name} Galaxy at 3D position:`, bossPosition);
    return boss;
}

// =============================================================================
// ENHANCED 3D BOSS SUPPORT SPAWNING - PRESERVES ALL ORIGINAL FEATURES
// =============================================================================

function spawnBossSupport(galaxyId, bossPosition, supportIndex, areaKey = null, supportOverrides = null) {
    const galaxyType = galaxyTypes[galaxyId];
    const shapeData = enemyShapes[galaxyId];
    // Per-species overrides so support ships match the boss they escort
    // (e.g. Martian Pirate boss → Martian Pirate Enemy1.glb supports).
    const modelGalaxyId = (supportOverrides && typeof supportOverrides.modelGalaxyId === 'number')
        ? supportOverrides.modelGalaxyId : galaxyId;
    const factionLabel = (supportOverrides && supportOverrides.factionLabel) || galaxyType.faction;

    // PRESERVED: Create support geometry and material
    const supportGeometry = createEnemyGeometry(galaxyId);
    const supportMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(shapeData.color).multiplyScalar(1.1), // PRESERVED: Support coloring
        roughness: 0.4,
        metalness: 0.6,
        emissive: new THREE.Color(shapeData.color).multiplyScalar(0.2),
        emissiveIntensity: 0.5
    });

    // Try to use 3D model first, fallback to geometry (modelGalaxyId+1 because models are 1-8, galaxies are 0-7)
    let support;
    if (typeof createEnemyMeshWithModel === 'function') {
        support = createEnemyMeshWithModel(modelGalaxyId + 1, supportGeometry, supportMaterial);
    } else {
        support = new THREE.Mesh(supportGeometry, supportMaterial);
    }
    
    // ENHANCED: Position around boss in 3D space
    const angle = (supportIndex / 3) * Math.PI * 2;
    const distance = 150 + Math.random() * 100; // PRESERVED: Support positioning distance
    
    // Calculate 3D support position relative to boss
    const supportPosition = bossPosition.clone();
    supportPosition.x += Math.cos(angle) * distance;
    supportPosition.y += (Math.random() - 0.5) * 100; // PRESERVED: Y variation
    supportPosition.z += Math.sin(angle) * distance;
    
    support.position.copy(supportPosition);

    // Calculate hitbox size from scaled model (like asteroids) - supports are 96x scaled
    let supportHitboxSize = 96; // Default for 96x scaled model
    try {
        const box = new THREE.Box3().setFromObject(support);
        const size = new THREE.Vector3();
        box.getSize(size);
        supportHitboxSize = Math.max(size.x, size.y, size.z);
    } catch (e) {
        // Use default if calculation fails
    }

    // PRESERVED: Complete support userData with all original properties
    support.userData = {
        name: `${factionLabel} Support ${supportIndex + 1}`, // PRESERVED: Support naming
        type: 'enemy',
        health: getEnemyHealthForDifficulty(false, false, true), // PRESERVED: Support health
        maxHealth: getEnemyHealthForDifficulty(false, false, true),
        speed: 0.7, // FIXED: Support speed (700 km/s, within 200-1000 km/s range)
        aggression: 0.9, // PRESERVED: Support aggression
        patrolCenter: supportPosition.clone(), // ENHANCED: 3D patrol center
        patrolRadius: distance,
        lastAttack: 0,
        isActive: true,
        visible: true,
        galaxyId: galaxyId,
        galaxyColor: shapeData.color,
        swarmTarget: null,
        circlePhase: Math.random() * Math.PI * 2,
        attackMode: 'support', // PRESERVED: Support attack mode
        detectionRange: 3500, // PRESERVED: Support detection range
        firingRange: 350, // PRESERVED: Support firing range
        isLocal: false,
        isBoss: false,
        isBossSupport: true, // PRESERVED: Mark as boss support
        isEliteGuardian: false, // NEW: Distinguish from elite guardians
        position3D: supportPosition.clone(), // NEW: Store 3D position
        hitboxSize: supportHitboxSize, // Store hitbox size for accurate collision detection
        areaKey: areaKey // NEW: Track which area this support belongs to
    };
    
    // PRESERVED: Ensure support visibility and prevent frustum culling
    support.visible = true;
    support.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
    
    scene.add(support);
    enemies.push(support);
    if (typeof materializeShip === 'function') materializeShip(support, 600);
    
    console.log(`Boss support spawned: ${support.userData.name} at 3D position:`, supportPosition);
}

// =============================================================================
// SAGITTARIUS A* LIBERATION — gates black-hole warp range until the two
// local set-piece bosses (Martian Pirate + Vulcan High Command) are dead.
// On liberation: galaxy-wide black-hole warping unlocks (the warp picker
// reads isSolSystemLiberated() live) and a white dotted line is drawn to
// the nearest twin nebula.
// =============================================================================
function isSolSystemLiberated() {
    // Galaxy-wide black-hole warping unlocks once the VULCAN boss (the
    // Sagittarius A* set-piece) is defeated — the Martian Pirate boss is
    // no longer required for the gate.
    if (typeof bossSystem === 'undefined' || !bossSystem.areaBosses) return false;
    const vp = bossSystem.areaBosses['7-vulcanPatrol_boss'];
    return !!(vp && vp.defeated);
}
if (typeof window !== 'undefined') window.isSolSystemLiberated = isSolSystemLiberated;

// Destroy every still-alive enemy matching `predicate` (used to scatter
// a species when its boss dies). Skips other bosses/support. Returns the
// count removed.
function eliminateRemainingSpecies(predicate) {
    if (typeof enemies === 'undefined') return 0;
    let removed = 0;
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (!e || !e.userData || e.userData.health <= 0) continue;
        if (e.userData.isBoss || e.userData.isBossSupport) continue;
        if (!predicate(e.userData)) continue;
        e.userData.health = 0;
        const pos = e.position;
        if (typeof createExplosionEffect === 'function') { try { createExplosionEffect(pos); } catch (_) {} }
        else if (typeof createFactionExplosion === 'function') { try { createFactionExplosion(pos, e.userData.galaxyId, 0.6); } catch (_) {} }
        if (typeof scene !== 'undefined' && scene.remove) scene.remove(e);
        enemies.splice(i, 1);
        removed++;
    }
    return removed;
}
if (typeof window !== 'undefined') window.eliminateRemainingSpecies = eliminateRemainingSpecies;

// Centre of the nearest paired/clustered ("twin") nebula to `fromPos`.
function findNearestTwinNebulaCenter(fromPos) {
    if (typeof nebulaClouds === 'undefined' || !nebulaClouds.length || typeof THREE === 'undefined') return null;
    const clusters = {};
    for (let i = 0; i < nebulaClouds.length; i++) {
        const n = nebulaClouds[i];
        if (!n || !n.userData) continue;
        if (n.userData.isDistant || n.userData.isExoticCore) continue;
        const ci = n.userData.cluster;
        if (ci === undefined || ci === null) continue;
        (clusters[ci] = clusters[ci] || []).push(n);
    }
    let best = null, bestDist = Infinity;
    for (const ci in clusters) {
        const pair = clusters[ci];
        if (pair.length < 2) continue;   // only true twins
        const center = new THREE.Vector3();
        pair.forEach(n => center.add(n.position));
        center.divideScalar(pair.length);
        const d = fromPos.distanceTo(center);
        if (d < bestDist) { bestDist = d; best = center; }
    }
    return best;
}

// Draw a persistent white dashed line from Sgr A* to the nearest twin
// nebula, guiding the freshly-liberated player onward.
function showLiberationPathToTwinNebula() {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;
    if (typeof window !== 'undefined' && window.liberationNebulaPath) return; // once
    const fromPos = new THREE.Vector3(0, 0, 0); // Sagittarius A*
    const target = findNearestTwinNebulaCenter(fromPos);
    if (!target) { console.warn('🌌 Liberation: no twin nebula found for path'); return; }
    const geom = new THREE.BufferGeometry().setFromPoints([fromPos, target]);
    // Direction gradient (PewPew-style): dimmer at Sgr A*, full white at
    // the twin nebula — brightness ramps toward where the player should
    // fly. Floor 0.45 (was 0.25) so the near end still clearly reads as
    // THE WHITE LINE when standing at Sgr A*.
    geom.setAttribute('color', new THREE.BufferAttribute(
        new Float32Array([0.45, 0.45, 0.45, 1, 1, 1]), 3));
    const mat = new THREE.LineDashedMaterial({
        color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.85,
        dashSize: 140, gapSize: 100, depthWrite: false
    });
    const line = new THREE.Line(geom, mat);
    line.computeLineDistances();
    line.frustumCulled = false;
    line.renderOrder = 60;
    line.name = 'LiberationTwinNebulaPath';
    scene.add(line);
    if (typeof window !== 'undefined') window.liberationNebulaPath = line;
    console.log('🌌 Liberation path to nearest twin nebula drawn');
}

function maybeTriggerSolLiberation() {
    if (typeof bossSystem === 'undefined') return;
    if (bossSystem._solLiberationFired) return;
    if (!isSolSystemLiberated()) return;
    bossSystem._solLiberationFired = true;
    showLiberationPathToTwinNebula();
    if (typeof showAchievement === 'function') {
        showAchievement('Sagittarius A* Liberated!',
            'Black holes now warp you galaxy-wide. Follow the white path to the nearest twin nebula.', true);
    }
    if (typeof playGalaxyVictoryMusic === 'function') {
        try { playGalaxyVictoryMusic(); } catch (e) {}
    }
}
if (typeof window !== 'undefined') window.maybeTriggerSolLiberation = maybeTriggerSolLiberation;

// =============================================================================
// ENHANCED BOSS VICTORY SYSTEM - PRESERVES ALL ORIGINAL FEATURES
// =============================================================================

function checkBossVictory(defeatedEnemy) {
    // Handle both area bosses and elite guardians
    if (!defeatedEnemy.userData.isBoss && !defeatedEnemy.userData.isEliteGuardian) return false;

    const galaxyId = defeatedEnemy.userData.galaxyId;
    const areaKey = defeatedEnemy.userData.areaKey;
    const faction = defeatedEnemy.userData.faction || galaxyTypes[galaxyId].faction;

    if (defeatedEnemy.userData.isEliteGuardian) {
        // ELITE GUARDIAN DEFEATED
        console.log(`🏆 Elite Guardian defeated: ${defeatedEnemy.userData.name} (${faction})`);

        if (typeof window !== 'undefined' && window.replaySystem) {
            window.replaySystem.record('Felled the ' + faction + ' Elite Guardian', 2);
        }

        // Mark elite guardian as defeated
        if (bossSystem.eliteGuardians[faction]) {
            bossSystem.eliteGuardians[faction].defeated = true;
        }

        // Remove from active bosses list
        const bossIndex = bossSystem.activeBosses.indexOf(defeatedEnemy);
        if (bossIndex > -1) {
            bossSystem.activeBosses.splice(bossIndex, 1);
        }

        // Show victory message. NOTE: this is ONE guardian (there is
        // exactly one Elite Guardian per faction). The old copy said
        // "Hostile Forces have been Eliminated!" which made it read as
        // though every enemy had just died — misleading. Keep it
        // specific to this single defender.
        if (typeof showAchievement === 'function') {
            showAchievement('Elite Guardian Eliminated!',
                `${defeatedEnemy.userData.name} (${faction}) has fallen — that faction's last defender is down.`);
        }

        // A guardian dying may complete a deferred "sector neutralized"
        // banner for its galaxy.
        if (typeof flushFactionClearedMessages === 'function') {
            setTimeout(flushFactionClearedMessages, 60);
        }

        return true;

    } else if (defeatedEnemy.userData.isBoss) {
        // AREA BOSS DEFEATED
        console.log(`🎯 Area Boss defeated: ${defeatedEnemy.userData.name} (${areaKey})`);

        // Victory-replay highlight: boss kills are prime montage material
        if (typeof window !== 'undefined' && window.replaySystem) {
            window.replaySystem.record('Destroyed ' + (defeatedEnemy.userData.name || 'a flagship'), 3);
        }

        // Mark area boss as defeated
        if (areaKey && bossSystem.areaBosses[areaKey]) {
            bossSystem.areaBosses[areaKey].defeated = true;
        }

        // Mark THIS GALAXY's boss as defeated. This is the single flag
        // checkGalaxyClear() and checkGuardianVictory() gate on, but
        // nothing ever set it: checkGalaxyClear only set it behind its
        // own `bossDefeated` precondition (a deadlock with itself), so
        // galaxyBossDefeated[g] stayed false forever and galaxiesCleared
        // never incremented even after every guardian was destroyed.
        if (bossSystem.galaxyBossDefeated &&
            typeof galaxyId === 'number' && galaxyId >= 0 && galaxyId < 8) {
            bossSystem.galaxyBossDefeated[galaxyId] = true;
        }

        // Decapitation: killing a species boss scatters/destroys its
        // remaining rank-and-file. Detect the species from the boss's
        // areaKey ('7-vulcanPatrol_boss' / '7-martianPirate_boss').
        const _ak = defeatedEnemy.userData.areaKey || areaKey || '';
        if (_ak.indexOf('vulcanPatrol') >= 0 && typeof eliminateRemainingSpecies === 'function') {
            const n = eliminateRemainingSpecies(ud => ud.isVulcanPatrol);
            if (typeof showAchievement === 'function') {
                showAchievement('Vulcan High Command Routed',
                    `Their leader is dead — ${n} remaining ship${n === 1 ? '' : 's'} scattered and destroyed.`, true);
            }
        } else if (_ak.indexOf('martianPirate') >= 0 && typeof eliminateRemainingSpecies === 'function') {
            const n = eliminateRemainingSpecies(ud => ud.isMartianPirate && !ud.isVulcanPatrol);
            if (typeof showAchievement === 'function') {
                showAchievement('Martian Pirates Routed',
                    `Their leader is dead — ${n} remaining raider${n === 1 ? '' : 's'} scattered and destroyed.`, true);
            }
        } else if (typeof galaxyId === 'number' && galaxyId !== 7 &&
                   typeof eliminateRemainingSpecies === 'function') {
            // FACTION COLLAPSE: a dead flagship takes its faction's
            // remaining rank-and-file with it — their ships detonate
            // across the galaxy (same treatment the local Vulcan/Martian
            // species get above). Boss escorts are spared here; they're
            // demoted to regular hostiles below and fight on.
            const n = eliminateRemainingSpecies(ud => ud.galaxyId === galaxyId);
            if (n > 0 && typeof showAchievement === 'function') {
                const facName = (typeof galaxyTypes !== 'undefined' && galaxyTypes[galaxyId])
                    ? galaxyTypes[galaxyId].faction : 'Enemy';
                showAchievement(facName + ' Collapse',
                    `Their flagship is down — ${n} remaining ship${n === 1 ? '' : 's'} destroyed in the rout.`, true);
            }
        }

        // Defeating the Vulcan (Sgr A*) boss liberates the system and
        // unlocks galaxy-wide black-hole warping + the twin-nebula path.
        if (typeof maybeTriggerSolLiberation === 'function') {
            maybeTriggerSolLiberation();
        }

        // Remove from active bosses list
        const bossIndex = bossSystem.activeBosses.indexOf(defeatedEnemy);
        if (bossIndex > -1) {
            bossSystem.activeBosses.splice(bossIndex, 1);
        }

        // Update legacy tracking for backwards compatibility
        if (bossSystem.activeBoss === defeatedEnemy) {
            bossSystem.activeBoss = null;
        }

        // Boss escorts DO NOT instantly vanish when the boss dies — that
        // made it look like "all the enemies disappeared the moment the
        // boss died". Instead they're demoted to regular hostiles: they
        // keep flying and fighting and must be cleared individually.
        // Clearing the isBossSupport flag also lets the normal
        // area-clear / galaxy-clear logic count them again.
        const supportShips = enemies.filter(enemy =>
            enemy.userData.isBossSupport &&
            enemy.userData.areaKey === areaKey &&
            enemy.userData.health > 0
        );

        supportShips.forEach(support => {
            support.userData.isBossSupport = false;
            support.userData.attackMode = 'pursue';
            support.userData.isActive = true;
            // Keep them in the same galaxy/area so area-clear still works.
            if (support.userData.galaxyId === undefined) {
                support.userData.galaxyId = galaxyId;
            }
        });

        console.log(`Boss victory: Defeated ${defeatedEnemy.userData.name}; ${supportShips.length} escorts demoted to regular hostiles in area ${areaKey}`);

        // Wingmen rally around the player in a victory orbit before
        // resuming patrol / heading to the next nebula.
        if (typeof triggerWingmanCelebration === 'function') {
            triggerWingmanCelebration();
        }

        // Check if we should spawn elite guardians now
        checkAndSpawnEliteGuardians();

        // The boss dying completes the "FORCES NEUTRALIZED" banner for
        // this faction. Black-hole galaxies are lazy-loaded AFTER
        // createEnemyClusters() runs, so they have NO clusters and
        // checkFactionCleared() never deferred a banner — which is why
        // it never appeared. Synthesize the pending entry here so it
        // fires on every boss clear. flushFactionClearedMessages() still
        // guards on the boss being spawned + no guardian alive and
        // dedups via clearedAnnounced (shows once per galaxy).
        if (typeof galaxyId === 'number' && galaxyId >= 0 &&
            typeof galaxyTypes !== 'undefined' && galaxyTypes[galaxyId] &&
            typeof nebulaIntelSystem !== 'undefined') {
            if (!nebulaIntelSystem.pendingCleared) nebulaIntelSystem.pendingCleared = {};
            if (!nebulaIntelSystem.clearedAnnounced) nebulaIntelSystem.clearedAnnounced = {};
            if (!nebulaIntelSystem.pendingCleared[galaxyId] &&
                !nebulaIntelSystem.clearedAnnounced[galaxyId]) {
                const _fac = galaxyTypes[galaxyId];
                let _nbName = 'nearest nebula';
                if (galaxyId === 7) {
                    // Local system: direct to the white liberation path,
                    // not the arbitrary round-robin "tracking" nebula.
                    _nbName = 'the twin nebulas marked by the white path';
                } else if (typeof nebulaClouds !== 'undefined') {
                    const _nb = nebulaClouds.find(n => n && n.userData &&
                        n.userData.assignedFaction === galaxyId);
                    if (_nb) _nbName = _nb.userData.name;
                }
                nebulaIntelSystem.pendingCleared[galaxyId] =
                    { faction: _fac, nebulaName: _nbName, galaxyId: galaxyId };
            }
        }
        if (typeof flushFactionClearedMessages === 'function') {
            setTimeout(flushFactionClearedMessages, 120);
        }

        return true;
    }

    return false;
}
// =============================================================================
// ELITE GUARDIAN SPAWNING SYSTEM - UNIVERSE-WIDE SPECIES ELIMINATION
// =============================================================================

// Record where an enemy was killed (for elite guardian spawning)
function recordEnemyKillPosition(enemy) {
    if (!enemy || !enemy.userData) return;
    
    const galaxyId = enemy.userData.galaxyId;
    if (galaxyId === undefined || !galaxyTypes[galaxyId]) return;
    
    const faction = galaxyTypes[galaxyId].faction;
    
    // Store the kill position for this faction
    lastKillPositions[faction] = enemy.position.clone();
    // Per-kill log silenced (spammy during demo combat)
}

function checkAndSpawnEliteGuardians() {
    if (typeof enemies === 'undefined' || typeof scene === 'undefined') return;

    // Track enemy counts by faction/species across ALL galaxies
    const factionCounts = {};

    enemies.forEach(enemy => {
        if (!enemy.userData || enemy.userData.health <= 0) return;
        if (enemy.userData.isBoss || enemy.userData.isBossSupport || enemy.userData.isEliteGuardian) return;

        // Skip factionless hostiles (UFOs use galaxyId -1, etc.) — they
        // don't belong to any galaxy species, so galaxyTypes[galaxyId]
        // is undefined and they must not count toward elite-guardian
        // species elimination.
        const galaxyId = enemy.userData.galaxyId;
        const gt = galaxyTypes[galaxyId];
        if (!gt) return;
        const faction = gt.faction;

        factionCounts[faction] = (factionCounts[faction] || 0) + 1;
    });

    // Check each faction - spawn elite guardian if species is completely eliminated
    Object.keys(galaxyTypes).forEach(galaxyId => {
        const faction = galaxyTypes[galaxyId].faction;
        const count = factionCounts[faction] || 0;

        // Check if elite guardian already spawned or defeated
        if (bossSystem.eliteGuardians[faction]) return;

        // Spawn elite guardian when ALL enemies of this species are eliminated universe-wide
        if (count === 0) {
            console.log(`🌌 Species ${faction} completely eliminated! Spawning Elite Guardian...`);
            // Use the last kill position if available, otherwise use galaxy center
            const spawnPos = lastKillPositions[faction] || null;
            spawnEliteGuardian(parseInt(galaxyId), faction, spawnPos);
        }
    });
}

function spawnEliteGuardian(galaxyId, faction, spawnPosition = null) {
    // Safety check
    if (bossSystem.eliteGuardians[faction]) return;

    console.log(`👑 Spawning Elite Guardian for faction: ${faction} (Galaxy ${galaxyId})`);

    // Mark elite guardian as spawned
    bossSystem.eliteGuardians[faction] = {
        spawned: true,
        defeated: false,
        guardianRef: null
    };

    const galaxyType = galaxyTypes[galaxyId];

    // Use provided spawn position (where last enemy was killed) or fallback to galaxy center
    const guardianPosition = spawnPosition ? spawnPosition.clone() : getGalaxy3DPosition(galaxyId);
    console.log(`📍 Elite Guardian spawning at ${spawnPosition ? 'last kill position' : 'galaxy center'}:`, guardianPosition);

    const guardianGeometry = createEnemyGeometry(galaxyId);
    const shapeData = enemyShapes[galaxyId];

    // Elite guardian material - much brighter and more intimidating
    const guardianMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(shapeData.color).multiplyScalar(1.8), // 1.8x brighter than boss
        roughness: 0.2,
        metalness: 0.9,
        emissive: new THREE.Color(shapeData.color).multiplyScalar(0.8), // Very strong emissive
        emissiveIntensity: 1.2
    });

    // Use boss model but with extra scaling - 200x (larger than bosses at 144x)
    let guardian;
    let guardianIsGLB = false;
    if (typeof createBossMeshWithModel === 'function') {
        guardian = createBossMeshWithModel(galaxyId + 1, guardianGeometry, guardianMaterial);
        guardianIsGLB = guardian.isGroup || (guardian.children && guardian.children.length > 1);
        // Apply additional scaling for elite guardian (200x total = 80% of original 250x)
        guardian.scale.multiplyScalar(200.0 / 144.0); // Scale up from boss size
    } else {
        guardian = new THREE.Mesh(guardianGeometry, guardianMaterial);
        guardian.scale.multiplyScalar(3.5); // Larger than regular boss
    }

    guardian.position.copy(guardianPosition);

    // Procedural glow shell — skip when GLB loaded (same fix as boss)
    if (!guardianIsGLB) {
        const guardianGlowGeometry = guardianGeometry.clone();
        const guardianGlowMaterial = new THREE.MeshBasicMaterial({
            color: shapeData.color,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        const guardianGlow = new THREE.Mesh(guardianGlowGeometry, guardianGlowMaterial);
        guardianGlow.scale.multiplyScalar(1.5);
        guardianGlow.visible = true;
        guardianGlow.frustumCulled = false;
        guardian.add(guardianGlow);
    }

    // Calculate hitbox size
    let guardianHitboxSize = 200; // Default for 200x scaled model
    try {
        const box = new THREE.Box3().setFromObject(guardian);
        const size = new THREE.Vector3();
        box.getSize(size);
        guardianHitboxSize = Math.max(size.x, size.y, size.z);
    } catch (e) {
        // Use default if calculation fails
    }

    // Elite guardian userData
    guardian.userData = {
        name: `${faction} ELITE GUARDIAN`,
        type: 'enemy',
        health: getEnemyHealthForDifficulty(false, true, false) * 2, // 2x boss health
        maxHealth: getEnemyHealthForDifficulty(false, true, false) * 2,
        speed: 1.0, // FIXED: Elite guardian speed (1000 km/s max, faster than bosses at 800 km/s)
        aggression: 1.0,
        patrolCenter: guardianPosition.clone(),
        patrolRadius: 1200, // Larger patrol radius
        lastAttack: 0,
        isActive: true,
        visible: true,
        galaxyId: galaxyId,
        galaxyColor: shapeData.color,
        swarmTarget: null,
        circlePhase: Math.random() * Math.PI * 2,
        attackMode: 'elite_engage',
        detectionRange: 6000, // Larger detection range
        firingRange: 600, // Longer firing range
        isLocal: false,
        isBoss: false,
        isBossSupport: false,
        isEliteGuardian: true, // Mark as elite guardian
        faction: faction,
        position3D: guardianPosition.clone(),
        hitboxSize: guardianHitboxSize
    };

    guardian.visible = true;
    guardian.frustumCulled = true;

    scene.add(guardian);
    enemies.push(guardian);

    // Update tracking
    bossSystem.eliteGuardians[faction].guardianRef = guardian;
    bossSystem.activeBosses.push(guardian);

    // Show warning — and fade any praise text so it's readable
    if (typeof window.clearArcadePraise === 'function') {
        window.clearArcadePraise();
    }
    if (typeof showBossWarning === 'function') {
        showBossWarning(`⚠️ ${guardian.userData.name} ⚠️`);
    }

    // Play boss sound
    if (typeof playSound === 'function') {
        playSound('boss');
    }

    // Show achievement
    if (typeof showAchievement === 'function') {
        showAchievement('ELITE GUARDIAN DEPLOYED!',
            `The last defender of ${faction} has arrived! This is their final stand!`);
    }

    console.log(`Elite Guardian spawned: ${guardian.userData.name} at`, guardianPosition);
    return guardian;
}

// =============================================================================
// PLANET AND STAR GENERATION FUNCTIONS
// =============================================================================

function generatePlanetName(galaxyId) {
    const galaxy = galaxyTypes[galaxyId];
    const isStarTrek = ['Federation', 'Klingon Empire', 'Romulan Star Empire', 'Cardassian Union', 'Vulcan High Command'].includes(galaxy.faction);
    const planetList = isStarTrek ? starTrekPlanets : starWarsPlanets;
    const baseName = planetList[Math.floor(Math.random() * planetList.length)];
    const suffix = Math.random() > 0.7 ? ' ' + (Math.floor(Math.random() * 20) + 1) : '';
    return baseName + suffix;
}


// =============================================================================
// GARGANTUA-STYLE BLACK HOLE VISUALS
// =============================================================================
// The reference look (Interstellar / EHT images) is a black shadow with a
// bright "photon ring" that appears to wrap up over the top and down under
// the bottom of the sphere, plus a warm accretion disk receding to the
// sides. True gravitational lensing is a per-pixel raymarch — far too
// expensive here (mobile already struggles). Instead we fake it with two
// cheap, shader-free pieces:
//
//   1. A camera-facing Sprite whose texture is a transparent core (the
//      black sphere shows through as the shadow), a sharp bright photon
//      ring, then a warm glow falloff. Because a Sprite always faces the
//      camera, the bright ring automatically wraps over/under the sphere
//      from EVERY angle — exactly the silhouette in the reference images,
//      with zero per-frame JS.
//   2. A wide flat gradient disk (RingGeometry) in the equatorial plane,
//      which the existing animate() loop already keeps flat — viewed
//      edge-on it reads as the bright bar through the middle, and from
//      above as the receding disk.
//
// Canvas textures are cached per color so 10+ black holes share a few.
const _gargantuaTexCache = {};

// The accretion disk is a RingGeometry(radius*DISK_IN_K, radius*DISK_OUT_K).
// r128's RingGeometry UVs are a SQUARE projection — uv = (vertex.xy /
// outerRadius + 1) / 2 — so texture radius 0.5 is the ring's OUTER rim and
// texture radius 0.5 * (inner/outer) is its INNER lip. Both texture builders
// below depend on that ratio, so it lives here as the single source of truth.
const _GARG_DISK_IN_K = 1.05;
const _GARG_DISK_OUT_K = 4.0;
const _GARG_DISK_RATIO = _GARG_DISK_IN_K / _GARG_DISK_OUT_K;   // 0.2625

function _gsmooth(a, b, x) {
    let t = (x - a) / (b - a);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
}

function _gargantuaGlowTexture(color) {
    const key = 'g' + color;
    if (_gargantuaTexCache[key]) return _gargantuaTexCache[key];
    const c = new THREE.Color(color);
    const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255);
    const size = 512, cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const cx = size / 2;
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    // The sprite is sized so texture-radius 1.0 == radius * 3.1, i.e. the
    // black sphere's silhouette lands at 1/3.1 = 0.3226. Everything inside
    // that is occluded by the sphere's own depth, so the photon ring has to
    // sit just OUTSIDE it or it gets eaten.
    grad.addColorStop(0.00, 'rgba(0,0,0,0)');
    grad.addColorStop(0.314, 'rgba(0,0,0,0)');
    // PHOTON RING — a razor-thin, blown-out white band at ~1.05x the shadow
    // radius. Measured in-game, the previous profile still read as a fat grey
    // halo: it held 0.42 alpha out to 0.362 and then carried a warm tail at
    // 0.17 → 0.012 ALL THE WAY to the sprite rim (texture radius 1.0 == 3.1
    // black-hole radii), so ~85% of the sprite's area was painting a low-alpha
    // wash. Additive, over-range, and stacked over the jets, that wash is what
    // dominated: the ring itself was a thin bright line lost inside a grey disc
    // three times the width of the hole.
    //
    // Now: a 0.012-wide spike that clips to white, a short warm shoulder, one
    // faint second-order arc, and a tail that is GONE by 0.60 (1.9 radii).
    grad.addColorStop(0.3225, 'rgba(255,255,255,0.00)');
    grad.addColorStop(0.3345, 'rgba(255,255,255,1.00)');
    grad.addColorStop(0.3420, 'rgba(255,250,238,0.62)');
    grad.addColorStop(0.3520, `rgba(${Math.min(255,r+110)},${Math.min(255,g+80)},${Math.min(255,b+40)},0.22)`);
    grad.addColorStop(0.3700, `rgba(${r},${Math.min(255,g+24)},${b},0.075)`);
    // Second-order lensed arc — light that looped the hole one extra time.
    // Faint, but it is the detail that sells "this is bent spacetime".
    grad.addColorStop(0.3960, `rgba(${r},${Math.round(g*0.85)},${b},0.030)`);
    grad.addColorStop(0.4075, 'rgba(255,244,226,0.155)');
    grad.addColorStop(0.4190, `rgba(${r},${Math.round(g*0.8)},${b},0.028)`);
    // Short warm bleed so the ring doesn't step from full brightness to
    // background in a handful of pixels — but it dies inside two radii
    // instead of glazing the whole sprite.
    grad.addColorStop(0.470, `rgba(${r},${Math.round(g*0.66)},${Math.round(b*0.55)},0.042)`);
    grad.addColorStop(0.540, `rgba(${r},${Math.round(g*0.55)},${Math.round(b*0.44)},0.014)`);
    grad.addColorStop(0.620, `rgba(${r},${Math.round(g*0.48)},${Math.round(b*0.38)},0.0)`);
    grad.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    _gargantuaTexCache[key] = tex;
    return tex;
}

// DOPPLER-BEAMED ACCRETION DISK — HDR EMISSIVE PROFILE.
//
// History: the first version put its white-hot lip at texture offset 0.50 —
// which, per the UV note above, is the disk's OUTER rim, with everything
// from 0.00 to 0.46 fully transparent, i.e. a bright hoop at the far edge
// and a hollow middle: the exact inverse of an accretion disk. The second
// built the profile in the right space but painted it as an LDR texture on
// an LDR material, so the hottest matter in the universe topped out around
// 64% screen brightness and its ~13:1 beaming ratio got squashed into a few
// levels of 8-bit alpha. Both read as a flat plastic hoop.
//
// This version treats the disk as an HDR emitter and lets the tone mapper
// do the clipping (atmospheric-perspective.js switches the renderer to
// ACESFilmic, and the material below carries a >1 colour multiplier):
//
//   • `over` is the physical emission in units where 1.0 == "just saturating
//     the framebuffer". It routinely reaches 6 near the beamed ISCO lip.
//     Alpha saturates there, and the EXCESS is spent whitening the colour —
//     so the photon-ring edge genuinely clips to white and rolls off into
//     the ring's own colour, instead of stopping dead at 8-bit alpha.
//   • The colour is a three-stop temperature ramp (deep ember → the hole's
//     own hue → white-hot) driven by a T ~ r^-3/4-ish radial term MULTIPLIED
//     by the Doppler factor, so there is both an inner-hot/outer-cool radial
//     gradient AND an approaching-vs-receding split, not just a brightness
//     difference.
//   • Beaming is ^2.8 for a ~30:1 limb ratio (real Doppler factor D^3-4 for
//     a disk this deep in the potential), so the two limbs of the ring are
//     unmistakably different objects on screen.
//   • The outer feather now starts at t=0.50 instead of 0.74, so the disk
//     dissolves over half its width — that's the "glow bleed" that keeps the
//     edge from stepping from background to full ring in under 10 pixels.
function _gargantuaDiskTexture(color) {
    const key = 'd' + color;
    if (_gargantuaTexCache[key]) return _gargantuaTexCache[key];
    const c = new THREE.Color(color);
    const br = c.r * 255, bg = c.g * 255, bb = c.b * 255;
    const size = _isMobileRenderTier() ? 256 : 384;

    // Temperature ramp stops. Ember = the hole's hue crushed down to a dull
    // red-shifted coal; mid = its own colour at full chroma; hot = the
    // slightly warm white a real ISCO lip photographs as.
    const emR = br * 0.62, emG = bg * 0.17, emB = bb * 0.11;
    const miR = Math.min(255, br * 1.02 + 14), miG = Math.min(255, bg * 0.82 + 24), miB = Math.min(255, bb * 0.62 + 10);
    const hoR = 255, hoG = 250, hoB = 240;

    const src = document.createElement('canvas');
    src.width = src.height = size;
    const sctx = src.getContext('2d');
    const img = sctx.createImageData(size, size);
    const data = img.data;
    const RIN = _GARG_DISK_RATIO;

    for (let y = 0; y < size; y++) {
        const dy = (y + 0.5) / size - 0.5;
        for (let x = 0; x < size; x++) {
            const dx = (x + 0.5) / size - 0.5;
            const rr = 2 * Math.sqrt(dx * dx + dy * dy);   // 1.0 == outer rim
            const i = (y * size + x) * 4;
            if (rr > 1.0 || rr < RIN) { data[i + 3] = 0; continue; }

            const t = (rr - RIN) / (1 - RIN);              // 0 inner lip → 1 rim
            const ang = Math.atan2(dy, dx);

            // Radial emission profile: a blown-out ISCO lip riding a
            // T^-3/4-ish falloff, feathered out well before the geometric
            // rim so the disk dissolves into the dark rather than ending on
            // a hard circle.
            const lipT = t / 0.065;
            const lip = Math.exp(-lipT * lipT);
            let prof = Math.pow(1 - t, 2.0) * 0.90 + lip * 1.55;
            prof *= 1 - _gsmooth(0.50, 1.0, t);

            // RELATIVISTIC BEAMING. dop == 1 on the approaching limb, 0 on
            // the receding one.
            const dop = 0.5 + 0.5 * Math.cos(ang);
            const beam = 0.085 + 2.75 * Math.pow(dop, 2.8);   // ~33:1

            // Orbiting filaments — fine angular striations, strongest near
            // the hot inner edge where the shear is worst.
            const fil = 0.82 + 0.18 * Math.sin(ang * 9 + t * 26) * (1 - t * 0.7);

            // HDR emission, in "1.0 == saturating" units.
            const over = prof * beam * fil;
            if (over <= 0.004) { data[i + 3] = 0; continue; }

            // Alpha saturates; the overexposure above 1 is spent on
            // whitening, which is what "clips to white at the photon ring"
            // actually looks like on a tone-mapped display.
            //
            // THRESHOLD MATTERS MORE THAN THE CURVE. The previous knee sat at
            // over=0.62 with a 1.05 span, i.e. anything past over≈1.7 came out
            // pure white — and the beamed limb runs 2.8x the base profile, so
            // most of the approaching HALF of the disk was above that. The
            // texture was then multiplied by an over-range 2.6 tint and
            // additively blended, which took "mostly white" to "flat grey-white
            // slab" on screen: measured in-game, the disk read as a featureless
            // grey wash with no hue at all. The knee now sits at 2.4 with a 2.6
            // span, so the disk BODY keeps its ember→orange ramp and only the
            // genuinely overexposed inner lip clips out.
            const alpha = over > 1 ? 1 : over;
            let w = (over - 2.4) / 2.6;
            w = w < 0 ? 0 : (w > 1 ? 1 : w);

            // TEMPERATURE = radial falloff × Doppler blueshift. This is the
            // term that gives the disk BOTH gradients at once.
            let h = Math.pow(1 - t, 0.85) * (0.30 + 0.78 * Math.pow(dop, 1.15));
            h = h < 0 ? 0 : (h > 1 ? 1 : h);

            let R, G, B;
            if (h < 0.55) {
                const u = h / 0.55;
                R = emR + (miR - emR) * u;
                G = emG + (miG - emG) * u;
                B = emB + (miB - emB) * u;
            } else {
                const u = (h - 0.55) / 0.45;
                R = miR + (hoR - miR) * u;
                G = miG + (hoG - miG) * u;
                B = miB + (hoB - miB) * u;
            }
            // The ISCO lip's own whitening is likewise gated: `lip` is a
            // gaussian that is still ~0.5 a third of the way out, so
            // `lip * 1.25` bleached a broad inner band. Only the core of the
            // gaussian (lip > 0.45, i.e. the innermost ~8% of the disk width)
            // is allowed to go white — that is the THIN hot lip.
            const wh = Math.max(w, Math.min(1, Math.max(0, lip - 0.45) * 2.0));
            R = R + (255 - R) * wh;
            G = G + (250 - G) * wh;
            B = B + (242 - B) * wh;

            data[i] = R > 255 ? 255 : R;
            data[i + 1] = G > 255 ? 255 : G;
            data[i + 2] = B > 255 ? 255 : B;
            data[i + 3] = alpha * 255;
        }
    }
    sctx.putImageData(img, 0, 0);

    // One soft pass so the filaments and the ISCO lip read as plasma rather
    // than as aliased pixels when the disk fills the screen.
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.filter = `blur(${Math.max(1, size / 260)}px)`;
    ctx.drawImage(src, 0, 0);

    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    _gargantuaTexCache[key] = tex;
    return tex;
}

// =============================================================================
// LENSED WRAP ARCS — the read the disk physically cannot give us.
// =============================================================================
// The accretion disk is a flat RingGeometry sharing an origin with an OPAQUE,
// depth-writing horizon sphere. That is correct occlusion and completely wrong
// physics: in a real gravitational field the disk's far half is bent up over
// the top of the shadow and down under the bottom, so you see the WHOLE disk
// wrapped into a halo around a black disc. With z-occlusion you instead see
// the near half only, terminating on a hard horizontal line across the
// sphere's equator — which is exactly what the wave-2 critic measured, and
// what a screenshot of Sgr A* showed: a flat slab cut off at the middle.
//
// A true raymarch is out of budget. This is the geometric cheat: a camera-
// facing quad carrying TWO arcs of accretion-disk material, drawn IN FRONT of
// the horizon at 1.05-1.40x the shadow radius, rolled so they cap the top and
// bottom of the shadow, and faded in as the disk approaches edge-on (which is
// precisely when the far half disappears behind the sphere and the wrap is
// needed). The arcs carry the same ember→orange→white temperature ramp and the
// same Doppler asymmetry as the disk, so they read as the SAME material
// continuing around the hole rather than as a decal.
//
// Texture radius 1.0 == radius * _GARG_WRAP_K, so the shadow silhouette lands
// at 1/_GARG_WRAP_K and the arc band spans _GARG_WRAP_IN.._GARG_WRAP_OUT
// shadow radii.
const _GARG_WRAP_K = 2.2;
const _GARG_WRAP_IN = 1.05;
const _GARG_WRAP_OUT = 1.40;

function _gargantuaWrapTexture(color) {
    const key = 'w' + color;
    if (_gargantuaTexCache[key]) return _gargantuaTexCache[key];
    const c = new THREE.Color(color);
    const br = c.r * 255, bg = c.g * 255, bb = c.b * 255;
    const size = _isMobileRenderTier() ? 256 : 384;

    // Same three-stop temperature ramp as the disk, so the arcs and the disk
    // are unmistakably the same plasma.
    const emR = br * 0.62, emG = bg * 0.17, emB = bb * 0.11;
    const miR = Math.min(255, br * 1.02 + 14), miG = Math.min(255, bg * 0.82 + 24), miB = Math.min(255, bb * 0.62 + 10);
    const hoR = 255, hoG = 250, hoB = 240;

    const r0 = _GARG_WRAP_IN / _GARG_WRAP_K;    // 0.477
    const r1 = _GARG_WRAP_OUT / _GARG_WRAP_K;   // 0.636

    const src = document.createElement('canvas');
    src.width = src.height = size;
    const sctx = src.getContext('2d');
    const img = sctx.createImageData(size, size);
    const data = img.data;

    for (let y = 0; y < size; y++) {
        const dy = (y + 0.5) / size - 0.5;
        for (let x = 0; x < size; x++) {
            const dx = (x + 0.5) / size - 0.5;
            const rr = 2 * Math.sqrt(dx * dx + dy * dy);
            const i = (y * size + x) * 4;
            if (rr < r0 * 0.94 || rr > r1 * 1.10) { data[i + 3] = 0; continue; }

            const ang = Math.atan2(dy, dx);

            // ANGULAR MASK. The arcs live at the top and bottom (|sin| → 1)
            // and dissolve toward the horizontal (|sin| → 0), where the real
            // disk geometry already occupies the frame. Without this they
            // would double up on the disk's own limbs and read as a hoop.
            const s = Math.abs(Math.sin(ang));
            const cap = _gsmooth(0.18, 0.78, s);
            if (cap <= 0.002) { data[i + 3] = 0; continue; }

            // RADIAL PROFILE. A hot lip just outside the shadow (this is the
            // lensed inner edge of the disk, the brightest part of the image)
            // rolling off outward, feathered to zero at both ends so the band
            // never shows a geometric edge.
            const u = (rr - r0) / (r1 - r0);
            const lipT = (u - 0.08) / 0.17;
            const lip = Math.exp(-lipT * lipT);
            let prof = lip * 1.35 + Math.pow(1 - Math.min(1, Math.max(0, u)), 2.2) * 0.55;
            prof *= _gsmooth(-0.06, 0.05, u) * (1 - _gsmooth(0.62, 1.02, u));

            // DOPPLER. Same beaming law as the disk, keyed off the horizontal
            // axis, so each arc is bright where it leaves the approaching limb
            // and fades toward the receding one. That gradient ALONG the arc
            // is what makes it read as bent light rather than as a painted
            // halo.
            const dop = 0.5 + 0.5 * Math.cos(ang);
            const beam = 0.14 + 2.05 * Math.pow(dop, 2.4);

            const over = prof * cap * beam;
            if (over <= 0.004) { data[i + 3] = 0; continue; }

            const alpha = over > 1 ? 1 : over;
            let w = (over - 1.5) / 1.9;
            w = w < 0 ? 0 : (w > 1 ? 1 : w);

            let h = (0.34 + 0.74 * Math.pow(dop, 1.15)) * (1 - u * 0.55);
            h = h < 0 ? 0 : (h > 1 ? 1 : h);

            let R, G, B;
            if (h < 0.55) {
                const t2 = h / 0.55;
                R = emR + (miR - emR) * t2;
                G = emG + (miG - emG) * t2;
                B = emB + (miB - emB) * t2;
            } else {
                const t2 = (h - 0.55) / 0.45;
                R = miR + (hoR - miR) * t2;
                G = miG + (hoG - miG) * t2;
                B = miB + (hoB - miB) * t2;
            }
            const wh = Math.max(w, Math.min(1, Math.max(0, lip - 0.62) * 2.4));
            R = R + (255 - R) * wh;
            G = G + (250 - G) * wh;
            B = B + (242 - B) * wh;

            data[i] = R > 255 ? 255 : R;
            data[i + 1] = G > 255 ? 255 : G;
            data[i + 2] = B > 255 ? 255 : B;
            data[i + 3] = alpha * 255;
        }
    }
    sctx.putImageData(img, 0, 0);

    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.filter = `blur(${Math.max(1, size / 200)}px)`;
    ctx.drawImage(src, 0, 0);

    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    _gargantuaTexCache[key] = tex;
    return tex;
}

// HDR tint for the emissive black-hole layers. THREE.Color stores its
// components unclamped and WebGLRenderer copies them straight into the
// `diffuse` uniform, so a value above 1 is a genuine over-range emitter:
// with ACESFilmic tone mapping engaged (see atmospheric-perspective.js) it
// rolls smoothly into white instead of hard-clipping, which is the whole
// difference between "bloom" and "a flat orange band".
function _hdrTint(k) {
    const c = new THREE.Color();
    c.setRGB(k, k, k);
    return c;
}

// =============================================================================
// EVENT HORIZON MATERIAL — the shadow has to actually OCCLUDE.
// =============================================================================
// Every black hole in the game used to be `transparent: true, opacity: 0.95`.
// That is not "almost opaque" in a scene like this one: it is a 5% window onto
// everything behind the hole, and with a star sprite clipping at 255 behind it
// the horizon shows a 13/255 dot — measurably non-black pixels inside a region
// that must be the darkest thing on screen. Worse, `transparent: true` moves
// the sphere into the transparent queue, where it is depth-sorted against the
// additive star fields, galaxy point clouds and nebula sprites that share its
// origin — so the sort order between "star" and "hole" was effectively
// arbitrary and stars drew straight through the horizon.
//
// Opaque + depthWrite puts the sphere in the opaque queue, which renders
// wholesale BEFORE every transparent object and leaves a depth wall behind it.
// Everything additive behind the hole is then depth-rejected for free, and the
// silhouette is a true (0,0,0) hole punched in the sky. `fog: false` matters
// too: galaxy cores sit past fogNear, and a fogged horizon is a violet ball,
// not a shadow. renderOrder -1 draws it ahead of the rest of the opaque queue
// so it also serves as an early-z occluder for the disk fragments behind it.
const _EVENT_HORIZON_ORDER = -1;

function _eventHorizonMaterial() {
    return new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        depthTest: true,
        fog: false
    });
}
if (typeof window !== 'undefined') window._eventHorizonMaterial = _eventHorizonMaterial;

// Polar-jet plume texture: helical filaments only, SEAMLESS in both axes.
//
// The length falloff deliberately lives in the geometry's vertex colours,
// not here. A first pass baked "blinding at the throat → gone at the tip"
// into the texture's v axis and then scrolled v to make the plasma stream —
// which, with RepeatWrapping, marched the blinding throat band up the jet
// once per cycle and read as a hard white ring sliding outward. Detail
// scrolls; shape does not. Every filament here uses an INTEGER number of
// wavelengths over the canvas height so v=0 and v=1 line up exactly and the
// scroll has no seam at all.
function _gargantuaJetTexture(color) {
    const key = 'j' + color;
    if (_gargantuaTexCache[key]) return _gargantuaTexCache[key];
    const c = new THREE.Color(color);
    const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255);
    const w = 128, h = 256;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');

    // Uniform plasma body — the cone's base glow, flat along v. Kept LOW and
    // colour-forward: at 0.34 with a near-white tint the two double-sided
    // cones stacked up to a pair of solid grey searchlights that out-read the
    // photon ring itself. The filaments below carry the plume; this is only
    // the medium they sit in.
    ctx.fillStyle = `rgba(${Math.min(255, r + 18)},${Math.min(255, g + 24)},${Math.min(255, b + 14)},0.20)`;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = 'blur(2px)';
    for (let i = 0; i < 26; i++) {
        const x0 = Math.random() * w;
        const amp = 4 + Math.random() * 13;
        const cycles = 1 + Math.floor(Math.random() * 4);      // integer → seamless
        const freq = (cycles * Math.PI * 2) / h;
        const ph = Math.random() * Math.PI * 2;
        ctx.beginPath();
        for (let y = 0; y <= h; y += 4) {
            const xx = x0 + Math.sin(y * freq + ph) * amp;
            if (y === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
        }
        // Draw each strand three times (x-w, x, x+w) so strands crossing the
        // wrap seam are continuous around the cone too.
        ctx.strokeStyle = `rgba(255,${230 + Math.floor(Math.random() * 25)},255,${0.06 + Math.random() * 0.12})`;
        ctx.lineWidth = 1 + Math.random() * 3;
        ctx.stroke();
        ctx.save();
        ctx.translate(-w, 0); ctx.stroke();
        ctx.translate(2 * w, 0); ctx.stroke();
        ctx.restore();
    }
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    _gargantuaTexCache[key] = tex;
    return tex;
}

// Registry of every black hole that has gargantua visuals + a proximity
// fade. The per-frame fade band (Sgr A* / Companion Core reach ~9.5–9.9k
// units) is far wider than the ~2000-unit `activePlanets` cull range, so
// the fade MUST be driven from this dedicated list every frame rather
// than from activePlanets — otherwise beyond ~2000 units the effects
// never update and stay stuck at full design opacity instead of fading.
const gargantuaBlackHoles = [];
if (typeof window !== 'undefined') window.gargantuaBlackHoles = gargantuaBlackHoles;

// Mobile render tier. Mirrors the heuristic in game-core.js (renderer
// init) and caches it on window, so star fields / shields can scale
// themselves down regardless of whether they build before or after the
// renderer sets window.__isMobileGPU. Mobile gets AA off + pixelRatio
// 1, which makes additive star/shield pixels pile up to harsh white —
// these call sites use this to cut count + opacity on mobile only.
function _isMobileRenderTier() {
    if (typeof window === 'undefined') return false;
    if (typeof window.__isMobileGPU !== 'undefined') return window.__isMobileGPU;
    window.__isMobileGPU = (window.innerWidth <= 768) ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    return window.__isMobileGPU;
}
if (typeof window !== 'undefined') window._isMobileRenderTier = _isMobileRenderTier;

// =============================================================================
// STAR CORONA — wispy halo + bright rim shell + slow alive pulse
// Lifts plain coloured spheres to a "hot core + radiating corona" look like
// real photographic suns: bright near-white disc, a thin white-hot rim, and
// a wide additive halo sprite that pulses irregularly over ~10–25 s.
// =============================================================================
const _starCoronaTexCache = {};

// Colour-temperature proxy. Real stellar temperature is a blackbody curve;
// what matters on screen is only "does this star lean red or blue", which the
// palette colour already encodes. Returns -1 (deep red giant) .. +1 (blue
// supergiant), and the chromosphere / flare tints derived from it.
function _starTempTint(color) {
    const c = new THREE.Color(color);
    let t = (c.b - c.r) * 1.6 + (c.g - c.r) * 0.4;
    t = t < -1 ? -1 : (t > 1 ? 1 : t);
    const k = (t + 1) * 0.5;                       // 0 = coolest, 1 = hottest
    // Chromosphere: H-alpha crimson on cool stars, hard blue-white on hot
    // ones, then pulled 30% back toward the star's own colour so a green or
    // magenta arcade sun still reads as itself.
    const chromo = new THREE.Color(0xff3311).lerp(new THREE.Color(0x9ecfff), k).lerp(c, 0.30);
    // Flare spikes stay hotter than the body — that is what makes them read
    // as bloom rather than as geometry.
    const flare = new THREE.Color(0xffcc66).lerp(new THREE.Color(0xd8ecff), k);
    return { t: t, k: k, chromo: chromo, flare: flare };
}

// Anamorphic / diffraction flare: a hot core bloom with a tapered 4-point
// spike cross plus two shorter diagonals. Rotated slowly per-frame via
// SpriteMaterial.rotation, which costs nothing and reads as the lens
// breathing rather than as a decal glued to the star.
function _starFlareTexture(color) {
    const key = 'F' + color;
    if (_starCoronaTexCache[key]) return _starCoronaTexCache[key];
    const c = new THREE.Color(color);
    const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255);
    const size = 256, cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const cx = size / 2;

    ctx.globalCompositeOperation = 'lighter';

    // Tight overexposed core.
    const core = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.26);
    core.addColorStop(0.00, 'rgba(255,255,255,0.95)');
    core.addColorStop(0.35, `rgba(${Math.min(255,r+70)},${Math.min(255,g+60)},${Math.min(255,b+40)},0.45)`);
    core.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, size, size);

    // [angle, length fraction, half-thickness fraction]
    const spikes = [
        [0, 0.98, 0.030],
        [Math.PI / 2, 0.80, 0.026],
        [Math.PI / 4, 0.44, 0.015],
        [-Math.PI / 4, 0.44, 0.015]
    ];
    for (let i = 0; i < spikes.length; i++) {
        const ang = spikes[i][0], L = cx * spikes[i][1], w = cx * spikes[i][2];
        ctx.save();
        ctx.translate(cx, cx);
        ctx.rotate(ang);
        ctx.filter = 'blur(2px)';
        const lg = ctx.createLinearGradient(-L, 0, L, 0);
        lg.addColorStop(0.00, 'rgba(0,0,0,0)');
        lg.addColorStop(0.34, `rgba(${r},${g},${b},0.22)`);
        lg.addColorStop(0.46, `rgba(${Math.min(255,r+50)},${Math.min(255,g+40)},${Math.min(255,b+30)},0.70)`);
        lg.addColorStop(0.50, 'rgba(255,255,255,1.00)');
        lg.addColorStop(0.54, `rgba(${Math.min(255,r+50)},${Math.min(255,g+40)},${Math.min(255,b+30)},0.70)`);
        lg.addColorStop(0.66, `rgba(${r},${g},${b},0.22)`);
        lg.addColorStop(1.00, 'rgba(0,0,0,0)');
        ctx.fillStyle = lg;
        // Lens (rhombus) rather than a bar, so each spike tapers to a point
        // instead of ending on a visible rectangle edge.
        ctx.beginPath();
        ctx.moveTo(-L, 0);
        ctx.lineTo(0, -w);
        ctx.lineTo(L, 0);
        ctx.lineTo(0, w);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    _starCoronaTexCache[key] = tex;
    return tex;
}

function _starCoronaTexture(color) {
    const key = 's' + color;
    if (_starCoronaTexCache[key]) return _starCoronaTexCache[key];
    const c = new THREE.Color(color);
    const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255);
    const size = 256, cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const cx = size / 2;
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    // Hot near-white inner halo blending into a warm wispy outer corona.
    grad.addColorStop(0.00, 'rgba(255,250,235,0.85)');
    grad.addColorStop(0.18, `rgba(${Math.min(255,r+90)},${Math.min(255,g+60)},${Math.min(255,b+20)},0.55)`);
    grad.addColorStop(0.38, `rgba(${r},${Math.round(g*0.75)},${Math.round(b*0.45)},0.30)`);
    grad.addColorStop(0.65, `rgba(${r},${Math.round(g*0.50)},${Math.round(b*0.22)},0.10)`);
    grad.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    _starCoronaTexCache[key] = tex;
    return tex;
}

const starCoronas = [];
if (typeof window !== 'undefined') window.starCoronas = starCoronas;

// -----------------------------------------------------------------------------
// PHOTOSPHERE — the star's own disc, as a sphere instead of a coin.
// -----------------------------------------------------------------------------
// Every star in these systems carried a MeshBasicMaterial, which is by
// definition ONE COLOUR over the whole silhouette: no shading, no view
// dependence, no surface. At the distances the slingshot parks you at — you
// whip a star at a few radii, that is the entire mechanic — the biggest
// object on screen was a flat filled circle with additive sprites stacked in
// front of it. All the volume was in the dressing and none in the body.
//
// This replaces the fill with a real photosphere, and it is FREE: same mesh,
// same opaque draw call, no extra pass, and nothing added to the additive
// budget (which is the thing that actually costs frames here).
//
//   • LIMB DARKENING, the Eddington curve I(mu)/I(1) = 0.34 + 0.66*mu^0.82.
//     This is the single reason a photograph of the Sun reads as a ball and
//     a flat disc reads as a sticker. It is not a vignette — it is view
//     dependent, so it slides across the disc as you orbit.
//   • GRANULATION that churns: three octaves of nested sine turbulence in
//     OBJECT space, so it spins with the star instead of swimming.
//   • STARSPOTS. A star built only from bright churn reads as a light bulb.
//     Sparse dark islands are what make it read as a surface with weather.
//   • A CHROMOSPHERE hairline in the last few percent of the disc, so the
//     silhouette hands off into the corona shells instead of ending on a cut.
//
// The material exposes `.color` as the live uCore uniform object, so every
// existing `star.material.color.lerp(...)` / `.copy(...)` in this file and in
// visual-flair's lens-flare tint keeps working — and now actually drives the
// shader instead of a dead fill.
const _PHOTOSPHERE_VERT = `
    varying vec3 vN;
    varying vec3 vWP;
    varying vec3 vOP;
    void main() {
        vOP = normalize(position);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

const _PHOTOSPHERE_FRAG = `
    uniform vec3 uCore;
    uniform vec3 uEdge;
    uniform float uTime;
    uniform float uSeed;
    varying vec3 vN;
    varying vec3 vWP;
    varying vec3 vOP;

    void main() {
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vWP);
        float mu = clamp(dot(N, V), 0.0, 1.0);

        // Nested sines, not fbm: no texture fetches, no loop, and the inner
        // sine phase-modulating the outer one is what stops it looking like
        // a plaid of standing waves.
        vec3 p = vOP * 4.6 + uSeed;
        float t = uTime * 0.30;
        float n  = sin(p.x * 1.1 + sin(p.y * 1.6 + t)) * 0.50;
        n += sin(p.y * 2.4 + sin(p.z * 2.0 - t * 0.73)) * 0.30;
        n += sin(p.z * 4.9 + sin(p.x * 3.3 + t * 1.21)) * 0.20;
        n = clamp(n * 0.5 + 0.5, 0.0, 1.0);

        vec3 col = mix(uEdge, uCore, smoothstep(0.16, 0.88, n));
        // The bright net between granule cells.
        col += uCore * smoothstep(0.66, 0.97, n) * 0.30;

        // STARSPOTS — slow, sparse, and DARK. Gated on the granulation so a
        // spot has a ragged edge instead of being a painted ellipse.
        float sp = sin(p.x * 0.62 - uSeed) * 0.34
                 + sin(p.z * 0.81 + uSeed * 1.7) * 0.34
                 + n * 0.46;
        col *= 1.0 - smoothstep(0.72, 0.95, sp) * 0.48;

        // LIMB DARKENING, lifted 1.12x so the star keeps its presence — this
        // is here to add shape, not to dim the brightest object in frame.
        col *= 1.12 * (0.40 + 0.60 * pow(mu, 0.78));
        // CHROMOSPHERE hairline. Measured on the procedural primaries: at
        // pow 9 this reads as a bright hoop around a darker interior — a
        // glass marble, which is a different flat cue, not a fix. A real
        // chromosphere is a fraction of a percent of the radius, and the
        // outer glow is the corona sprites' job.
        col += uEdge * pow(1.0 - mu, 14.0) * 0.60;

        gl_FragColor = vec4(col, 1.0);
    }
`;

const _starPhotospheres = [];
let _photosphereTime = 0;

function makeStarPhotosphere(star, tint) {
    if (!star || typeof THREE === 'undefined') return null;
    if (typeof window !== 'undefined' && window.STAR_PHOTOSPHERE === false) return null;
    const old = star.material;
    // Only ever upgrade a plain fill. Anything richer already belongs to
    // somebody else (proc-galaxies' own star program, the Sun's textured
    // material) and must be left alone.
    if (!old || old.type !== 'MeshBasicMaterial' || !old.color) return null;
    if (star.userData && star.userData._photosphere) return null;

    const core = new THREE.Color(tint === undefined ? 0xffaa44 : tint);
    // The limb colour is the star's own hue driven cooler and deeper, so a
    // blue star limbs to steel and an amber one limbs to ember. Uniform grey
    // shading would flatten every star in the game to the same ball.
    const hsl = { h: 0, s: 0, l: 0 };
    core.getHSL(hsl);
    const edge = new THREE.Color().setHSL(
        hsl.h,
        Math.min(1, hsl.s * 0.85 + 0.22),
        Math.max(0.16, hsl.l * 0.48)
    );

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uCore: { value: core },
            uEdge: { value: edge },
            uTime: { value: 0 },
            uSeed: { value: Math.random() * 30 }
        },
        vertexShader: _PHOTOSPHERE_VERT,
        fragmentShader: _PHOTOSPHERE_FRAG,
        transparent: false,
        depthWrite: true,
        fog: false
    });
    // Back-compatibility surface: `.color` IS the uCore uniform's Color, so
    // in-place mutation by existing callers reaches the shader.
    mat.color = core;

    if (old.dispose) old.dispose();
    star.material = mat;
    if (!star.userData) star.userData = {};
    star.userData._photosphere = mat;
    _starPhotospheres.push(mat);
    return mat;
}
if (typeof window !== 'undefined') window.makeStarPhotosphere = makeStarPhotosphere;

function updateStarPhotospheres(dt) {
    _photosphereTime += (typeof dt === 'number' && dt > 0 && dt < 0.5) ? dt : 0.016;
    for (let i = 0; i < _starPhotospheres.length; i++) {
        _starPhotospheres[i].uniforms.uTime.value = _photosphereTime;
    }
}
if (typeof window !== 'undefined') window.updateStarPhotospheres = updateStarPhotospheres;

function addStarCorona(star, radius, baseColor) {
    if (!star || typeof THREE === 'undefined') return;
    if (star.userData && star.userData._hasCorona) return;
    const tint = (baseColor === undefined || baseColor === null) ? 0xffaa44 : baseColor;

    // Swap the flat fill for a photosphere BEFORE the hot-lerp below, so that
    // lerp lands on the shader's core colour and still does its job.
    makeStarPhotosphere(star, tint);

    // Lift the disc itself toward a hot white-yellow so the core reads
    // as overexposed rather than a flat colour. Lerp 40% so individual
    // star palette colours still come through.
    if (star.material && star.material.color) {
        const hot = new THREE.Color(0xfff2c0);
        star.material.color.lerp(hot, 0.4);
    }

    // Camera-facing wispy outer halo. Additive, no depth-write so it
    // never occludes nearby objects; renderOrder above most things.
    const coronaMat = new THREE.SpriteMaterial({
        map: _starCoronaTexture(tint),
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true
    });
    const corona = new THREE.Sprite(coronaMat);
    const coronaSize = radius * 3.2;
    corona.scale.set(coronaSize * 2, coronaSize * 2, 1);
    corona.frustumCulled = false;
    corona.renderOrder = 65;
    star.add(corona);

    // Thin bright white-hot rim shell just outside the disc edge.
    const rimGeo = new THREE.SphereGeometry(radius * 1.04, 24, 24);
    const rimMat = new THREE.MeshBasicMaterial({
        color: 0xfff2c0,
        transparent: true,
        opacity: 0.35,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.frustumCulled = false;
    star.add(rim);

    // CHROMOSPHERE — a second, wider backside shell carrying the star's
    // colour TEMPERATURE rather than its palette colour: crimson H-alpha on
    // cool suns, hard blue-white on hot ones. Backside additive shells are
    // brightest at the limb (longest path through the shell) and near-nil
    // face-on, so this reads as a real atmosphere hugging the disc instead
    // of a flat tint over it — and it is what separates two stars that
    // happen to share a body colour.
    const temp = _starTempTint(tint);
    const chromoMat = new THREE.MeshBasicMaterial({
        color: temp.chromo,
        transparent: true,
        opacity: 0.30,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const chromo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.16, 24, 24), chromoMat);
    chromo.frustumCulled = false;
    star.add(chromo);

    // LAYERED FLARE. Two more sprites on top of the wide halo:
    //   • a tight, blown-out bloom right on the disc, which is what makes
    //     the core look overexposed rather than merely bright;
    //   • the diffraction spike cross, slowly counter-rotating.
    // Both are camera-facing and additive; the spike texture is >90%
    // transparent, so the extra overdraw is a fraction of the halo's.
    const bloomMat = new THREE.SpriteMaterial({
        map: _starCoronaTexture(tint),
        color: 0xffffff,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true
    });
    const bloom = new THREE.Sprite(bloomMat);
    const bloomSize = radius * 1.5;
    bloom.scale.set(bloomSize * 2, bloomSize * 2, 1);
    bloom.frustumCulled = false;
    bloom.renderOrder = 66;
    star.add(bloom);

    const spikeMat = new THREE.SpriteMaterial({
        map: _starFlareTexture(temp.flare.getHex()),
        color: 0xffffff,
        transparent: true,
        opacity: _isMobileRenderTier() ? 0.30 : 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true
    });
    const spikes = new THREE.Sprite(spikeMat);
    const spikeSize = radius * (_isMobileRenderTier() ? 5.0 : 7.0);
    spikes.scale.set(spikeSize * 2, spikeSize * 2, 1);
    spikes.frustumCulled = false;
    spikes.renderOrder = 67;
    star.add(spikes);

    star.userData._hasCorona = true;
    star.userData._coronaSprite = corona;
    star.userData._coronaBaseScale = coronaSize * 2;
    star.userData._coronaRim = rim;
    star.userData._coronaChromo = chromoMat;
    star.userData._coronaBloom = bloom;
    star.userData._coronaBloomScale = bloomSize * 2;
    star.userData._coronaSpikes = spikes;
    star.userData._coronaSpikeScale = spikeSize * 2;
    star.userData._coronaPulsePhase = Math.random() * Math.PI * 2;
    star.userData._coronaSpin = (Math.random() < 0.5 ? -1 : 1) * (0.02 + Math.random() * 0.03);
    if (starCoronas.indexOf(star) === -1) starCoronas.push(star);
}
if (typeof window !== 'undefined') window.addStarCorona = addStarCorona;

// Per-frame: slow irregular pulse so the corona breathes like a real
// star. Two detuned low-frequency sines (~14s and ~28s periods) summed,
// with a per-star random phase so suns don't beat in sync.
function updateStarCoronas() {
    if (!starCoronas.length) return;
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    for (let i = 0; i < starCoronas.length; i++) {
        const s = starCoronas[i];
        if (!s || !s.userData) continue;
        const sprite = s.userData._coronaSprite;
        const rim = s.userData._coronaRim;
        if (!sprite || !sprite.material) continue;
        const ph = s.userData._coronaPulsePhase || 0;
        const wob = Math.sin(t * 0.45 + ph) * 0.6 +
                    Math.sin(t * 0.22 + ph * 1.7) * 0.4;       // ~[-1, 1]
        const grow = (s.userData._coronaBaseScale || 1) * (1 + wob * 0.07);
        sprite.scale.set(grow, grow, 1);
        let o = 0.85 + wob * 0.25;
        sprite.material.opacity = o < 0 ? 0 : (o > 1.20 ? 1.20 : o);
        if (rim && rim.material) {
            let ro = 0.32 + wob * 0.12;
            rim.material.opacity = ro < 0 ? 0 : (ro > 0.55 ? 0.55 : ro);
        }

        // The chromosphere breathes on a THIRD, much slower beat than the
        // halo. Locking every layer to one sine is what makes procedural
        // pulses look mechanical; letting them drift apart makes the star
        // look like it has weather.
        const chromo = s.userData._coronaChromo;
        if (chromo) {
            const cw = Math.sin(t * 0.13 + ph * 2.3);
            let co = 0.28 + cw * 0.10;
            chromo.opacity = co < 0.05 ? 0.05 : co;
        }

        // Tight core bloom flares HARDER than the halo (^1.6 on the same
        // wobble) so peaks read as the star surging, not just glowing.
        const bloom = s.userData._coronaBloom;
        if (bloom && bloom.material) {
            const sharp = wob >= 0 ? Math.pow(wob, 1.6) : -Math.pow(-wob, 1.6);
            const bg = (s.userData._coronaBloomScale || 1) * (1 + sharp * 0.12);
            bloom.scale.set(bg, bg, 1);
            let bo = 0.72 + sharp * 0.30;
            bloom.material.opacity = bo < 0 ? 0 : (bo > 1.1 ? 1.1 : bo);
        }

        // Diffraction spikes: slow rotation + a counter-phase length pump,
        // so the cross stretches while the halo contracts.
        const spikes = s.userData._coronaSpikes;
        if (spikes && spikes.material) {
            spikes.material.rotation = t * (s.userData._coronaSpin || 0.03);
            const sg = (s.userData._coronaSpikeScale || 1) * (1 - wob * 0.10);
            spikes.scale.set(sg, sg, 1);
            let so = 0.40 - wob * 0.14;
            spikes.material.opacity = so < 0.05 ? 0.05 : (so > 0.62 ? 0.62 : so);
        }
    }
}
if (typeof window !== 'undefined') window.updateStarCoronas = updateStarCoronas;

// =============================================================================
// EARTH ENHANCEMENT — procedural surface + cloud shell + atmosphere rim
// No external textures are bundled; this draws a "blue marble"-ish look on
// canvas so Earth reads with continents, clouds and a fresnel limb glow
// instead of a flat blue Lambert ball.
// =============================================================================
const _earthTexCache = {};

function _earthSurfaceTexture() {
    if (_earthTexCache.surface) return _earthTexCache.surface;
    const w = 1024, h = 512;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');

    // Ocean base — vertical gradient so poles are slightly icier.
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, h);
    oceanGrad.addColorStop(0.00, '#9fc0d6');
    oceanGrad.addColorStop(0.12, '#2c4a78');
    oceanGrad.addColorStop(0.50, '#1a3a66');
    oceanGrad.addColorStop(0.88, '#2c4a78');
    oceanGrad.addColorStop(1.00, '#9fc0d6');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, w, h);

    // Continent blobs — clusters of overlapping ellipses in earth tones.
    // Not real geography, but reads as "land masses on a blue planet".
    const landTones = ['#5a6b3a', '#7a6a3a', '#8a7a4a', '#b59565', '#6a5a3a', '#4a5530'];
    const continents = 14;
    for (let c = 0; c < continents; c++) {
        const cx = Math.random() * w;
        const cy = h * 0.15 + Math.random() * h * 0.7;   // avoid poles
        const blobs = 18 + Math.floor(Math.random() * 24);
        const baseR = 18 + Math.random() * 50;
        for (let b = 0; b < blobs; b++) {
            const ang = Math.random() * Math.PI * 2;
            const off = Math.random() * baseR * 2.4;
            const rx = baseR * (0.6 + Math.random() * 0.8);
            const ry = baseR * (0.5 + Math.random() * 0.7);
            const x = cx + Math.cos(ang) * off;
            const y = cy + Math.sin(ang) * off * 0.6;
            ctx.fillStyle = landTones[(b + c) % landTones.length];
            ctx.beginPath();
            ctx.ellipse(x, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Polar ice caps.
    const capGrad = ctx.createLinearGradient(0, 0, 0, h);
    capGrad.addColorStop(0.00, 'rgba(255,255,255,0.9)');
    capGrad.addColorStop(0.08, 'rgba(255,255,255,0)');
    capGrad.addColorStop(0.92, 'rgba(255,255,255,0)');
    capGrad.addColorStop(1.00, 'rgba(255,255,255,0.9)');
    ctx.fillStyle = capGrad;
    ctx.fillRect(0, 0, w, h);

    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    _earthTexCache.surface = tex;
    return tex;
}

function _earthCloudTexture() {
    if (_earthTexCache.clouds) return _earthTexCache.clouds;
    const w = 1024, h = 512;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    // Transparent background.
    ctx.clearRect(0, 0, w, h);
    // Layered semi-opaque blobs at three scales → wispy bands.
    const passes = [
        { count: 60,  rmin: 40, rmax: 110, alpha: 0.20 },
        { count: 180, rmin: 12, rmax: 36,  alpha: 0.14 },
        { count: 450, rmin: 3,  rmax: 10,  alpha: 0.10 }
    ];
    for (const p of passes) {
        ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
        for (let i = 0; i < p.count; i++) {
            const x = Math.random() * w;
            const y = h * 0.08 + Math.random() * h * 0.84;   // gentle taper toward poles
            const r = p.rmin + Math.random() * (p.rmax - p.rmin);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    _earthTexCache.clouds = tex;
    return tex;
}

const _earthClouds = [];

function enhanceEarth(earth, radius) {
    if (!earth || typeof THREE === 'undefined') return;
    if (earth.userData && earth.userData._enhanced) return;
    earth.userData._enhanced = true;

    // 1. Upgrade the surface to Phong with a procedural land/ocean
    //    canvas + mild specular sheen so the lit ocean catches a soft
    //    highlight under the new directional sunlight.
    const phong = new THREE.MeshPhongMaterial({
        map: _earthSurfaceTexture(),
        specular: 0x335577,
        shininess: 22,
        emissive: 0x000000
    });
    if (earth.material && earth.material.dispose) earth.material.dispose();
    earth.material = phong;

    // 2. Cloud shell — slightly larger sphere with the procedural
    //    cloud canvas. Independent rotation via updateEarthClouds()
    //    gives subtle parallax against the surface.
    const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.02, 56, 40),
        new THREE.MeshLambertMaterial({
            map: _earthCloudTexture(),
            transparent: true,
            // 0.9 buried the continents under a white haze at the new hero
            // scale — the planet read as an ice ball. At 0.72 the weather is
            // still a distinct shell but you can see the land through it.
            opacity: 0.72,
            depthWrite: false
        })
    );
    clouds.frustumCulled = false;
    earth.add(clouds);
    earth.userData._cloudLayer = clouds;
    _earthClouds.push(clouds);

    // 3. NIGHT SIDE. The player spawns in Earth orbit and the opening frame is
    //    frequently the dark hemisphere — measured in-game, that frame was a
    //    featureless black ball with a thin lit crescent and nothing else, the
    //    exact opposite of the reference plates where the night side is the
    //    most characterful part of the planet (coastlines picked out in city
    //    light). This shell adds those lamps plus the atmosphere limb, keyed
    //    off Sol's real position so it tracks the terminator as Earth orbits.
    const sol = (typeof window !== 'undefined' && window.localSystemOffset)
        ? window.localSystemOffset : { x: 8000, y: 0, z: 4800 };
    addNightSideShell(earth, radius, {
        sun: new THREE.Vector3(sol.x, sol.y, sol.z),
        nightColor: 0xffc169,
        rimColor: 0x54a8ff,
        rim: 0.75,
        city: 1.0,
        seed: 3.7
    });
}
if (typeof window !== 'undefined') window.enhanceEarth = enhanceEarth;

// =============================================================================
// PROCEDURAL PLANET TEXTURES — Mercury craters, Mars rust, gas-giant bands.
// Same canvas-painting approach as Earth, but per-planet. No assets bundled.
// =============================================================================
const _planetTexCache = {};

function _mercurySurfaceTexture() {
    if (_planetTexCache.mercury) return _planetTexCache.mercury;
    const w = 1024, h = 512;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#a89080';
    ctx.fillRect(0, 0, w, h);

    // Soft regional highland/lowland patches.
    for (let i = 0; i < 60; i++) {
        const cx = Math.random() * w;
        const cy = Math.random() * h;
        const r = 40 + Math.random() * 110;
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        const lighter = Math.random() < 0.5;
        grd.addColorStop(0, lighter ? 'rgba(200,180,160,0.40)' : 'rgba(80,70,60,0.40)');
        grd.addColorStop(1, lighter ? 'rgba(200,180,160,0)' : 'rgba(80,70,60,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // 500-ish craters at varied sizes: lighter rim + dark centre.
    for (let i = 0; i < 500; i++) {
        const cx = Math.random() * w;
        const cy = Math.random() * h;
        const r = 1.5 + Math.random() * 11;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(210,190,170,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(60,52,44,0.65)';
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    _planetTexCache.mercury = tex;
    return tex;
}

function _marsSurfaceTexture() {
    if (_planetTexCache.mars) return _planetTexCache.mars;
    const w = 1024, h = 512;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');

    // Banded latitudinal base — paler at poles, deep rust at equator.
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0.00, '#d8a890');
    grd.addColorStop(0.10, '#c2603a');
    grd.addColorStop(0.50, '#a23a1c');
    grd.addColorStop(0.90, '#c2603a');
    grd.addColorStop(1.00, '#d8a890');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    // Darker rust regions (Tharsis / Valles-style smudges).
    for (let i = 0; i < 36; i++) {
        const cx = Math.random() * w;
        const cy = h * 0.15 + Math.random() * h * 0.7;
        const rx = 50 + Math.random() * 130;
        const ry = 25 + Math.random() * 70;
        ctx.fillStyle = 'rgba(110,48,24,0.42)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
    }

    // Polar ice caps.
    const cap = ctx.createLinearGradient(0, 0, 0, h);
    cap.addColorStop(0.00, 'rgba(255,255,255,0.72)');
    cap.addColorStop(0.06, 'rgba(255,255,255,0)');
    cap.addColorStop(0.94, 'rgba(255,255,255,0)');
    cap.addColorStop(1.00, 'rgba(255,255,255,0.72)');
    ctx.fillStyle = cap;
    ctx.fillRect(0, 0, w, h);

    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    _planetTexCache.mars = tex;
    return tex;
}

function _gasGiantTexture(bands, turbulence, spot) {
    const w = 1024, h = 512;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');

    // Horizontal band stripes.
    for (const b of bands) {
        ctx.fillStyle = b.color;
        ctx.fillRect(0, b.y0 * h, w, (b.y1 - b.y0) * h);
    }

    // Per-band turbulence — small horizontal smudges in lighter and
    // darker tints, so the rigid stripes feather into one another.
    for (let i = 0; i < turbulence.count; i++) {
        const y = Math.random() * h;
        const x = Math.random() * w;
        const rx = turbulence.rxMin + Math.random() * (turbulence.rxMax - turbulence.rxMin);
        const ry = turbulence.ryMin + Math.random() * (turbulence.ryMax - turbulence.ryMin);
        ctx.fillStyle = Math.random() < 0.5 ? turbulence.lightTint : turbulence.darkTint;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Optional storm spot (Jupiter only).
    if (spot) {
        const grd = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, spot.r);
        grd.addColorStop(0, spot.coreColor);
        grd.addColorStop(0.6, spot.midColor);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(spot.x, spot.y, spot.r, spot.r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    return tex;
}

function _jupiterSurfaceTexture() {
    if (_planetTexCache.jupiter) return _planetTexCache.jupiter;
    const bands = [
        { y0: 0.00, y1: 0.06, color: '#b08868' },
        { y0: 0.06, y1: 0.12, color: '#d4a878' },
        { y0: 0.12, y1: 0.20, color: '#9c6c4c' },
        { y0: 0.20, y1: 0.28, color: '#e8c898' },
        { y0: 0.28, y1: 0.34, color: '#a87858' },
        { y0: 0.34, y1: 0.40, color: '#e0b888' },
        { y0: 0.40, y1: 0.48, color: '#f0d8b0' },
        { y0: 0.48, y1: 0.54, color: '#d8a878' },
        { y0: 0.54, y1: 0.60, color: '#e8c898' },
        { y0: 0.60, y1: 0.66, color: '#9c6c4c' },
        { y0: 0.66, y1: 0.74, color: '#d4a878' },
        { y0: 0.74, y1: 0.80, color: '#a87858' },
        { y0: 0.80, y1: 0.88, color: '#d4a878' },
        { y0: 0.88, y1: 0.94, color: '#9c6c4c' },
        { y0: 0.94, y1: 1.00, color: '#b08868' }
    ];
    const tex = _gasGiantTexture(bands, {
        count: 700, rxMin: 18, rxMax: 90, ryMin: 2.5, ryMax: 8,
        lightTint: 'rgba(255,238,205,0.18)', darkTint: 'rgba(95,65,38,0.18)'
    }, {
        x: 1024 * 0.65, y: 512 * 0.62, r: 70,
        coreColor: '#cc4422', midColor: '#aa3318'
    });
    _planetTexCache.jupiter = tex;
    return tex;
}

function _saturnSurfaceTexture() {
    if (_planetTexCache.saturn) return _planetTexCache.saturn;
    const bands = [
        { y0: 0.00, y1: 0.10, color: '#b89858' },
        { y0: 0.10, y1: 0.20, color: '#d4b878' },
        { y0: 0.20, y1: 0.30, color: '#e0c898' },
        { y0: 0.30, y1: 0.40, color: '#d4b878' },
        { y0: 0.40, y1: 0.50, color: '#e8cca0' },
        { y0: 0.50, y1: 0.60, color: '#d8b888' },
        { y0: 0.60, y1: 0.70, color: '#e0c898' },
        { y0: 0.70, y1: 0.80, color: '#c8a868' },
        { y0: 0.80, y1: 0.90, color: '#d4b878' },
        { y0: 0.90, y1: 1.00, color: '#b89858' }
    ];
    const tex = _gasGiantTexture(bands, {
        count: 320, rxMin: 18, rxMax: 70, ryMin: 1.5, ryMax: 5,
        lightTint: 'rgba(255,240,210,0.10)', darkTint: 'rgba(140,100,60,0.10)'
    }, null);
    _planetTexCache.saturn = tex;
    return tex;
}

// Apply a procedural texture to non-Earth planets that benefit from one.
// Venus / Uranus / Neptune are intentionally left as their solid-colour
// Lambert disc — they read fine that way against the reference image.
function enhancePlanet(planet, name, radius) {
    if (!planet || typeof THREE === 'undefined') return;
    if (planet.userData && planet.userData._textured) return;
    let tex = null;
    let usePhong = false;
    switch (name) {
        case 'Mercury': tex = _mercurySurfaceTexture(); break;
        case 'Mars':    tex = _marsSurfaceTexture(); break;
        case 'Jupiter': tex = _jupiterSurfaceTexture(); usePhong = true; break;
        case 'Saturn':  tex = _saturnSurfaceTexture(); usePhong = true; break;
        default: return;
    }
    const newMat = usePhong
        ? new THREE.MeshPhongMaterial({ map: tex, specular: 0x553322, shininess: 8 })
        : new THREE.MeshLambertMaterial({ map: tex });
    if (planet.material && planet.material.dispose) planet.material.dispose();
    planet.material = newMat;
    planet.userData._textured = true;
}
if (typeof window !== 'undefined') window.enhancePlanet = enhancePlanet;


// =============================================================================
// PLANETARY PRESENCE KIT — rings, night-side city lights, limb darkening.
// =============================================================================
// Reference bar (user-supplied Homeworld-style plates): planets are LANDMARKS.
// They are huge in frame, they carry a ring plane you can read the system's
// ecliptic from, their night side is speckled with city light, and their limb
// falls off into a soft terminator rather than ending on a hard circle. What
// this game had instead: nebula-cluster planets were flat unlit
// MeshBasicMaterial discs at 0.85 opacity (no terminator, no limb, no
// silhouette — literally a coloured circle), and their "rings" were 2-5
// concentric flat hoops of solid colour.
//
// Three shared pieces below fix that, all procedural (no texture downloads),
// all cached by colour so a hundred planets share a handful of GPU objects.
// =============================================================================
const _ringTexCache = {};

// Banded ring texture. RingGeometry's UVs are a SQUARE projection — uv =
// (vertex.xy / outerRadius + 1) / 2 — so texture radius 0.5 is the OUTER rim
// and 0.5 * (inner/outer) is the inner lip. _PLANET_RING_IN is that ratio,
// baked in so every caller builds its geometry to match.
const _PLANET_RING_IN = 0.56;

function _planetRingTexture(color) {
    // CACHE KEY BY HUE BUCKET, NOT BY THE ARGUMENT. Callers pass either a hex
    // number (Sol) or a THREE.Color (procedural systems), and 'pr' + aColor
    // stringifies to 'pr[object Object]' — so every procedurally-tinted ring
    // in the game silently shared ONE texture, whichever was built first.
    // Bucketing the hue also bounds memory: hundreds of ringed worlds collapse
    // onto at most ~5 dozen 512² plates instead of one each.
    const src = new THREE.Color(color);
    const shl = { h: 0, s: 0, l: 0 };
    src.getHSL(shl);
    const hb = Math.round(shl.h * 23) / 23;
    const sb = Math.round(shl.s * 3) / 3;
    const key = 'pr' + hb.toFixed(3) + '_' + sb.toFixed(2);
    if (_ringTexCache[key]) return _ringTexCache[key];
    const c = new THREE.Color().setHSL(hb, sb, 0.58);
    const size = _isMobileRenderTier() ? 256 : 512;

    // 1D radial density: broad ringlet structure from three detuned harmonics,
    // three carved gaps (a Cassini-scale one plus two narrow ones), and a
    // feather at both edges so the ring plane dissolves instead of ending on a
    // geometric circle — the "hard cut edge" failure the sky critic flagged
    // elsewhere applies just as much here.
    const N = 1024;
    const dens = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        let v = 0.58
            + 0.20 * Math.sin(t * Math.PI * 2 * 9 + 1.7)
            + 0.13 * Math.sin(t * Math.PI * 2 * 23 + 0.4)
            + 0.08 * Math.sin(t * Math.PI * 2 * 47 + 2.9);
        const gap = (centre, width, depth) => {
            const q = (t - centre) / width;
            v *= 1 - depth * Math.exp(-q * q);
        };
        gap(0.42, 0.024, 0.93);
        gap(0.67, 0.014, 0.72);
        gap(0.17, 0.012, 0.55);
        v *= _gsmooth(0.0, 0.07, t) * (1 - _gsmooth(0.84, 1.0, t));
        dens[i] = v < 0 ? 0 : v;
    }

    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const data = img.data;
    // Ice-bright and dusty-dark tints derived from the planet's own hue, so a
    // violet world gets violet-grey ice rather than the same beige for all.
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    const bright = new THREE.Color().setHSL(hsl.h, Math.min(0.55, hsl.s * 0.6 + 0.10), 0.82);
    const dark = new THREE.Color().setHSL(hsl.h, Math.min(0.65, hsl.s * 0.8 + 0.05), 0.34);

    for (let y = 0; y < size; y++) {
        const dy = (y + 0.5) / size - 0.5;
        for (let x = 0; x < size; x++) {
            const dx = (x + 0.5) / size - 0.5;
            const rr = 2 * Math.sqrt(dx * dx + dy * dy);
            const i = (y * size + x) * 4;
            if (rr > 1.0 || rr < _PLANET_RING_IN) { data[i + 3] = 0; continue; }
            const t = (rr - _PLANET_RING_IN) / (1 - _PLANET_RING_IN);
            const d = dens[Math.min(N - 1, Math.round(t * (N - 1)))];
            if (d <= 0.004) { data[i + 3] = 0; continue; }
            // Denser lanes read icier, thin lanes read as dust.
            const k = Math.min(1, d * 1.15);
            data[i] = (dark.r + (bright.r - dark.r) * k) * 255;
            data[i + 1] = (dark.g + (bright.g - dark.g) * k) * 255;
            data[i + 2] = (dark.b + (bright.b - dark.b) * k) * 255;
            data[i + 3] = Math.min(1, d * 0.92) * 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    _ringTexCache[key] = tex;
    return tex;
}

// Attach a banded ring plane sized to the planet. `tilt` is the extra lean off
// the ecliptic in radians (Uranus gets a near-polar one). Returns the mesh.
function addPlanetRings(planet, radius, color, opts) {
    if (!planet || typeof THREE === 'undefined') return null;
    const o = opts || {};
    const outer = radius * (o.outerK || 2.35);
    const inner = outer * _PLANET_RING_IN;
    const geo = new THREE.RingGeometry(inner, outer, o.segments || 96);
    const mat = new THREE.MeshBasicMaterial({
        map: _planetRingTexture(color),
        transparent: true,
        opacity: o.opacity === undefined ? 0.85 : o.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = Math.PI / 2 + (o.tilt || 0);
    ring.rotation.z = o.roll || 0;
    ring.frustumCulled = false;
    ring.renderOrder = 4;
    ring.userData.isPlanetRing = true;
    planet.add(ring);

    // SPIN DECOUPLING. game-core's updatePlanetOrbits() adds ~0.02 rad of
    // rotation.y to EVERY planet every frame, and a child inherits that. An
    // equatorial ring (tilt 0) doesn't care — it is symmetric about the spin
    // axis — but any LEANT ring plane gets swung around the axis at ~70°/s,
    // which reads as the ring tumbling like a flipped coin. Uranus's polar
    // ring is the extreme case. So leant rings cache their intended
    // orientation and cancel the parent's yaw each frame instead.
    if (Math.abs(o.tilt || 0) > 0.02 || Math.abs(o.roll || 0) > 0.02) {
        ring.userData._ringFixed = new THREE.Quaternion().copy(ring.quaternion);
        _tiltedPlanetRings.push(ring);
    }
    return ring;
}
if (typeof window !== 'undefined') window.addPlanetRings = addPlanetRings;

const _tiltedPlanetRings = [];
const _ringYawQ = (typeof THREE !== 'undefined') ? new THREE.Quaternion() : null;
const _ringAxisY = (typeof THREE !== 'undefined') ? new THREE.Vector3(0, 1, 0) : null;
function updatePlanetRingTilts() {
    if (!_ringYawQ) return;
    for (let i = 0; i < _tiltedPlanetRings.length; i++) {
        const ring = _tiltedPlanetRings[i];
        const p = ring.parent;
        if (!p) continue;
        _ringYawQ.setFromAxisAngle(_ringAxisY, -p.rotation.y);
        ring.quaternion.copy(_ringYawQ).multiply(ring.userData._ringFixed);
    }
}
if (typeof window !== 'undefined') window.updatePlanetRingTilts = updatePlanetRingTilts;

// -----------------------------------------------------------------------------
// PLANET PRESENCE MATERIAL — one program, per-planet uniforms.
// -----------------------------------------------------------------------------
// Everything the reference plates read as "a world" and a flat disc does not:
//
//   • TERMINATOR from a real light position (the system's own star), so the
//     planet has a lit side and a dark side and therefore a direction.
//   • LIMB DARKENING (mu^0.42) — the single cheapest cue that turns a circle
//     into a sphere.
//   • NIGHT-SIDE CITY LIGHTS — hashed speckle gated to "continents" and to the
//     dark hemisphere, brightest near the terminator, dying at the limb.
//   • CLOUD SHELL — an fbm weather layer blended over the surface, so worlds
//     have banding and highlights instead of one flat albedo.
//   • ATMOSPHERE RIM — a fresnel edge that lights up on the lit crescent, which
//     is what separates the silhouette from the black behind it.
//
// It is opaque (no transparent-queue sorting against the nebula sprites, which
// is what made the old 0.85-opacity discs flicker in front of/behind gas) and
// costs one extra material per planet, not one extra draw call.
const _PLANET_PRESENCE_FRAG = `
    uniform vec3 uColor;
    uniform vec3 uNight;
    uniform vec3 uRim;
    uniform vec3 uSun;
    uniform float uCity;
    uniform float uCloud;
    uniform float uSeed;
    varying vec3 vN;
    varying vec3 vW;

    float h21(vec2 p) {
        p = fract(p * vec2(127.31, 311.7));
        p += dot(p, p.yx + 41.17);
        return fract(p.x * p.y * 95.43);
    }
    float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = h21(i), b = h21(i + vec2(1.0, 0.0));
        float c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.07; a *= 0.5; }
        return s;
    }

    void main() {
        vec3 N = normalize(vN);
        vec3 L = normalize(uSun - vW);
        vec3 V = normalize(cameraPosition - vW);
        float ndl = dot(N, L);
        float day = smoothstep(-0.11, 0.30, ndl);
        float mu = clamp(dot(N, V), 0.0, 1.0);
        float limb = pow(mu, 0.42);

        // Surface parameterisation from the normal (lon, lat).
        vec2 sp = vec2(atan(N.z, N.x) * 1.4, asin(clamp(N.y, -1.0, 1.0)) * 2.2) + uSeed;

        float land = smoothstep(0.44, 0.62, fbm(sp * 2.4));
        float cl = smoothstep(0.46, 0.80, fbm(sp * vec2(3.4, 5.2) + 7.0)) * uCloud;

        vec3 albedo = uColor * (0.82 + 0.30 * land);
        vec3 base = albedo * (0.045 + 0.955 * day) * (0.42 + 0.58 * limb);
        vec3 cloudLit = vec3(0.93, 0.95, 1.0) * (0.08 + 0.92 * day) * (0.5 + 0.5 * limb);
        base = mix(base, cloudLit, cl * 0.78);

        // NIGHT LIGHTS. Gated to land, to the dark hemisphere, and away from
        // the limb (city glow you see edge-on is atmosphere, not lamps).
        float night = smoothstep(0.12, -0.24, ndl);
        // See the note in the night-shell shader: coarse hash cells read as
        // tiles, not lamps. Fine grain plus a sparse bright octave.
        float grid = h21(floor(sp * vec2(240.0, 162.0)));
        float spark = smoothstep(0.880, 0.998, grid);
        float big = smoothstep(0.972, 0.999, h21(floor(sp * vec2(66.0, 46.0)) + 9.1));
        vec3 lights = uNight * (spark + big * 0.85) * land * night * uCity
                      * (0.20 + 0.80 * limb) * (1.0 - cl * 0.75);

        // ATMOSPHERE RIM.
        float fres = pow(1.0 - mu, 3.2);
        vec3 rim = uRim * fres * (0.18 + 0.95 * smoothstep(-0.40, 0.35, ndl));

        gl_FragColor = vec4(base + lights * 2.4 + rim, 1.0);
    }
`;

const _PLANET_PRESENCE_VERT = `
    varying vec3 vN;
    varying vec3 vW;
    void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

function createPlanetPresenceMaterial(opts) {
    const o = opts || {};
    const col = new THREE.Color(o.color === undefined ? 0x88aacc : o.color);
    const hsl = { h: 0, s: 0, l: 0 };
    col.getHSL(hsl);
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: col },
            // City light is warm sodium-amber by default; exotic worlds can
            // pass their own so a crystal world glows in its own hue.
            uNight: { value: new THREE.Color(o.nightColor === undefined ? 0xffbe5c : o.nightColor) },
            // Rim inherits the planet's hue but pushed bright and cool, which
            // is what reads as "atmosphere" rather than "outline".
            uRim: { value: o.rimColor !== undefined
                ? new THREE.Color(o.rimColor)
                : new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.7 + 0.25), 0.62).multiplyScalar(o.rim === undefined ? 0.55 : o.rim) },
            uSun: { value: (o.sun && o.sun.clone) ? o.sun.clone() : new THREE.Vector3(0, 0, 0) },
            uCity: { value: o.city === undefined ? 0.0 : o.city },
            uCloud: { value: o.cloud === undefined ? 0.0 : o.cloud },
            uSeed: { value: o.seed === undefined ? Math.random() * 40 : o.seed }
        },
        vertexShader: _PLANET_PRESENCE_VERT,
        fragmentShader: _PLANET_PRESENCE_FRAG,
        transparent: false,
        depthWrite: true,
        fog: false
    });
}
if (typeof window !== 'undefined') window.createPlanetPresenceMaterial = createPlanetPresenceMaterial;

// -----------------------------------------------------------------------------
// NIGHT-SIDE SHELL — city lights + atmosphere rim for planets that keep their
// stock lit material (the Sol system runs on a real PointLight and a Phong
// Earth, and swapping that out would throw away the sunlight the whole system
// is graded around). This adds the two things stock materials cannot do:
// emissive lamps that only appear where the sun does not reach, and a fresnel
// limb. Additive, depth-tested against the planet it hugs.
// -----------------------------------------------------------------------------
const _NIGHT_SHELL_FRAG = `
    uniform vec3 uNight;
    uniform vec3 uRim;
    uniform vec3 uSun;
    uniform float uCity;
    uniform float uSeed;
    varying vec3 vN;
    varying vec3 vW;

    float h21(vec2 p) {
        p = fract(p * vec2(127.31, 311.7));
        p += dot(p, p.yx + 41.17);
        return fract(p.x * p.y * 95.43);
    }
    float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = h21(i), b = h21(i + vec2(1.0, 0.0));
        float c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.07; a *= 0.5; }
        return s;
    }

    void main() {
        vec3 N = normalize(vN);
        vec3 L = normalize(uSun - vW);
        vec3 V = normalize(cameraPosition - vW);
        float ndl = dot(N, L);
        float mu = clamp(dot(N, V), 0.0, 1.0);

        vec2 sp = vec2(atan(N.z, N.x) * 1.4, asin(clamp(N.y, -1.0, 1.0)) * 2.2) + uSeed;
        // Bigger, better-separated land masses: cities that ignore the
        // coastlines read as glitter sprinkled over a ball. Two octaves of
        // gating (continent, then habitable band) leave real dark oceans.
        float land = smoothstep(0.47, 0.61, fbm(sp * 1.7))
                   * (0.35 + 0.65 * smoothstep(0.40, 0.70, fbm(sp * 4.3 + 21.0)));
        float night = smoothstep(0.14, -0.26, ndl);
        // GRAIN MATTERS. At vec2(64,44) each hash cell covered ~2 degrees of
        // arc, which on a planet that fills half the frame is a 20-pixel
        // square — the night side read as a mosaic of yellow tiles, not as
        // cities. At this frequency a cell is a few pixels even at hero scale.
        float grid = h21(floor(sp * vec2(268.0, 178.0)));
        float spark = smoothstep(0.926, 0.999, grid);
        // Sparse second octave: a few bright metropolises among the towns.
        float big = smoothstep(0.972, 0.999, h21(floor(sp * vec2(74.0, 50.0)) + 9.1));
        // A faint sodium haze under the sparks so cities read as basins of
        // light, not as loose confetti.
        float haze = smoothstep(0.58, 0.90, fbm(sp * 15.0)) * 0.22;
        vec3 lamps = uNight * (spark + big * 0.9 + haze) * land * night * uCity * (0.18 + 0.82 * mu);

        float fres = pow(1.0 - mu, 3.0);
        vec3 rim = uRim * fres * (0.20 + 1.05 * smoothstep(-0.45, 0.30, ndl));

        gl_FragColor = vec4(lamps * 2.6 + rim, 1.0);
    }
`;

function addNightSideShell(planet, radius, opts) {
    if (!planet || typeof THREE === 'undefined') return null;
    const o = opts || {};
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uNight: { value: new THREE.Color(o.nightColor === undefined ? 0xffc169 : o.nightColor) },
            uRim: { value: new THREE.Color(o.rimColor === undefined ? 0x4d9fff : o.rimColor)
                .multiplyScalar(o.rim === undefined ? 0.60 : o.rim) },
            uSun: { value: (o.sun && o.sun.clone) ? o.sun.clone() : new THREE.Vector3(0, 0, 0) },
            uCity: { value: o.city === undefined ? 1.0 : o.city },
            uSeed: { value: o.seed === undefined ? Math.random() * 40 : o.seed }
        },
        vertexShader: _PLANET_PRESENCE_VERT,
        fragmentShader: _NIGHT_SHELL_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
        fog: false
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.035, 56, 40), mat);
    shell.frustumCulled = false;
    shell.renderOrder = 3;
    shell.userData.isNightShell = true;
    planet.add(shell);
    return shell;
}
if (typeof window !== 'undefined') window.addNightSideShell = addNightSideShell;

// =============================================================================
// PRESENCE-BODY TESSELLATION LOD
// =============================================================================
// The 567 nebula-cluster worlds pick their segment count ONCE, from their world
// radius: 56x40 above r=90, 36x28 above r=20, 16x16 below. Radius is the wrong
// axis. What decides whether a limb reads as a polygon is how many PIXELS the
// silhouette spans, and that is r/distance — a 30-unit moon you are flying past
// at three radii fills more frame, and shows its facets harder, than a
// 140-unit giant seen from across its system. Every one of these bodies is a
// flyby target (they carry the mining routes and the civilian traffic), so
// "small" here does not mean "never close".
//
// So: keep the shipped count as the FLOOR and add two tiers above it, chosen
// per frame from angular size. Structure is deliberately the same shape as the
// one js/proc-galaxies.js uses for its own bodies — a per-body [t0, t1, t2]
// cache, tiers built lazily, hysteresis on the way down — because divergent
// LOD implementations in one scene drift into visibly different pop distances.
//
// Budget. Only bodies inside ~11 radii ever build the hero tier, which is a
// handful at a time, and the tier is released the moment a body drops back
// past the mid boundary, so live hero geometry is bounded by what is actually
// near the camera rather than by everywhere you have ever been. The sweep is
// amortised: 150 bodies every 6th frame, i.e. the full set every ~0.4s, at a
// cost of one squared distance each.
const PB_LOD = {
    enabled: true,
    hero: [72, 48],          // inside ~11 radii
    mid: [44, 30],           // inside ~45 radii
    heroAng: 0.090,          // r/d
    midAng: 0.022,
    heroDrop: 0.076,         // hysteresis: fall this far before demoting
    midDrop: 0.018,
    perPass: 150,
    everyNFrames: 6,
    built: 0,
    swaps: 0
};

const _pbList = [];
let _pbScanned = false;
let _pbSeenCount = -1;
let _pbCursor = 0;
let _pbFrame = 0;
const _pbTmp = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

// A body qualifies if it wears the planet-presence program and a sphere we can
// re-tessellate. Nothing else in `planets` is touched.
function _pbScan() {
    const arr = (typeof planets !== 'undefined' && planets) ? planets
              : ((typeof window !== 'undefined' && window.planets) ? window.planets : null);
    if (!arr || !arr.length) return false;
    _pbList.length = 0;
    for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (!b || !b.material || !b.material.uniforms) continue;
        if (b.material.uniforms.uCity === undefined) continue;
        // Already registered by an earlier sweep — re-list it, but do NOT
        // rebuild its bookkeeping: that would orphan a mounted hero tier and
        // lie about which tier the mesh is actually wearing.
        if (b.userData._pbGeo) { _pbList.push(b); continue; }
        const g = b.geometry;
        const p = g && g.parameters;
        if (!p || !(p.radius > 0) || !(p.widthSegments > 0)) continue;
        b.userData._pbGeo = [g, null, null];
        b.userData._pbTier = 0;
        b.userData._pbR = p.radius;
        // Floor the added tiers at what the body already had, so this can only
        // ever add silhouette, never take it away from a 56x40 giant.
        b.userData._pbSegs = [
            [p.widthSegments, p.heightSegments],
            [Math.max(PB_LOD.mid[0], p.widthSegments), Math.max(PB_LOD.mid[1], p.heightSegments)],
            [Math.max(PB_LOD.hero[0], p.widthSegments), Math.max(PB_LOD.hero[1], p.heightSegments)]
        ];
        _pbList.push(b);
    }
    return true;
}

function _pbSetTier(b, tier) {
    const ud = b.userData;
    if (ud._pbTier === tier) return;
    const cache = ud._pbGeo;
    if (!cache[tier]) {
        const s = ud._pbSegs[tier];
        cache[tier] = new THREE.SphereGeometry(ud._pbR, s[0], s[1]);
        PB_LOD.built++;
    }
    b.geometry = cache[tier];
    ud._pbTier = tier;
    PB_LOD.swaps++;
    // Release the hero tier once the body is no longer anywhere near hero
    // framing. Tier 0 is never released — it is the shipped geometry and the
    // one every distant body is sitting on.
    if (tier === 0 && cache[2]) {
        cache[2].dispose();
        cache[2] = null;
    }
}

function updatePresenceBodyLod(camera) {
    if (!PB_LOD.enabled || typeof THREE === 'undefined' || !_pbTmp) return;
    if ((_pbFrame++ % PB_LOD.everyNFrames) !== 0) return;
    const cam = camera || (typeof window !== 'undefined' ? window.camera : null);
    if (!cam || !cam.position) return;
    // The nebula clusters are built in stages, so a single scan at first tick
    // would miss every world created after it. Re-scan whenever the global
    // body count has moved; already-registered bodies keep their tier because
    // the bookkeeping lives on userData, not in the list.
    const _all = (typeof planets !== 'undefined' && planets) ? planets
               : ((typeof window !== 'undefined' && window.planets) ? window.planets : null);
    const _len = _all ? _all.length : 0;
    if (!_pbScanned || _len !== _pbSeenCount) {
        if (!_pbScan()) return;
        _pbScanned = true;
        _pbSeenCount = _len;
    }
    if (!_pbList.length) return;

    const cp = cam.position;
    const n = Math.min(PB_LOD.perPass, _pbList.length);
    for (let k = 0; k < n; k++) {
        if (_pbCursor >= _pbList.length) _pbCursor = 0;
        const b = _pbList[_pbCursor++];
        if (!b || !b.parent) continue;
        const ud = b.userData;
        // Moons here are parented to their planet, so object.position is a
        // LOCAL offset — scoring on it would make every moon look like it was
        // filling the screen and take a hero tier it never earns.
        const e = b.matrixWorld.elements;
        _pbTmp.set(e[12] - cp.x, e[13] - cp.y, e[14] - cp.z);
        const d = _pbTmp.length();
        if (d < 1e-3) continue;
        const ang = ud._pbR / d;
        const cur = ud._pbTier;
        let tier;
        if (ang >= PB_LOD.heroAng) tier = 2;
        else if (ang >= PB_LOD.midAng) tier = 1;
        else tier = 0;
        // Hysteresis on the way DOWN only, so drifting on a boundary cannot
        // strobe the geometry.
        if (tier < cur) {
            if (cur === 2 && ang > PB_LOD.heroDrop) tier = 2;
            else if (tier === 0 && ang > PB_LOD.midDrop) tier = 1;
        }
        if (tier !== cur) _pbSetTier(b, tier);
    }
}
if (typeof window !== 'undefined') {
    window.updatePresenceBodyLod = updatePresenceBodyLod;
    window.PB_LOD = PB_LOD;
    window.presenceLodDebug = function () {
        const t = [0, 0, 0];
        for (let i = 0; i < _pbList.length; i++) t[_pbList[i].userData._pbTier]++;
        return {
            bodies: _pbList.length, base: t[0], mid: t[1], hero: t[2],
            geometriesBuilt: PB_LOD.built, swaps: PB_LOD.swaps
        };
    };
}

// Slow independent cloud drift so weather parallaxes against the surface.
function updateEarthClouds() {
    for (let i = 0; i < _earthClouds.length; i++) {
        const c = _earthClouds[i];
        if (c) c.rotation.y += 0.0002;
    }
    // Piggybacked here rather than added to animate()'s call list because
    // game-core.js / index.html are sealed this wave, and this is already the
    // per-frame "planet shells" pass. See updatePlanetRingTilts for why leant
    // ring planes have to cancel their parent's spin.
    updatePlanetRingTilts();
    updateStarPhotospheres();
    updatePresenceBodyLod(typeof camera !== 'undefined' ? camera : null);
}
if (typeof window !== 'undefined') window.updateEarthClouds = updateEarthClouds;

// =============================================================================
// GRAVITATIONAL-LENSING ILLUSION
// =============================================================================
// A true lens needs the scene rendered to a texture and re-sampled per pixel.
// This gets ~90% of the read for one billboarded quad and no render target:
// the shader generates its OWN starfield procedurally from the world-space
// view ray, then bends that ray before sampling it.
//
//   • rs = r - θE²/r  is the thin-lens deflection. Far from the hole rs ≈ r
//     (the sky is untouched); approaching θE the sampled radius collapses to
//     zero, so the star field visibly COMPRESSES and smears into a ring.
//   • rs goes NEGATIVE inside θE, which is not a bug — that is the secondary
//     image, the mirrored copy of the sky behind the hole, and it renders on
//     the far side automatically.
//   • Magnification (1/|s|) brightens the compressed annulus, producing an
//     Einstein ring that lines up with the sprite's photon ring.
//
// Because the ray is reconstructed in WORLD space from `cameraPosition`, the
// lensed stars stay pinned to the sky as you orbit — they don't slide around
// with the billboard the way a plane-space pattern would.
function _gargantuaLensMaterial(color, shadowFrac) {
    const lite = _isMobileRenderTier();
    const frag = `
        uniform vec3 uCenter;
        uniform float uShadow;
        uniform float uEinstein;
        uniform float uOpacity;
        uniform vec3 uWarm;
        uniform float uSeed;
        varying vec2 vUv;
        varying vec3 vWorld;

        float h31(vec3 p) {
            p = fract(p * 0.1031);
            p += dot(p, p.yzx + 33.33);
            return fract((p.x + p.y) * p.z);
        }

        float starLayer(vec3 d, float sc, float thr, float sd) {
            vec3 g = d * sc + sd;
            vec3 id = floor(g);
            vec3 f = fract(g);
            float hh = h31(id);
            if (hh < thr) return 0.0;
            vec3 cpt = vec3(h31(id + 11.3), h31(id + 27.7), h31(id + 41.1)) * 0.5 + 0.25;
            float dd = length(f - cpt);
            float b = (hh - thr) / (1.0 - thr);
            return smoothstep(0.21, 0.0, dd) * (0.25 + 0.75 * b);
        }

        void main() {
            vec2 p = (vUv - 0.5) * 2.0;
            float r = length(p);
            float body = 1.0 - smoothstep(0.70, 1.0, r);
            if (body <= 0.0 || uOpacity <= 0.001) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }

            vec3 rel = vWorld - uCenter;
            float th2 = uEinstein * uEinstein;
            float rs = r - th2 / max(r, 0.015);
            float s = rs / max(r, 0.0001);

            vec3 dir = normalize((uCenter + rel * s) - cameraPosition);

            float stars = starLayer(dir, 120.0, 0.968, uSeed);
            ${lite ? '' : 'stars += starLayer(dir, 265.0, 0.984, uSeed + 17.0) * 0.75;'}

            float mag = clamp(0.32 / (abs(s) + 0.11), 0.0, 3.2);

            float shade = smoothstep(uShadow * 0.98, uShadow * 1.10, r);
            // THIN. The Einstein arc used to be an 11%-wide gaussian carrying
            // a 0.28 amplitude — wide enough and dim enough to read as one
            // more layer of the grey halo rather than as a ring. Halved in
            // width and lifted in amplitude: less area, more punch.
            float rd = (r - uEinstein) / (uEinstein * 0.055);
            float ring = exp(-rd * rd);

            // The procedural star field is SUPPORT, not the subject. At 1.35
            // it laid a speckled wash over a quad several black-hole radii
            // wide, which is most of what "grey halo" was made of.
            float a = (stars * mag * 0.72 + ring * 0.62) * shade * body * uOpacity;
            vec3 col = mix(vec3(0.74, 0.86, 1.0), uWarm, ring * 0.80);
            gl_FragColor = vec4(col * a, 1.0);
        }
    `;
    return new THREE.ShaderMaterial({
        uniforms: {
            uCenter: { value: new THREE.Vector3() },
            uShadow: { value: shadowFrac },
            uEinstein: { value: shadowFrac * 1.45 },
            uOpacity: { value: 0.0 },
            uWarm: { value: new THREE.Color(color) },
            uSeed: { value: Math.random() * 90.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorld;
            void main() {
                vUv = uv;
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorld = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: frag,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        fog: false
    });
}

// =============================================================================
// POLAR JETS — twin relativistic plumes along the hole's spin axis.
// Two tapered open cylinders per pole (a bright core plume + a wide dim
// sheath), additive, with the texture scrolled outward every frame. The
// equatorial disk lies in XZ (its rotation.x = PI/2), so ±Y is the spin axis.
// Reserved for the gargantua PAIR — Sgr A* and the Companion Core — so the
// two supermassive landmarks read as different in kind from the ordinary
// galaxy-core holes, not just bigger.
// =============================================================================
function addPolarJets(blackHole, radius, color, lengthK) {
    if (!blackHole || typeof THREE === 'undefined') return;
    if (!blackHole.userData) blackHole.userData = {};
    if (blackHole.userData._gargJets) return;
    // Normally called right after addGargantuaVisuals, which owns this list;
    // stand one up anyway so jets can never silently skip the distance fade.
    if (!blackHole.userData._gargFade) blackHole.userData._gargFade = [];

    const tex = _gargantuaJetTexture(color === undefined ? 0x66ddff : color);
    const len = radius * (lengthK || 11);
    const jets = [];

    // [tip radius, throat radius, opacity, renderOrder]. The wide sheath is
    // the expensive half — a near-screen-filling additive cone — and it is
    // pure volume, no silhouette, so mobile drops it and keeps the plume.
    const shells = _isMobileRenderTier()
        ? [[radius * 1.15, radius * 0.10, 0.70, 67]]
        : [[radius * 1.15, radius * 0.10, 0.70, 67],
           [radius * 2.30, radius * 0.22, 0.15, 66]];

    for (let s = 0; s < shells.length; s++) {
        const sh = shells[s];
        const geo = new THREE.CylinderGeometry(sh[0], sh[1], len, 18, 20, true);
        // Cylinders are built centred on the origin; slide up so the narrow
        // end starts at the event horizon and the plume opens outward.
        geo.translate(0, len / 2, 0);

        // Break the cone's silhouette. A mathematically perfect cone reads as
        // a searchlight beam, not as plasma; bending the radius with two
        // integer-harmonic waves (integer so they stay continuous across the
        // wrap seam) gives the plume an irregular, twisted edge for free at
        // build time and zero cost per frame.
        const pos = geo.attributes.position;
        const seed = Math.random() * 6.28;
        for (let v = 0; v < pos.count; v++) {
            const x = pos.getX(v), z = pos.getZ(v);
            const rr = Math.sqrt(x * x + z * z);
            if (rr < 1e-4) continue;
            const th = Math.atan2(z, x);
            const yn = pos.getY(v) / len;
            const wob = 1 +
                0.17 * Math.sin(th * 3 + yn * 9.0 + seed) +
                0.10 * Math.sin(th * 5 - yn * 14.0 + seed * 1.7);
            pos.setX(v, Math.cos(th) * rr * wob);
            pos.setZ(v, Math.sin(th) * rr * wob);
        }

        // Length falloff as VERTEX COLOUR, so the cone dissolves into the
        // dark instead of ending on the geometry's open rim, and so the
        // scrolling texture can't drag the shape around with it. The dip at
        // the very throat (y→0) keeps the narrow end from reading as a
        // flat-capped white wedge glued to the sphere.
        const col = new Float32Array(pos.count * 3);
        for (let v = 0; v < pos.count; v++) {
            const y = pos.getY(v) / len;                    // 0 throat → 1 tip
            const ignite = Math.min(1, 0.18 + y / 0.05);    // soft ignition
            const decay = Math.pow(1 - y, 2.0);             // long plume fade
            const a = ignite * decay;
            col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = a;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

        // Lift the whole plume clear of the horizon — AFTER the vertex
        // colours are baked, so the 0..1 throat→tip ramp above is unaffected.
        // The cone used to start at y=0, i.e. the CENTRE of the sphere, which
        // meant its near wall was drawn across the front hemisphere. That was
        // invisible enough while the horizon was a 95%-opaque grey-black
        // smudge; against a genuinely opaque shadow it reads as a hard-edged
        // grey rectangle sitting inside the hole and wrecks the silhouette.
        // Starting just outside the photon ring, the jet emerges from behind
        // the limb the way it should.
        geo.translate(0, radius * 1.02, 0);

        const mat = new THREE.MeshBasicMaterial({
            map: tex,
            vertexColors: true,
            transparent: true,
            opacity: sh[2],
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false
        });
        for (let pole = 0; pole < 2; pole++) {
            const m = new THREE.Mesh(geo, mat);
            if (pole === 1) m.rotation.x = Math.PI;   // mirror to the south pole
            m.frustumCulled = false;
            m.renderOrder = sh[3];
            m.userData.isGargantuaJet = true;
            blackHole.add(m);
            jets.push(m);
        }
        blackHole.userData._gargFade.push({ m: mat, base: sh[2] });
    }

    blackHole.userData._gargJets = jets;
    blackHole.userData._gargJetTex = tex;
}
if (typeof window !== 'undefined') window.addPolarJets = addPolarJets;

// Attach the photon-ring glow Sprite + a wide gradient accretion disk to
// an existing black-hole sphere. `radius` is the sphere radius; `color`
// the warm disk/glow tint (defaults to a fiery orange).
function addGargantuaVisuals(blackHole, radius, color, nearK, farK) {
    if (!blackHole || typeof THREE === 'undefined') return;
    if (blackHole.userData && blackHole.userData._gargantua) return;
    const col = (color === undefined || color === null) ? 0xff6a1a : color;

    // 1. Camera-facing glow + photon ring. Photon ring sits at ~0.37 of
    //    the texture, so a sprite of full-width W puts it at 0.37*W from
    //    centre — size it so that lands just outside the sphere.
    const glowMat = new THREE.SpriteMaterial({
        map: _gargantuaGlowTexture(col),
        // Over-range tint: the photon ring is the brightest thing in the
        // frame and has to survive the tone curve as pure white with a soft
        // shoulder, not as an 8-bit value the star sprites can out-shine.
        color: _hdrTint(1.85),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true
    });
    const glow = new THREE.Sprite(glowMat);
    const glowSize = radius * 3.1; // photon ring ≈ radius * 1.15
    glow.scale.set(glowSize * 2, glowSize * 2, 1);
    glow.frustumCulled = false;
    glow.renderOrder = 70;
    glow.userData.isGargantuaGlow = true;
    blackHole.add(glow);

    // 2. Wide doppler-beamed accretion disk. RingGeometry so the existing
    //    animate() blackhole loop keeps it flat in the equatorial plane
    //    (that loop skips anything flagged isGargantuaDisk, so the flag
    //    below must stay).
    const diskGeo = new THREE.RingGeometry(radius * _GARG_DISK_IN_K, radius * _GARG_DISK_OUT_K, 96);
    const diskMat = new THREE.MeshBasicMaterial({
        map: _gargantuaDiskTexture(col),
        // 2.6x over-range. The texture already carries the beaming ratio and
        // the radial temperature ramp; this pushes the approaching limb past
        // the tone curve's shoulder (so it clips to white) while leaving the
        // receding limb comfortably below it (so it stays a dim ember). That
        // separation is the entire read of "this thing is spinning".
        color: _hdrTint(2.6),
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
    });
    const disk = new THREE.Mesh(diskGeo, diskMat);
    disk.rotation.x = Math.PI / 2;
    disk.frustumCulled = false;
    disk.renderOrder = 68;
    disk.userData.isGargantuaDisk = true;
    blackHole.add(disk);

    if (!blackHole.userData) blackHole.userData = {};

    // 2b. LENSED WRAP ARCS — see _gargantuaWrapTexture. A single quad,
    //     billboarded + rolled + pushed toward the camera every frame by
    //     updateGargantuaProximityFade so it always draws in FRONT of the
    //     horizon sphere. depthTest stays on: the push guarantees the quad
    //     wins against the shadow while still being occluded by anything
    //     genuinely between the player and the hole.
    const wrapMat = new THREE.MeshBasicMaterial({
        map: _gargantuaWrapTexture(col),
        color: _hdrTint(2.2),
        transparent: true,
        opacity: 0.0,               // driven by the edge-on ramp per frame
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
    });
    const wrapGeo = new THREE.PlaneGeometry(1, 1);
    const wrap = new THREE.Mesh(wrapGeo, wrapMat);
    wrap.frustumCulled = false;
    wrap.renderOrder = 71;          // over the shadow, over the disk
    wrap.visible = false;
    wrap.userData.isGargantuaWrap = true;
    blackHole.add(wrap);
    blackHole.userData._gargWrap = wrap;
    blackHole.userData._gargWrapMat = wrapMat;
    blackHole.userData._gargWrapSize = radius * _GARG_WRAP_K * 2;
    blackHole.userData._gargWrapPush = radius * 1.0;
    // The doppler hot lobe is BAKED into the disk texture at local +X. Cached
    // here so the per-frame lock can steer it (see _gargLockDopplerLobe).
    blackHole.userData._gargDisk = disk;

    // 3. Lensing plane. Half-width == radius * LENS_K, so the shadow
    //    silhouette lands at 1/LENS_K in the shader's normalised space.
    //    7.0 made this a 14-radius-wide per-pixel additive quad — by far the
    //    largest overdraw in the whole black-hole stack, spent mostly on a
    //    faint star wash. At 5.0 its Einstein arc lands at 1.45 shadow radii,
    //    i.e. exactly on the outer edge of the wrap arcs, so the two agree
    //    instead of smearing each other.
    const LENS_K = 5.0;
    const lensMat = _gargantuaLensMaterial(col, 1.0 / LENS_K);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lensMat);
    lens.scale.set(radius * LENS_K * 2, radius * LENS_K * 2, 1);
    lens.renderOrder = 69;             // over the disk, under the photon ring
    lens.frustumCulled = true;         // one quad each; let the GPU skip them
    lens.visible = false;              // switched on by the proximity fade
    lens.userData.isGargantuaLens = true;
    blackHole.add(lens);

    // Proximity fade. ONLY the fake-Gargantua additions (the camera-
    // facing glow sprite, the accretion disk, the lens quad and any polar
    // jets) fade with distance. The original black-hole sphere material
    // and any legacy accretion rings are intentionally left untouched —
    // they keep their normal opacity regardless of how close the camera is.
    const fade = [
        { m: glowMat, base: 1.0 },
        { m: diskMat, base: 0.95 }
    ];
    blackHole.userData._gargFade = fade;
    blackHole.userData._gargLens = lens;
    blackHole.userData._gargLensMat = lensMat;
    // Refs for the slow "alive / unstable" corona pulse. Random phase so
    // every hole breathes out of sync with the others.
    blackHole.userData._gargGlow = glow;
    blackHole.userData._gargGlowScale = glowSize * 2;
    blackHole.userData._gargPulsePhase = Math.random() * Math.PI * 2;
    // Defaults (14 / 110) keep the 8 galaxy holes glowing from far enough
    // to navigate toward. Sgr A* / Companion Core pass a wide band tuned
    // so the effect sits at ~5% from the Sol start (~9.5k away) and
    // ramps the whole way to ~95% as the player closes in.
    blackHole.userData._gargNear = radius * (nearK || 14);   // ~95% within
    blackHole.userData._gargFar  = radius * (farK  || 110);  // ~5% beyond
    blackHole.userData._gargantua = true;
    if (gargantuaBlackHoles.indexOf(blackHole) === -1) {
        gargantuaBlackHoles.push(blackHole);
    }
}
if (typeof window !== 'undefined') window.addGargantuaVisuals = addGargantuaVisuals;

// Per-frame update for the fake-Gargantua glow + accretion disk.
// (The old per-vertex Doppler-beaming pass has been removed.)
//  • Proximity fade: opacity scales linearly with camera distance
//    across the hole's _gargNear.._gargFar band so the effect ramps
//    the whole way in instead of popping.
//  • Corona pulse: the halo glow slowly breathes brighter/dimmer and
//    grows/shrinks on two detuned sines so it reads as alive/unstable.
const _gargTmp = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _gargQ = (typeof THREE !== 'undefined') ? new THREE.Quaternion() : null;
// Scratch for the doppler lock + wrap arcs. Module-level so the per-frame
// path allocates nothing (this runs for every gargantua hole, every frame).
const _gargQ2 = (typeof THREE !== 'undefined') ? new THREE.Quaternion() : null;
const _gargQ3 = (typeof THREE !== 'undefined') ? new THREE.Quaternion() : null;
const _gargV1 = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _gargV2 = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _gargAxisZ = (typeof THREE !== 'undefined') ? new THREE.Vector3(0, 0, 1) : null;

// DOPPLER LOBE LOCK.
//
// The disk's beaming asymmetry — the ~33:1 brightness split between the limb
// coming toward you and the one going away — is BAKED into the texture at the
// disk's local +X. Baked asymmetry on a child of a rotating (or arbitrarily
// tilted) parent is asymmetry pointing in a meaningless direction: galaxy
// cores inherit their galaxy's tilt, several holes spin their child groups,
// and the result was a hot lobe parked wherever the parent happened to face,
// often on the receding side or straight away from the camera.
//
// Relativistic beaming is a VIEW-DEPENDENT effect. The bright limb is the one
// whose orbital velocity points at the observer: with spin axis ŷ, a parcel at
// p has velocity ŷ × p, and (ŷ × p)·V is maximised when p ∥ (V × ŷ). So the
// lobe direction is fixed by the camera, not by the parent's transform — which
// unparents it from the spin for free and is more correct than either.
//
// Everything is computed in the hole's LOCAL frame (the disk's parent) so the
// result survives any tilt the hole is carrying.
function _gargLockDopplerLobe(blackHole, camera, worldPos) {
    const disk = blackHole.userData._gargDisk;
    if (!disk || !_gargQ2) return;
    // View direction, hole → camera, in the hole's local frame.
    _gargV1.copy(camera.position).sub(worldPos);
    if (_gargV1.lengthSq() < 1e-6) return;
    blackHole.getWorldQuaternion(_gargQ2);
    _gargQ2.conjugate();
    _gargV1.applyQuaternion(_gargQ2).normalize();
    // d = V × ŷ, projected into the disk plane (local XZ).
    // (Vx,Vy,Vz) × (0,1,0) = (Vz*1 - Vy*0, 0 - 0, 0 - Vx*1) = (Vz, 0, -Vx).
    const dx = _gargV1.z, dz = -_gargV1.x;
    if (dx * dx + dz * dz < 1e-8) return;   // dead pole-on; leave as-is
    // The disk's euler is (x: PI/2, y: 0, z: phi) and three applies it as
    // Rx·Ry·Rz, so local +X lands at (cos phi, 0, sin phi) after the flat-lay
    // rotation. Solve for phi directly.
    disk.rotation.z = Math.atan2(dz, dx);
}

function updateGargantuaProximityFade(blackHole, camera) {
    if (!blackHole || !blackHole.userData || !camera || !_gargTmp) return;
    const fade = blackHole.userData._gargFade;
    if (!fade) return;
    blackHole.getWorldPosition(_gargTmp);
    const d = camera.position.distanceTo(_gargTmp);
    const near = blackHole.userData._gargNear || 1;
    const far = blackHole.userData._gargFar || (near * 8);
    let p = (far - d) / (far - near);
    p = p < 0 ? 0 : (p > 1 ? 1 : p);   // 0 at/beyond far, 1 within near
    // 12% .. 96% of each design opacity. The floor was 5% back when every
    // hole also wore an always-on flat accretion hoop; those hoops are gone
    // (they were the "plastic ring"), so the emissive disk is now the ONLY
    // thing marking a distant hole and has to stay legible from far out.
    const vis = 0.12 + 0.84 * p;
    for (let k = 0; k < fade.length; k++) {
        fade[k].m.opacity = fade[k].base * vis;
    }

    // Lensing quad. Billboarded by hand (a Sprite can't carry a custom
    // ShaderMaterial): world orientation := camera orientation, expressed
    // in the hole's local frame so galaxy cores that carry their galaxy's
    // tilt don't skew it. Kept OFF until the hole is genuinely close —
    // it is the only per-pixel work in this whole system, and a lensed
    // speck 40 radii away buys nothing.
    const lens = blackHole.userData._gargLens;
    if (lens) {
        const on = p > 0.12;
        lens.visible = on;
        if (on && _gargQ) {
            blackHole.getWorldQuaternion(_gargQ);
            _gargQ.conjugate();
            lens.quaternion.copy(_gargQ).multiply(camera.quaternion);
            const lm = blackHole.userData._gargLensMat;
            if (lm && lm.uniforms) {
                lm.uniforms.uCenter.value.copy(_gargTmp);
                // Ramps in over the top half of the approach so the sky
                // "starts to bend" as you commit to the hole.
                lm.uniforms.uOpacity.value = (p - 0.12) / 0.88;
            }
        }
    }

    // Keep the baked doppler hot lobe on the limb that is actually coming
    // toward the camera, whatever the parent is doing.
    _gargLockDopplerLobe(blackHole, camera, _gargTmp);

    // LENSED WRAP ARCS. Three things happen here every frame:
    //
    //   1. BILLBOARD + ROLL. World orientation := the camera's, then rolled
    //      about the view axis so the arcs' local +Y lines up with the disk
    //      normal's on-screen direction. Without the roll the arcs would cap
    //      screen-top/bottom while the disk ran diagonally, and the illusion
    //      that this is the same disk bent over the shadow dies instantly.
    //   2. PUSH. The quad is slid one radius toward the camera (with a
    //      matching scale-down so its apparent size is unchanged) so it is
    //      geometrically in FRONT of the opaque horizon and passes depth test
    //      — that is the whole point: these arcs must overlay the shadow.
    //   3. EDGE-ON RAMP. The far half of the disk only disappears when you
    //      approach the disk plane, so the arcs fade in exactly as the disk
    //      goes edge-on and are off entirely when you look down on it (where
    //      the real disk is fully visible and needs no help).
    const wrap = blackHole.userData._gargWrap;
    if (wrap && _gargQ2 && p > 0.02) {
        blackHole.getWorldQuaternion(_gargQ2);
        // Disk normal (hole-local +Y) in world space.
        _gargV2.set(0, 1, 0).applyQuaternion(_gargQ2);
        // View direction, hole → camera.
        _gargV1.copy(camera.position).sub(_gargTmp);
        const dist = _gargV1.length();
        if (dist > 1e-4) {
            _gargV1.multiplyScalar(1 / dist);
            const edge = 1 - Math.abs(_gargV1.dot(_gargV2));   // 1 == edge-on
            let arc = (edge - 0.14) / 0.55;
            arc = arc < 0 ? 0 : (arc > 1 ? 1 : arc);
            const op = arc * (0.30 + 0.70 * p);
            wrap.visible = op > 0.004;
            if (wrap.visible) {
                // Roll: project the disk normal into camera space and aim the
                // texture's +Y at it.
                _gargV2.applyQuaternion(_gargQ3.copy(camera.quaternion).conjugate());
                const roll = Math.atan2(_gargV2.y, _gargV2.x) - Math.PI / 2;
                _gargQ3.setFromAxisAngle(_gargAxisZ, roll);
                _gargQ2.conjugate();                       // hole-local frame
                wrap.quaternion.copy(_gargQ2).multiply(camera.quaternion).multiply(_gargQ3);
                // Push toward the camera, expressed in the hole's local frame.
                const push = Math.min(blackHole.userData._gargWrapPush || 0, dist * 0.45);
                _gargV1.multiplyScalar(push).applyQuaternion(_gargQ2);
                wrap.position.copy(_gargV1);
                const s = (blackHole.userData._gargWrapSize || 1) * ((dist - push) / dist);
                wrap.scale.set(s, s, 1);
                if (blackHole.userData._gargWrapMat) {
                    blackHole.userData._gargWrapMat.opacity = op;
                }
            }
        }
    } else if (wrap) {
        wrap.visible = false;
    }

    // Jet plasma streams outward from both throats. One shared texture per
    // hole, so this is a single offset write regardless of shell count.
    const jets = blackHole.userData._gargJets;
    if (jets) {
        // Opacity alone is not enough of a cull: a jet cone at 5% still
        // rasterises a near-screen-filling additive quad's worth of
        // fragments for nothing. Below the fade band, stop drawing them.
        const jvis = p > 0.05;
        for (let j = 0; j < jets.length; j++) jets[j].visible = jvis;
        if (jvis) {
            const jtex = blackHole.userData._gargJetTex;
            if (jtex) jtex.offset.y = (jtex.offset.y - 0.0035) % 1;
        }
    }

    // Slow, irregular corona pulse layered on top of the proximity
    // fade. Two detuned low-freq sines (~11s and ~27s periods) so it
    // wanders rather than ticking like a metronome — alive/unstable.
    const glow = blackHole.userData._gargGlow;
    if (glow && glow.material) {
        const t = (typeof performance !== 'undefined'
            ? performance.now() : Date.now()) * 0.001;
        const ph = blackHole.userData._gargPulsePhase || 0;
        const wob = Math.sin(t * 0.55 + ph) * 0.62 +
                    Math.sin(t * 0.236 + ph * 1.7) * 0.38;   // ~[-1, 1]
        const grow = (blackHole.userData._gargGlowScale || 1) * (1 + wob * 0.10);
        glow.scale.set(grow, grow, 1);
        // glow.material.opacity was just set to base*vis above; flare it
        // ±30% and clamp so additive blending doesn't blow out.
        let o = glow.material.opacity * (1 + wob * 0.30);
        glow.material.opacity = o < 0 ? 0 : (o > 1.25 ? 1.25 : o);
    }
}
if (typeof window !== 'undefined') window.updateGargantuaProximityFade = updateGargantuaProximityFade;


function calculateBlackHoleRotationSpeed(galaxyType, galaxyId, position) {
    // Base speed varies by galaxy type
    let baseSpeed = 0.001; // Default speed
    
    switch (galaxyType.name) {
        case 'Quasar':
            baseSpeed = 0.0020; // Fastest - active galactic nuclei
            break;
        case 'Spiral':
            baseSpeed = 0.0012; // Moderate - like our Milky Way
            break;
        case 'Elliptical':
            baseSpeed = 0.0008; // Slower - older, more stable
            break;
        case 'Irregular':
            baseSpeed = 0.0014; // Variable - chaotic systems
            break;
        case 'Ring':
            baseSpeed = 0.0016; // Fast - ring galaxies are dynamic
            break;
        case 'Dwarf':
            baseSpeed = 0.0006; // Slowest - small, low-energy systems
            break;
        case 'Lenticular':
            baseSpeed = 0.0009; // Slow - transitional type
            break;
        case 'Ancient':
            baseSpeed = 0.0007; // Very slow - old, settled systems
            break;
    }
    
    // Distance from galactic center affects speed (closer = faster)
    const distanceFromCenter = Math.sqrt(position.x * position.x + position.z * position.z);
    const universeRadius = 100000; // Increased to accommodate exotic/borg systems (up to 85k units) with margins
    const normalizedDistance = Math.min(distanceFromCenter / universeRadius, 1.0);
    
    // Speed decreases with distance from center (inverse relationship)
    const distanceMultiplier = 1.5 - (normalizedDistance * 0.8); // Range: 0.7 to 1.5
    
    // Add some random variation (Â±20%)
    const randomVariation = 0.8 + (Math.random() * 0.4); // Range: 0.8 to 1.2
    
    // Height from galactic plane also affects speed (closer to plane = faster)
    const heightFromPlane = Math.abs(position.y);
    const maxHeight = 3000; // Doubled scale
    const heightMultiplier = 1.2 - Math.min(heightFromPlane / maxHeight, 0.5); // Range: 0.7 to 1.2
    
    // Calculate final speed
    const finalSpeed = baseSpeed * distanceMultiplier * randomVariation * heightMultiplier;
    
    // Clamp to reasonable bounds
    return Math.max(0.003, Math.min(0.030, finalSpeed));
}

// =============================================================================
// GALAXY ENVIRONMENTAL EFFECTS
// =============================================================================

function createGalaxyEnvironmentalEffects(galaxyBlackHole, galaxyType) {
    // Add environmental particle effects around galaxy
    const effectGeometry = new THREE.BufferGeometry();
    const effectPositions = new Float32Array(500 * 3);
    const effectColors = new Float32Array(500 * 3);
    
    for (let i = 0; i < 500; i++) {
        const radius = 300 + Math.random() * 200;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(1 - 2 * Math.random());
        
        effectPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        effectPositions[i * 3 + 1] = radius * Math.cos(phi);
        effectPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
        
        const effectColor = new THREE.Color(galaxyType.color).multiplyScalar(0.5 + Math.random() * 0.5);
        effectColors[i * 3] = effectColor.r;
        effectColors[i * 3 + 1] = effectColor.g;
        effectColors[i * 3 + 2] = effectColor.b;
    }
    
    effectGeometry.setAttribute('position', new THREE.BufferAttribute(effectPositions, 3));
    effectGeometry.setAttribute('color', new THREE.BufferAttribute(effectColors, 3));
    
    const effectMaterial = new THREE.PointsMaterial({
        size: 1,
        map: getPointSprite(),          // soft round grain, not a filled square
        transparent: true,
        opacity: 0.3,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    const effects = new THREE.Points(effectGeometry, effectMaterial);
    effects.visible = true;
    effects.frustumCulled = false;
    
    galaxyBlackHole.add(effects);
}

function createOptimizedPlanets3D() {
    console.log('Creating comprehensive 3D universe with full local solar system...');
    
    // CRITICAL: Check for required globals first
    if (typeof scene === 'undefined' || !scene) {
        console.error('❌ Scene not initialized! Cannot create planets.');
        console.error('Make sure scene = new THREE.Scene() is called before this function.');
        return;
    }
    
    if (typeof planets === 'undefined') {
        console.error('❌ Planets array not initialized! Creating it now.');
        window.planets = [];
    }
    
    if (typeof THREE === 'undefined') {
        console.error('❌ THREE.js not loaded!');
        return;
    }
    
    console.log('✅ All required globals found. Proceeding with universe creation...');
    
    const localSystemOffset = { x: 8000, y: 0, z: 4800 }; // 4x further from Sgr A* (origin)
    // Single source of truth for everything that needs the Sol-system
    // centre outside this function's scope (enemy spawns, music regions).
    if (typeof window !== 'undefined') window.localSystemOffset = localSystemOffset;

    // =============================================================================
    // LOCAL SOLAR SYSTEM
    // =============================================================================
    
    try {
        // Sun radius 80 — 2× bump (40 → 80) on top of the earlier 5× so
        // it reads as a proper star without dominating the system; mass
        // / gravity (userData below) deliberately unchanged so slingshot
        // physics stay the same.
        const sunGeometry = new THREE.SphereGeometry(80, 32, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff44 });
        const sun = new THREE.Mesh(sunGeometry, sunMaterial);
        sun.position.set(localSystemOffset.x, localSystemOffset.y, localSystemOffset.z);
        sun.visible = true;
        sun.frustumCulled = false;

        // Apollo-style stark sunlight: warm-white, brighter direct
        // beam, reach extended past Neptune (now at ~19,238 units in
        // the AU-proportional layout — bumped range to 25k so Neptune
        // still receives ~0.7 effective intensity with decay 1.0,
        // which matches its real-world dim sunlight).
        const sunLight = new THREE.PointLight(0xfff5d0, 3.0, 25000, 1.0);
        sunLight.position.copy(sun.position);
        sunLight.castShadow = false;
        
        if (scene && scene.add) {
            scene.add(sunLight);
        }

        // Local ambient almost zero — vacuum doesn't scatter, so the
        // terminator should be a hard knife-edge between lit and black.
        const localAmbientLight = new THREE.AmbientLight(0x404040, 0.02);
        if (scene && scene.add) {
            scene.add(localAmbientLight);
        }
        
        sun.userData = { 
            name: 'Sol', 
            type: 'star',
            isLocalStar: true,
            orbitRadius: 0,
            orbitSpeed: 0.005,
            mass: 40,
            gravity: 10.0,
            isLocal: true
        };
        
        if (typeof planets !== 'undefined' && planets.push) {
            planets.push(sun);
        }
        
        if (scene && scene.add) {
            scene.add(sun);
        }

        // Wispy white-hot corona + bright rim + slow alive pulse.
        // Replaces the old tiny 12-unit inner glow sphere which read as
        // a flat dim yellow halo and didn't sell "star".
        if (typeof addStarCorona === 'function') {
            addStarCorona(sun, 80, 0xff8833);
        }

        console.log('✅ Sun created successfully');
        
    } catch (error) {
        console.error('❌ Error creating sun:', error);
        return;
    }
    
    // Sol-system planets & moons. Orbit distances are AU-proportional
    // (Earth = 640 units = 1.00 AU). Mercury is now included so the
    // inner system matches the reference; Jupiter–Neptune sit at their
    // true relative distances (Neptune lands ~19.2k out — the Sun
    // PointLight range is extended below to cover them).
    //   Mercury 0.39 → 250    Jupiter 5.20 →  3328
    //   Venus   0.72 → 461    Saturn  9.54 →  6106
    //   Earth   1.00 → 640    Uranus 19.20 → 12288
    //   Mars    1.52 → 973    Neptune 30.06→ 19238
    // Sizes are not to scale (matches the reference image's caption).
    //
    // HERO SCALE. The player spawns ~163 units from Earth's centre. At the old
    // radius of 40 that is an 28°-wide ball in a 75° frame — a prop, not a
    // landmark, and nothing like the reference plates where the home world
    // fills half the screen. At 64 it subtends 43°, i.e. ~57% of frame height,
    // and still leaves the spawn point at 2.5 radii — well clear of the
    // `distance < radius * 1.05` surface-collision test in game-physics.js and
    // of getSlingshotRange()'s radius*4+60. Both of those read
    // geometry.parameters.radius, so growing the geometry moves collision and
    // slingshot ranges WITH the visual instead of desyncing them; nothing here
    // touches mass or gravity, so the slingshot physics are unchanged.
    // Luna moves out to keep the same visual gap from the bigger Earth.
    const localPlanets = [
        { name: 'Mercury', distance: 250,   size: 20, color: 0xa89080, moons: [] },
        { name: 'Venus',   distance: 461,   size: 52, color: 0xffc649, moons: [] },
        { name: 'Earth',   distance: 640,   size: 64, color: 0x2233ff, moons: [{ name: 'Luna', distance: 300, size: 20, color: 0xdddddd }] },
        { name: 'Mars',    distance: 973,   size: 34, color: 0xff4422, moons: [
            { name: 'Phobos', distance: 96,  size: 7, color: 0x8b4513 },
            { name: 'Deimos', distance: 140, size: 6, color: 0x696969 }
        ]},
        { name: 'Jupiter', distance: 3328,  size: 120, color: 0xd9a06b, moons: [
            { name: 'Io', distance: 200, size: 14, color: 0xffff99 },
            { name: 'Europa', distance: 256, size: 13, color: 0x99ccff },
            { name: 'Ganymede', distance: 336, size: 18, color: 0xcc9966 },
            { name: 'Callisto', distance: 440, size: 16, color: 0x666666 }
        ]},
        { name: 'Saturn',  distance: 6106,  size: 96,  color: 0xe8c587, rings: true, moons: [
            { name: 'Titan', distance: 520, size: 20, color: 0xff9933 },
            { name: 'Enceladus', distance: 360, size: 8, color: 0xffffff }
        ]},
        // Uranus really does have rings, and they are near-POLAR — the planet
        // is tipped on its side. A vertical ring plane in a system where every
        // other ring lies flat is free character, and it costs one number.
        { name: 'Uranus',  distance: 12288, size: 64, color: 0xafdbe5, rings: true, ringTilt: 1.42, ringOpacity: 0.40, moons: [
            { name: 'Titania', distance: 336, size: 11, color: 0x888888 }
        ]},
        { name: 'Neptune', distance: 19238, size: 56, color: 0x3457c4, moons: [
            { name: 'Triton', distance: 176, size: 10, color: 0x99ccff }
        ]}
    ];
    
// =============================================================================
// ADDITIONAL LOCAL GALAXY STAR SYSTEMS
// =============================================================================

try {
    console.log('Creating additional local star systems...');
    
    const additionalSystems = [
        { 
            name: 'Alpha System', 
            starColor: 0xffdd99, 
            starSize: 6,
            planets: [
                { 
                    distance: 90, 
                    size: 4, 
                    color: 0xff6644,
                    rings: false,
                    moons: [
                        { name: 'Alpha-1a', distance: 20, size: 1.0, color: 0xcccccc }
                    ]
                },
                { 
                    distance: 150, 
                    size: 6, 
                    color: 0x4488ff,
                    rings: true,
                    moons: [
                        { name: 'Alpha-2a', distance: 28, size: 1.4, color: 0x88aaff },
                        { name: 'Alpha-2b', distance: 40, size: 1.1, color: 0xaaaaaa }
                    ]
                },
                { 
                    distance: 240, 
                    size: 8, 
                    color: 0xaa66ff,
                    rings: true,
                    moons: [
                        { name: 'Alpha-3a', distance: 32, size: 1.6, color: 0xbb88ff },
                        { name: 'Alpha-3b', distance: 46, size: 1.3, color: 0x999999 }
                    ]
                }
            ]
        },
        { 
            name: 'Beta System', 
            starColor: 0xff8844, 
            starSize: 5,
            planets: [
                { 
                    distance: 70, 
                    size: 3.5, 
                    color: 0x88ff44,
                    rings: false,
                    moons: [
                        { name: 'Beta-1a', distance: 18, size: 0.8, color: 0xbbbbbb }
                    ]
                },
                { 
                    distance: 130, 
                    size: 5.5, 
                    color: 0xff44aa,
                    rings: true,
                    moons: [
                        { name: 'Beta-2a', distance: 26, size: 1.2, color: 0xff66bb },
                        { name: 'Beta-2b', distance: 38, size: 1.0, color: 0xaaaaaa },
                        { name: 'Beta-2c', distance: 52, size: 0.9, color: 0x888888 }
                    ]
                }
            ]
        },
        { 
            name: 'Gamma System', 
            starColor: 0xaaddff, 
            starSize: 7,
            planets: [
                { 
                    distance: 110, 
                    size: 7, 
                    color: 0xffaa44,
                    rings: true,
                    moons: [
                        { name: 'Gamma-1a', distance: 30, size: 1.5, color: 0xffbb66 },
                        { name: 'Gamma-1b', distance: 44, size: 1.2, color: 0xcccccc }
                    ]
                },
                { 
                    distance: 180, 
                    size: 4.5, 
                    color: 0x44ffaa,
                    rings: false,
                    moons: [
                        { name: 'Gamma-2a', distance: 22, size: 0.9, color: 0x66ffbb }
                    ]
                },
                { 
                    distance: 280, 
                    size: 9, 
                    color: 0xff8844,
                    rings: true,
                    moons: [
                        { name: 'Gamma-3a', distance: 36, size: 1.8, color: 0xffaa66 },
                        { name: 'Gamma-3b', distance: 52, size: 1.4, color: 0xdddddd },
                        { name: 'Gamma-3c', distance: 68, size: 1.1, color: 0xaaaaaa }
                    ]
                }
            ]
        }
    ];
    
    additionalSystems.forEach((systemData, sysIndex) => {
        // Sit ABOVE the Sol plane — the opposite side from the Dune
        // gateway systems (which live ~32k BELOW). +1000 to +4000 on Y.
        const randomYOffset = 1000 + Math.random() * 3000; // +1000 to +4000 (always above)

        // Z spread ±4000.
        const randomZOffset = (Math.random() - 0.5) * 8000; // -4000 to +4000
        
        // Keep X positioning varied but more controlled
        const baseXOffsets = [-1200, 1400, -800];
        const randomXOffset = baseXOffsets[sysIndex] + (Math.random() - 0.5) * 400; // Add ±200 variation
        
        const systemOffset = { 
            x: localSystemOffset.x + randomXOffset, 
            y: localSystemOffset.y + randomYOffset, 
            z: localSystemOffset.z + randomZOffset 
        };
        
        console.log(`Creating ${systemData.name} at offset: Y=${randomYOffset.toFixed(0)}, Z=${randomZOffset.toFixed(0)}`);
        
        // Create star. Visual radius bumped 4× from systemData.starSize
        // so the star reads at the new larger Sol scale; mass / gravity
        // below intentionally still use the unscaled value so slingshot
        // physics aren't changed by the visual resize.
        const _starVisualSize = systemData.starSize * 2;
        const starGeometry = new THREE.SphereGeometry(_starVisualSize, 24, 24);
        const starMaterial = new THREE.MeshBasicMaterial({ color: systemData.starColor });
        const star = new THREE.Mesh(starGeometry, starMaterial);
        star.position.set(systemOffset.x, systemOffset.y, systemOffset.z);
        star.visible = true;
        star.frustumCulled = false;
        
        star.userData = {
            name: `${systemData.name} Star`,
            type: 'star',
            isLocalStar: false,
            orbitRadius: 0,
            mass: systemData.starSize * 3,
            gravity: systemData.starSize * 0.8,
            isLocal: true,
            rotationSpeed: 0.015
        };
        
        planets.push(star);
        scene.add(star);
        if (typeof addStarCorona === 'function') {
            addStarCorona(star, _starVisualSize, systemData.starColor);
        }

        // Create planets for this system
        systemData.planets.forEach((planetData, pIndex) => {
            const planetGeometry = new THREE.SphereGeometry(planetData.size, 20, 20);
            const planetMaterial = new THREE.MeshLambertMaterial({
                color: planetData.color,
                emissive: new THREE.Color(planetData.color).multiplyScalar(0.05)
            });
            const planet = new THREE.Mesh(planetGeometry, planetMaterial);
            planet.position.set(
                systemOffset.x + planetData.distance,
                systemOffset.y,
                systemOffset.z
            );
            planet.visible = true;
            planet.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling for planets
            
            planet.userData = {
                name: `${systemData.name}-${pIndex + 1}`,
                type: 'planet',
                isStatic: false,
                orbitRadius: planetData.distance,
                orbitSpeed: 0.012 + pIndex * 0.004,
                orbitPhase: pIndex * Math.PI * 0.5,
                systemCenter: { x: systemOffset.x, y: systemOffset.y, z: systemOffset.z },
                mass: planetData.size * 2.5,
                gravity: planetData.size * 0.8,
                isLocal: true,
                rotationSpeed: 0.02
            };
            
            planets.push(planet);
            scene.add(planet);
            
            // ✅ Add rings if specified
            if (planetData.rings) {
                const ringCount = 2 + Math.floor(Math.random() * 2); // 2-3 rings
                
                for (let r = 0; r < ringCount; r++) {
                    const ringInner = planetData.size + 6 + r * 6;
                    const ringOuter = ringInner + 4;
                    const ringGeometry = new THREE.RingGeometry(ringInner, ringOuter, 32);
                    const ringMaterial = new THREE.MeshBasicMaterial({ 
                        color: 0xdddddd,
                        transparent: true,
                        opacity: 0.5 - r * 0.1,
                        side: THREE.DoubleSide
                    });
                    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                    ring.rotation.x = Math.PI / 2;
                    ring.visible = true;
                    ring.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
                    
                    planet.add(ring);
                }
                
                console.log(`✅ Added ${ringCount} rings to ${planet.userData.name}`);
            }
            
            // ✅ Add moons
            if (planetData.moons && planetData.moons.length > 0) {
                planetData.moons.forEach((moonData, moonIndex) => {
                    try {
                        const moonGeometry = new THREE.SphereGeometry(moonData.size, 12, 12);
                        const moonMaterial = new THREE.MeshLambertMaterial({ 
                            color: moonData.color,
                            emissive: new THREE.Color(moonData.color).multiplyScalar(0.02)
                        });
                        const moon = new THREE.Mesh(moonGeometry, moonMaterial);
                        moon.position.set(moonData.distance, 0, 0);
                        moon.visible = true;
                        moon.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
                        
                        moon.userData = { 
                            name: moonData.name,
                            type: 'moon',
                            orbitRadius: moonData.distance,
                            orbitSpeed: Math.max(0.04, Math.min(0.45, 0.14 * Math.pow(160 / (moonData.distance || 160), 1.3))), // inner moons orbit FASTER (Kepler-like) — was 0.1+index*0.02 which made outer moons fastest
                            orbitPhase: moonIndex * Math.PI * 0.5,
                            parentPlanet: planet,
                            mass: moonData.size * 2,
                            gravity: moonData.size * 0.6,
                            isLocal: true
                        };
                        
                        planets.push(moon);
                        scene.add(moon);
                        
                        console.log(`✅ Created moon: ${moonData.name} for ${planet.userData.name}`);
                        
                    } catch (moonError) {
                        console.error(`❌ Error creating moon ${moonData.name}:`, moonError);
                    }
                });
            }
            
            console.log(`✅ Created ${planet.userData.name} in ${systemData.name} with ${planetData.moons ? planetData.moons.length : 0} moon(s)`);
        });
    });
    
    console.log('✅ Additional local star systems created with rings, moons, and random 3D positioning');
    
} catch (localSystemsError) {
    console.error('❌ Error creating additional local systems:', localSystemsError);
}
    
    localPlanets.forEach((planetData, index) => {
        try {
            // Tessellation has to follow scale. At 20x20 a sphere's limb is a
            // visible 20-gon: invisible on a 15-unit marble, glaring on a
            // 64-unit hero planet that fills half the frame — and it was
            // already mismatched against Earth's 40-segment cloud shell, so
            // the surface poked through the clouds along the facets.
            const _seg = planetData.size >= 56 ? 56 : (planetData.size >= 30 ? 36 : 24);
            const planetGeometry = new THREE.SphereGeometry(planetData.size, _seg, Math.round(_seg * 0.75));
            const planetMaterial = new THREE.MeshLambertMaterial({ 
                color: planetData.color,
                emissive: new THREE.Color(planetData.color).multiplyScalar(0.05)
            });
            const planet = new THREE.Mesh(planetGeometry, planetMaterial);
            planet.position.set(
                localSystemOffset.x + planetData.distance, 
                localSystemOffset.y, 
                localSystemOffset.z
            );
            
            planet.visible = true;
            planet.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling for planets
            
            planet.userData = { 
                name: planetData.name,
                type: 'planet',
                isStart: planetData.name === 'Earth',
                orbitRadius: planetData.distance,
                orbitSpeed: 0.04 - index * 0.002,
                orbitPhase: index * Math.PI * 0.3,
                systemCenter: localSystemOffset,
                mass: planetData.size * 2,
                gravity: planetData.size * 0.8,
                isLocal: true
            };
            
            if (planets && planets.push) {
                planets.push(planet);
            }
            
            if (scene && scene.add) {
                scene.add(planet);
            }

            // Earth: full blue-marble (procedural surface + cloud shell +
            // atmosphere fresnel rim). Mercury / Mars / Jupiter / Saturn
            // get just a procedural surface texture via enhancePlanet —
            // craters for Mercury, rusty bands for Mars, banded gas-giant
            // canvases for Jupiter & Saturn (plus the Great Red Spot).
            // Venus / Uranus / Neptune stay as their solid Lambert disc.
            if (planetData.name === 'Earth' && typeof enhanceEarth === 'function') {
                enhanceEarth(planet, planetData.size);
            } else if (typeof enhancePlanet === 'function') {
                enhancePlanet(planet, planetData.name, planetData.size);
            }

            // RING PLANE. Was three concentric 4-unit hoops of solid 0xdddddd
            // at 0.5/0.4/0.3 opacity — from any distance that is three grey
            // circles, and edge-on it is three grey lines. One banded plane
            // with carved gaps and a feathered outer edge reads as a ring
            // SYSTEM: a structure with lanes you can see the planet through.
            if (planetData.rings) {
                addPlanetRings(planet, planetData.size, planetData.color, {
                    outerK: 2.45,
                    tilt: planetData.ringTilt || 0.06,
                    opacity: planetData.ringOpacity === undefined ? 0.9 : planetData.ringOpacity,
                    segments: 128
                });
            }
            
            // Add moons
            planetData.moons.forEach((moonData, moonIndex) => {
                try {
                    const moonGeometry = new THREE.SphereGeometry(moonData.size, 12, 12);
                    const moonMaterial = new THREE.MeshLambertMaterial({ 
                        color: moonData.color,
                        emissive: new THREE.Color(moonData.color).multiplyScalar(0.02)
                    });
                    const moon = new THREE.Mesh(moonGeometry, moonMaterial);
                    moon.position.set(moonData.distance, 0, 0);
                    moon.visible = true;
                    moon.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
                    moon.material.transparent = false;
                    
                    moon.userData = { 
                        name: moonData.name,
                        type: 'moon',
                        orbitRadius: moonData.distance,
                        orbitSpeed: Math.max(0.04, Math.min(0.45, 0.14 * Math.pow(160 / (moonData.distance || 160), 1.3))), // inner moons orbit FASTER (Kepler-like) — was 0.1+index*0.02 which made outer moons fastest
                        orbitPhase: moonIndex * Math.PI * 0.5,
                        parentPlanet: planet,
                        mass: moonData.size * 2,
                        gravity: moonData.size * 0.6,
                        isLocal: true
                    };
                    
                    if (planets && planets.push) {
                        planets.push(moon);
                    }
                    
                    if (scene && scene.add) {
                        scene.add(moon);
                    }
                    
                    console.log(`✅ Created moon: ${moonData.name} for ${planetData.name}`);
                    
                } catch (moonError) {
                    console.error(`❌ Error creating moon ${moonData.name}:`, moonError);
                }
            });
            
        } catch (planetError) {
            console.error(`❌ Error creating planet ${planetData.name}:`, planetError);
        }
    });
    
    // =============================================================================
    // SAGITTARIUS A* AT GALACTIC CENTER
    // =============================================================================
    
    try {
        const centralBlackHoleGeometry = new THREE.SphereGeometry(280, 24, 24); // 4x
        const centralBlackHoleMaterial = _eventHorizonMaterial();
        const centralBlackHole = new THREE.Mesh(centralBlackHoleGeometry, centralBlackHoleMaterial);
        centralBlackHole.position.set(0, 0, 0);
        centralBlackHole.visible = true;
        centralBlackHole.frustumCulled = false;
        centralBlackHole.renderOrder = _EVENT_HORIZON_ORDER;
        
        centralBlackHole.userData = {
            name: 'Sagittarius A* (Galactic Center)',
            type: 'blackhole',
            mass: 8000,
            gravity: 400.0,
            warpThreshold: 640,
            isGalacticCenter: true,
            isSagittariusA: true,
            targetGalaxy: Math.floor(Math.random() * 8),
            mapPosition: { x: 0.5, y: 0.5 },
            galaxyId: 8,
            rotationSpeed: 0.025
        };
        
        if (scene && scene.add) {
            scene.add(centralBlackHole);
        }
        
        if (planets && planets.push) {
            planets.push(centralBlackHole);
        }
        
        // Add accretion disk
        const centralRingGeometry = new THREE.RingGeometry(240, 360, 48); // 4x
        const centralRingMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff4500,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const centralRing = new THREE.Mesh(centralRingGeometry, centralRingMaterial);
        centralRing.rotation.x = Math.PI / 2;
        // Hidden for review — the legacy flat accretion ring competes
        // with the Gargantua disk/glow on Sgr A*. Flip back to true to
        // restore it.
        centralRing.visible = false;
        centralRing.frustumCulled = false;
        
        if (centralBlackHole && centralBlackHole.add) {
            centralBlackHole.add(centralRing);
        }
        addGargantuaVisuals(centralBlackHole, 280, 0xff4500, 2, 34); // 4x; ~5% at Sol start (~9.5k) → ~95% close
        // Ice-blue jets against the orange disk — the supermassive pair are
        // the only holes in the game that get them.
        addPolarJets(centralBlackHole, 280, 0x55ccff, 7);

        console.log('✅ Sagittarius A* created at galactic center');
        
    } catch (sgrAError) {
        console.error('❌ Error creating Sagittarius A*:', sgrAError);
    }
    
// =============================================================================
// 8TH GALACTIC CORE - ABOVE SAGITTARIUS A* WITH STARFIELD
// =============================================================================

try {
    console.log('Creating Companion Core near Sagittarius A*...');
    
   // Random distance between 400 and 620, randomly above or below Sagittarius A*
const core8Distance = (1600 + Math.random() * 880) * (Math.random() < 0.5 ? 1 : -1); // 4x (kept clear of the 4x-bigger Sgr A*)
    const core8Geometry = new THREE.SphereGeometry(180, 24, 24); // 4x; still smaller than Sgr A* (180 vs 280)
    const core8Material = _eventHorizonMaterial();
    const core8BlackHole = new THREE.Mesh(core8Geometry, core8Material);
    core8BlackHole.position.set(0, core8Distance, 0); // Y-axis (vertical)
    core8BlackHole.visible = true;
    core8BlackHole.frustumCulled = false;
    core8BlackHole.renderOrder = _EVENT_HORIZON_ORDER;
    
    core8BlackHole.userData = {
    name: 'Companion Core', // RENAMED from "Twin Galactic Core"
    type: 'blackhole',
    mass: 2800, // Smaller mass than Sagittarius A*
    gravity: 150.0,
    warpThreshold: 320,
    isGalacticCore: true,
    isCompanionCore: true, // New flag
    galaxyId: 7,
    rotationSpeed: 0.0001,
    mapPosition: { x: 0.5, y: 0.52 }
};
    
    if (scene && scene.add) {
        scene.add(core8BlackHole);
    }
    
    if (planets && planets.push) {
        planets.push(core8BlackHole);
    }
    
    // Add accretion disk
    const core8RingGeometry = new THREE.RingGeometry(100, 160, 48); // 4x
   const core8RingMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x6644dd, // Darker purple to distinguish from Sagittarius A*
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide
});
    const core8Ring = new THREE.Mesh(core8RingGeometry, core8RingMaterial);
    core8Ring.rotation.x = Math.PI / 2;
    // Retired, same as Sgr A*'s: a flat untextured hoop at constant colour
    // sat right on the limb of the emissive disk and was the brightest thing
    // there, which is what made the marquee object read as plastic. The
    // Gargantua disk (1.05–4.0 radii, HDR, Doppler-beamed) replaces it.
    core8Ring.visible = false;
    core8Ring.frustumCulled = false;
    
    if (core8BlackHole && core8BlackHole.add) {
        core8BlackHole.add(core8Ring);
    }
    addGargantuaVisuals(core8BlackHole, 180, 0xff6a1a, 3, 55); // 4x; ~5% at Sol start (~9.7k) → ~95% close
    // Magenta-violet jets so the Companion reads as a different animal from
    // Sgr A* at a glance, even before the name plate resolves.
    addPolarJets(core8BlackHole, 180, 0xcc55ff, 5);
    // ADD SPIRAL GALAXY STARFIELD around 8th core (same as local galaxy)
const core8GalaxyStarsGeometry = new THREE.BufferGeometry();
const core8GalaxyStarsMaterial = new THREE.PointsMaterial({
    size: 2.0,
    map: getPointSprite(),              // round star, not a square pixel block
    depthWrite: false,
    transparent: true,
    opacity: _isMobileRenderTier() ? 0.5 : 0.9,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
});

const core8LocalStarsVertices = [];
const core8LocalStarsColors = [];

// Create stars in spiral pattern for Core8. 4× spatial scale to match
// the 4×-enlarged black hole + Gargantua disk (so the vertical
// structure clears the hole again like it did on main). Halved on
// mobile — additive points with no AA / pixelRatio 1 read far brighter
// and denser there.
const _core8StarCount = _isMobileRenderTier() ? 1500 : 3000;
for (let i = 0; i < _core8StarCount; i++) {
    const armAngle = Math.random() * Math.PI * 2;
    const armDistance = Math.pow(Math.random(), 1.8) * 8000;
    const armWidth = 0.20;
    
    let x, y, z;
    
    if (Math.random() < 0.3) {
        // Dense center bulge
        const bulgeRadius = Math.pow(Math.random(), 3) * 2800;
        const bulgeAngle = Math.random() * Math.PI * 2;
        const bulgeHeight = (Math.random() - 0.5) * 1200;
        x = Math.cos(bulgeAngle) * bulgeRadius;
        z = Math.sin(bulgeAngle) * bulgeRadius;
        y = bulgeHeight;
    } else {
        // Spiral arms
        const angle = armAngle + (armDistance / 360) * Math.PI;
        x = Math.cos(angle) * armDistance + (Math.random() - 0.5) * armWidth * armDistance;
        z = Math.sin(angle) * armDistance + (Math.random() - 0.5) * armWidth * armDistance;
        y = (Math.random() - 0.5) * 480;
    }
    
    // Position is relative to the black hole, so no offset needed
    core8LocalStarsVertices.push(x, y, z);
    
    // Pure white stars
    const starColor = new THREE.Color(0xffffff); // White
    core8LocalStarsColors.push(starColor.r, starColor.g, starColor.b);
} // ← CLOSE THE FOR LOOP HERE

// =============================================================================
// DUNE STAR SYSTEMS - ORBIT THE LOCAL BLACK HOLE GATEWAY
// =============================================================================

// Local gateway position. Pushed far BELOW the Sol plane (−32k) so the
// gateway black hole and the systems that cluster around it all sit well
// outside the Sun's 25k light radius — lit only by their own stars. The
// gateway black hole (created later) reads its position straight from
// here so the two never drift apart. Hoisted above the Dune try-block
// so the later black-hole try-block can still see it.
const localGatewayPosition = {
    x: localSystemOffset.x + 2600,
    y: localSystemOffset.y - 32000,
    z: localSystemOffset.z + 2000
};
if (typeof window !== 'undefined') window.localGatewayPosition = localGatewayPosition;

try {
    console.log('Creating Dune star systems around local black hole gateway...');
    
    const duneSystems = [
        {
            name: 'Arrakis Sector', // The desert planet - Dune!
            starColor: 0xddaa66, // Sandy
            starSize: 15,
            orbitalDistance: 1200,
            orbitalAngle: 0,
            planets: [
                { distance: 120, size: 12, color: 0xccaa77 }, // Desert colors
                { distance: 220, size: 15, color: 0xaa8855 },
                { distance: 350, size: 10, color: 0x996633 }
            ]
        },
        {
            name: 'Caladan System', // Atreides homeworld - water planet
            starColor: 0x6688aa, // Muted blue
            starSize: 18,
            orbitalDistance: 1600,
            orbitalAngle: Math.PI * 0.4,
            planets: [
                { distance: 140, size: 14, color: 0x558899 },
                { distance: 260, size: 11, color: 0x6699aa }
            ]
        },
        {
            name: 'Giedi Prime', // Harkonnen homeworld - industrial
            starColor: 0x777766, // Gray-brown
            starSize: 20,
            orbitalDistance: 2000,
            orbitalAngle: Math.PI * 0.8,
            planets: [
                { distance: 160, size: 16, color: 0x665544 },
                { distance: 280, size: 13, color: 0x554433 },
                { distance: 420, size: 18, color: 0x776655 }
            ]
        },
        {
            name: 'Kaitain', // Imperial capital
            starColor: 0xbb9955, // Regal bronze
            starSize: 22,
            orbitalDistance: 1800,
            orbitalAngle: Math.PI * 1.2,
            planets: [
                { distance: 130, size: 11, color: 0xaa8844 },
                { distance: 240, size: 14, color: 0x998866 }
            ]
        },
        {
            name: 'Salusa Secundus', // Prison planet
            starColor: 0x995544, // Dark rust
            starSize: 17,
            orbitalDistance: 1400,
            orbitalAngle: Math.PI * 1.6,
            planets: [
                { distance: 150, size: 13, color: 0x885533 },
                { distance: 270, size: 12, color: 0x774422 },
                { distance: 400, size: 15, color: 0x886644 }
            ]
        },
        {
            name: 'Ix', // Technology planet
            starColor: 0x88aaaa, // Metallic teal
            starSize: 16,
            orbitalDistance: 1100,
            orbitalAngle: Math.PI * 2.0,
            planets: [
                { distance: 120, size: 10, color: 0x779999 },
                { distance: 220, size: 14, color: 0x88aa99 }
            ]
        }
    ];
    
    duneSystems.forEach((systemData, sysIndex) => {
    // Systems cluster AROUND the gateway, which now lives far below the
    // Sol plane (localGatewayPosition.y ≈ −32k). A modest vertical
    // spread keeps them grouped with the gateway rather than scattered
    // across the whole Y axis.
    const verticalOffset = (Math.random() > 0.5 ? 1 : -1) * (400 + Math.random() * 1500);

    // ✅ ENHANCED: Much more dramatic orbital plane tilts (up to ±30 degrees)
    const orbitalTilt = {
        x: (Math.random() - 0.5) * 1.0, // Tilt up to ±28.6 degrees around X-axis
        z: (Math.random() - 0.5) * 1.0  // Tilt up to ±28.6 degrees around Z-axis
    };

    // Orbit the gateway in its own (off-plane) neighbourhood.
    const systemX = localGatewayPosition.x + Math.cos(systemData.orbitalAngle) * systemData.orbitalDistance;
    const systemY = localGatewayPosition.y + verticalOffset;
    const systemZ = localGatewayPosition.z + Math.sin(systemData.orbitalAngle) * systemData.orbitalDistance;

    
    const systemOffset = { 
        x: systemX, 
        y: systemY, 
        z: systemZ,
        tilt: orbitalTilt // ✅ Store tilt for later use
    };
    
    console.log(`${systemData.name}: Y-offset=${verticalOffset.toFixed(0)}, Tilt=(${(orbitalTilt.x * 57.3).toFixed(1)}°, ${(orbitalTilt.z * 57.3).toFixed(1)}°)`);
    
    // Create star with emissive glow. Visual radius 4× of
    // systemData.starSize (mass / gravity unchanged below).
    const _starVisualSize = systemData.starSize * 2;
    const starGeometry = new THREE.SphereGeometry(_starVisualSize, 24, 24);
    const starMaterial = new THREE.MeshBasicMaterial({
        color: systemData.starColor
    });
const star = new THREE.Mesh(starGeometry, starMaterial);
star.position.set(systemOffset.x, systemOffset.y, systemOffset.z);
star.visible = true;
star.frustumCulled = false;

// Each gateway system is now far outside the Sun's reach, so its own
// star is the ONLY light source — brighter + longer reach so the whole
// little system (planets orbit out to ~400u) is clearly self-lit.
const starLight = new THREE.PointLight(
    systemData.starColor, // Use star's color
    4.5,  // Intensity
    3000, // Distance — covers the system with margin now the Sun can't
    1.0   // Decay
);
starLight.position.copy(star.position);
starLight.castShadow = false;
scene.add(starLight);

// Store light reference for cleanup
star.userData.light = starLight;

star.userData = {
    name: `${systemData.name} Star`,
    type: 'star',
    isLocalStar: false,
    orbitRadius: 0, // ✅ FIXED: Stars should NOT orbit - they stay at systemOffset
    orbitSpeed: 0,  // ✅ FIXED: No orbital movement
    orbitPhase: 0,
    systemCenter: null, // ✅ FIXED: No system center means no orbital motion
    mass: systemData.starSize * 3,
    gravity: systemData.starSize * 0.8,
    isLocalGateway: true, // ✅ Brown orbit lines
    rotationSpeed: 0.015,
    orbitalTilt: orbitalTilt, // ✅ Store tilt in userData
    light: starLight, // Store reference for updates
    // ✅ ADD: Store original position for reference
    fixedPosition: { x: systemOffset.x, y: systemOffset.y, z: systemOffset.z }
};

planets.push(star);
scene.add(star);
if (typeof addStarCorona === 'function') {
    addStarCorona(star, _starVisualSize, systemData.starColor);
}

console.log(`✅ Created ${star.userData.name} orbiting local gateway with point light`);

// Garrison this far-off-plane gateway system with a UFO squadron,
// reusing the canonical createUFOEnemy (erratic-flight AI, procedural/
// GLB saucer, missile drops) so they behave like every other UFO.
if (typeof createUFOEnemy === 'function' && typeof THREE !== 'undefined') {
    const _ufoCount = 3 + Math.floor(Math.random() * 2);   // 3–4 per system
    for (let _u = 0; _u < _ufoCount; _u++) {
        const _ua = (_u / _ufoCount) * Math.PI * 2 + Math.random() * 0.6;
        const _ur = 500 + Math.random() * 700;
        const _uy = (Math.random() - 0.5) * 500;
        const _upos = new THREE.Vector3(
            systemOffset.x + Math.cos(_ua) * _ur,
            systemOffset.y + _uy,
            systemOffset.z + Math.sin(_ua) * _ur
        );
        createUFOEnemy(_upos, systemData.name, _u);
    }
}
    
    // Create planets for this system
systemData.planets.forEach((planetData, pIndex) => {
    const planetGeometry = new THREE.SphereGeometry(planetData.size, 20, 20);
    const planetMaterial = new THREE.MeshLambertMaterial({ 
        color: planetData.color,
        emissive: new THREE.Color(planetData.color).multiplyScalar(0.05)
    });
    const planet = new THREE.Mesh(planetGeometry, planetMaterial);
    
    // ✅ ENHANCED: Apply orbital plane tilt to planet positions
    const baseX = systemOffset.x + planetData.distance;
    const baseY = systemOffset.y;
    const baseZ = systemOffset.z;
    
    // Apply tilt transformation with more dramatic effect
    const tiltedY = baseY + (planetData.distance * Math.sin(orbitalTilt.x));
    const tiltedZ = baseZ + (planetData.distance * Math.sin(orbitalTilt.z));
    
    planet.position.set(baseX, tiltedY, tiltedZ);
    planet.visible = true;
    planet.frustumCulled = false;
    
    planet.userData = {
        name: `${systemData.name}-${pIndex + 1}`,
        type: 'planet',
        isStatic: false,
        orbitRadius: planetData.distance,
        orbitSpeed: 0.012 + pIndex * 0.004,
        orbitPhase: pIndex * Math.PI * 0.5,
        systemCenter: { x: systemOffset.x, y: systemOffset.y, z: systemOffset.z },
        mass: planetData.size * 2.5,
        gravity: planetData.size * 0.8,
        isLocalGateway: true, // ✅ Brown orbit lines
        rotationSpeed: 0.02,
        orbitalTilt: orbitalTilt
    };
    
    planets.push(planet);
    scene.add(planet);
    
    // ✅ ADD RINGS (30% chance for larger planets)
    const ringChance = planetData.size > 10 ? 0.5 : 0.3;
    if (Math.random() < ringChance) {
        const ringCount = 2 + Math.floor(Math.random() * 2); // 2-3 rings
        
        for (let r = 0; r < ringCount; r++) {
            const ringInner = planetData.size + 6 + r * 6;
            const ringOuter = ringInner + 4;
            const ringGeometry = new THREE.RingGeometry(ringInner, ringOuter, 32);
            
            // Use color variations based on system
            const ringHue = new THREE.Color(planetData.color);
            ringHue.offsetHSL(Math.random() * 0.1 - 0.05, -0.3, 0);
            
            const ringMaterial = new THREE.MeshBasicMaterial({ 
                color: ringHue,
                transparent: true,
                opacity: 0.6 - r * 0.1,
                side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.2; // Slight tilt variation
            ring.visible = true;
            ring.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
            
            planet.add(ring);
        }
        
        console.log(`✅ Added ${ringCount} rings to ${planet.userData.name}`);
    }
    
    // ✅ ADD MOONS (based on planet size)
    let moonProbability = 0.2;
    if (planetData.size > 8) moonProbability = 0.5;
    if (planetData.size > 12) moonProbability = 0.7;
    
    if (Math.random() < moonProbability) {
        let maxMoons = 1;
        if (planetData.size > 8) maxMoons = 2;
        if (planetData.size > 12) maxMoons = 3;
        
        const moonCount = 1 + Math.floor(Math.random() * maxMoons);
        
        for (let m = 0; m < moonCount; m++) {
            const moonSize = planetData.size * (0.1 + Math.random() * 0.15);
            const moonDistance = planetData.size + 20 + m * 15;
            
            const moonGeometry = new THREE.SphereGeometry(moonSize, 12, 12);
            
            // Moon colors - mostly gray with occasional variation
            const moonHue = Math.random() < 0.7 ? 0 : new THREE.Color(planetData.color).getHSL({}).h;
            const moonSat = Math.random() < 0.7 ? 0 : 0.2;
            const moonLight = 0.4 + Math.random() * 0.3;
            const moonColor = new THREE.Color().setHSL(moonHue, moonSat, moonLight);
            
            const moonMaterial = new THREE.MeshLambertMaterial({ 
                color: moonColor,
                emissive: new THREE.Color(moonColor).multiplyScalar(0.02)
            });
            
            const moon = new THREE.Mesh(moonGeometry, moonMaterial);
            moon.position.set(moonDistance, 0, 0);
            moon.visible = true;
            moon.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
            
            moon.userData = { 
                name: `${systemData.name}-${pIndex + 1}-Moon-${m + 1}`,
                type: 'moon',
                orbitRadius: moonDistance,
                orbitSpeed: 0.1 + m * 0.02,
                orbitPhase: m * Math.PI * 0.5,
                parentPlanet: planet,
                mass: moonSize * 2,
                gravity: moonSize * 0.6,
                isLocalGateway: true
            };
            
            planets.push(moon);
            scene.add(moon);
        }
        
        console.log(`✅ Added ${moonCount} moon(s) to ${planet.userData.name}`);
    }
    
    console.log(`✅ Created ${planet.userData.name} in ${systemData.name} (local gateway orbit)`);
});

// ✅ ADD TENDRILS TO STARS (30% chance)
if (Math.random() < 0.30 && typeof createSunSpikes === 'function') {
    createSunSpikes(star);
    console.log(`✅ Added plasma tendrils to ${star.userData.name}`);
}
});

console.log('✅ Dune star systems created with dramatic vertical spacing and orbital tilts');
    
} catch (duneSystemsError) {
    console.error('❌ Error creating Dune systems:', duneSystemsError);
}

// NOW create the geometry (AFTER the loop completes)
core8GalaxyStarsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(core8LocalStarsVertices, 3));
core8GalaxyStarsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(core8LocalStarsColors, 3));

const core8GalaxyStars = new THREE.Points(core8GalaxyStarsGeometry, core8GalaxyStarsMaterial);
core8GalaxyStars.visible = true;
core8GalaxyStars.frustumCulled = true; // PERF: Enable culling

core8BlackHole.add(core8GalaxyStars);
core8BlackHole.userData.starCluster = core8GalaxyStars; // Store reference for rotation

console.log('✅ 8th galactic core created with spiral galaxy starfield:', core8LocalStarsVertices.length / 3, 'stars');
} catch (core8Error) {
    console.error('❌ Error creating 8th galactic core:', core8Error);
}
    
    // =============================================================================
// LOCAL BLACK HOLE GATEWAY - POSITIONED ABOVE SOLAR SYSTEM PLANE
// =============================================================================

try {
    const localBlackHoleGeometry = new THREE.SphereGeometry(44, 20, 20);
    const localBlackHoleMaterial = _eventHorizonMaterial();
    const blackHole = new THREE.Mesh(localBlackHoleGeometry, localBlackHoleMaterial);
    blackHole.renderOrder = _EVENT_HORIZON_ORDER;
    
    // Sit exactly at the (now far-below-plane) gateway position so the
    // black hole stays the hub of its system cluster.
    blackHole.position.set(
        localGatewayPosition.x,
        localGatewayPosition.y,
        localGatewayPosition.z
    );
        blackHole.visible = true;
        blackHole.frustumCulled = false;
        
        blackHole.userData = { 
            name: 'Local Galactic Gateway', 
            type: 'blackhole',
            mass: 280,
            gravity: 140.0,
            warpThreshold: 100,
            isLocalGateway: true,
            isLocal: true,
            rotationSpeed: 0.015
        };
        
        if (planets && planets.push) {
            planets.push(blackHole);
        }
        
        if (scene && scene.add) {
            scene.add(blackHole);
        }
        
        // Legacy accretion hoop — RETIRED (kept in the graph so anything
        // walking the children still finds a RingGeometry where it expects
        // one). This was the single worst object in the piece: a 16-unit-wide
        // band of FLAT saddle-brown with `transparent:false` (so its 0.4
        // opacity never even applied), sitting directly on the limb of the
        // event horizon at full opacity, identical on both limbs, stepping
        // from background to full value in under 10 pixels. It was what the
        // eye actually read as "the accretion disk", and it read as painted
        // plastic. The Gargantua disk below — HDR, Doppler-beamed, ~33:1
        // between approaching and receding limbs, feathered over half its
        // width — is the real one.
        const ringGeometry = new THREE.RingGeometry(40, 56, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x8b4513,
            transparent: false,
            opacity: 0.4,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.visible = false;
        ring.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
        
        if (blackHole && blackHole.add) {
            blackHole.add(ring);
        }
        addGargantuaVisuals(blackHole, 44, 0xff7a2a);
        
        console.log('✅ Local gateway black hole created');
        
    } catch (localBHError) {
        console.error('❌ Error creating local black hole:', localBHError);
    }

    // =============================================================================
    // NEBULA SKYBOX BACKDROP — the actual fix for "no background sky": until
    // now scene.background was never set, and the only backdrop layers (CMB
    // shader sphere + Hubble deep-field sphere, both below) render at low
    // opacity (0.2 / 0.10), so most of the celestial sphere still read as
    // literal black between them — confirmed by pointing the camera away from
    // the local cluster and getting an empty frame with a couple dozen
    // sub-pixel dots. This bakes ONE full equirectangular nebula texture
    // (dust lanes, a milky-way band, warm/cool color zones, 3 distant galaxy
    // features, and a fine pinprick starfield) once at load time onto a
    // canvas, then wraps it on a giant BackSide sphere — same technique
    // hubbleSkybox2 already uses below (a static texture on a sphere costs
    // one texture sample per pixel per frame, not a re-evaluated shader), so
    // there is no ongoing per-frame cost. It sits outside every other
    // backdrop layer (largest radius, most-negative renderOrder) so the
    // CMB/Hubble/imposter layers still composite their extra detail on top of
    // it exactly as before.
    // =============================================================================
    console.log('Creating procedural nebula skybox backdrop...');
    try {
        const _nebW = _isMobileRenderTier() ? 1024 : 2048;
        const _nebH = _nebW / 2;
        const _nebCanvas = document.createElement('canvas');
        _nebCanvas.width = _nebW;
        _nebCanvas.height = _nebH;
        const _nctx = _nebCanvas.getContext('2d');

        // 1) Base gradient — TRUE BLACK poles, a whisper of violet toward the
        //    equator. Everything painted in steps 1-4 is run through an
        //    explicit BLACK-POINT SUBTRACT in step 4.5 before the stars go
        //    down, so this gradient exists only to tint the dust that
        //    survives the subtract; on its own it lands under the black point
        //    and is erased to literal zero. That is why the blobs below can
        //    finally be painted at full synthwave strength again (they were
        //    cut 4x in an earlier pass purely to hold the luminance floor
        //    down, which drained the colour out of the whole sky).
        const _baseGrad = _nctx.createLinearGradient(0, 0, 0, _nebH);
        _baseGrad.addColorStop(0.00, '#000000');
        _baseGrad.addColorStop(0.35, '#03030f');
        _baseGrad.addColorStop(0.50, '#080522');
        _baseGrad.addColorStop(0.65, '#03030f');
        _baseGrad.addColorStop(1.00, '#000000');
        _nctx.fillStyle = _baseGrad;
        _nctx.fillRect(0, 0, _nebW, _nebH);

        // Helper: soft radial-gradient blob, drawn three times (x-W, x, x+W)
        // so anything overlapping the horizontal seam tiles seamlessly.
        function _nebBlob(cx, cy, r, stops, blur, composite) {
            _nctx.save();
            _nctx.filter = blur ? `blur(${blur}px)` : 'none';
            _nctx.globalCompositeOperation = composite || 'lighter';
            [cx - _nebW, cx, cx + _nebW].forEach((x) => {
                const grad = _nctx.createRadialGradient(x, cy, 0, x, cy, r);
                stops.forEach(([offset, color]) => grad.addColorStop(offset, color));
                _nctx.fillStyle = grad;
                _nctx.beginPath();
                _nctx.arc(x, cy, r, 0, Math.PI * 2);
                _nctx.fill();
            });
            _nctx.restore();
        }

        // 2) Milky-way band — a broad, gently curved strip of denser dust
        //    running the width of the sphere, brighter/warmer than the base.
        //    NOTE ON ALPHAS: every blob below is drawn with 'lighter' onto an
        //    opaque base, so its alpha acts as a pure ADDITIVE intensity and
        //    26 overlapping band blobs stack. The stack of soft, hugely
        //    overlapping tails is exactly what used to smear a low-level wash
        //    across the ENTIRE celestial sphere and lift the frame's black
        //    floor. The previous pass fought that by cutting every alpha 4x,
        //    which killed the colour along with the wash. The real fix is the
        //    black-point subtract in step 4.5: it deletes the overlap tails
        //    outright (they land below the black point and resolve to zero)
        //    while leaving the blob CORES intact. So the alphas here are
        //    painted for the look we want in the dust lanes, ~3x the cut
        //    values, and the subtract — not the artist — polices the floor.
        const _bandY = _nebH * (0.42 + Math.random() * 0.16);
        for (let i = 0; i < 26; i++) {
            const x = (i / 26) * _nebW * 1.4 - _nebW * 0.2;
            const y = _bandY + Math.sin(i * 0.7) * _nebH * 0.05;
            _nebBlob(x, y, _nebH * (0.16 + Math.random() * 0.08),
                [[0, 'rgba(200,190,255,0.125)'], [0.5, 'rgba(140,120,220,0.055)'], [1, 'rgba(0,0,0,0)']],
                50, 'lighter');
        }

        // 3) Dust-lane / warm-cool nebula blobs in synthwave palette
        const _nebPalette = [
            ['rgba(255,45,190,0.215)', 'rgba(255,45,190,0)'],  // magenta dust
            ['rgba(0,220,255,0.200)', 'rgba(0,220,255,0)'],    // cyan dust
            ['rgba(140,60,255,0.215)', 'rgba(140,60,255,0)'],  // violet dust
            ['rgba(255,160,60,0.155)', 'rgba(255,160,60,0)'],  // amber — warm zone
            ['rgba(40,220,190,0.140)', 'rgba(40,220,190,0)']   // teal — cool zone
        ];
        for (let i = 0; i < 16; i++) {
            const p = _nebPalette[i % _nebPalette.length];
            const cx = Math.random() * _nebW;
            const cy = _nebH * 0.12 + Math.random() * _nebH * 0.76;
            const r = _nebH * (0.14 + Math.random() * 0.22);
            _nebBlob(cx, cy, r, [[0, p[0]], [1, p[1]]], 55, 'lighter');
        }

        // 4) Distant galaxy features — 3 large, bright landmarks with a
        //    tight core, soft halo, and faint spiral-arm streaks.
        const _nebGalaxies = [
            { x: _nebW * 0.18, y: _nebH * 0.30, r: _nebH * 0.10, hue: 'rgba(255,235,210,' },
            { x: _nebW * 0.62, y: _nebH * 0.68, r: _nebH * 0.085, hue: 'rgba(200,220,255,' },
            { x: _nebW * 0.85, y: _nebH * 0.22, r: _nebH * 0.075, hue: 'rgba(255,205,240,' }
        ];
        //    Halos and arms are painted at full strength again (the subtract
        //    below eats their outer falloff); the tight CORES stay hot on
        //    purpose — like the baked stars below they are the crisp, small,
        //    high-contrast detail that survives the additive opacity and
        //    gives the void something to bite against.
        _nebGalaxies.forEach((g) => {
            _nebBlob(g.x, g.y, g.r * 3.2, [[0, g.hue + '0.080)'], [1, g.hue + '0)']], 60, 'lighter');
            _nebBlob(g.x, g.y, g.r, [[0, g.hue + '1.0)'], [0.3, g.hue + '0.42)'], [1, g.hue + '0)']], 6, 'lighter');
            _nctx.save();
            _nctx.translate(g.x, g.y);
            _nctx.rotate(Math.random() * Math.PI);
            _nctx.scale(1, 0.35);
            _nctx.filter = 'blur(3px)';
            _nctx.strokeStyle = g.hue + '0.170)';
            _nctx.lineWidth = g.r * 0.12;
            _nctx.lineCap = 'round';
            for (let a = 0; a < 2; a++) {
                _nctx.beginPath();
                _nctx.arc(0, 0, g.r * (1.6 + a * 0.6), a * Math.PI, a * Math.PI + Math.PI * 1.3);
                _nctx.stroke();
            }
            _nctx.restore();
        });

        // 4.5) BLACK-POINT SUBTRACT — the single change that lets open sky
        //      resolve to the clear colour again.
        //
        //      This dome is the outermost additive layer and it covers every
        //      pixel of every frame, so whatever its darkest texel is becomes
        //      the game's luminance FLOOR. The problem was never the bright
        //      dust: it was that 26 band blobs + 16 dust blobs + 3 galaxy
        //      halos, each a soft radial gradient with a wide tail, sum with
        //      'lighter' into a low-level wash of ~10-25/255 across the WHOLE
        //      sphere, with no texel anywhere reading zero. Multiply that by
        //      the material's additive opacity and every frame gained a few
        //      counts of plum haze it could never lose — measured floor
        //      RGB(13,9,16), and a controlled A/B (hide this one mesh) moved
        //      the open-void vantage from 24% to 85% of pixels under 0.02
        //      luma. The dome, on its own, WAS the milk.
        //
        //      A gradient's tail is unbounded, so no choice of alpha ever
        //      makes it reach zero — you can only make the whole sky dimmer,
        //      which is what the previous 4x cut did (and why the sky went
        //      grey and lifeless). Subtracting a black point fixes the tails
        //      instead of the peaks: everything below `bp` is clamped to
        //      literal 0 — an additive texel of 0 contributes EXACTLY nothing
        //      no matter what opacity the dome runs at — while what survives
        //      is renormalised and gamma-crushed so the dust lanes come back
        //      HOTTER and more saturated than before. Blacks and colour, not
        //      blacks or colour.
        //
        //      Runs before the pinprick starfield below so the stars are
        //      composited on top of the graded dust at full brightness
        //      instead of being crushed with it. One pass over the canvas at
        //      load time (256-entry LUT, no per-pixel pow) — zero per-frame
        //      cost, and it is the last thing to touch the dust layer.
        const _NEB_BLACK_POINT = 0.115;   // texels dimmer than this → hard 0
        const _NEB_GAMMA = 1.30;          // crush the mids that survive
        const _NEB_GAIN = 1.45;           // then put the punch back in the lanes
        try {
            const _nebLut = new Uint8ClampedArray(256);
            const _nebSpan = 1 - _NEB_BLACK_POINT;
            for (let v = 0; v < 256; v++) {
                const t = Math.max(0, (v / 255) - _NEB_BLACK_POINT) / _nebSpan;
                _nebLut[v] = Math.round(Math.min(1, Math.pow(t, _NEB_GAMMA) * _NEB_GAIN) * 255);
            }
            const _nebImg = _nctx.getImageData(0, 0, _nebW, _nebH);
            const _nebPx = _nebImg.data;
            for (let i = 0; i < _nebPx.length; i += 4) {
                _nebPx[i] = _nebLut[_nebPx[i]];
                _nebPx[i + 1] = _nebLut[_nebPx[i + 1]];
                _nebPx[i + 2] = _nebLut[_nebPx[i + 2]];
            }
            _nctx.putImageData(_nebImg, 0, 0);
        } catch (nebGradeError) {
            // getImageData can throw on a tainted canvas; the dome is still
            // usable ungraded, just hazier, so this must never be fatal.
            console.warn('⚠️ Nebula skybox black-point subtract skipped:', nebGradeError);
        }

        // 5) Fine pinprick starfield baked straight into the backdrop — fills
        //    the gaps between the live Points starfield so a distant frame
        //    never reads as bare black between sparse dots, denser near the
        //    milky-way band like a real sky.
        _nctx.globalCompositeOperation = 'lighter';
        const _nebStarCount = _isMobileRenderTier() ? 3500 : 7000;
        for (let i = 0; i < _nebStarCount; i++) {
            const x = Math.random() * _nebW;
            const y = Math.random() * _nebH;
            const nearBand = Math.max(0, 1 - Math.abs(y - _bandY) / (_nebH * 0.3));
            if (Math.random() > 0.35 + nearBand * 0.5) continue;
            const size = Math.random() < 0.92 ? Math.random() * 0.9 + 0.2 : Math.random() * 1.6 + 1.0;
            const warm = Math.random() < 0.28;
            // Pushed toward full brightness (was 0.35..0.85). The dust around
            // them got 4x darker and the whole layer now composites at 0.25
            // additive, so stars need the headroom to stay CRISP pinpricks
            // against real black instead of dissolving into the wash.
            const alpha = 0.62 + Math.random() * 0.38;
            _nctx.fillStyle = warm
                ? `rgba(255,${200 + Math.floor(Math.random() * 40)},${150 + Math.floor(Math.random() * 60)},${alpha})`
                : `rgba(${200 + Math.floor(Math.random() * 40)},${225 + Math.floor(Math.random() * 30)},255,${alpha})`;
            _nctx.beginPath();
            _nctx.arc(x, y, size, 0, Math.PI * 2);
            _nctx.fill();
        }
        _nctx.globalCompositeOperation = 'source-over';

        const nebulaSkyboxTexture = new THREE.CanvasTexture(_nebCanvas);
        nebulaSkyboxTexture.wrapS = THREE.RepeatWrapping;
        nebulaSkyboxTexture.wrapT = THREE.ClampToEdgeWrapping;
        nebulaSkyboxTexture.needsUpdate = true;

        const nebulaSkyboxGeometry = new THREE.SphereGeometry(195000, 48, 32);
        // ADDITIVE, not opaque. Previously this drew as a solid MeshBasic
        // wash: because it is the outermost layer with the most-negative
        // renderOrder, every one of its texels became the literal minimum
        // luminance of that direction of sky, and the darkest texel was a
        // violet ~#120e2a — so NOTHING in the game could ever be blacker
        // than that. Additive at 0.25 means this layer can only ADD light
        // on top of the near-black clear colour: void stays void, dust
        // lanes and baked stars still bloom.
        const nebulaSkyboxMaterial = new THREE.MeshBasicMaterial({
            map: nebulaSkyboxTexture,
            side: THREE.BackSide,
            fog: false,
            transparent: true,
            opacity: 0.25,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false
        });
        const nebulaSkybox = new THREE.Mesh(nebulaSkyboxGeometry, nebulaSkyboxMaterial);
        nebulaSkybox.renderOrder = -5; // furthest-back layer — everything else composites on top
        nebulaSkybox.frustumCulled = false;
        scene.add(nebulaSkybox);
        window.nebulaSkybox = nebulaSkybox;
        window.nebulaSkyboxTexture = nebulaSkyboxTexture;
        // Design opacity the distance fade below modulates around.
        nebulaSkybox.userData._nebBaseOpacity = 0.25;

        // scene.background is the true floor of the frame now that the
        // backdrop is additive. Near-black with a trace of blue so it reads
        // as deep space rather than a dead monitor, but low enough that
        // large parts of an open-void frame sit under 0.02 luminance.
        scene.background = new THREE.Color(0x010109);

        console.log(`✅ Nebula skybox backdrop created (${_nebW}x${_nebH}, radius 195000, additive @0.25)`);
    } catch (nebulaSkyboxError) {
        console.error('❌ Error creating nebula skybox backdrop:', nebulaSkyboxError);
    }

    // =============================================================================
    // COSMIC MICROWAVE BACKGROUND (CMB) SKYBOX
    // =============================================================================
    
    console.log('Creating cosmic background radiation skybox...');
    
    try {
// Shader material for procedural cosmic background
        const cosmicSkyboxMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                opacity: { value: 0.2 }  // Add opacity uniform for easy control
            },
            vertexShader: `
                varying vec3 vPosition;
                varying vec2 vUv;
                
                void main() {
                    vPosition = position;
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float opacity;
                varying vec3 vPosition;
                varying vec2 vUv;
                
                // Noise functions for cosmic texture
                float random(vec2 st) {
                    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
                }
                
                float noise(vec2 st) {
                    vec2 i = floor(st);
                    vec2 f = fract(st);
                    float a = random(i);
                    float b = random(i + vec2(1.0, 0.0));
                    float c = random(i + vec2(0.0, 1.0));
                    float d = random(i + vec2(1.0, 1.0));
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
                }
                
                float fbm(vec2 st) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    float frequency = 2.0;
                    for(int i = 0; i < 6; i++) {
                        value += amplitude * noise(st * frequency);
                        frequency *= 2.0;
                        amplitude *= 0.5;
                    }
                    return value;
                }

                // Ridged multifractal: folds value-noise around its midpoint so
                // troughs collapse toward 0 and octaves that agree reinforce each
                // other into thin bright seams instead of smooth blobs. This is
                // what turns the noise into filamentary dust lanes.
                float ridgedFbm(vec2 st) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    float frequency = 1.0;
                    float weight = 1.0;
                    for (int i = 0; i < 6; i++) {
                        float n = noise(st * frequency);
                        n = 1.0 - abs(n * 2.0 - 1.0);
                        n = n * n;
                        n *= weight;
                        weight = clamp(n * 2.0, 0.0, 1.0);
                        value += n * amplitude;
                        frequency *= 2.05; // slight lacunarity drift avoids grid alignment
                        amplitude *= 0.5;
                    }
                    return value;
                }

                // Cheap 2-tap domain warp so the ridged filaments curl and drift
                // like real dust lanes instead of tracing straight noise cells.
                vec2 domainWarp(vec2 st) {
                    float wx = noise(st * 1.3 + 4.2) * 0.6 + noise(st * 2.7 + 8.5) * 0.4;
                    float wy = noise(st * 1.3 + 9.1) * 0.6 + noise(st * 2.7 + 1.7) * 0.4;
                    return (vec2(wx, wy) - 0.5) * 1.2;
                }

                void main() {
                    // Create spherical coordinates for seamless wrapping
                    vec3 direction = normalize(vPosition);
                    float theta = atan(direction.z, direction.x);
                    float phi = acos(direction.y);
                    vec2 sphereUV = vec2(theta / (2.0 * 3.14159), phi / 3.14159);

                    vec2 warpedUV = sphereUV + domainWarp(sphereUV * 4.0) * 0.6;

                    // Multi-scale ridged noise for filamentary dust structure
                    vec2 uv1 = warpedUV * 3.0;
                    vec2 uv2 = warpedUV * 8.0;
                    vec2 uv3 = warpedUV * 20.0;

                    float pattern1 = ridgedFbm(uv1);
                    float pattern2 = ridgedFbm(uv2);
                    float pattern3 = ridgedFbm(uv3);

                    // Combine patterns for complex structure
                    float combinedPattern = pattern1 * 0.5 + pattern2 * 0.3 + pattern3 * 0.2;

                    // Bias the structure into one soft "milky way" band that wraps
                    // the sphere along a fixed tilted plane; away from it the
                    // filaments are suppressed so most of the sky stays quiet.
                    vec3 galacticPlaneNormal = normalize(vec3(0.35, 0.92, -0.18));
                    float distFromPlane = abs(dot(direction, galacticPlaneNormal));
                    float bandBoost = 1.0 - smoothstep(0.0, 0.4, distFromPlane);
                    combinedPattern *= mix(0.2, 1.0, bandBoost);

                    // Contrast/power curve: crushes the mid-tones toward black so
                    // bright emission is rare and localized instead of a global wash.
                    float t = pow(clamp(combinedPattern, 0.0, 1.0), 2.5);

                    // Rare, low-frequency mask selecting 2-3 small hero regions
                    // across the whole sphere where saturated color is allowed.
                    float heroNoise = fbm(sphereUV * 1.2 + vec2(41.0, 17.0));
                    float heroMask = smoothstep(0.72, 0.9, heroNoise);

                    // Base palette: near-black void deepening into indigo/blue
                    // neon dust as filament brightness rises. This alone covers
                    // ~60-70% of the sphere's area at the void end.
                    vec3 voidColor = vec3(0.010, 0.008, 0.025);
                    vec3 indigoColor = vec3(0.05, 0.03, 0.12);
                    vec3 dustColor = vec3(0.12, 0.20, 0.50);
                    vec3 filamentColor = vec3(0.35, 0.45, 0.85);

                    vec3 baseColor = voidColor;
                    baseColor = mix(baseColor, indigoColor, smoothstep(0.05, 0.30, t));
                    baseColor = mix(baseColor, dustColor, smoothstep(0.30, 0.65, t));
                    baseColor = mix(baseColor, filamentColor, smoothstep(0.65, 0.95, t));

                    // Hero overlay: saturated synthwave pink/orange, gated to the
                    // few heroMask regions AND only at their brightest ridge tips.
                    vec3 warmColor = vec3(0.9, 0.25, 0.55);
                    vec3 hotColor = vec3(1.0, 0.55, 0.15);
                    float heroStrength = heroMask * smoothstep(0.55, 0.9, t);
                    vec3 heroColor = mix(warmColor, hotColor, smoothstep(0.6, 1.0, t));

                    vec3 color = mix(baseColor, heroColor, heroStrength);

                    // Add subtle variation (kept faint so it can't wash out the void)
                    float variation = noise(sphereUV * 50.0) * 0.03;
                    color += vec3(variation) * (0.3 + 0.7 * t);

                    // BLACK-POINT SUBTRACT. Same policy as the nebula dome's
                    // baked grade: this sphere is additive and covers every
                    // pixel, so its quietest fragment sets a floor the frame
                    // can never get below. voidColor (0.010,0.008,0.025) plus
                    // the variation term meant the "empty" 60-70% of this
                    // sphere still emitted a few counts of indigo everywhere.
                    // Subtracting exactly that much makes the void resolve to
                    // a hard zero — additive zero contributes NOTHING — while
                    // the filaments and hero regions keep their energy and get
                    // a little of it back from the renormalise.
                    color = max(color - vec3(0.012, 0.010, 0.030), vec3(0.0)) * 1.15;

                    // Add faint stars/bright spots AFTER the subtract so the
                    // pinpricks stay crisp instead of being crushed with the dust.
                    float stars = pow(noise(sphereUV * 800.0), 20.0) * 0.6;
                    color += vec3(stars);

                    gl_FragColor = vec4(color, opacity);  // Use opacity uniform
                }
            `,
            transparent: true,         // Enable transparency
            blending: THREE.AdditiveBlending,  // Try additive blending
            side: THREE.BackSide,      // Render inside of sphere
            depthWrite: false
        });
        
        // Create massive sphere that encompasses the entire universe
        const cosmicSkyboxGeometry = new THREE.SphereGeometry(150000, 64, 64);
        const cosmicSkybox = new THREE.Mesh(cosmicSkyboxGeometry, cosmicSkyboxMaterial);
        cosmicSkybox.renderOrder = -1; // Render behind everything
        cosmicSkybox.visible = true;
        cosmicSkybox.frustumCulled = false;
        
        scene.add(cosmicSkybox);
        
        // Store reference for animation
        window.cosmicSkybox = cosmicSkybox;  // Store globally
        if (typeof gameState !== 'undefined') {
            gameState.cosmicSkybox = cosmicSkybox;
        }
        
        console.log('✅ Cosmic microwave background skybox created');
        
    } catch (cosmicError) {
        console.error('❌ Error creating cosmic background:', cosmicError);
    }
    
    // =============================================================================
    // HUBBLE ULTRA DEEP FIELD SKYBOX 2 - SECOND LAYER OF DISTANT GALAXIES
    // =============================================================================
    
    console.log('Creating second Hubble Ultra Deep Field galaxy background...');
    
    try {
        const textureLoader2 = new THREE.TextureLoader();
        
        // Local Hubble Ultra Deep Field image path (second image)
        const hubbleImageURL2 = './images/hubble_ultra_deep_field_high_rez_edit4.jpg';
        
        console.log('Loading second Hubble Ultra Deep Field image from local path...');
        
        textureLoader2.load(
            hubbleImageURL2,
            function(texture) {
                // fog: false is LOAD-BEARING, not tidiness.
                //
                // MeshBasicMaterial defaults to fog: true, and this sphere has
                // a radius of 140,000 while scene.fog (atmospheric-perspective
                // .js) runs 55,000 → 130,000. Every single fragment of this
                // dome is therefore PAST fogFar, i.e. 100% fog colour — so
                // this layer has never once shown the Hubble Ultra Deep Field.
                // It has been rendering as a flat sheet of the synthwave
                // horizon violet at up to 0.50 opacity: the single largest
                // luminance floor in the game, painted over the entire
                // celestial sphere, and the reason the sky read as uniform
                // dark teal no matter which way the player looked. Unfogged,
                // the plate is what it was always meant to be — near-perfect
                // black with thousands of pinprick galaxies.
                //
                // ADDITIVE for the same reason: the plate's own background is
                // genuinely black (median luminance 0.000, p90 0.0045), so
                // adding it contributes galaxies and nothing else, where
                // normal blending would multiply down the nebula dome behind
                // it for no gain.
                const hubbleMaterial2 = new THREE.MeshBasicMaterial({
                    map: texture,
                    side: THREE.BackSide,
                    transparent: true,
                    opacity: 0.10,  // Visible immediately so the background isn't pure black at start
                    fog: false,
                    blending: THREE.AdditiveBlending,
                    toneMapped: false,
                    depthWrite: false
                });

                // BLACK-POINT SUBTRACT on the plate itself.
                //
                // "Genuinely black background" is true of the ORIGINAL plate
                // and false of the JPEG we ship: chroma subsampling and ring
                // artefacts leave the empty sky sitting at roughly 5-8/255
                // instead of 0. Additive at up to 0.45 opacity across a
                // 140,000u dome, that is a couple of counts added to every
                // pixel of every frame — small on its own, but it stacks with
                // the nebula dome and it is pure haze, never detail.
                // Subtracting the plate's own black level pins empty sky to
                // exactly 0 and leaves the galaxies (which sit far above it)
                // essentially untouched, so this layer can keep its full
                // opacity and give back only what it was hired for.
                //
                // Injected instead of hand-writing a ShaderMaterial so the
                // material stays a stock MeshBasicMaterial — same fog/encoding
                // plumbing, same one-texture-sample cost, no new shader to
                // keep in sync with the r128 chunks.
                hubbleMaterial2.onBeforeCompile = function (shader) {
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <map_fragment>',
                        [
                            '#ifdef USE_MAP',
                            '  vec4 texelColor = texture2D( map, vUv );',
                            '  texelColor = mapTexelToLinear( texelColor );',
                            '  texelColor.rgb = max(texelColor.rgb - vec3(0.055), vec3(0.0)) * 1.19;',
                            '  diffuseColor *= texelColor;',
                            '#endif'
                        ].join('\n')
                    );
                };

                // Create sphere behind the first Hubble skybox
                const hubbleGeometry2 = new THREE.SphereGeometry(140000, 64, 64);
                const hubbleSkybox2 = new THREE.Mesh(hubbleGeometry2, hubbleMaterial2);
                hubbleSkybox2.renderOrder = -3; // Render behind first Hubble skybox
                hubbleSkybox2.visible = true;
                hubbleSkybox2.frustumCulled = false;
                
                scene.add(hubbleSkybox2);
                
                // Store reference
                window.hubbleSkybox2 = hubbleSkybox2;
                if (typeof gameState !== 'undefined') {
                    gameState.hubbleSkybox2 = hubbleSkybox2;
                }
                
                console.log('✅ Second Hubble Ultra Deep Field skybox loaded - deeper distant galaxies visible');
            },
            function(progress) {
                console.log(`Loading second Hubble texture: ${(progress.loaded / progress.total * 100).toFixed(0)}%`);
            },
            function(error) {
                console.warn('❌ Failed to load second Hubble image from /images/');
                console.error('Error details:', error);
            }
        );
        
    } catch (hubbleError) {
        console.error('❌ Error creating second Hubble skybox:', hubbleError);
    }
	
    // =============================================================================
    // STARFIELD CREATION
    // =============================================================================
    
    console.log('Creating comprehensive 3D starfield...');
    
    try {
        // Shared vertex/fragment plumbing for both field stars and hero
        // stars: size and twinkle are per-vertex attributes so a single
        // draw call can hold thousands of differently-sized,
        // differently-timed points. Twinkle time is driven every frame
        // from updateDeepSpaceSparkle() (see below), called out of
        // updateNebulaBreathing() so it stays smooth even though that
        // hook runs unthrottled.
        //
        // HDR MAGNITUDE MODEL. The old grading gave every star the same peak
        // brightness and sized it purely by distance: `gl_PointSize = aSize *
        // (uSizeScale / -z)`. At the ranges these shells actually live at
        // (40,000-900,000u) that expression evaluates to a few HUNDREDTHS of
        // a pixel, so hardware clamped literally every star to one dim
        // fragment. The sky came out as uniform grey confetti — measured, only
        // 0.003% of an open-void frame exceeded 0.9 luma, i.e. the renderer
        // had a black point but no WHITE point, and nothing in the sky could
        // read as bright because nothing WAS bright.
        //
        // Real skies are the opposite: apparent magnitude is logarithmic and
        // heavily skewed, so a handful of stars are overwhelmingly brighter
        // than the thousands behind them, and THAT is what the eye reads as
        // depth. So each star now carries:
        //   aPx  — its screen radius in pixels, driven by MAGNITUDE, not
        //          range (a background star's distance is a rounding error at
        //          these scales), with a small distance term left in so the
        //          near shell still grows if you fly into it.
        //   aHDR — a peak intensity that is allowed to EXCEED 1.0.
        // The fragment shader tone-maps that HDR value the way a sensor does:
        // once the core passes 1.0 it stops getting brighter and starts
        // getting whiter, so bright stars bloom out to a clipped white core
        // wrapped in their own colour instead of clamping to a flat disc.
        // Faint stars stay sub-1.0 and read as coloured texture, untouched.
        //
        // Still one draw call, still NormalBlending (no additive overdraw) —
        // this is a re-grade, not more particles. Point count is unchanged.
        const _starVertexShader = `
            attribute float aSize;
            attribute float aPhase;
            attribute float aSpeed;
            attribute float aPx;
            attribute float aHDR;
            varying vec3 vColor;
            varying float vTwinkle;
            varying float vHDR;
            uniform float uTime;
            uniform float uSizeScale;
            uniform float uDpr;
            uniform float uMaxPx;
            void main() {
                vColor = color;
                vHDR = aHDR;
                vTwinkle = 0.78 + 0.22 * sin(uTime * aSpeed + aPhase);
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                // Magnitude-driven screen size, plus the legacy perspective
                // term so a star you actually approach still swells.
                float near = min(aSize * (uSizeScale / max(1.0, -mvPosition.z)), 6.0);
                // HARD SCREEN-SIZE CEILING. Point size here is magnitude-driven
                // and therefore distance-INDEPENDENT: without a cap, a bright
                // star holds the same screen radius whether it is 12,000u or
                // 600,000u away, so a generous aPx stops reading as "a brilliant
                // star" and starts reading as a foreground bokeh orb pasted over
                // the frame. The ceiling is what keeps every one of these a
                // STAR — brightness may exceed 1.0 (see aHDR), radius may not.
                gl_PointSize = min(aPx + near, uMaxPx) * uDpr;
                gl_Position = projectionMatrix * mvPosition;
            }
        `;
        const _starFragmentShader = `
            varying vec3 vColor;
            varying float vTwinkle;
            varying float vHDR;
            void main() {
                vec2 uv = gl_PointCoord - 0.5;
                float d = length(uv) * 2.0;
                // Flat-topped core + soft skirt. The PLATEAU is the point: a
                // Gaussian peaks at one texel and falls off immediately, so a
                // "bright" star was still only ever one bright pixel. Real
                // overexposure saturates an AREA — the sensor clips across the
                // whole core and only then rolls off — and that saturated
                // disc is what makes a star read as brilliant rather than
                // merely present. The skirt is the glow, and it costs nothing
                // extra: no additive halo pass, no second draw call.
                // Core + glow. The core is the saturated disc that clips to
                // white; the glow is a wide, much dimmer falloff that keeps a
                // bright star from reading as a cut-out circle. Brightness,
                // not radius, is what the magnitude curve mostly buys — an
                // HDR value of 8 does not make a fatter dot, it makes a
                // wider region of the SAME dot clip to white.
                float core = pow(smoothstep(0.78, 0.05, d), 1.25);
                float glow = pow(max(0.0, 1.0 - d), 3.2) * 0.30;
                float I = (core + glow) * vHDR * vTwinkle;
                if (I < 0.045) discard;
                // HDR -> LDR. Everything past 1.0 spills into desaturation,
                // so an overexposed core clips to white while its falloff
                // keeps the star's colour.
                vec3 c = mix(vColor, vec3(1.0), clamp(I - 1.0, 0.0, 1.0));
                gl_FragColor = vec4(c, clamp(I, 0.0, 1.0));
            }
        `;
        const _heroFragmentShader = `
            varying vec3 vColor;
            varying float vTwinkle;
            varying float vHDR;
            void main() {
                vec2 uv = gl_PointCoord - 0.5;
                float d = length(uv);
                // Core radius tightened 0.34 -> 0.20. At 0.34 the saturated
                // disc covered ~68% of the sprite's width, so with an HDR core
                // clipping to white the whole quad read as a filled white ball
                // and the cross-flare was just a fringe on it. At 0.20 the disc
                // is a star's overexposed point and the SPIKES carry the
                // "hero" read — which is the effect this was always for.
                float core = pow(smoothstep(0.20, 0.0, d), 1.25);
                float crossX = smoothstep(0.030, 0.0, abs(uv.y)) * (1.0 - smoothstep(0.02, 0.5, abs(uv.x)));
                float crossY = smoothstep(0.030, 0.0, abs(uv.x)) * (1.0 - smoothstep(0.02, 0.5, abs(uv.y)));
                float flare = max(crossX, crossY) * 0.85;
                float I = (core * vHDR + flare) * (0.6 + 0.4 * vTwinkle);
                if (I < 0.02) discard;
                vec3 c = mix(vColor, vec3(1.0), clamp(I - 1.0, 0.0, 1.0));
                gl_FragColor = vec4(c, clamp(I, 0.0, 1.0));
            }
        `;

        const _starSizeScale = (typeof window !== 'undefined' ? window.innerHeight : 900) * 0.5;
        // gl_PointSize is in DEVICE pixels, so a size picked to look right at
        // 1x would render half as wide on a 2x buffer. Scale by the actual
        // pixel ratio so the magnitude curve means the same thing everywhere.
        const _starDpr = (typeof renderer !== 'undefined' && renderer && renderer.getPixelRatio)
            ? renderer.getPixelRatio()
            : (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1);

        // Synthwave star palette: mostly blue-white (real-sky-accurate),
        // with warm amber and magenta/violet accents for identity.
        function _pickStarColor() {
            const r = Math.random();
            let h, s, l;
            if (r < 0.5) { h = 0.56 + Math.random() * 0.08; s = 0.20 + Math.random() * 0.35; l = 0.72 + Math.random() * 0.22; }
            else if (r < 0.72) { h = 0.09 + Math.random() * 0.05; s = 0.45 + Math.random() * 0.35; l = 0.62 + Math.random() * 0.22; }
            else if (r < 0.9) { h = Math.random(); s = 0.02 + Math.random() * 0.06; l = 0.85 + Math.random() * 0.13; }
            else { h = 0.82 + Math.random() * 0.08; s = 0.35 + Math.random() * 0.4; l = 0.68 + Math.random() * 0.2; }
            return new THREE.Color().setHSL(h, s, l);
        }

        // Combined "field stars" buffer — near + mid + far shells all live
        // in ONE geometry/ONE draw call (same draw-call budget as the old
        // single-shell starfield, which already merged its two tiers into
        // one buffer). Per-vertex size/color/twinkle replace the old flat
        // white PointsMaterial.
        const fieldPositions = [];
        const fieldColors = [];
        const fieldSizes = [];
        const fieldPhases = [];
        const fieldSpeeds = [];
        const fieldPx = [];
        const fieldHDR = [];

        // magExp shapes the magnitude distribution for a shell: `Math.pow(u,
        // magExp)` with magExp > 1 pushes most stars toward faint and leaves a
        // thin tail of brilliant ones — the log-skew a real sky has. Raise it
        // for a background fill shell, lower it for a shell of landmarks.
        // hdrMax is how far past 1.0 that shell's brightest cores are allowed
        // to go, i.e. how hard they clip to white.
        function _addFieldStar(distanceFactor, sizeMin, sizeMax, magExp, hdrMax, pxMax) {
            const x = (Math.random() - 0.5) * 4000 * distanceFactor;
            const y = (Math.random() - 0.5) * 1600 * distanceFactor;
            const z = (Math.random() - 0.5) * 4000 * distanceFactor;
            fieldPositions.push(x, y, z);
            const c = _pickStarColor();
            fieldColors.push(c.r, c.g, c.b);
            fieldSizes.push(sizeMin + Math.random() * (sizeMax - sizeMin));
            fieldPhases.push(Math.random() * Math.PI * 2);
            fieldSpeeds.push(0.3 + Math.random() * 0.7);
            const mag = Math.pow(Math.random(), magExp);
            // Size grows much more slowly than brightness (sqrt-ish), so the
            // bright end reads as INTENSE rather than as fat blobs.
            fieldPx.push(1.05 + Math.pow(mag, 2.0) * pxMax);
            fieldHDR.push(0.26 + mag * hdrMax);
        }

        // Point count raised from the original ~4,140 to 50k+ (desktop) so the
        // sky reads as a dense field instead of ~30 visible dots when the
        // camera looks away from the local cluster — a single Points draw
        // call scales trivially to this count (no texture sampling, no
        // additive overdraw: NormalBlending, see fieldStarsMaterial below),
        // so this is a vertex-count bump, not a new fill-rate cost. Halved
        // per-shell on mobile via _fieldStarMul, consistent with the
        // existing mobile-tier scaling elsewhere in this function.
        const _fieldStarMul = _isMobileRenderTier() ? 0.5 : 1;

        // Shell A — near background (was "Background stars"). Closest shell,
        // so it carries the brightest magnitudes and the widest spread.
        for (let i = 0; i < 9000 * _fieldStarMul; i++) _addFieldStar(10 + Math.random() * 30, 0.9, 1.7, 2.8, 6.5, 6.0);

        // Shell B — mid depth (fills the gap between near and far so the
        // field reads as layered depth instead of two flat clusters)
        for (let i = 0; i < 14000 * _fieldStarMul; i++) _addFieldStar(40 + Math.random() * 55, 0.6, 1.2, 3.6, 5.0, 4.0);
        
// =============================================================================
// LOCAL GALAXY STARS - SEPARATE ROTATING OBJECT
// =============================================================================

const localGalaxyStarsGeometry = new THREE.BufferGeometry();
const localGalaxyStarsMaterial = new THREE.PointsMaterial({
    size: 1.0,
    map: getPointSprite(),              // round star, not a square pixel block
    depthWrite: false,
    vertexColors: true,
    transparent: true,
    opacity: _isMobileRenderTier() ? 0.5 : 1.0,
    sizeAttenuation: true
});

const localStarsVertices = [];
const localStarsColors = [];

// Local galaxy stars in spiral pattern around Sagittarius A*. 4×
// spatial scale to match the 4×-enlarged Sgr A* + Gargantua disk so
// the vertical axis is visible above/below the hole again like on
// main. Halved on mobile (harsh additive pile-up with no AA there).
const _sgrAStarCount = _isMobileRenderTier() ? 3000 : 6000;
for (let i = 0; i < _sgrAStarCount; i++) {
    const armAngle = Math.random() * Math.PI * 2;
    const armDistance = Math.pow(Math.random(), 1.8) * 16000;
    const armWidth = 0.25;

    if (Math.random() < 0.3) {
        // Dense center bulge — older population, warm gold/amber core
        const bulgeRadius = Math.pow(Math.random(), 3) * 2800;
        const bulgeAngle = Math.random() * Math.PI * 2;
        const bulgeHeight = (Math.random() - 0.5) * 1200;
        const x = Math.cos(bulgeAngle) * bulgeRadius;
        const z = Math.sin(bulgeAngle) * bulgeRadius;
        const y = bulgeHeight;
        localStarsVertices.push(x, y, z);
        const _bc = new THREE.Color().setHSL(0.10 + Math.random() * 0.05, 0.55 + Math.random() * 0.25, 0.6 + Math.random() * 0.2);
        localStarsColors.push(_bc.r, _bc.g, _bc.b);
    } else {
        // Spiral arms — young population, cyan/blue-white with a magenta sprinkle
        const angle = armAngle + (armDistance / 360) * Math.PI;
        const x = Math.cos(angle) * armDistance + (Math.random() - 0.5) * armWidth * armDistance;
        const z = Math.sin(angle) * armDistance + (Math.random() - 0.5) * armWidth * armDistance;
        const y = (Math.random() - 0.5) * 480;
        localStarsVertices.push(x, y, z);
        const _ac = Math.random() < 0.12
            ? new THREE.Color().setHSL(0.85 + Math.random() * 0.08, 0.6, 0.7)
            : new THREE.Color().setHSL(0.54 + Math.random() * 0.1, 0.35 + Math.random() * 0.3, 0.7 + Math.random() * 0.2);
        localStarsColors.push(_ac.r, _ac.g, _ac.b);
    }
}

localGalaxyStarsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(localStarsVertices, 3));
localGalaxyStarsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(localStarsColors, 3));
const localGalaxyStars = new THREE.Points(localGalaxyStarsGeometry, localGalaxyStarsMaterial);
localGalaxyStars.visible = true;
localGalaxyStars.frustumCulled = true; // PERF: Enable culling

// Store as global variable so we can rotate it
window.localGalaxyStars = localGalaxyStars;

if (scene && scene.add) {
    scene.add(localGalaxyStars);
    console.log('✅ Local galaxy stars created (rotating):', localStarsVertices.length / 3, 'stars');
}
        
        // Shell C — distant bright (was "Distant bright stars"). This is the
        // LANDMARK shell: a low magExp means most of these are genuinely
        // bright, so the far sky has named-star anchors the eye can lock to.
        for (let i = 0; i < 1700 * _fieldStarMul; i++) _addFieldStar(100 + Math.random() * 130, 1.6, 2.8, 1.25, 10.0, 13.0);

        // Shell D — far/faint fill layer: at 30000,4000,30000 looking outward,
        // past Shell C's distance but still well inside the far plane, there
        // was nothing. Deliberately the faintest grade in the sky (high
        // magExp, low hdrMax) so it reads as dust-fine texture between the
        // brighter shells and never as a fourth layer of confetti.
        for (let i = 0; i < 28000 * _fieldStarMul; i++) _addFieldStar(120 + Math.random() * 100, 0.35, 0.75, 5.5, 1.8, 2.0);

        const fieldStarsGeometry = new THREE.BufferGeometry();
        fieldStarsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fieldPositions, 3));
        fieldStarsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(fieldColors, 3));
        fieldStarsGeometry.setAttribute('aSize', new THREE.Float32BufferAttribute(fieldSizes, 1));
        fieldStarsGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(fieldPhases, 1));
        fieldStarsGeometry.setAttribute('aSpeed', new THREE.Float32BufferAttribute(fieldSpeeds, 1));
        fieldStarsGeometry.setAttribute('aPx', new THREE.Float32BufferAttribute(fieldPx, 1));
        fieldStarsGeometry.setAttribute('aHDR', new THREE.Float32BufferAttribute(fieldHDR, 1));

        // Screen-radius ceilings, in CSS px. The field shells already cap
        // themselves through pxMax (14 at the very top of Shell C), so
        // FIELD_MAX_PX is a safety net, not a re-grade. HERO_MAX_PX is the
        // load-bearing one: it is what guarantees a hero star can never grow
        // into a foreground orb no matter what the magnitude roll gives it.
        const _FIELD_MAX_PX = 16.0;
        const _HERO_MAX_PX = 9.0;

        const fieldStarsMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 }, uSizeScale: { value: _starSizeScale },
                uDpr: { value: _starDpr }, uMaxPx: { value: _FIELD_MAX_PX }
            },
            vertexShader: _starVertexShader,
            fragmentShader: _starFragmentShader,
            transparent: true,
            depthWrite: false,
            vertexColors: true
        });

        const fieldStars = new THREE.Points(fieldStarsGeometry, fieldStarsMaterial);
        fieldStars.visible = true;
        fieldStars.frustumCulled = false;
        if (scene && scene.add) {
            scene.add(fieldStars);
            console.log('✅ Starfield added to scene with', fieldPositions.length / 3, 'stars across 3 depth shells');
        }
        window.fieldStars = fieldStars;
        window.fieldStarsMaterial = fieldStarsMaterial;
        window.stars = fieldStars; // legacy alias for any external `window.stars` checks

        // HERO STARS — a few dozen bright cross-flare landmarks scattered
        // across the same depth range. Own tiny draw call, additive
        // blending so the flare actually glows; the count is small enough
        // that additive overdraw here is negligible (per PIECE brief:
        // shader work over particle-count inflation).
        // Count raised 38 -> 90: at 38, a typical framing held one or two, so
        // most views had no landmark at all. 90 puts 3-6 in an average frame
        // while staying a rounding error on the draw budget (one small
        // additive Points call, cores only a handful of pixels wide).
        //
        // 280 was tried and reverted: measured in an ordinary cruise frame it
        // put 89 of these on screen at once, 75 of them wider than 20 CSS px,
        // and since a hero star's size does not fall off with distance the
        // result was a field of large soft white discs floating over the whole
        // sky — "bright white spheres everywhere" — rather than landmarks in
        // it. Landmarks only work while they are RARE.
        const heroCount = 90;
        const heroPositions = [];
        const heroColors = [];
        const heroSizes = [];
        const heroPhases = [];
        const heroSpeeds = [];
        const heroPx = [];
        const heroHDR = [];
        for (let i = 0; i < heroCount; i++) {
            const distanceFactor = 12 + Math.random() * 160;
            heroPositions.push(
                (Math.random() - 0.5) * 4000 * distanceFactor,
                (Math.random() - 0.5) * 1600 * distanceFactor,
                (Math.random() - 0.5) * 4000 * distanceFactor
            );
            const c = _pickStarColor();
            c.offsetHSL(0, 0, 0.1); // hero stars read hotter/brighter — overexposed core
            heroColors.push(c.r, c.g, c.b);
            heroSizes.push(7 + Math.random() * 11);
            heroPhases.push(Math.random() * Math.PI * 2);
            heroSpeeds.push(0.15 + Math.random() * 0.35);
            // Top of the magnitude curve: these are the sky's brightest
            // objects, so their cores blow past 1.0 and clip to pure white
            // with the cross-flare hanging off them.
            //
            // The brightness (aHDR) is what buys "brilliant"; the RADIUS
            // (aPx) must stay in the same league as the field stars or these
            // stop reading as sky at all. The field's brightest tail tops out
            // near 14 px and sits around 2-4 px typically (see _addFieldStar),
            // so 3.2-7.6 px keeps a hero star clearly the biggest thing in the
            // starfield while still being a star. Was 16-40 px, i.e. up to 3x
            // the brightest field star and ~10x the typical one — orbs.
            heroPx.push(3.2 + Math.random() * 4.4);
            heroHDR.push(2.6 + Math.random() * 2.4);
        }

        const heroStarsGeometry = new THREE.BufferGeometry();
        heroStarsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(heroPositions, 3));
        heroStarsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(heroColors, 3));
        heroStarsGeometry.setAttribute('aSize', new THREE.Float32BufferAttribute(heroSizes, 1));
        heroStarsGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(heroPhases, 1));
        heroStarsGeometry.setAttribute('aSpeed', new THREE.Float32BufferAttribute(heroSpeeds, 1));
        heroStarsGeometry.setAttribute('aPx', new THREE.Float32BufferAttribute(heroPx, 1));
        heroStarsGeometry.setAttribute('aHDR', new THREE.Float32BufferAttribute(heroHDR, 1));

        const heroStarsMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 }, uSizeScale: { value: _starSizeScale },
                uDpr: { value: _starDpr }, uMaxPx: { value: _HERO_MAX_PX }
            },
            vertexShader: _starVertexShader,
            fragmentShader: _heroFragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true
        });

        const heroStars = new THREE.Points(heroStarsGeometry, heroStarsMaterial);
        heroStars.visible = true;
        heroStars.frustumCulled = false;
        if (scene && scene.add) {
            scene.add(heroStars);
            console.log('✅ Hero stars added:', heroCount, 'cross-flare landmarks');
        }
        window.heroStars = heroStars;
        window.heroStarsMaterial = heroStarsMaterial;

        // Keep the point-size formula in sync with the actual canvas size AND
        // with the pixel ratio (dragging a window between a retina and a
        // non-retina display changes it), so the magnitude curve doesn't
        // silently halve or double the apparent size of every star.
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', () => {
                const s = window.innerHeight * 0.5;
                const dpr = (typeof renderer !== 'undefined' && renderer && renderer.getPixelRatio)
                    ? renderer.getPixelRatio() : _starDpr;
                if (fieldStarsMaterial && fieldStarsMaterial.uniforms) {
                    fieldStarsMaterial.uniforms.uSizeScale.value = s;
                    fieldStarsMaterial.uniforms.uDpr.value = dpr;
                }
                if (heroStarsMaterial && heroStarsMaterial.uniforms) {
                    heroStarsMaterial.uniforms.uSizeScale.value = s;
                    heroStarsMaterial.uniforms.uDpr.value = dpr;
                }
            });
        }

        // =============================================================================
        // DISTANT GALAXY IMPOSTERS — a handful of faint spiral/elliptical
        // smudges on the far sphere so deep space has landmarks besides
        // pinprick stars. Two canvas-generated textures (spiral,
        // elliptical) reused across several tinted/rotated sprite
        // instances: 2 texture generations, ~5 draw calls, no geometry.
        // =============================================================================
        try {
            // Both imposter plates were pure WHITE gradients relying on the
            // sprite tint for colour, which through additive blending averages
            // out to a grey smudge; and the spiral's arms were constant-alpha
            // 0.18 strokes with round caps that simply STOPPED at 0.92 of the
            // radius. That stop is the "hard cut edge" the sky critic
            // measured: a soft glow with two hard-ended bars laid across it.
            //
            // This version (a) gives the core a warm→cool temperature ramp so
            // the smudge has hue of its own, (b) fades every arm stroke out
            // along its length AND across its width by drawing it as many
            // short, thinning segments, (c) stipples HII knots along the arms
            // so there is structure at close range, and (d) finishes with a
            // destination-in radial mask, which guarantees alpha reaches zero
            // before the canvas edge — no square boundary can ever clip it.
            function _galaxyImposterTexture(kind) {
                const size = 256;
                const cv = document.createElement('canvas');
                cv.width = cv.height = size;
                const ctx = cv.getContext('2d');
                const cx = size / 2;
                ctx.translate(cx, cx);
                const squash = (kind === 'spiral') ? 0.42 : 0.62;

                ctx.save();
                ctx.scale(1, squash);
                const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, cx);
                if (kind === 'spiral') {
                    // Warm old-star bulge → cool blue disc, the way a real
                    // spiral photographs.
                    grad.addColorStop(0.00, 'rgba(255,244,220,0.95)');
                    grad.addColorStop(0.09, 'rgba(255,226,180,0.60)');
                    grad.addColorStop(0.30, 'rgba(206,222,255,0.22)');
                    grad.addColorStop(0.62, 'rgba(178,206,255,0.075)');
                    grad.addColorStop(1.00, 'rgba(160,190,255,0)');
                } else {
                    grad.addColorStop(0.00, 'rgba(255,242,214,0.92)');
                    grad.addColorStop(0.22, 'rgba(255,226,186,0.46)');
                    grad.addColorStop(0.55, 'rgba(238,214,196,0.14)');
                    grad.addColorStop(1.00, 'rgba(220,206,200,0)');
                }
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(0, 0, cx, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                if (kind === 'spiral') {
                    ctx.globalCompositeOperation = 'lighter';
                    for (let arm = 0; arm < 2; arm++) {
                        ctx.save();
                        ctx.rotate(arm * Math.PI + Math.random() * 0.4);
                        ctx.scale(1, squash);
                        const A_MAX = Math.PI * 1.75;
                        let prevX = 0, prevY = 0;
                        for (let a = 0; a < A_MAX; a += 0.045) {
                            const f = a / A_MAX;                 // 0 core → 1 tip
                            const rr = f * cx * 0.94;
                            const px = Math.cos(a * 2.2) * rr;
                            const py = Math.sin(a * 2.2) * rr;
                            if (a > 0) {
                                // Alpha rises out of the bulge and dies well
                                // before the tip; width tapers with it.
                                const al = 0.30 * Math.min(1, f / 0.18) * Math.pow(1 - f, 1.5);
                                if (al > 0.002) {
                                    ctx.strokeStyle = 'rgba(196,220,255,' + al.toFixed(4) + ')';
                                    ctx.lineWidth = size * (0.055 * (1 - f * 0.55));
                                    ctx.lineCap = 'round';
                                    ctx.beginPath();
                                    ctx.moveTo(prevX, prevY);
                                    ctx.lineTo(px, py);
                                    ctx.stroke();
                                    // HII knots — young blue-white clusters
                                    // strung along the arm.
                                    if (Math.random() < 0.16) {
                                        const kr = size * (0.010 + Math.random() * 0.016);
                                        const kg = ctx.createRadialGradient(px, py, 0, px, py, kr);
                                        const ka = al * (0.9 + Math.random() * 0.9);
                                        kg.addColorStop(0, 'rgba(228,240,255,' + Math.min(0.6, ka).toFixed(4) + ')');
                                        kg.addColorStop(1, 'rgba(228,240,255,0)');
                                        ctx.fillStyle = kg;
                                        ctx.beginPath();
                                        ctx.arc(px, py, kr, 0, Math.PI * 2);
                                        ctx.fill();
                                    }
                                }
                            }
                            prevX = px; prevY = py;
                        }
                        ctx.restore();
                    }
                    // A dust lane cutting the disc — subtractive detail is what
                    // stops a spiral reading as a glow blob.
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.save();
                    ctx.scale(1, squash);
                    ctx.rotate(Math.random() * Math.PI);
                    const dl = ctx.createLinearGradient(0, -cx * 0.10, 0, cx * 0.10);
                    dl.addColorStop(0.00, 'rgba(0,0,0,0)');
                    dl.addColorStop(0.50, 'rgba(0,0,0,0.30)');
                    dl.addColorStop(1.00, 'rgba(0,0,0,0)');
                    ctx.fillStyle = dl;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, cx * 0.86, cx * 0.11, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }

                // Hard-edge insurance: multiply the whole plate by a radial
                // alpha ramp that is exactly zero at the canvas edge.
                ctx.globalCompositeOperation = 'destination-in';
                const mask = ctx.createRadialGradient(0, 0, 0, 0, 0, cx);
                mask.addColorStop(0.00, 'rgba(0,0,0,1)');
                mask.addColorStop(0.62, 'rgba(0,0,0,1)');
                mask.addColorStop(0.86, 'rgba(0,0,0,0.35)');
                mask.addColorStop(1.00, 'rgba(0,0,0,0)');
                ctx.fillStyle = mask;
                ctx.fillRect(-cx, -cx, size, size);
                ctx.globalCompositeOperation = 'source-over';

                const tex = new THREE.CanvasTexture(cv);
                tex.needsUpdate = true;
                return tex;
            }

            const _spiralImposterTex = _galaxyImposterTexture('spiral');
            const _ellipticalImposterTex = _galaxyImposterTexture('elliptical');
            // Softened toward white: the plate now carries its own warm-core /
            // cool-disc ramp, so a saturated tint on top would flatten it back
            // into one hue. These read as a faint synthwave cast over a galaxy,
            // not as a coloured blob.
            const _imposterPalette = [0xa8e4ff, 0xffb0ea, 0xffd2a8, 0xd0b4ff, 0xdde8ff];
            const imposterCount = 5;
            const galaxyImposters = [];

            for (let i = 0; i < imposterCount; i++) {
                const isSpiral = i % 2 === 0;
                const tex = isSpiral ? _spiralImposterTex : _ellipticalImposterTex;
                const mat = new THREE.SpriteMaterial({
                    map: tex,
                    color: _imposterPalette[i % _imposterPalette.length],
                    transparent: true,
                    opacity: 0.3 + Math.random() * 0.22,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    depthTest: true,
                    fog: false
                });
                if (mat.rotation !== undefined) mat.rotation = Math.random() * Math.PI * 2;

                const sprite = new THREE.Sprite(mat);
                // Scatter across the far sphere, well beyond gameplay content
                // (galaxies/nebulas top out around 75,000u) but inside the
                // ~250,000u camera far plane.
                const dirTheta = Math.random() * Math.PI * 2;
                const dirPhi = Math.acos(1 - 2 * Math.random());
                const dist = 95000 + Math.random() * 35000;
                sprite.position.set(
                    dist * Math.sin(dirPhi) * Math.cos(dirTheta),
                    dist * Math.cos(dirPhi) * 0.6,
                    dist * Math.sin(dirPhi) * Math.sin(dirTheta)
                );
                const scale = 14000 + Math.random() * 14000;
                sprite.scale.set(scale, scale, 1);
                sprite.frustumCulled = false;
                sprite.renderOrder = -2; // behind stars/nebulas, in front of Hubble/CMB skyboxes

                sprite.userData._baseOpacity = mat.opacity;
                sprite.userData._shimmerPhase = Math.random() * Math.PI * 2;
                sprite.userData._shimmerSpeed = 0.03 + Math.random() * 0.04;

                if (scene && scene.add) scene.add(sprite);
                galaxyImposters.push(sprite);
            }

            window.galaxyImposters = galaxyImposters;
            console.log('✅ Distant galaxy imposters added:', imposterCount);
        } catch (imposterError) {
            console.error('❌ Error creating distant galaxy imposters:', imposterError);
        }

        // =============================================================================
        // DISTANT GALAXIES WITH ENHANCED PLANETS
        // =============================================================================
        
        if (typeof galaxyTypes === 'undefined') {
        console.warn('galaxyTypes not available');
        return;
    }
    
    const galaxyPositions = generateSphericalGalaxyPositions();
    
    galaxyTypes.forEach((galaxyType, g) => {
        try {
            const galaxyData = galaxyPositions[g];
            
            if (g === 7) {
                // Local galaxy - don't create distant version, it's where we are
                console.log('Skipping distant version of local galaxy (we are inside it)');
                return;
            }
            
            const galaxyCenter = galaxyData.position;
            const galaxySize = galaxyType.size;
            const _galaxyStarMul = _isMobileRenderTier() ? 0.5 : 1;
            const armStars = Math.round((galaxyType.name === 'Quasar' ? 6000 : galaxyType.name === 'Dwarf' ? 2000 : 4000) * _galaxyStarMul);
            
            console.log(`Creating 3D galaxy ${g} (${galaxyType.name}) at spherical position:`, galaxyCenter);

            // Calculate disc starfield size to be 2.5x the spherical starfield radius
            const blackHoleSize = galaxyType.name === 'Quasar' ? 60 : galaxyType.name === 'Dwarf' ? 20 : 36;
            const sphericalStarfieldMaxRadius = blackHoleSize + 1000;
            const discStarfieldRadius = sphericalStarfieldMaxRadius * 2.5;

            // Create galaxy stars with proper 3D distribution
            // CREATE SEPARATE ROTATING STAR CLUSTER with unique structure per galaxy type
// CREATE SEPARATE ROTATING STAR CLUSTER matching original algorithm
const galaxyStarsGeometry = new THREE.BufferGeometry();
const galaxyStarsVertices = [];
const galaxyStarsColors = [];

// Generate stars with original algorithm
for (let i = 0; i < armStars; i++) {
    let localX, localY, localZ;

    if (Math.random() < 0.4) {
        // Center bulge (40% of stars)
        const bulgeRadius = Math.pow(Math.random(), 2.5) * (discStarfieldRadius * 0.3);
        const bulgeAngle = Math.random() * Math.PI * 2;
        const bulgePhi = (Math.random() - 0.5) * Math.PI;
        
        localX = bulgeRadius * Math.cos(bulgeAngle) * Math.cos(bulgePhi);
        localZ = bulgeRadius * Math.sin(bulgeAngle) * Math.cos(bulgePhi);
        localY = bulgeRadius * Math.sin(bulgePhi) * 0.8;
        
    } else {
        // Spiral arms or elliptical distribution (60% of stars)
        if (galaxyType.arms > 0) {
            // Spiral galaxies (including Ring)
            const arm = Math.floor(i / (armStars/galaxyType.arms)) % galaxyType.arms;
            const armAngle = (i / (armStars/galaxyType.arms)) * Math.PI * 2;
            const armDistance = Math.pow(Math.random(), 1.8) * discStarfieldRadius;
            const armWidth = galaxyType.name === 'Ring' ? 0.03 : 0.12;

            // Ring galaxies: skip center
            if (galaxyType.name === 'Ring' && armDistance < discStarfieldRadius * 0.4) {
                i--; // Don't count this iteration
                continue;
            }

            const angle = armAngle + (armDistance / discStarfieldRadius) * Math.PI * 2;
            localX = Math.cos(angle + arm * (Math.PI*2/galaxyType.arms)) * armDistance +
                      (Math.random() - 0.5) * armWidth * armDistance;
            localZ = Math.sin(angle + arm * (Math.PI*2/galaxyType.arms)) * armDistance +
                      (Math.random() - 0.5) * armWidth * armDistance;
            localY = (Math.random() - 0.5) * (galaxyType.name === 'Elliptical' ? 120 : 30);

        } else {
            // Elliptical galaxies (no arms)
            const distance = Math.pow(Math.random(), 1.3) * discStarfieldRadius;
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.random() - 0.5) * (galaxyType.name === 'Lenticular' ? 0.3 : Math.PI * 0.6);

            localX = distance * Math.sin(phi) * Math.cos(theta);
            localZ = distance * Math.sin(phi) * Math.sin(theta);
            localY = distance * Math.cos(phi) * (galaxyType.name === 'Lenticular' ? 0.1 : 0.5);
        }
    }
    
    // Store in local coordinates (relative to black hole)
    galaxyStarsVertices.push(localX, localY, localZ);
    
    // Color based on galaxy type
    const starColor = new THREE.Color(galaxyType.color).offsetHSL(
        Math.random() * 0.2 - 0.1, 0, Math.random() * 0.3
    );
    galaxyStarsColors.push(starColor.r, starColor.g, starColor.b);
}

// Create the rotating star cluster
galaxyStarsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(galaxyStarsVertices, 3));
galaxyStarsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(galaxyStarsColors, 3));

const galaxyStarsMaterial = new THREE.PointsMaterial({
    size: 1.0,
    map: getPointSprite(),              // round star, not a square pixel block
    depthWrite: false,
    transparent: true,
    opacity: _isMobileRenderTier() ? 0.5 : 0.8,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
});

const galaxyMainStars = new THREE.Points(galaxyStarsGeometry, galaxyStarsMaterial);
galaxyMainStars.visible = true;
galaxyMainStars.frustumCulled = false;

// Store temporarily to add to black hole after it's created
const galaxyStarsToAdd = galaxyMainStars;

                    // Create galactic core black hole with proper 3D positioning and rotation
            // blackHoleSize already calculated above for disc starfield sizing
            const blackHoleGeometry = new THREE.SphereGeometry(blackHoleSize, 16, 16);
            const blackHoleMaterial = _eventHorizonMaterial();
            const galaxyBlackHole = new THREE.Mesh(blackHoleGeometry, blackHoleMaterial);
            galaxyBlackHole.renderOrder = _EVENT_HORIZON_ORDER;
            
            // Position and rotate the galaxy black hole
            galaxyBlackHole.position.copy(galaxyCenter);
            galaxyBlackHole.rotation.copy(galaxyData.rotation);
            
            galaxyBlackHole.visible = true;
            galaxyBlackHole.frustumCulled = false;
            galaxyBlackHole.matrixAutoUpdate = true;
            galaxyBlackHole.updateMatrix();
            
            galaxyBlackHole.userData = {
                name: `${galaxyType.name} Galaxy Core (${galaxyType.faction})`,
                type: 'blackhole',
                mass: galaxyType.mass,
                gravity: galaxyType.name === 'Quasar' ? 300.0 : galaxyType.name === 'Dwarf' ? 100.0 : 200.0,
                warpThreshold: 160,
                isGalacticCore: true,
                galaxyType: galaxyType,
                galaxyId: g,
                faction: galaxyType.faction,
                species: galaxyType.species,
                rotationSpeed: galaxyType.name === 'Quasar' ? 0.0001 : 
               galaxyType.name === 'Spiral' ? 0.0008 : 
               galaxyType.name === 'Dwarf' ? 0.0003 : 0.0005,
            };
            
            if (scene && scene.add) {
                scene.add(galaxyBlackHole);
            }
            if (planets && planets.push) {
                planets.push(galaxyBlackHole);
            }

            // Create accretion disk with galaxy rotation applied
            const ringSize = galaxyType.name === 'Quasar' ? 80 : blackHoleSize + 12;
            const ringGeometry = new THREE.RingGeometry(ringSize - 8, ringSize + 20, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: galaxyType.color,
                transparent: true,
                opacity: galaxyType.name === 'Quasar' ? 0.8 : 0.4,
                side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            
            // Apply random rotation offset to the ring relative to galaxy
            // Lie in the galaxy's own plane: rotation.x = PI/2 puts the
            // ring in the parent black hole's equatorial plane, and the
            // parent already carries galaxyData.rotation, so the disk
            // shares the galaxy's tilt. The previous random per-axis
            // offsets tilted each ring OUT of its galaxy (visible axis
            // mismatch); the Gargantua disk has no such offset, so they
            // disagreed. Keep them coplanar.
            ring.rotation.set(Math.PI / 2, 0, 0);

            // RETIRED — see the note on the local gateway's hoop. A flat
            // constant-colour band on the horizon's limb out-read the
            // emissive disk and flattened every galaxy core into a bead on a
            // washer. The Gargantua disk carries galaxyType.color too, so the
            // per-faction identity this ring provided is not lost.
            ring.visible = false;
            ring.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
            ring.matrixAutoUpdate = true;
            ring.updateMatrix();
            galaxyBlackHole.add(ring);
            addGargantuaVisuals(galaxyBlackHole, blackHoleSize, galaxyType.color);

            // Create large outer accretion disc (2.5x spherical starfield radius) with high transparency
            // Reuse sphericalStarfieldMaxRadius from earlier calculation
            const largeDiscRadiusMultiplier = 2.5;
            const largeDiscInnerRadius = sphericalStarfieldMaxRadius * largeDiscRadiusMultiplier * 0.7;
            const largeDiscOuterRadius = sphericalStarfieldMaxRadius * largeDiscRadiusMultiplier * 1.1;

            const largeRingGeometry = new THREE.RingGeometry(largeDiscInnerRadius, largeDiscOuterRadius, 64);
            const largeRingMaterial = new THREE.MeshBasicMaterial({
                color: galaxyType.color,
                transparent: true,
                opacity: galaxyType.name === 'Quasar' ? 0.15 : 0.08,  // Very transparent
                side: THREE.DoubleSide
            });
            const largeRing = new THREE.Mesh(largeRingGeometry, largeRingMaterial);

            // Coplanar with the galaxy (see ring above).
            largeRing.rotation.set(Math.PI / 2, 0, 0);

            largeRing.visible = true;
            largeRing.frustumCulled = true;
            largeRing.matrixAutoUpdate = true;
            largeRing.updateMatrix();
            galaxyBlackHole.add(largeRing);

            // Add the main galaxy stars
if (typeof galaxyStarsToAdd !== 'undefined') {
    galaxyBlackHole.add(galaxyStarsToAdd);
    galaxyBlackHole.userData.galaxyStars = galaxyStarsToAdd;
}
                    // Create star cluster around black hole
                    const clusterCount = galaxyType.name === 'Quasar' ? 3000 : 1500;
                    const clusterGeometry = new THREE.BufferGeometry();
                    const clusterPositions = new Float32Array(clusterCount * 3);
                    const clusterColors = new Float32Array(clusterCount * 3);
                    
                    for (let i = 0; i < clusterCount; i++) {
                        const clusterRadius = blackHoleSize + 200 + Math.random() * 800;
                        const theta = Math.random() * Math.PI * 2;
                        const phi = Math.acos(1 - 2 * Math.random());
                        
                        clusterPositions[i * 3] = clusterRadius * Math.sin(phi) * Math.cos(theta);
                        clusterPositions[i * 3 + 1] = clusterRadius * Math.cos(phi);
                        clusterPositions[i * 3 + 2] = clusterRadius * Math.sin(phi) * Math.sin(theta);
                        
                        const starColor = new THREE.Color(galaxyType.color).offsetHSL(Math.random() * 0.2 - 0.1, 0, Math.random() * 0.3);
                        clusterColors[i * 3] = starColor.r;
                        clusterColors[i * 3 + 1] = starColor.g;
                        clusterColors[i * 3 + 2] = starColor.b;
                    }
                    
                    clusterGeometry.setAttribute('position', new THREE.BufferAttribute(clusterPositions, 3));
                    clusterGeometry.setAttribute('color', new THREE.BufferAttribute(clusterColors, 3));
                    
                    const clusterMaterial = new THREE.PointsMaterial({
                        size: 1.0,
                        map: getPointSprite(),   // round star, not a square block
                        depthWrite: false,
                        transparent: true,
                        opacity: 0.8,
                        vertexColors: true,
                        blending: THREE.AdditiveBlending,
                        sizeAttenuation: true
                    });
                    
                    const starCluster = new THREE.Points(clusterGeometry, clusterMaterial);
                    starCluster.visible = true;
                    starCluster.frustumCulled = false;
                    galaxyBlackHole.add(starCluster);
					galaxyBlackHole.userData.starCluster = starCluster; // Add this line
                    
                    // Create star systems in this galaxy
                    const systemCount = galaxyType.name === 'Quasar' ? 5 : 
                                       galaxyType.name === 'Dwarf' ? 2 : 3;
                    
                    for (let s = 0; s < systemCount; s++) {
                        try {
                            // Position systems in 3D around galaxy center
                            const systemRadius = (galaxyType.name === 'Dwarf' ? 240 : 500) + Math.random() * (galaxySize - 300);
                            const systemTheta = Math.random() * Math.PI * 2;
                            const systemPhi = Math.acos(1 - 2 * Math.random());
                            
                            const localSystemX = systemRadius * Math.sin(systemPhi) * Math.cos(systemTheta);
                            const localSystemY = systemRadius * Math.cos(systemPhi);
                            const localSystemZ = systemRadius * Math.sin(systemPhi) * Math.sin(systemTheta);
                            
                            const localSystemVector = new THREE.Vector3(localSystemX, localSystemY, localSystemZ);
                            localSystemVector.applyEuler(galaxyData.rotation);
                            
                            const systemX = galaxyCenter.x + localSystemVector.x;
                            const systemY = galaxyCenter.y + localSystemVector.y;
                            const systemZ = galaxyCenter.z + localSystemVector.z;
                            
                            // Create system star
                            const starSize = 5 + Math.random() * 8;
                            const starGeometry = new THREE.SphereGeometry(starSize, 16, 16);
                            const starMaterial = new THREE.MeshBasicMaterial({ 
                                color: new THREE.Color(galaxyType.color).offsetHSL(Math.random() * 0.3 - 0.15, 0, 0.2)
                            });
                            const star = new THREE.Mesh(starGeometry, starMaterial);
                            star.position.set(systemX, systemY, systemZ);
                            star.visible = true;
                            star.frustumCulled = false;
                            star.matrixAutoUpdate = false;
                            star.updateMatrix();

// Add point light for distant galaxy star
const lightColor = new THREE.Color(galaxyType.color);
lightColor.offsetHSL(Math.random() * 0.3 - 0.15, 0, 0.2);

const starLight = new THREE.PointLight(
    lightColor,
    2.0,  // Intensity
    1000,  // Distance
    1.0   // Decay
);
starLight.position.copy(star.position);
starLight.castShadow = false;

if (scene && scene.add) {
    scene.add(starLight);
}

star.userData = {
                                name: `${galaxyType.faction} System ${s+1}`,
                                type: 'star',
                                isDistant: true,
                                isStatic: false,
                                isLocal: false,  // ← ADD THIS LINE
                                mass: starSize * 4,
                                gravity: 6.0,
                                galaxyId: g,
                                galaxyType: galaxyType.name,
                                systemCenter: {x: systemX, y: systemY, z: systemZ},
                                faction: galaxyType.faction,
                                galaxy3DData: galaxyData
                            };
                            
                            if (planets && planets.push) {
                                planets.push(star);
                            }
                            if (scene && scene.add) {
                                scene.add(star);
                            }
                            
                            if (Math.random() < 0.20 && typeof createSunSpikes === 'function') {
    							createSunSpikes(star);
                            }
                            
                            // Create 6-10 planets per system
                            const planetCount = 6 + Math.floor(Math.random() * 5);
                            
                            for (let p = 0; p < planetCount; p++) {
                                try {
                                    const positionFactor = p / planetCount;
                                    let planetSize;
                                    
                                    if (positionFactor < 0.3) {
                                        planetSize = 1.5 + Math.random() * 2.5;
                                    } else if (positionFactor < 0.6) {
                                        planetSize = 2.5 + Math.random() * 3.5;
                                    } else {
                                        planetSize = 5 + Math.random() * 8;
                                    }
                                    
                                    const planetGeometry = new THREE.SphereGeometry(planetSize, 16, 16);
                                    
                                    let planetHue, planetSaturation, planetLightness;
                                    const planetType = Math.random();
                                    
                                    if (planetType < 0.2) {
                                        planetHue = 0.08 + Math.random() * 0.08;
                                        planetSaturation = 0.4 + Math.random() * 0.3;
                                        planetLightness = 0.4 + Math.random() * 0.2;
                                    } else if (planetType < 0.4) {
                                        planetHue = 0.55 + Math.random() * 0.1;
                                        planetSaturation = 0.3 + Math.random() * 0.4;
                                        planetLightness = 0.6 + Math.random() * 0.3;
                                    } else if (planetType < 0.6) {
                                        planetHue = 0.05 + Math.random() * 0.15;
                                        planetSaturation = 0.5 + Math.random() * 0.4;
                                        planetLightness = 0.5 + Math.random() * 0.2;
                                    } else if (planetType < 0.8) {
                                        planetHue = 0.5 + Math.random() * 0.15;
                                        planetSaturation = 0.6 + Math.random() * 0.3;
                                        planetLightness = 0.4 + Math.random() * 0.3;
                                    } else {
                                        planetHue = 0.0 + Math.random() * 0.05;
                                        planetSaturation = 0.7 + Math.random() * 0.3;
                                        planetLightness = 0.3 + Math.random() * 0.3;
                                    }
                                    
                                    const planetMaterial = new THREE.MeshLambertMaterial({ 
                                        color: new THREE.Color().setHSL(planetHue, planetSaturation, planetLightness),
                                        emissive: new THREE.Color().setHSL(planetHue, planetSaturation * 0.5, 0.1)
                                    });
                                    
                                    const planet = new THREE.Mesh(planetGeometry, planetMaterial);
                                    planet.visible = true;
                                    planet.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling for planets
                                    planet.matrixAutoUpdate = false;
                                    
                                    const orbitRadius = 50 + (p * 80) + Math.random() * 40;
                                    const orbitAngle = Math.random() * Math.PI * 2;
                                    const orbitHeight = (Math.random() - 0.5) * 15;
                                    
                                    planet.position.set(
                                        systemX + Math.cos(orbitAngle) * orbitRadius,
                                        systemY + orbitHeight,
                                        systemZ + Math.sin(orbitAngle) * orbitRadius
                                    );
                                    planet.updateMatrix();
                                    
                                    let strangeness = 'normal';
                                    const strangeRoll = Math.random();
                                    if (strangeRoll > 0.95) strangeness = 'crystal';
                                    else if (strangeRoll > 0.90) strangeness = 'volcanic';
                                    else if (strangeRoll > 0.85) strangeness = 'ice';
                                    else if (strangeRoll > 0.80) strangeness = 'gas';
                                    
                                    const orbitSpeed = 0.001 + Math.random() * 0.003; //  INCREASED 10x: was 0.0001-0.0004, now 0.001-0.004
                                    const orbitPhase = Math.random() * Math.PI * 2;
                                    
                                    planet.userData = {
                                        name: typeof generatePlanetName === 'function' ? 
                                              generatePlanetName(g) : `Planet ${g}-${s}-${p}`,
                                        type: 'planet',
                                        isDistant: true,
                                        isStatic: false,
                                        orbitRadius: orbitRadius,
                                        orbitSpeed: orbitSpeed,
                                        orbitPhase: orbitPhase,
                                        systemCenter: {x: systemX, y: systemY, z: systemZ},
                                        mass: planetSize * 3.6,
                                        gravity: 1.6 + Math.random() * 2.4,
                                        galaxyId: g,
                                        galaxyType: galaxyType.name,
                                        faction: galaxyType.faction,
                                        strangeness: strangeness,
                                        position3D: planet.position.clone(),
                                        galaxy3DData: galaxyData,
                                        hasRings: false,
                                        moonCount: 0
                                    };
                                    
                                    if (planets && planets.push) {
                                        planets.push(planet);
                                    }
                                    if (scene && scene.add) {
                                        scene.add(planet);
                                    }
                                    
                                    // Add rings
                                    const ringChance = positionFactor > 0.5 ? 0.35 : 0.15;
                                    if (Math.random() < ringChance) {
                                        const ringCount = 2 + Math.floor(Math.random() * 3);
                                        
                                        for (let r = 0; r < ringCount; r++) {
                                            const ringInner = planetSize + 6 + r * 5;
                                            const ringOuter = ringInner + 3 + Math.random() * 2;
                                            const ringGeometry = new THREE.RingGeometry(ringInner, ringOuter, 32);
                                            
                                            const ringHue = Math.random() < 0.6 ? planetHue : 0.55 + Math.random() * 0.1;
                                            const ringColor = new THREE.Color().setHSL(ringHue, 0.3, 0.6 + Math.random() * 0.2);
                                            
                                            const ringMaterial = new THREE.MeshBasicMaterial({ 
                                                color: ringColor,
                                                transparent: true,
                                                opacity: 0.6 - r * 0.1,
                                                side: THREE.DoubleSide
                                            });
                                            
                                            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                                            ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.2;
                                            ring.visible = true;
                                            ring.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
                                            planet.add(ring);
                                        }
                                        
                                        planet.userData.hasRings = true;
                                    }
                                    
                                    // Add moons - FIXED with parentPlanet reference
let moonProbability = 0.35; //  INCREASED from 0.15
if (planetSize > 6) moonProbability = 0.65; //  INCREASED from 0.4
if (planetSize > 9) moonProbability = 0.85; //  INCREASED from 0.6

if (Math.random() < moonProbability) {
    const moonCount = 1 + Math.floor(Math.random() * 4); // ✅ INCREASED: Now 1-4 moons instead of 1-3
    planet.userData.moonCount = moonCount;
    
    for (let m = 0; m < moonCount; m++) {
        try {
            const moonSize = 0.5 + Math.random() * 1.5;
            const moonGeometry = new THREE.SphereGeometry(moonSize, 12, 12);
            
            const moonHue = (planetHue + 0.2 + Math.random() * 0.2) % 1;
            const moonMaterial = new THREE.MeshLambertMaterial({
                color: new THREE.Color().setHSL(moonHue, 0.3, 0.6),
                emissive: new THREE.Color().setHSL(moonHue, 0.15, 0.05)
            });
            
            const moon = new THREE.Mesh(moonGeometry, moonMaterial);
            moon.visible = true;
            moon.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
            
            const moonOrbitRadius = planetSize + 12 + m * 8;
            const moonAngle = Math.random() * Math.PI * 2;
            
            moon.position.set(
                moonOrbitRadius * Math.cos(moonAngle),
                (Math.random() - 0.5) * 4,
                moonOrbitRadius * Math.sin(moonAngle)
            );
            
            // ⭐ CRITICAL FIX: Add parentPlanet reference with FASTER orbit speed
            moon.userData = {
                name: `${planet.userData.name} Moon ${m + 1}`,
                type: 'moon',
                orbitRadius: moonOrbitRadius,
                orbitSpeed: 0.008 + Math.random() * 0.012, //  MUCH FASTER: 0.008-0.020 instead of 0.002-0.005
                orbitPhase: moonAngle,
                parentPlanet: planet,
                mass: moonSize * 2,
                gravity: moonSize * 0.6,
                isDistant: true,
                galaxyId: g
            };
            
            planet.add(moon); // Moon is child of planet
            
            if (planets && planets.push) {
                planets.push(moon);
            }

            // console.log(`      🌙 Added moon to ${planet.userData.name} in galaxy ${g}`);
        } catch (moonError) {
            console.error(`Error creating moon for planet in galaxy ${g}:`, moonError);
        }
    }
}
                                    
                                } catch (planetError) {
                                    console.error(`Error creating planet in system ${s} of galaxy ${g}:`, planetError);
                                }
                            }
                            
                        } catch (systemError) {
                            console.error(`Error creating system ${s} in galaxy ${g}:`, systemError);
                        }
                    }
                    
                } catch (galaxyError) {
                    console.error(`Error creating galaxy ${g}:`, galaxyError);
                }
            });
        
        // Starfield/hero-stars/galaxy-imposters were already built and
        // added to the scene above, before the distant-galaxies loop.
        console.log('✅ Deep-space backdrop complete (starfield, hero stars, galaxy imposters, distant galaxies)');

    } catch (starError) {
        console.error('❌ Error creating starfield:', starError);
    }
    
    // =============================================================================
    // CAMERA AND INITIAL STATE SETUP
    // =============================================================================
    
    if (typeof camera !== 'undefined' && camera) {
        try {
            const earthInitialPosition = new THREE.Vector3(localSystemOffset.x + 160, localSystemOffset.y + 40, localSystemOffset.z);
            camera.position.copy(earthInitialPosition);
            camera.lookAt(new THREE.Vector3(0, 0, 0));
            
            if (typeof cameraRotation !== 'undefined') {
                cameraRotation = { 
                    x: camera.rotation.x,
                    y: camera.rotation.y,
                    z: camera.rotation.z 
                };
            }
            
            if (typeof gameState !== 'undefined' && gameState.velocityVector) {
                const sunPosition = new THREE.Vector3(localSystemOffset.x, localSystemOffset.y, localSystemOffset.z);
                const earthToSun = new THREE.Vector3().subVectors(sunPosition, earthInitialPosition).normalize();
                const orbitalDirection = new THREE.Vector3(-earthToSun.z, 0, earthToSun.x).normalize();
                gameState.velocityVector = orbitalDirection.multiplyScalar(gameState.minVelocity || 0.2);
            }
            
            console.log('✅ Camera positioned near Earth');
            
        } catch (cameraError) {
            console.error('❌ Error setting camera position:', cameraError);
        }
    }
    
    console.log('✅ Comprehensive 3D universe created!');
    console.log('- Local solar system with', localPlanets.length, 'planets and moons');
    console.log('- Total celestial objects:', planets ? planets.length : 'unknown');
    console.log('- Sagittarius A* at galactic center');
    console.log('- Local black hole gateway');
    console.log('- Distant galaxies with enhanced star systems');
    console.log('- Enhanced starfield with multiple layers');
}

function createClusteredNebulas() {
    console.log('Creating clustered nebulas with central supernovas and orbiting brown dwarfs...');
    
    if (typeof nebulaClouds === 'undefined') {
        window.nebulaClouds = [];
    }
    
    const nebulaCount = 8;
    // PERF: Push cluster centers further from twin cores (origin)
    // Reduces object density near origin for better FPS
    const clusterCenters = [
        { x: 28000, y: 0, z: 22000 },      // Was 15000, 12000
        { x: -32000, y: 500, z: -28000 },  // Was -18000, -15000
        { x: 18000, y: -800, z: -35000 }   // Was 8000, -20000
    ];
    
    // MYTHICAL NEBULA NAMING SYSTEM
    const mythicalNebulaNames = [
        'Olympus Nebula',      // Home of the gods
        'Titan Nebula',        // Primordial giants
        'Atlantis Nebula',     // Lost City of the heavens
        'Prometheus Nebula',   // Bringer of fire
        'Elysium Nebula',      // Paradise realm
        'Tartarus Nebula',     // Deepest abyss
        'Hyperion Nebula',     // Titan of light
        'Chronos Nebula'       // God of time
    ];
    
    for (let i = 0; i < nebulaCount; i++) {
        const nebulaGroup = new THREE.Group();
        const clusterIndex = i % clusterCenters.length;
        const clusterCenter = clusterCenters[clusterIndex];
        
        const clusterSpread = 3000;
        const offsetX = (Math.random() - 0.5) * clusterSpread;
        const offsetZ = (Math.random() - 0.5) * clusterSpread;
        const offsetY = (Math.random() - 0.5) * 1500;
        
        const nebulaX = clusterCenter.x + offsetX;
        const nebulaZ = clusterCenter.z + offsetZ;
        const nebulaY = clusterCenter.y + offsetY;
        
        // Create nebula cloud particles. Mobile renders ~40% the count —
        // these are additive points and fill-rate, not vertex count, is
        // the mobile killer, but fewer points still cuts overdraw.
        const particleCount = _isMobileRenderTier() ? 500 : 1200;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        
        let baseHue;
        if (clusterIndex === 0) {
            baseHue = 0.15 + Math.random() * 0.3;
        } else if (clusterIndex === 1) {
            baseHue = 0.5 + Math.random() * 0.25;
        } else {
            baseHue = 0.8 + Math.random() * 0.2;
        }
        
        const nebulaColor = new THREE.Color().setHSL(baseHue, 0.7 + Math.random() * 0.3, 0.5 + Math.random() * 0.3);
        const nebulaSize = 2000 + Math.random() * 3000;

        // Two-tone core->rim HSL gradient: a hotter, brighter core cools
        // into a deeper-hued rim as particles sit farther from center, so
        // the cloud reads as a volumetric body instead of a flat color
        // splat with per-particle noise.
        const nebulaCoreColor = nebulaColor.clone().offsetHSL(0.04, 0.1, 0.22);
        const nebulaRimColor = nebulaColor.clone().offsetHSL(-0.07, 0.05, -0.18);

        for (let j = 0; j < particleCount; j++) {
            const radius = Math.pow(Math.random(), 0.3) * nebulaSize;
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.random() - 0.5) * Math.PI * 0.6;

            positions[j * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[j * 3 + 1] = radius * Math.cos(phi) * (Math.random() - 0.5) * 0.4;
            positions[j * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

            const rNorm = Math.min(1, radius / nebulaSize);
            const colorVariation = nebulaCoreColor.clone().lerp(nebulaRimColor, rNorm);
            colorVariation.offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.12);

            colors[j * 3] = colorVariation.r;
            colors[j * 3 + 1] = colorVariation.g;
            colors[j * 3 + 2] = colorVariation.b;
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const nebulaMaterial = new THREE.PointsMaterial({
            size: 2.5,
            // Soft round puff instead of a hard axis-aligned square. Without a
            // map the fragment stage never reads gl_PointCoord and WebGL fills
            // the whole gl_PointSize quad flat — 5,000 grey blocks per cloud.
            map: getPointSprite(),
            vertexColors: true,
            transparent: true,
            opacity: 0.65,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
            // Required with the sprite: the quad's transparent corners must not
            // punch a square hole in the depth buffer for everything behind.
            depthWrite: false,
            fog: false // preserve the cloud's own core->rim gradient; scene fog would flatten it
        });
        
        const nebulaPoints = new THREE.Points(particleGeometry, nebulaMaterial);
        nebulaPoints.visible = true;
        // Frustum-cull the point cloud: its bounding sphere is centred and
        // accurate, so off-screen nebulas (most of the cluster when you're
        // flying through it) skip the additive draw entirely. Was false.
        nebulaPoints.frustumCulled = true;
        nebulaGroup.add(nebulaPoints);

        // **NEW: Add central supernova to some nebulas**
        if (Math.random() > 0.5) {
            const supernovaGeometry = new THREE.SphereGeometry(30, 16, 16);
            const supernovaMaterial = new THREE.MeshStandardMaterial({
                color: 0xff6600,
                emissive: 0xff4400,
                emissiveIntensity: 2.0,
                roughness: 0.2,
                metalness: 0.5
            });
            const supernova = new THREE.Mesh(supernovaGeometry, supernovaMaterial);
            supernova.position.set(0, 0, 0); // Center of nebula
            
            // Add supernova glow
            const supernovaGlowGeometry = new THREE.SphereGeometry(45, 16, 16);
            const supernovaGlowMaterial = new THREE.MeshBasicMaterial({
                color: 0xffaa44,
                transparent: true,
                opacity: 0.4,
                blending: THREE.AdditiveBlending
            });
            const supernovaGlow = new THREE.Mesh(supernovaGlowGeometry, supernovaGlowMaterial);
            supernova.add(supernovaGlow);
            
            supernova.userData = {
                name: `Nebula Core ${i + 1}`,
                type: 'supernova',
                isCentralCore: true
            };
            
            nebulaGroup.add(supernova);
            
            // **NEW: Add 2-4 brown dwarfs orbiting the supernova**
            const brownDwarfCount = 2 + Math.floor(Math.random() * 3);
            for (let bd = 0; bd < brownDwarfCount; bd++) {
                const bdOrbitRadius = 100 + Math.random() * 150;
                const bdOrbitAngle = (bd / brownDwarfCount) * Math.PI * 2;
                
                const brownDwarfGeometry = new THREE.SphereGeometry(12, 12, 12);
                const brownDwarfMaterial = new THREE.MeshStandardMaterial({
                    color: 0xaa6633,
                    emissive: 0x663311,
                    emissiveIntensity: 0.8,
                    roughness: 0.6,
                    metalness: 0.4
                });
                const brownDwarf = new THREE.Mesh(brownDwarfGeometry, brownDwarfMaterial);
                
                brownDwarf.position.set(
                    Math.cos(bdOrbitAngle) * bdOrbitRadius,
                    (Math.random() - 0.5) * 30,
                    Math.sin(bdOrbitAngle) * bdOrbitRadius
                );
                
                brownDwarf.userData = {
                    name: `Brown Dwarf ${bd + 1}`,
                    type: 'brown_dwarf',
                    orbitRadius: bdOrbitRadius,
                    orbitSpeed: 0.001 + Math.random() * 0.002,
                    orbitAngle: bdOrbitAngle,
                    orbitCenter: new THREE.Vector3(0, 0, 0)
                };
                
                nebulaGroup.add(brownDwarf);
            }
            
            console.log(`  ✨ Added supernova with ${brownDwarfCount} orbiting brown dwarfs to nebula ${i + 1}`);
        }
        
        nebulaGroup.position.set(nebulaX, nebulaY, nebulaZ);
        nebulaGroup.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        
        nebulaGroup.visible = true;
        nebulaGroup.frustumCulled = false;
        
        const mythicalName = getMythicalNebulaName(clusterIndex);
        
        nebulaGroup.userData = {
            name: `${mythicalName} Nebula`,
            mythicalName: mythicalName, // Store the short name separately
            type: 'nebula',
            size: nebulaSize,
            color: nebulaColor,
            cluster: clusterIndex,
            clusterName: mythicalName, // For discovery notifications
            rotationSpeed: (Math.random() - 0.5) * 0.0008,
            position3D: nebulaGroup.position.clone(),
            discovered: false // Track discovery status
        };
        
        scene.add(nebulaGroup);
        nebulaClouds.push(nebulaGroup);
    }
    
    console.log(`✅ Created ${nebulaClouds.length} nebulas with central supernovas and orbiting brown dwarfs`);
}



function createSpectacularClusteredNebulas() {
    console.log('Creating spectacular multi-layered clustered nebulas...');

    // Desktop layers the cluster 3× for rich colour intermingling. On
    // mobile that's 24 overlapping additive point clouds in the same
    // cluster centres — the worst fill-rate case in the game — so mobile
    // builds a single layer (8 nebulas) instead.
    const _mobile = (typeof _isMobileRenderTier === 'function') && _isMobileRenderTier();

    createClusteredNebulas(); // Layer 1

    if (!_mobile) {
        setTimeout(() => {
            createClusteredNebulas(); // Layer 2
        }, 300);

        setTimeout(() => {
            createClusteredNebulas(); // Layer 3
        }, 600);
    }

    // Create distant nebulas in the outer regions (50,000-75,000 units)
    setTimeout(() => {
        createDistantNebulas();
    }, _mobile ? 300 : 900);

    // Create exotic core nebulas (45,000-65,000 units)
    setTimeout(() => {
        createExoticCoreNebulas();
    }, _mobile ? 600 : 1200);

    console.log(_mobile
        ? 'Single-layer clustered nebulas (mobile tier) created!'
        : 'Triple-layered clustered nebulas with maximum color intermingling created!');
}

// =============================================================================
// DISTANT NEBULAS - Distributed between 50,000-75,000 units from origin
// =============================================================================
function createDistantNebulas() {
    console.log('Creating distant nebulas in outer regions (50,000-75,000 units)...');

    if (typeof nebulaClouds === 'undefined') {
        window.nebulaClouds = [];
    }

    const distantNebulaCount = 6;
    const minRadius = 50000;
    const maxRadius = 75000;
    const visibilityRange = 45000; // Only visible within 45k units

    const distantNebulaNames = [
        'Distant Nebula Alpha',
        'Distant Nebula Beta',
        'Distant Nebula Gamma',
        'Distant Nebula Delta',
        'Distant Nebula Epsilon',
        'Distant Nebula Zeta'
    ];
    
    // Nebula shapes matching galaxy-formation style
    const nebulaShapes = ['spiral', 'elliptical', 'irregular', 'lenticular', 'spiral', 'ring'];

    for (let i = 0; i < distantNebulaCount; i++) {
        const nebulaGroup = new THREE.Group();

        // Distribute evenly around a sphere at distant radius
        const phi = (i / distantNebulaCount) * Math.PI * 2;
        const theta = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.5;
        const distanceFromOrigin = minRadius + Math.random() * (maxRadius - minRadius);

        const nebulaX = distanceFromOrigin * Math.sin(theta) * Math.cos(phi);
        const nebulaY = distanceFromOrigin * Math.cos(theta);
        const nebulaZ = distanceFromOrigin * Math.sin(theta) * Math.sin(phi);

        // MATCHED TO GALAXY-FORMATION: High particle count. Mobile gets
        // ~40% to keep additive fill-rate manageable on weak GPUs.
        const particleCount = _isMobileRenderTier()
            ? (1600 + Math.floor(Math.random() * 800))
            : (4000 + Math.floor(Math.random() * 2000));
        const nebulaGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        const baseHue = Math.random();
        const nebulaColor = new THREE.Color().setHSL(baseHue, 0.7 + Math.random() * 0.3, 0.5 + Math.random() * 0.3);
        const nebulaSize = 1500 + Math.random() * 1000; // Matched to galaxy-formation scale
        const shape = nebulaShapes[i % nebulaShapes.length];
        const arms = shape === 'spiral' ? 3 : (shape === 'ring' ? 1 : 2);
        // Two-tone core->rim gradient (see createClusteredNebulas for rationale)
        const nebulaCoreColor = nebulaColor.clone().offsetHSL(0.04, 0.1, 0.22);
        const nebulaRimColor = nebulaColor.clone().offsetHSL(-0.07, 0.05, -0.18);

        // MATCHED TO GALAXY-FORMATION: Galaxy-like distribution
        for (let p = 0; p < particleCount; p++) {
            const i3 = p * 3;
            let x, y, z;
            
            if (shape === 'spiral' || shape === 'ring') {
                if (Math.random() < 0.4) {
                    // Center bulge
                    const bulgeRadius = Math.pow(Math.random(), 2.5) * (nebulaSize * 0.3);
                    const bulgeAngle = Math.random() * Math.PI * 2;
                    const bulgePhi = (Math.random() - 0.5) * Math.PI;
                    x = bulgeRadius * Math.cos(bulgeAngle) * Math.cos(bulgePhi);
                    z = bulgeRadius * Math.sin(bulgeAngle) * Math.cos(bulgePhi);
                    y = bulgeRadius * Math.sin(bulgePhi) * 0.8;
                } else {
                    // Spiral arms
                    const arm = Math.floor(p / (particleCount / arms)) % arms;
                    const armAngle = (p / (particleCount / arms)) * Math.PI * 2;
                    const armDistance = Math.pow(Math.random(), 1.8) * nebulaSize;
                    const armWidth = shape === 'ring' ? 0.03 : 0.12;
                    if (shape === 'ring' && armDistance < nebulaSize * 0.4) continue;
                    const angle = armAngle + (armDistance / nebulaSize) * Math.PI * 2;
                    x = Math.cos(angle + arm * (Math.PI * 2 / arms)) * armDistance + (Math.random() - 0.5) * armWidth * armDistance;
                    z = Math.sin(angle + arm * (Math.PI * 2 / arms)) * armDistance + (Math.random() - 0.5) * armWidth * armDistance;
                    y = (Math.random() - 0.5) * 30;
                }
            } else if (shape === 'elliptical') {
                const dist = Math.pow(Math.random(), 1.3) * nebulaSize;
                const t = Math.random() * Math.PI * 2;
                const ph = (Math.random() - 0.5) * Math.PI * 0.6;
                x = dist * Math.sin(ph) * Math.cos(t);
                z = dist * Math.sin(ph) * Math.sin(t);
                y = dist * Math.cos(ph) * 0.5;
            } else if (shape === 'lenticular') {
                if (Math.random() < 0.4) {
                    const bulgeRadius = Math.pow(Math.random(), 3) * (nebulaSize * 0.3);
                    const bulgeAngle = Math.random() * Math.PI * 2;
                    x = Math.cos(bulgeAngle) * bulgeRadius;
                    z = Math.sin(bulgeAngle) * bulgeRadius;
                    y = (Math.random() - 0.5) * 50;
                } else {
                    const dist = Math.pow(Math.random(), 1.5) * nebulaSize;
                    const t = Math.random() * Math.PI * 2;
                    x = Math.cos(t) * dist;
                    z = Math.sin(t) * dist;
                    y = (Math.random() - 0.5) * 20;
                }
            } else {
                // Irregular
                const dist = Math.pow(Math.random(), 1.3) * nebulaSize;
                const t = Math.random() * Math.PI * 2;
                const ph = (Math.random() - 0.5) * Math.PI;
                x = dist * Math.sin(ph) * Math.cos(t) + (Math.random() - 0.5) * nebulaSize * 0.3;
                z = dist * Math.sin(ph) * Math.sin(t) + (Math.random() - 0.5) * nebulaSize * 0.3;
                y = dist * Math.cos(ph) * 0.4;
            }

            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;

            const rNorm = Math.min(1, Math.sqrt(x * x + z * z) / nebulaSize);
            const colorVariation = nebulaCoreColor.clone().lerp(nebulaRimColor, rNorm);
            colorVariation.offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.12);
            colors[i3] = colorVariation.r;
            colors[i3 + 1] = colorVariation.g;
            colors[i3 + 2] = colorVariation.b;
        }

        nebulaGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        nebulaGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // MATCHED TO GALAXY-FORMATION: Same particle material settings
        const nebulaMaterial = new THREE.PointsMaterial({
            size: 2.5,
            // Soft round puff instead of a hard axis-aligned square. Without a
            // map the fragment stage never reads gl_PointCoord and WebGL fills
            // the whole gl_PointSize quad flat — 5,000 grey blocks per cloud.
            map: getPointSprite(),
            vertexColors: true,
            transparent: true,
            opacity: 0.65,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
            // Required with the sprite: the quad's transparent corners must not
            // punch a square hole in the depth buffer for everything behind.
            depthWrite: false,
            fog: false // preserve the cloud's own core->rim gradient; scene fog would flatten it
        });

        const nebulaPoints = new THREE.Points(nebulaGeometry, nebulaMaterial);
        nebulaPoints.visible = true;
        nebulaPoints.frustumCulled = true;  // PERF: off-screen nebulas skip the additive draw
        nebulaGroup.add(nebulaPoints);

        nebulaGroup.position.set(nebulaX, nebulaY, nebulaZ);
        nebulaGroup.visible = false; // Start hidden - visibility controlled by range
        nebulaGroup.userData = {
            type: 'nebula',
            name: distantNebulaNames[i],
            mythicalName: distantNebulaNames[i],
            color: nebulaColor,
            discovered: false,
            size: nebulaSize,
            shape: shape,
            isDistant: true,
            visibilityRange: visibilityRange,
            distanceFromOrigin: distanceFromOrigin
        };

        scene.add(nebulaGroup);
        nebulaClouds.push(nebulaGroup);

        console.log(`  Created ${distantNebulaNames[i]} (${shape}) at distance ${distanceFromOrigin.toFixed(0)} units - visible within ${visibilityRange} units`);
    }

    console.log(`✅ Created ${distantNebulaCount} distant nebulas (galaxy-formation style, range-based visibility)`);
}

// =============================================================================
// EXOTIC CORE NEBULAS - Distributed in exotic core systems range (45,000-65,000 units)
// =============================================================================
function createExoticCoreNebulas() {
    console.log('Creating exotic core nebulas (45,000-65,000 units)...');

    if (typeof nebulaClouds === 'undefined') {
        window.nebulaClouds = [];
    }

    const exoticNebulaCount = 8;
    const minRadius = 45000;
    const maxRadius = 65000;
    const visibilityRange = 40000; // Only visible within 40k units

    const exoticNebulaNames = [
        'Frontier Nebula',
        'Outer Veil Nebula',
        'Deep Space Nebula',
        'Void Nebula',
        'Boundary Nebula',
        'Edge Nebula',
        'Threshold Nebula',
        'Horizon Nebula'
    ];
    
    // Nebula shapes matching galaxy-formation style
    const nebulaShapes = ['spiral', 'elliptical', 'quasar', 'lenticular', 'irregular', 'ancient', 'ring', 'spiral'];

    for (let i = 0; i < exoticNebulaCount; i++) {
        const nebulaGroup = new THREE.Group();

        // Distribute around a sphere at exotic core distance
        const phi = (i / exoticNebulaCount) * Math.PI * 2;
        const theta = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.6;
        const distanceFromOrigin = minRadius + Math.random() * (maxRadius - minRadius);

        const nebulaX = distanceFromOrigin * Math.sin(theta) * Math.cos(phi);
        const nebulaY = distanceFromOrigin * Math.cos(theta);
        const nebulaZ = distanceFromOrigin * Math.sin(theta) * Math.sin(phi);

        // MATCHED TO GALAXY-FORMATION: High particle count. Mobile gets
        // ~40% to keep additive fill-rate manageable on weak GPUs.
        const particleCount = _isMobileRenderTier()
            ? (1600 + Math.floor(Math.random() * 800))
            : (4000 + Math.floor(Math.random() * 2000));
        const nebulaGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        const baseHue = (i / exoticNebulaCount) + Math.random() * 0.1;
        const nebulaColor = new THREE.Color().setHSL(baseHue, 0.8 + Math.random() * 0.2, 0.5 + Math.random() * 0.3);
        const nebulaSize = 1500 + Math.random() * 1000; // Matched to galaxy-formation scale
        const shape = nebulaShapes[i % nebulaShapes.length];
        const arms = shape === 'spiral' ? 3 : (shape === 'ring' ? 1 : 2);
        // Two-tone core->rim gradient (see createClusteredNebulas for rationale)
        const nebulaCoreColor = nebulaColor.clone().offsetHSL(0.04, 0.1, 0.22);
        const nebulaRimColor = nebulaColor.clone().offsetHSL(-0.07, 0.05, -0.18);

        // MATCHED TO GALAXY-FORMATION: Galaxy-like distribution
        for (let p = 0; p < particleCount; p++) {
            const i3 = p * 3;
            let x, y, z;
            
            if (shape === 'spiral' || shape === 'ring') {
                if (Math.random() < 0.4) {
                    const bulgeRadius = Math.pow(Math.random(), 2.5) * (nebulaSize * 0.3);
                    const bulgeAngle = Math.random() * Math.PI * 2;
                    const bulgePhi = (Math.random() - 0.5) * Math.PI;
                    x = bulgeRadius * Math.cos(bulgeAngle) * Math.cos(bulgePhi);
                    z = bulgeRadius * Math.sin(bulgeAngle) * Math.cos(bulgePhi);
                    y = bulgeRadius * Math.sin(bulgePhi) * 0.8;
                } else {
                    const arm = Math.floor(p / (particleCount / arms)) % arms;
                    const armAngle = (p / (particleCount / arms)) * Math.PI * 2;
                    const armDistance = Math.pow(Math.random(), 1.8) * nebulaSize;
                    const armWidth = shape === 'ring' ? 0.03 : 0.12;
                    if (shape === 'ring' && armDistance < nebulaSize * 0.4) continue;
                    const angle = armAngle + (armDistance / nebulaSize) * Math.PI * 2;
                    x = Math.cos(angle + arm * (Math.PI * 2 / arms)) * armDistance + (Math.random() - 0.5) * armWidth * armDistance;
                    z = Math.sin(angle + arm * (Math.PI * 2 / arms)) * armDistance + (Math.random() - 0.5) * armWidth * armDistance;
                    y = (Math.random() - 0.5) * 30;
                }
            } else if (shape === 'elliptical' || shape === 'ancient') {
                const dist = Math.pow(Math.random(), 1.3) * nebulaSize;
                const t = Math.random() * Math.PI * 2;
                const ph = (Math.random() - 0.5) * Math.PI * 0.6;
                x = dist * Math.sin(ph) * Math.cos(t);
                z = dist * Math.sin(ph) * Math.sin(t);
                y = dist * Math.cos(ph) * 0.5;
            } else if (shape === 'lenticular') {
                if (Math.random() < 0.4) {
                    const bulgeRadius = Math.pow(Math.random(), 3) * (nebulaSize * 0.3);
                    const bulgeAngle = Math.random() * Math.PI * 2;
                    x = Math.cos(bulgeAngle) * bulgeRadius;
                    z = Math.sin(bulgeAngle) * bulgeRadius;
                    y = (Math.random() - 0.5) * 50;
                } else {
                    const dist = Math.pow(Math.random(), 1.5) * nebulaSize;
                    const t = Math.random() * Math.PI * 2;
                    x = Math.cos(t) * dist;
                    z = Math.sin(t) * dist;
                    y = (Math.random() - 0.5) * 20;
                }
            } else if (shape === 'quasar') {
                // Quasar: Intense core with jets
                if (Math.random() < 0.5) {
                    const coreRadius = Math.pow(Math.random(), 3) * (nebulaSize * 0.2);
                    const coreAngle = Math.random() * Math.PI * 2;
                    x = Math.cos(coreAngle) * coreRadius;
                    z = Math.sin(coreAngle) * coreRadius;
                    y = (Math.random() - 0.5) * 30;
                } else {
                    // Jets
                    const jetLength = Math.random() * nebulaSize * 0.8;
                    const jetSpread = Math.random() * 30;
                    const jetSide = Math.random() > 0.5 ? 1 : -1;
                    x = (Math.random() - 0.5) * jetSpread;
                    z = (Math.random() - 0.5) * jetSpread;
                    y = jetSide * jetLength;
                }
            } else {
                // Irregular
                const dist = Math.pow(Math.random(), 1.3) * nebulaSize;
                const t = Math.random() * Math.PI * 2;
                const ph = (Math.random() - 0.5) * Math.PI;
                x = dist * Math.sin(ph) * Math.cos(t) + (Math.random() - 0.5) * nebulaSize * 0.3;
                z = dist * Math.sin(ph) * Math.sin(t) + (Math.random() - 0.5) * nebulaSize * 0.3;
                y = dist * Math.cos(ph) * 0.4;
            }

            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;

            const rNorm = Math.min(1, Math.sqrt(x * x + z * z) / nebulaSize);
            const colorVariation = nebulaCoreColor.clone().lerp(nebulaRimColor, rNorm);
            colorVariation.offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.12);
            colors[i3] = colorVariation.r;
            colors[i3 + 1] = colorVariation.g;
            colors[i3 + 2] = colorVariation.b;
        }

        nebulaGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        nebulaGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // MATCHED TO GALAXY-FORMATION: Same particle material settings
        const nebulaMaterial = new THREE.PointsMaterial({
            size: 2.5,
            // Soft round puff instead of a hard axis-aligned square. Without a
            // map the fragment stage never reads gl_PointCoord and WebGL fills
            // the whole gl_PointSize quad flat — 5,000 grey blocks per cloud.
            map: getPointSprite(),
            vertexColors: true,
            transparent: true,
            opacity: 0.65,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
            // Required with the sprite: the quad's transparent corners must not
            // punch a square hole in the depth buffer for everything behind.
            depthWrite: false,
            fog: false // preserve the cloud's own core->rim gradient; scene fog would flatten it
        });

        const nebulaPoints = new THREE.Points(nebulaGeometry, nebulaMaterial);
        nebulaPoints.visible = true;
        nebulaPoints.frustumCulled = true;  // PERF: off-screen nebulas skip the additive draw
        nebulaGroup.add(nebulaPoints);

        nebulaGroup.position.set(nebulaX, nebulaY, nebulaZ);
        nebulaGroup.visible = false; // Start hidden - visibility controlled by range
        nebulaGroup.userData = {
            type: 'nebula',
            name: exoticNebulaNames[i],
            mythicalName: exoticNebulaNames[i],
            color: nebulaColor,
            discovered: false,
            size: nebulaSize,
            shape: shape,
            isExoticCore: true,
            visibilityRange: visibilityRange,
            distanceFromOrigin: distanceFromOrigin
        };

        scene.add(nebulaGroup);
        nebulaClouds.push(nebulaGroup);

        console.log(`  Created ${exoticNebulaNames[i]} (${shape}) at distance ${distanceFromOrigin.toFixed(0)} units - visible within ${visibilityRange} units`);
    }

    console.log(`✅ Created ${exoticNebulaCount} exotic core nebulas (galaxy-formation style, range-based visibility)`);
    console.log(`   Total nebulas in scene: ${nebulaClouds.length}`);
}

// =============================================================================
// NEBULA VISIBILITY UPDATE - Called each frame to show/hide distant nebulas based on range
// Includes smooth fade-in/fade-out effect
// =============================================================================
// Frame counter for throttling nebula visibility
let _nebulaVisibilityFrameCount = 0;

function updateNebulaVisibility() {
    // PERF: Only check every 15 frames instead of every frame
    _nebulaVisibilityFrameCount++;
    if (_nebulaVisibilityFrameCount % 15 !== 0) return;
    
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) return;
    if (typeof camera === 'undefined') return;
    
    const fadeSpeed = 0.005; // How fast to fade in/out (0.005 = ~200 frames / ~3-4 seconds for full fade)
    const maxOpacity = 0.65;
    
    nebulaClouds.forEach(nebula => {
        if (!nebula || !nebula.userData) return;
        
        // Only apply range-based visibility to distant and exotic nebulas
        if (!nebula.userData.isDistant && !nebula.userData.isExoticCore) return;
        
        const visibilityRange = nebula.userData.visibilityRange || 25000;
        const distance = camera.position.distanceTo(nebula.position);
        
        // Initialize fade state if not present
        if (nebula.userData.currentOpacity === undefined) {
            nebula.userData.currentOpacity = 0;
        }
        
        // Determine if should be visible based on range
        const shouldBeVisible = distance < visibilityRange;
        
        // Calculate target opacity based on distance
        let targetOpacity = 0;
        if (shouldBeVisible) {
            // Distance-based opacity: full at 60% of range, fades to 50% at edge
            const fadeStart = visibilityRange * 0.6;
            const fadeEnd = visibilityRange;
            if (distance > fadeStart) {
                const fadeProgress = (distance - fadeStart) / (fadeEnd - fadeStart);
                targetOpacity = maxOpacity * (1 - fadeProgress * 0.5);
            } else {
                targetOpacity = maxOpacity;
            }
        }
        
        // Smoothly interpolate current opacity toward target
        const opacityDiff = targetOpacity - nebula.userData.currentOpacity;
        if (Math.abs(opacityDiff) > 0.001) {
            // Slow, dramatic fade-in for distant nebulas
            const speed = opacityDiff > 0 ? fadeSpeed : fadeSpeed * 0.5;
            nebula.userData.currentOpacity += opacityDiff * speed;
            
            // Clamp to valid range
            nebula.userData.currentOpacity = Math.max(0, Math.min(maxOpacity, nebula.userData.currentOpacity));
        }
        
        // Update visibility and material opacity
        const isCurrentlyVisible = nebula.userData.currentOpacity > 0.001;
        
        if (nebula.visible !== isCurrentlyVisible) {
            nebula.visible = isCurrentlyVisible;
            if (isCurrentlyVisible && nebula.userData.currentOpacity < 0.1) {
                console.log(`👁️ ${nebula.userData.name} fading into view (distance: ${distance.toFixed(0)})`);
            }
        }
        
        // Apply opacity to nebula particles — only write when it actually
        // changed, so a settled (fully-faded-in or hidden) nebula doesn't
        // dirty the material every 15 frames for no reason.
        if (nebula.children[0] && nebula.children[0].material) {
            const mat = nebula.children[0].material;
            if (mat.opacity !== nebula.userData.currentOpacity) {
                mat.opacity = nebula.userData.currentOpacity;
            }
        }
    });
}

// Export visibility update function
window.updateNebulaVisibility = updateNebulaVisibility;

// =============================================================================
// DEEP-SPACE SPARKLE — per-frame driver for the starfield/hero-star twinkle
// shaders and the galaxy-imposter shimmer, all created in
// createOptimizedPlanets3D(). Called (unthrottled, every frame) from
// updateNebulaBreathing() below, which is itself already wired into the
// main game loop — piggybacking here avoids adding a second per-frame call
// site. Cost is a handful of uniform/opacity writes; no scene traversal.
// =============================================================================
function updateDeepSpaceSparkle() {
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;

    if (window.fieldStarsMaterial && window.fieldStarsMaterial.uniforms) {
        window.fieldStarsMaterial.uniforms.uTime.value = t;
    }
    if (window.heroStarsMaterial && window.heroStarsMaterial.uniforms) {
        window.heroStarsMaterial.uniforms.uTime.value = t;
    }
    // Celestial impostors shimmer on the same clock — the buffer behind them is
    // only rewritten at the 6Hz cull cadence, so the twinkle has to be driven
    // here or the far field reads as a frozen screen of dots.
    if (window.celestialImpostorMaterial && window.celestialImpostorMaterial.uniforms) {
        window.celestialImpostorMaterial.uniforms.uTime.value = t;
    }

    const imposters = window.galaxyImposters;
    if (imposters && imposters.length) {
        for (let i = 0; i < imposters.length; i++) {
            const spr = imposters[i];
            if (!spr || !spr.userData || !spr.material) continue;
            const base = spr.userData._baseOpacity || spr.material.opacity;
            const speed = spr.userData._shimmerSpeed || 0.04;
            const phase = spr.userData._shimmerPhase || 0;
            spr.material.opacity = base * (0.82 + 0.18 * Math.sin(t * speed + phase));
        }
    }
}
window.updateDeepSpaceSparkle = updateDeepSpaceSparkle;

// =============================================================================
// NEBULA IDLE BREATHING (PewPew-inspired) — modulate each nebula cloud's
// alpha ±8% on a slow (~13 s) cycle so the backdrop never reads as a static
// image. Multiplies AROUND the base opacity the visibility system computed
// (userData.currentOpacity), so the two systems don't fight; nebulas without
// a managed opacity snapshot their material value once as the base. Each
// nebula gets a phase offset so the field shimmers instead of pulsing in
// lockstep.
// =============================================================================
let _nebBreathPhase = 0;
function updateNebulaBreathing() {
    // Runs every frame regardless of nebula state — also drives starfield
    // twinkle/hero-star flare/galaxy-imposter shimmer (see function below).
    updateDeepSpaceSparkle();

    if (typeof nebulaClouds === 'undefined' || !nebulaClouds.length) return;
    _nebBreathPhase += 0.008; // full cycle ~13 s at 60 fps
    for (let i = 0; i < nebulaClouds.length; i++) {
        const n = nebulaClouds[i];
        if (!n || !n.visible || !n.children[0]) continue;
        const mat = n.children[0].material;
        if (!mat || mat.opacity === undefined) continue;
        let base = (n.userData && typeof n.userData.currentOpacity === 'number')
            ? n.userData.currentOpacity
            : (n.userData ? n.userData._breathBase : undefined);
        if (base === undefined) {
            base = mat.opacity;
            if (n.userData) n.userData._breathBase = base;
        }
        const breath = 0.92 + 0.08 * Math.sin(_nebBreathPhase + i * 0.7);
        mat.opacity = base * breath;

        // GENTLE PARALLAX SCALE: a slow, tiny breathe on the whole cloud's
        // scale (not just alpha) reads as volumetric gas roiling in 3D
        // rather than a flat sprite pulsing brightness. Cheap — one
        // Vector3.setScalar per visible nebula per frame, no geometry work.
        const scaleBreath = 1 + 0.035 * Math.sin(_nebBreathPhase * 0.55 + i * 1.3);
        n.scale.setScalar(scaleBreath);
    }
}
window.updateNebulaBreathing = updateNebulaBreathing;

// =============================================================================
// DISTANCE CULLING - Hide far-away objects to cut draw calls (PERF)
// =============================================================================
// The entire universe lives in one scene with a 250k-unit camera far plane, so
// without this every distant galaxy's planets, asteroid belts, comets and ships
// are submitted to the GPU every frame even when they're sub-pixel specks. That
// was measured at ~2,700-2,900 draw calls/frame at the Sol start. Toggling
// .visible lets three.js skip the whole subtree (no draw call, no matrix work).
//
// We only RESTORE visibility for objects we ourselves hid (tracked via
// userData._distCulled) so we never fight other visibility systems such as the
// distant-nebula opacity fade in updateNebulaVisibility(). Enemies are
// deliberately NOT culled here because combat logic reads enemy.visible.
//
// -----------------------------------------------------------------------------
// WHY THIS PASS RESOLVES WORLD POSITIONS (the inverted proximity band)
// -----------------------------------------------------------------------------
// `planets` is not a flat list. 345 of the nebula-cluster worlds' moons are
// CHILDREN of their parent planet mesh, so `moon.position` is a LOCAL offset of
// ~100-300u, not a world coordinate. Subtracting the camera from it does not
// measure "how far is that moon" — it measures, to within a moon's orbit,
// HOW FAR THE CAMERA IS FROM THE WORLD ORIGIN. Both halves of the reported
// regression fall straight out of that one line:
//
//   * Sitting near the origin (which the world rebase keeps you at most of the
//     time) every moon in the universe scores "in range" and is left flagged
//     visible — measured 313 of 345 moons flagged visible past 30,000u, 286 of
//     them sub-pixel, from 80,000u away.
//   * The moment the camera is genuinely far from the origin — a warp jump, a
//     galactic-view sweep, the frames before a rebase catches up — the same
//     formula hides EVERY moon in the game, including the one you are close
//     enough to read the terminator on. Near became the band that gets culled.
//
// So distance is now measured to the body's WORLD position (matrixWorld's
// translation for anything parented; `position` stays the fast path for the
// root-level majority, and is what the game's own update code wrote this frame).
//
// Two further rules the old pass had no way to express:
//
//   * NEAR IS A PROMISE. Inside CULL_NEAR_RADII of a body's own radius it is
//     visible, full stop — no quality tier, no authored range, no throttle may
//     take away a world that is filling the screen.
//   * FAR IS ANGULAR. A 4-unit moon 25,000u away is a fifth of a pixel, and it
//     was being drawn purely because its parent planet was still in range. Below
//     a sub-pixel silhouette it is culled on its own account (with hysteresis so
//     a body drifting on the boundary cannot strobe).
//
// And two timing rules:
//
//   * A CAMERA JUMP FORCES A PASS. The 10-frame throttle is right for flight
//     (20u/frame max, i.e. 200u of drift between passes against a 30,000u
//     range) and wrong for teleports: measured after a warp-in, everything
//     within 40 radii of the camera stayed invisible for the first 3-7 frames.
//     A jump larger than anything flight can produce re-decides immediately.
//   * WE RE-ASSERT AFTER THE TWO PASSES THAT FORCE MOONS VISIBLE. game-core's
//     updateActivePlanets() ("CRITICAL: Always include moons and ensure they're
//     visible") and updatePlanetOrbits() ("Ensure moon is always visible") both
//     write `visible = true` on every moon, the latter EVERY FRAME and last in
//     animate() before the render. Without the guard this cull's decision about
//     a moon survives for a fraction of one frame and the far field never
//     actually goes away — measured 313 of 345 moons flagged visible past
//     30,000u with the cull otherwise fully correct. The guard restores only
//     bodies THIS pass hid, so it can never fight another visibility system.
//
// THE DISTANCE GATE IS NOT A SECOND OPINION.
// The two rules above were right and still fired second: `planets` was gated at
// 30,000u FIRST, and the angular rule only ever got to arbitrate among the
// survivors. Measured at spawn, 1600x900, fov 76, tier 0: 45 of 71 bodies that
// were still 2px or wider on screen — including a 595u star at 102,091u (4.7px)
// and a 524u star at 98,767u (4.3px) — were deleted by the range test before
// anything looked at their silhouette. Only 40 of 1,185 worlds were drawn. The
// sky read as empty, and the emptiest part of it was the part with the biggest
// things in it.
//
// A 410u gas giant does not go sub-pixel until ~745,000u. Culling it at 30,000
// is 25x too early, and no pixel-space argument justifies it — the argument was
// only ever about draw calls, which is exactly what the angular rule already
// bounds (it removes every body under ~0.6px, ~75% of them, and it removes them
// for a reason you can see). So the range test no longer applies to anything
// with a silhouette; `br*br < lim*lim*d2` is the sole decider, and the authored
// number survives only as a fallback for entries with no measurable radius.
//
// The quality tier still has its lever, moved to where it belongs: cullScale
// now scales the sub-pixel THRESHOLD instead of the range, so a lower tier
// sheds the dimmest specks first rather than amputating the far half of the sky.
//
// THE SILHOUETTE IS THE WHOLE ASSEMBLY, NOT THE NAKED TOP-LEVEL SPHERE.
// The angular rule above is only as honest as the radius you feed it, and the
// radius it was being fed was `geometry.parameters.radius` — the bare
// SphereGeometry the body was built from, with none of the halo sprites, glow
// shells, accretion discs or star-field Points that hang off it and are drawn
// with it. Measured live over 3,480 bodies: 2,554 (73.4%) draw a silhouette
// more than 2x that number and 1,393 (40.0%) more than 5x. The galaxy cores
// are the extreme: a Spiral core reports radius 36 while its drawn assembly —
// 9 nodes, halo Sprite at scale 235, disc Plane at scale 360, an accretion
// shell and two Points clouds — reaches 2,849u, a 79x error (the Dwarf core is
// 142x off). At the Sol start that deleted the two nearest galaxy cores while
// they measured 28.4px and 23.9px of screen RADIUS: the biggest features in the
// deep sky, removed for being "sub-pixel". So the radius is now the world-space
// bounding-sphere radius of the object's WHOLE SUBTREE, taken about its own
// origin, cached on first use.
//
// WITH ONE CUT: WE DO NOT SWALLOW BODIES THAT ARE CULLED ON THEIR OWN ACCOUNT.
// 345 moons are CHILDREN of their parent planet (see the note above), and a
// moon 30u out on its orbit would inflate a 1.9u planet's silhouette to 31u —
// a 16x over-report of a mostly-empty sphere, and the same lie in the opposite
// direction. So the walk stops at any descendant that is itself a registered
// body. The test is `userData.type`, and it is exact here rather than a
// heuristic: measured, all 624 body-children carry one and 0 of 694 decoration
// children do.
//
// Cost: 2.7ms once for the whole 3,480-body universe (measured), amortised to
// nothing by the cache, and childless bodies — 3,105 of the 3,480 — take a
// fast path that touches no matrices at all.
const CULL_NEAR_RADII = 40;      // inside this many body-radii: always visible
const CULL_SUBPIXEL_ANG = 0.00055; // hide below ~0.6px of silhouette radius
// ...and bring it back at ~0.72px. THE BAND IS DEADZONE, NOT BUDGET: it exists
// only so a body drifting on the threshold cannot strobe at the pass's 6Hz
// cadence, and every body inside it is one the player can see and we are
// hiding anyway. At 0.00080 the band was 45% wide and left the Spiral,
// Elliptical and Lenticular cores parked hidden at ang 0.00057-0.00062 — above
// the keep-visible threshold, below the come-back one, stuck. 20% is still
// several passes' worth of approach at any speed the ship can make good
// against these distances, and it strands nothing.
const CULL_SUBPIXEL_BACK = 0.00066;
let _cullFrameCount = 0;
let _cullLastPassFrame = -999;
const _cullPrevCam = { x: Infinity, y: Infinity, z: Infinity };
const _cullJumpDist2 = 1500 * 1500; // beyond any per-frame flight movement
// Bodies this pass hid that another system force-shows (moons, and only moons —
// both stompers key on the same thing this does). Rebuilt every pass, walked by
// the guards, so it stays a few hundred entries and costs a boolean each.
const _cullStomped = [];
let _cullGuardsInstalled = 0;

// World-space position of a cull candidate, into a scratch record.
const _cullWP = { x: 0, y: 0, z: 0 };
function _cullWorldPos(o) {
    const p = o.parent;
    if (!p || p.isScene) {
        _cullWP.x = o.position.x; _cullWP.y = o.position.y; _cullWP.z = o.position.z;
    } else {
        const e = o.matrixWorld.elements;
        _cullWP.x = e[12]; _cullWP.y = e[13]; _cullWP.z = e[14];
    }
}

// Bounding-sphere radius of one node in world units, plus how far its centre
// sits from (ox,oy,oz) — i.e. how far this node REACHES from the body's own
// origin. Recurses, and stops at any descendant that is a registered body of
// its own (see the note above). Returns 0 for a node that draws nothing.
function _cullReach(d, isRoot, ox, oy, oz) {
    if (!isRoot && d.userData && d.userData.type) return 0;
    let best = 0;
    const g = d.geometry;
    if (g) {
        let bs = g.boundingSphere;
        if (!bs) {
            try { g.computeBoundingSphere(); bs = g.boundingSphere; } catch (e) { bs = null; }
        }
        if (bs && bs.radius > 0) {
            const e = d.matrixWorld.elements, c = bs.center;
            const cx = e[0] * c.x + e[4] * c.y + e[8]  * c.z + e[12];
            const cy = e[1] * c.x + e[5] * c.y + e[9]  * c.z + e[13];
            const cz = e[2] * c.x + e[6] * c.y + e[10] * c.z + e[14];
            // Max axis scale: conservative for the non-uniform case, exact for
            // the uniform one, and it is what a Sprite's world size already is.
            const s = Math.max(
                Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2]  * e[2]),
                Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6]  * e[6]),
                Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
            const dx = cx - ox, dy = cy - oy, dz = cz - oz;
            best = Math.sqrt(dx * dx + dy * dy + dz * dz) + bs.radius * s;
        }
    }
    const kids = d.children;
    for (let i = 0; i < kids.length; i++) {
        const r = _cullReach(kids[i], false, ox, oy, oz);
        if (r > best) best = r;
    }
    return best;
}

// Silhouette radius, cached: what the body actually DRAWS, over its whole
// subtree, in world units (see the long note above for why the top-level
// geometry parameter was not that). userData.radius survives only as the
// last-resort fallback for an entry that draws no measurable geometry at all —
// it is a gameplay mass-radius on some bodies and disagrees with the mesh.
//
// The cache is keyed on the child count as well, so a body that grows an
// assembly after its first cull pass (a black hole gaining its disc, a world
// gaining a moon) is re-measured rather than judged forever on what it used to
// look like.
function _cullBodyRadius(o) {
    const ud = o.userData;
    let r = ud._cullR;
    if (r !== undefined && ud._cullRKids === o.children.length) return r;
    if (o.children.length === 0) {
        // FAST PATH — no matrices. Measured: 0 of 3,480 bodies has a scaled
        // ancestor, so the local scale IS the world scale for a leaf, and
        // |centre| is rotation-invariant. 3,105 of 3,480 bodies land here.
        const g = o.geometry;
        let bs = g && g.boundingSphere;
        if (g && !bs) {
            try { g.computeBoundingSphere(); bs = g.boundingSphere; } catch (e) { bs = null; }
        }
        r = (bs && bs.radius > 0)
            ? (bs.center.length() + bs.radius) *
              Math.max(o.scale.x, o.scale.y, o.scale.z)
            : 0;
    } else {
        // matrixWorld may not have been built yet on the pass that first asks
        // (the cull can run before the renderer's own update), so force it for
        // this subtree — the renderer would do exactly this work at draw time.
        o.updateWorldMatrix(true, true);
        const e = o.matrixWorld.elements;
        r = _cullReach(o, true, e[12], e[13], e[14]);
    }
    if (!(r > 0)) {   // also catches NaN out of a degenerate bounding sphere
        const p = o.geometry && o.geometry.parameters;
        r = (p && p.radius > 0) ? p.radius : (ud.radius > 0 ? ud.radius : 0);
    }
    ud._cullR = r;
    ud._cullRKids = o.children.length;
    return r;
}

// =============================================================================
// THE IMPOSTOR TIER — one draw call for the whole small-but-visible far field
// =============================================================================
// The angular cull above is a BINARY SWITCH at the sub-pixel floor: a world is
// either the full assembly — a 20x20 SphereGeometry (760 tris) plus whatever
// rings, night shell and atmosphere hang off it — or it is nothing. Measured at
// a dense vantage: of 457 drawn worlds, 345 (75%) covered under 4 screen pixels
// and yet accounted for 523 of the 1,083 planet draw submissions (48.3%) and
// ~479k triangles. Half the submission budget was being spent on things the
// player cannot resolve as anything but a coloured dot — and the adaptive
// controller was ALREADY spent (tier 2, pixelRatio 0.7) trying to pay for it.
//
// A coloured dot is exactly what a Points cloud draws, for one call and one
// vertex. So the band between "resolvable" and "sub-pixel" gets its own tier:
//
//   >= CULL_IMPOSTOR_PX of screen DIAMETER   full mesh assembly, unchanged
//   between that and the sub-pixel floor     ONE point in the shared cloud
//   below the sub-pixel floor                gone, as before
//
// WHY DIAMETER IN REAL PIXELS, NOT A TUNED ANGULAR CONSTANT. The existing
// thresholds are raw angular ratios that happen to mean ~0.6px at the fov and
// window the game was tuned in. The impostor boundary is the one the player can
// actually SEE cross (a world you are flying toward pops from dot to sphere), so
// it is computed from the live camera fov and canvas height every pass — 4px is
// 4px on a phone, on a 4K panel, and after the adaptive-resolution controller
// has moved the backing store underneath it.
//
// WHY IT CANNOT RECREATE THE WHITE-ORB FLOOD. The hero-star post-mortem above is
// the cautionary tale: an additive point whose size does not fall off with
// distance stops reading as sky and starts reading as bokeh pasted over the
// frame. Two rules keep that from happening here:
//   * SIZE IS MEASURED, NOT AUTHORED. The quad is sized from the body's real
//     angular size this frame, so an impostor shrinks as you fly away exactly
//     like the mesh it replaced. There is no magnitude curve to blow out.
//   * THE CEILING IS BELOW THE HERO CEILING. IMPOSTOR_MAX_PX (7) < _HERO_MAX_PX
//     (9), and the disc inside the quad is smaller still, so the very largest
//     impostor is smaller than the sky's brightest landmark star. It reads as a
//     world seen from a long way off, which is what it is.
//
// WHY THE SWAP IS INVISIBLE. Three things have to line up at the boundary or the
// tier trades a frame-rate win for a pop the player sees on every approach:
//   * HYSTERESIS, so a body sitting on the line at the pass's 6Hz cadence cannot
//     strobe between mesh and dot (same deadzone argument as CULL_SUBPIXEL_BACK).
//   * THE DISC IS SIZED FROM THE BODY, EVERY PASS. vDisc is a fixed fraction of
//     the body's real screen radius this frame, so the patch handed over at the
//     swap is the patch the mesh was covering — not a fixed sprite that happens
//     to be nearby.
//   * BRIGHTNESS AND WIDTH ARE MEASURED AGAINST THE MESH, not guessed. See the
//     calibration block below for the rig and the residuals.
// And at the BOTTOM edge the impostor fades to nothing across the last stretch
// before the sub-pixel floor, so a body leaving the far end dissolves instead of
// being deleted — the one place the old binary switch was visible as a blink.
//
// WHAT IT BUYS. Measured at a pinned dense vantage, 1600x900, fov 75, quality
// tier 'normal', pixelRatio 1.0, no hostiles, three interleaved on/off repeats:
// 2,590 -> 2,164 draw calls (-426), 1,041k -> 723k triangles (-319k), median
// frame 57.1ms -> 44.7ms and p95 90.8ms -> 68.8ms (17.1 -> 21.4 fps). 388 worlds
// in ONE draw call. Census at the same vantage: of the 363 on-screen worlds
// between the sub-pixel floor and 4px, ZERO still submit a mesh draw, and of the
// 101 at or above 4px, 99 are still full meshes (the 2 are inside the come-back
// deadzone, which is what it is for).
//
// THE BUFFER IS REBUILT AT THE CULL CADENCE (6Hz), not per frame: it holds WORLD
// coordinates and the camera is applied by the vertex shader, so camera motion
// is exact every frame regardless, and a body's own orbital drift over 10 frames
// is a fraction of a pixel at these distances. The floating-origin rebase is the
// one thing that cannot wait for the next pass — a shift of tens of thousands of
// units would smear the entire far field for up to 10 frames — so it subtracts
// straight into the live buffer through __worldShiftHandlers.
const CULL_IMPOSTOR_PX = 4.0;       // screen DIAMETER at/below which a world is a dot
const CULL_IMPOSTOR_BACK_K = 1.22;  // ...and back to a mesh only 22% above it
const IMPOSTOR_MAX_PX = 7.0;        // quad ceiling, CSS px — under _HERO_MAX_PX (9)
const IMPOSTOR_MIN_PX = 2.2;        // enough quad for a soft-edged sub-pixel speck
// HOW WIDE, AND HOW BRIGHT. All three numbers below were MEASURED against the
// mesh at the swap boundary, not chosen to look plausible. The rig: render the
// frame with the body as a mesh and again with the body hidden, subtract, and
// that difference IS the body's own contribution to the screen; do the same for
// the impostor; the calibration is whatever makes the two contributions match.
// (Isolating each body against its own absence is what made the numbers usable
// — measuring the raw patch instead just measures whatever nebula happens to be
// behind it.)
//
// THE DISC IS NARROWER THAN THE SILHOUETTE, and it is now measured off the
// BALL, not off the assembly. The cull threshold has to use the whole assembly
// — a star's corona is what you can still see from 200,000u out — but the
// assembly is mostly halo, shell and ring, and painting a solid disc that wide
// is a different, much brighter object than the body. Saturn's assembly is
// 235.2 u against a 96 u ball, so the old disc was 1.37x the radius and 1.88x
// the AREA of the sphere it stood in for, with a ring plane's mostly-empty
// annulus painted in as solid planet. See _impostorBodyRadius: the quad still
// spans the assembly so the halo skirt lands where the rings were, and only the
// solid part of the sprite shrinks to the ball.
//
// THE BRIGHTNESS SPLITS, because the two families of body really do differ:
//   * A LIT WORLD is albedo x irradiance x phase, and all three are measured
//     per pass (see _impIllum). IMPOSTOR_LIT_GAIN multiplies that 0..1 number
//     rather than replacing it, and IMPOSTOR_LIT_CEIL stops a planet ever
//     reaching the shader's white knee — a world has no HDR core, and letting
//     one through is exactly the saturated-white-dot flash this tier was
//     reported for.
//   * A SELF-LUMINOUS BODY (star, galaxy core, anything whose own material is
//     additive) is a hot core that clips to white — above 1.0 here, which is
//     what makes the impostor's centre saturate the way the star shader's HDR
//     core does rather than reading as a coloured dot. It takes no illumination
//     term at all: it IS the light.
//
// WHAT THE SWAP MEASURES NOW. Rig: bisect the camera distance until the body
// flips representation (8.13 px of assembly diameter at quality tier 2, which
// is CULL_IMPOSTOR_PX widened by the tier's cullScale and the come-back
// deadzone), then isolate the body against its own absence on each side and
// compare. 12 worlds x 3 view directions = 36 crossings, live demo scene,
// 1600x900 at pixelRatio 0.7:
//
//                       median |step|   p90    max   |step| < 30   energy ratio
//   flat class gain          67-74     107-127  126-141   4/36        0.5-1.1
//   albedo x irradiance      21-31      45-57    74-86   17-22/36     0.4-0.8
//
// The residual is real and is not a constant that can be tuned away: the mesh's
// own peak at the swap swings 6x with view direction on the SAME body (Beta
// System-1 measured 36, 165 and 228 across three directions in one pass),
// because these worlds are not bare Lambert spheres — they carry emissive rims,
// unlit ring planes and additive presence shells. A one-vertex sprite cannot
// carry that structure; what it can do, and now does, is sit on the mesh's
// brightness rather than 100/255 above it.
const IMPOSTOR_DISC = 0.56;         // disc radius as a fraction of the BALL
const IMPOSTOR_LIT_GAIN = 1.8;      // now multiplies a measured 0..1 illumination
const IMPOSTOR_LIT_CEIL = 1.40;     // a lit world may warm, never clip to white
const IMPOSTOR_LUM_GAIN = 1.12;     // ...a star is its own light: no illum term

let _impPoints = null, _impGeo = null, _impMat = null, _impCap = 0, _impCount = 0;
let _impPos = null, _impRGB = null, _impPx = null, _impDisc = null, _impBright = null, _impPhase = null;

const _IMPOSTOR_VERT = `
    attribute float aPx;
    attribute float aDisc;
    attribute float aBright;
    attribute float aPhase;
    uniform float uDpr;
    uniform float uTime;
    varying vec3 vColor;
    varying float vDisc;
    varying float vEdge;
    varying float vI;
    void main() {
        vColor = color;
        vDisc = aDisc;
        // Limb softness, in quad units, floored at ~0.8 CSS px of transition.
        // A 3px body needs a soft edge to read as round at all, but the softness
        // has to be a FIXED PIXEL WIDTH rather than a fraction of the disc:
        // scaled with the disc it smeared the smallest bodies across their whole
        // quad and took their peak luminance down with it.
        vEdge = max(1.6 / max(aPx, 1.0), aDisc * 0.22);
        // The same slow shimmer the starfield runs on, at a third the depth —
        // enough that a distant system reads as alive rather than as a screen
        // of static dots, shallow enough that it never becomes a luminance
        // step at the mesh swap.
        vI = aBright * (0.92 + 0.08 * sin(uTime * 1.6 + aPhase));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // gl_PointSize is DEVICE pixels; aPx is CSS px, so the impostor keeps
        // its measured angular size after the adaptive-resolution controller
        // moves the backing store.
        gl_PointSize = aPx * uDpr;
        gl_Position = projectionMatrix * mv;
    }
`;
const _IMPOSTOR_FRAG = `
    varying vec3 vColor;
    varying float vDisc;
    varying float vEdge;
    varying float vI;
    void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;   // 0 centre, 1 at quad edge
        // The body's lit face as a soft-limbed disc, plus a narrow skirt out to
        // the quad edge. The skirt is where the assembly's halo/atmosphere used
        // to be, and it is also what keeps the disc from reading as a cut-out
        // circle at 2-3 px, where a hard edge is the whole shape.
        // 1.0 - smoothstep, NOT smoothstep with the edges swapped: GLSL leaves
        // smoothstep undefined when edge0 >= edge1, and on this driver the
        // swapped form silently returned 0 for every body whose disc was
        // narrower than its limb softness — the impostor was there, in the
        // buffer, at the right place, contributing nothing.
        float disc = 1.0 - smoothstep(max(0.0, vDisc - vEdge), vDisc + vEdge, d);
        float glow = pow(max(0.0, 1.0 - d), 3.0) * 0.20;
        float I = (disc + glow) * vI;
        if (I < 0.02) discard;
        vec3 c = mix(vColor, vec3(1.0), clamp(I - 1.0, 0.0, 1.0));
        gl_FragColor = vec4(c, clamp(I, 0.0, 1.0));
    }
`;

function _impostorEnsure(need) {
    if (_impPoints && _impCap >= need) return true;
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' || !scene || !scene.add) return false;
    const cap = Math.max(512, Math.ceil(need * 1.4));
    const pos = new Float32Array(cap * 3), rgb = new Float32Array(cap * 3);
    const px = new Float32Array(cap), disc = new Float32Array(cap);
    const bri = new Float32Array(cap), pha = new Float32Array(cap);
    if (_impPos) {   // grow: carry this pass's work over rather than blink
        pos.set(_impPos.subarray(0, _impCap * 3)); rgb.set(_impRGB.subarray(0, _impCap * 3));
        px.set(_impPx.subarray(0, _impCap)); disc.set(_impDisc.subarray(0, _impCap));
        bri.set(_impBright.subarray(0, _impCap)); pha.set(_impPhase.subarray(0, _impCap));
    }
    _impPos = pos; _impRGB = rgb; _impPx = px; _impDisc = disc; _impBright = bri; _impPhase = pha;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aPx', new THREE.BufferAttribute(px, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aDisc', new THREE.BufferAttribute(disc, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aBright', new THREE.BufferAttribute(bri, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(pha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, _impCount);

    if (!_impMat) {
        _impMat = new THREE.ShaderMaterial({
            uniforms: { uDpr: { value: 1 }, uTime: { value: 0 } },
            vertexShader: _IMPOSTOR_VERT,
            fragmentShader: _IMPOSTOR_FRAG,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true,
            fog: false
        });
    }
    if (_impPoints) { scene.remove(_impPoints); if (_impGeo) _impGeo.dispose(); }
    _impGeo = geo;
    _impPoints = new THREE.Points(geo, _impMat);
    _impPoints.frustumCulled = false;   // positions are rewritten under it every pass
    _impPoints.renderOrder = 2;
    _impPoints.name = 'celestialImpostors';
    scene.add(_impPoints);
    _impCap = cap;
    if (typeof window !== 'undefined') {
        window.celestialImpostors = _impPoints;
        window.celestialImpostorMaterial = _impMat;
    }
    return true;
}

// THE BODY'S COLOUR IS THE SURFACE UNIFORM, NOT THE BRIGHTEST ONE.
// The first version of this took whichever colour in the material was
// brightest, on the theory that the eye reads the brightest thing. It does not:
// a world's authored palette is mostly LIMB and NIGHT decoration, and those are
// deliberately the vivid ones. Measured over the 3,619 bodies in a loaded
// universe, the top-level material comes in exactly five shapes —
//   color + emissive                     3001   (stock lit materials)
//   uColor + uNight + uRim                634   (planet-presence shader)
//   uDay + uNight + uRim + uAccent         64   (day/night world shader)
//   color + uCore + uEdge                  54   (glow-core shader)
//   color alone                            32
// — and in the two shader families the brightest colour is uRim, the pink limb
// glow. Draadara Cascade I is a blue world (uDay 0.02,0.49,0.74) that its
// impostor was painting hot pink (uRim 0.98,0.38,0.89): a 161-degree hue error
// on a body whose whole job at 3 px is to be the right colour.
// So the surface uniforms are named, in precedence order, and the rim/night/
// accent/edge names are named too — as the ones that never get to answer.
const _IMP_SURFACE_UNIFORMS = ['uDay', 'uColor', 'uCore', 'uBase', 'uSurface', 'uTint'];
const _IMP_DECOR_UNIFORMS = {
    uRim: 1, uNight: 1, uAccent: 1, uEdge: 1, uGlow: 1, uHalo: 1, uAtmo: 1, uSpec: 1
};

// THE ALBEDO OF A TEXTURED WORLD IS IN THE TEXTURE, NOT IN `color`.
// Every hero world in Sol (Mercury, Earth, Mars, Jupiter, Saturn) is a
// MeshLambert/Phong with `color` 0xffffff and the whole surface in `map` — the
// standard way to author a textured body. Reading `m.color` on those five
// returns WHITE, so their impostors were painted as white-hot dots while the
// mesh they stood in for is a muted brown/blue/ochre. Measured 32x16 mean texel:
// Saturn 209,179,123 · Earth 108,113,102 · Mars 160,82,53 · Jupiter 195,157,119
// · Mercury 152,132,117 — none of them within a hue of white, and Earth's
// LUMINANCE is 0.44 of it.
//
// So the texture is sampled: one 32x16 drawImage per TEXTURE (not per body —
// the five worlds share nothing but the result is cached on the texture object,
// so a shared map is paid for once), averaged, and multiplied by `color` so a
// tinted texture still tints. 512 texels is enough for a mean and small enough
// that the whole cost is invisible; it happens on the first cull pass that ever
// impostors a textured world.
//
// AN UNDECODED TEXTURE MUST NOT BE CACHED. A map whose image has not loaded yet
// has width 0 and would average to black (or throw); the pass records that it
// asked too early via _impPaintPending so _impostorPaint declines to cache the
// answer, and the next pass gets the real colour.
let _impPaintPending = false;
const _impTexCanvas = { c: null, x: null };
function _impostorTexColor(tex) {
    if (!tex) return null;
    if (tex.__impAvg !== undefined) return tex.__impAvg;
    const img = tex.image;
    // Video/canvas/ImageBitmap all report width; a decoded <img> does too.
    const iw = img && (img.width || img.videoWidth);
    const ih = img && (img.height || img.videoHeight);
    if (!iw || !ih) { _impPaintPending = true; return null; }
    let out = null;
    try {
        if (!_impTexCanvas.c) {
            _impTexCanvas.c = document.createElement('canvas');
            _impTexCanvas.c.width = 32; _impTexCanvas.c.height = 16;
            _impTexCanvas.x = _impTexCanvas.c.getContext('2d', { willReadFrequently: true });
        }
        const x = _impTexCanvas.x;
        if (x) {
            x.clearRect(0, 0, 32, 16);
            x.drawImage(img, 0, 0, 32, 16);
            const d = x.getImageData(0, 0, 32, 16).data;
            let r = 0, g = 0, b = 0, n = 0;
            for (let i = 0; i < d.length; i += 4) {
                // Skip fully transparent texels — a cut-out map's holes are not
                // black surface, they are no surface.
                if (d[i + 3] < 8) continue;
                r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
            }
            if (n > 0) out = new THREE.Color(r / n / 255, g / n / 255, b / n / 255);
        }
    } catch (e) { out = null; }   // tainted canvas or a decode that isn't ready
    tex.__impAvg = out;           // cache the null too: a taint never un-taints
    return out;
}

// The one colour a material offers as its SURFACE, or null if it has none.
function _impostorNodeColor(m) {
    if (!m || Array.isArray(m)) return null;
    if (m.uniforms) {
        for (let i = 0; i < _IMP_SURFACE_UNIFORMS.length; i++) {
            const u = m.uniforms[_IMP_SURFACE_UNIFORMS[i]];
            if (u && u.value && u.value.isColor) return u.value;
        }
    }
    // A diffuse MAP outranks `color`, because on a textured body `color` is a
    // multiplier (usually white) and the map is the surface.
    if (m.map) {
        const t = _impostorTexColor(m.map);
        if (t) {
            if (m.color) return new THREE.Color(t.r * m.color.r, t.g * m.color.g, t.b * m.color.b);
            return t;
        }
    }
    // An emissive that is actually lit outranks the diffuse colour — on a star
    // or a lava world the diffuse is often near-black and the emissive is the
    // body. A dark emissive is just "not used" and must not win.
    if (m.emissive && (0.2126 * m.emissive.r + 0.7152 * m.emissive.g +
                       0.0722 * m.emissive.b) > 0.05) return m.emissive;
    if (m.color && (m.color.r + m.color.g + m.color.b) > 0.02) return m.color;
    if (m.uniforms) {   // authored shader we don't know: anything but decoration
        for (const k in m.uniforms) {
            if (_IMP_DECOR_UNIFORMS[k]) continue;
            const v = m.uniforms[k] && m.uniforms[k].value;
            if (v && v.isColor) return v;
        }
    }
    return null;
}

// The colour a world hands to its impostor, and whether it is self-luminous.
// Cached on userData: this walks materials and is the only expensive thing in
// the whole tier. It descends into children so a body whose top-level node is a
// bare Group (every star with a corona shell, every galaxy core) still reports a
// hue instead of falling back to grey — but the body's OWN node answers first,
// so a decoration never speaks over the surface it is attached to.
//
// Verified live over all 1,513 bodies whose material exposes a surface colour:
// the impostor's hue matches the body's own to within floating-point noise.
// The cache is unkeyed on purpose — a body's palette is authored once at
// creation, unlike its child count (see _cullBodyRadius, which does key on it
// because assemblies grow).
function _impostorPaint(o) {
    const ud = o.userData;
    if (ud._impPaint) return ud._impPaint;
    _impPaintPending = false;
    let col = null;
    let selfLum = false;
    const scan = (n, depth) => {
        const m = n.material;
        if (m && !Array.isArray(m)) {
            // SELF-LUMINOUS IS THE BODY'S OWN MATERIAL, NOT ITS DECORATION.
            // Testing the whole subtree classified ordinary asteroids as stars
            // — almost every body in this game wears an additive glow sprite or
            // shell somewhere — and a lit rock handed over a star's brightness.
            // Only the top-level node (depth 3, the body itself) gets a vote.
            if (depth === 3) {
                if (m.blending === THREE.AdditiveBlending) selfLum = true;
                if (m.emissive && (0.2126 * m.emissive.r + 0.7152 * m.emissive.g +
                                   0.0722 * m.emissive.b) > 0.25) selfLum = true;
            }
            if (!col) col = _impostorNodeColor(m);
        }
        if (col || depth <= 0) return;
        const kids = n.children;
        for (let i = 0; i < kids.length; i++) {
            // Same cut as the silhouette walk: a registered body of its own is
            // not part of this one's colour.
            if (kids[i].userData && kids[i].userData.type) continue;
            scan(kids[i], depth - 1);
            if (col) return;
        }
    };
    scan(o, 3);
    // AN UNLIT PART OF THE ASSEMBLY NEVER GOES DARK.
    // A ring is a MeshBasicMaterial: it takes no lighting at all, so a ringed
    // giant keeps a bright ring plane on its night side while the ball beside
    // it goes black. That is why Saturn and Uranus were the two worst residuals
    // in the sweep — the illumination model was correctly darkening the BALL
    // and the mesh was still showing a lit ring. A body carrying unlit geometry
    // therefore gets a higher illumination floor: it can dim, but it cannot go
    // out. Direct children only, which is where every ring in this game lives.
    let unlit = false;
    const kids0 = o.children;
    for (let i = 0; i < kids0.length; i++) {
        const k = kids0[i];
        if (!k || (k.userData && k.userData.type)) continue;
        const km = k.material;
        if (km && !Array.isArray(km) && km.isMeshBasicMaterial &&
            km.blending !== THREE.AdditiveBlending) { unlit = true; break; }
    }
    const t = ud.type;
    if (t === 'star' || t === 'sun' || ud.isStar || ud.tendrilGroup) selfLum = true;
    const out = col
        ? { r: col.r, g: col.g, b: col.b,
            lit: selfLum ? IMPOSTOR_LUM_GAIN : IMPOSTOR_LIT_GAIN, lum: selfLum }
        : { r: 0.62, g: 0.70, b: 0.88, lit: IMPOSTOR_LIT_GAIN, lum: false };
    // ALBEDO AND HUE ARE TWO DIFFERENT NUMBERS, AND THE TIER NEEDS BOTH.
    // `alb` is how much of the light that falls on this body comes back —
    // Saturn 0.71, Earth 0.44, Neptune 0.34 — and it is what makes the impostor
    // as bright as the mesh (see _impIllum). The stored r/g/b is then normalised
    // to full range so a dark authored tint still reads as its OWN colour at
    // 3 px rather than as a grey smudge; brightness is carried by `alb` and the
    // illumination term, never by the raw channel magnitudes.
    out.alb = Math.min(1, 0.2126 * out.r + 0.7152 * out.g + 0.0722 * out.b);
    out.unlit = unlit;
    const mx = Math.max(out.r, out.g, out.b);
    if (mx > 0.001 && mx < 1) { out.r /= mx; out.g /= mx; out.b /= mx; }
    // An undecoded texture would cache a wrong (usually white) albedo forever;
    // leave it uncached and let the next pass, ~160 ms later, ask again.
    if (_impPaintPending) return out;
    ud._impPaint = out;
    return out;
}

// =============================================================================
// HOW BRIGHT IS THIS WORLD, ACTUALLY?
// =============================================================================
// A class constant cannot answer that, and the pop the impostor tier shipped
// with was the proof. Measured with the isolate rig (render the body, render it
// hidden, subtract) at the 4 px swap, one park direction, twelve worlds: the
// impostor's peak sat at a near-constant 133-153/255 for every lit world, while
// the MESH it hands over to ranged from 21/255 (Alpha System-2, seen near full
// night) to 229/255 (Jupiter, seen near full day). No single gain can be within
// 30/255 of both ends of a 10x spread — the step was -81 on Jupiter and +50 on
// Alpha System-2, in opposite directions, at the same instant.
//
// The mesh's brightness is not a mystery, though: it is the same three numbers
// every lit shader in the engine multiplies together.
//
//   ALBEDO        what fraction of incident light the surface returns. Now a
//                 real measurement (the texture mean above), not `color`.
//   IRRADIANCE    what light arrives. Every star here is a PointLight with a
//                 finite `distance`, and r128's falloff is exactly
//                 pow(saturate(1 - d/cutoff), decay) — reproduced below, so the
//                 impostor dims on the same curve the mesh does. A world past
//                 its star's cutoff receives ambient and nothing else, and its
//                 impostor now knows that.
//   PHASE         which side of it we are looking at. A Lambert sphere seen at
//                 phase angle a returns, averaged over its visible disc,
//                 (1/pi)(sin a + (pi - a) cos a) of what it returns at full
//                 face. This is the term that makes a body dim as you swing
//                 around behind it — and it is why the SAME world measured 21
//                 and 229 in the sweep above.
//
// The product is the radiance the mesh would show, so it is what the impostor
// is given. At 2-4 px a lit sphere's brightest PIXEL is essentially its disc
// mean (the crescent is smaller than a pixel), which is exactly what this
// computes — so peak and mean agree at the only size the swap ever happens at.
//
// THE FLOOR EXISTS SO THE SKY DOES NOT GO OUT. Nothing is allowed below
// IMPOSTOR_ILLUM_FLOOR: a far-field world drifting through its own night would
// otherwise vanish entirely, and the far field reading as a live, coloured sky
// is the whole point of the tier. The floor is set below the darkest mesh the
// sweep found, so it can never be the thing that causes a step.
const IMPOSTOR_ILLUM_FLOOR = 0.06;
const IMPOSTOR_UNLIT_FLOOR = 0.20;   // ...for a body wearing unlit geometry
const IMPOSTOR_ILLUM_GAIN = 1.0;
const IMPOSTOR_PHASE_KEEP = 0.10;    // fitted below; 1 = ignore phase entirely
// Live levers for the calibration rig — window.__impTune = {gain, ph, floor,
// lit}. Undefined means "use the constant above", which is what ships.
function _impTune(k, dflt) {
    const t = (typeof window !== 'undefined') ? window.__impTune : null;
    return (t && typeof t[k] === 'number') ? t[k] : dflt;
}

// Compact copy of the scene's point lights: x,y,z,cutoff,intensity,decay.
// Rebuilt from _lights (which _lightRescan already maintains) once per cull
// pass — 62 entries, so the copy is free and the per-body loop below is a
// flat array walk with no property access or matrix work in it.
const _IMP_LIGHT_STRIDE = 6;
let _impLightBuf = new Float64Array(64 * _IMP_LIGHT_STRIDE);
let _impLightN = 0;
let _impAmbient = 0;
let _impCamX = 0, _impCamY = 0, _impCamZ = 0;
// One call at the head of every cull pass: where the eye is, and what is lit.
function _impPassBegin(cx, cy, cz) {
    _impCamX = cx; _impCamY = cy; _impCamZ = cz;
    _impLightsBuild();
}
function _impLightsBuild() {
    // _lights is maintained by the light-budget pass, which runs at the END of
    // the cull pass — so on the very first tick it is still empty and every
    // world would be written at the illumination floor. Prime it here rather
    // than ship one dark frame of far field.
    if (_lights.length === 0 && typeof scene !== 'undefined' && scene) _lightRescan();
    const n = _lights.length;
    if (_impLightBuf.length < n * _IMP_LIGHT_STRIDE) {
        _impLightBuf = new Float64Array(n * _IMP_LIGHT_STRIDE);
    }
    let k = 0;
    for (let i = 0; i < n; i++) {
        const l = _lights[i];
        // A light that is off contributes nothing to the mesh either, so the
        // impostor must agree with the budget pass about which stars are lit.
        if (!l.visible || !l.parent) continue;
        _cullWorldPos(l);
        const j = k * _IMP_LIGHT_STRIDE;
        _impLightBuf[j] = _cullWP.x; _impLightBuf[j + 1] = _cullWP.y; _impLightBuf[j + 2] = _cullWP.z;
        _impLightBuf[j + 3] = l.distance > 0 ? l.distance : 0;
        _impLightBuf[j + 4] = l.intensity * (0.2126 * l.color.r + 0.7152 * l.color.g + 0.0722 * l.color.b);
        _impLightBuf[j + 5] = l.decay > 0 ? l.decay : 0;
        k++;
    }
    _impLightN = k;
    // Ambient is a top-level scene child in every file that adds one, so this
    // is a scan of ~30 entries rather than a traverse of 40,000.
    let amb = 0;
    const kids = scene.children;
    for (let i = 0; i < kids.length; i++) {
        const c = kids[i];
        if (c.isAmbientLight && c.visible) {
            amb += c.intensity * (0.2126 * c.color.r + 0.7152 * c.color.g + 0.0722 * c.color.b);
        }
    }
    _impAmbient = amb;
}

// The radiance this body would show, 0..1, at this camera. See the note above.
function _impIllum(paint, wx, wy, wz, cx, cy, cz) {
    if (paint.lum) return 1;              // its own furnace: phase means nothing
    let E = _impAmbient, best = 0, bx = 0, by = 0, bz = 0;
    for (let i = 0; i < _impLightN; i++) {
        const j = i * _IMP_LIGHT_STRIDE;
        const dx = _impLightBuf[j] - wx, dy = _impLightBuf[j + 1] - wy, dz = _impLightBuf[j + 2] - wz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const R = _impLightBuf[j + 3];
        let att;
        if (R > 0) {
            if (d2 >= R * R) continue;    // past its own cutoff: exactly zero
            att = 1 - Math.sqrt(d2) / R;
            const dec = _impLightBuf[j + 5];
            if (dec !== 1 && dec > 0) att = Math.pow(att, dec);
        } else {
            att = 1;                      // distance 0 means "reaches forever"
        }
        const e = _impLightBuf[j + 4] * att;
        E += e;
        if (e > best) { best = e; bx = dx; by = dy; bz = dz; }
    }
    let phase = 1;
    if (best > 0) {
        const vx = cx - wx, vy = cy - wy, vz = cz - wz;
        const lb = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
        const lv = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
        let c = (bx * vx + by * vy + bz * vz) / (lb * lv);
        if (c > 1) c = 1; else if (c < -1) c = -1;
        const a = Math.acos(c);
        // Lambert-sphere disc mean, normalised to 1 at full face.
        phase = (Math.sin(a) + (Math.PI - a) * c) / Math.PI;
        if (phase < 0) phase = 0;
        // The ambient half of E is not directional; give it back the part the
        // phase term just took, or a world's night side reads darker than the
        // mesh (which still gets full ambient on every pixel).
        if (E > 0) {
            const dirShare = best / E;
            phase = phase * dirShare + (1 - dirShare);
        }
        // ...and these worlds are not bare Lambert spheres. Almost every one of
        // them wears an additive presence shell and an emissive rim that do not
        // care where the star is, so the mesh keeps most of its brightness on
        // its night side. Measured over 12 worlds x 3 view directions at the
        // swap, the mesh's peak varies far less with phase than a Lambert
        // sphere's would; PHASE_KEEP is how much of that view-independence the
        // impostor is given back.
        const keep = _impTune('ph', IMPOSTOR_PHASE_KEEP);
        if (keep > 0) phase = keep + (1 - keep) * phase;
    }
    let I = paint.alb * E * phase * _impTune('gain', IMPOSTOR_ILLUM_GAIN);
    if (I > 1) I = 1;
    const floor = paint.unlit
        ? _impTune('ufloor', IMPOSTOR_UNLIT_FLOOR)
        : _impTune('floor', IMPOSTOR_ILLUM_FLOOR);
    return I > floor ? I : floor;
}

// Write one body into this pass's impostor buffer.
//   angR  — the silhouette's screen RADIUS in CSS px, measured by the caller
//   fade  — 0..1 dissolve as the body approaches the sub-pixel floor
//   gain  — optional: what this silhouette is WORTH, replacing the paint's own
//           class gain. Only the scenery tier below passes it, because scenery
//           spans a 0.045-alpha gas puff and an opaque rock and one constant
//           cannot answer for both. Undefined means "you are a world".
// THE BODY THE PLAYER SEES IS NOT THE SILHOUETTE THE CULLER MEASURES.
// `_cullBodyRadius` spans the whole assembly on purpose — a ring plane, a
// corona shell, a moon — because that is what decides whether ANYTHING of this
// world is still on screen. But the thing you actually see at 3 px is the BALL,
// and painting a solid disc at assembly width is a different, much brighter
// object. Saturn: assembly 235.2 u, body 96 u, so the old disc was 1.37x the
// radius and 1.88x the AREA of the sphere it stood in for, with the rings'
// mostly-empty plane painted in as solid planet. Uranus is the same story at
// 156.8 vs 64.
//
// So the ball is measured separately, and cached: the top-level geometry's own
// radius when the body's own node draws one (which is every planet, moon and
// asteroid — rings and shells are children), and the assembly otherwise, which
// is the right answer for a star whose corona IS the body.
function _impostorBodyRadius(o) {
    const ud = o.userData;
    let r = ud._impBodyR;
    if (r !== undefined) return r;
    const g = o.geometry, p = g && g.parameters;
    r = (p && p.radius > 0)
        ? p.radius * Math.max(o.scale.x, o.scale.y, o.scale.z)
        : 0;
    ud._impBodyR = r;
    return r;
}

function _impostorWrite(o, wx, wy, wz, angR, fade, gain) {
    const i = _impCount;
    if (i >= _impCap && !_impostorEnsure(i + 1)) return;
    const paint = _impostorPaint(o);
    // The disc never goes below half a pixel of radius: under that a point is
    // sampled at most once and the body starts flickering with sub-pixel motion
    // instead of dimming. The FADE, not the size, is what retires it.
    const rPx = Math.max(angR, 0.5);
    // The QUAD still spans the assembly, so the halo skirt lands where the
    // rings and shells used to be; only the DISC inside it shrinks to the ball.
    const px = Math.min(IMPOSTOR_MAX_PX, Math.max(IMPOSTOR_MIN_PX, rPx * 5.2));
    const bodyR = _impostorBodyRadius(o);
    const cullR = bodyR > 0 ? _cullBodyRadius(o) : 0;
    const bodyPx = (cullR > 0 && bodyR < cullR) ? rPx * (bodyR / cullR) : rPx;
    _impPos[i * 3] = wx; _impPos[i * 3 + 1] = wy; _impPos[i * 3 + 2] = wz;
    _impRGB[i * 3] = paint.r; _impRGB[i * 3 + 1] = paint.g; _impRGB[i * 3 + 2] = paint.b;
    _impPx[i] = px;
    _impDisc[i] = Math.min(0.92, bodyPx * IMPOSTOR_DISC / (px * 0.5));
    // WORLDS GET THE ILLUMINATION MODEL; SCENERY KEEPS ITS OWN CALIBRATION.
    // A scenery child arrives with an explicit `gain` measured from its own
    // material alpha (see _sceneryTrait) — a 0.045-alpha gas puff and an opaque
    // rock in one number — and that number was fitted against the mesh with no
    // illumination term in the chain. Feeding it one would re-scale a tier that
    // is already right. Only a world, which arrives with `gain` undefined,
    // asks the model how brightly it is lit.
    let ill = 1;
    if (gain === undefined) {
        ill = _impIllum(paint, wx, wy, wz, _impCamX, _impCamY, _impCamZ);
        o.userData._impIll = ill;   // observability: what this pass decided
    }
    const cls = (gain === undefined)
        ? (paint.lum ? paint.lit : _impTune('lit', paint.lit))
        : gain;
    let b = cls * fade * ill;
    // A LIT WORLD IS NEVER ALLOWED TO CLIP TO WHITE.
    // The fragment shader mixes toward white above intensity 1 — deliberately,
    // so a star's core saturates the way the star shader's HDR core does. A
    // planet has no such core, and letting one through is precisely the "flash
    // as a saturated white dot" this tier was reported for: at the old white
    // paint plus a gain with no ceiling, Saturn's impostor measured peak 253/255
    // against a 41/255 mesh. Only `lum` bodies may pass 1.0 now; everything else
    // is capped just under it, so its peak is its OWN colour at full strength
    // and never brighter than the sky's landmark stars.
    if (!paint.lum && gain === undefined) {
        const ceil = _impTune('ceil', IMPOSTOR_LIT_CEIL);
        if (b > ceil) b = ceil;
    }
    _impBright[i] = b;
    if (o.userData._impPhase === undefined) o.userData._impPhase = Math.random() * 6.283;
    _impPhase[i] = o.userData._impPhase;
    _impCount = i + 1;
}

// Publish the pass's buffer. One upload, one draw range, no reallocation.
function _impostorFlush() {
    if (!_impGeo) {
        if (_impCount === 0) return;
        if (!_impostorEnsure(_impCount)) return;
    }
    // THE CLOUD LIVES AT THE ORIGIN, ALWAYS. Its buffer holds ABSOLUTE world
    // coordinates, so any transform on the object itself is added on top of
    // them — and applyWorldShift() shifts EVERY scene child's position, this
    // one included. Left alone that is a double subtract: the far field renders
    // one whole rebase away from where the bodies are, which looks exactly like
    // "the impostors aren't drawing" because nothing lands where you look for
    // it. The shift handler below undoes it at the moment it happens; this line
    // is the standing invariant, so no future system that walks scene.children
    // can reintroduce the same bug silently.
    if (_impPoints && (_impPoints.position.x || _impPoints.position.y || _impPoints.position.z)) {
        _impPoints.position.set(0, 0, 0);
    }
    const a = _impGeo.attributes;
    a.position.needsUpdate = true; a.color.needsUpdate = true;
    a.aPx.needsUpdate = true; a.aDisc.needsUpdate = true;
    a.aBright.needsUpdate = true; a.aPhase.needsUpdate = true;
    _impGeo.setDrawRange(0, _impCount);
    if (_impMat) {
        _impMat.uniforms.uDpr.value = (typeof renderer !== 'undefined' && renderer && renderer.getPixelRatio)
            ? renderer.getPixelRatio() : 1;
    }
    if (_impPoints) _impPoints.visible = _impCount > 0;
}

// =============================================================================
// THE SECOND POPULATION: SCENERY, ONE LEVEL DOWN
// =============================================================================
// The tier above fixed `planets` and stopped there, because `planets` is what
// the culler walks. Measured after it, at the densest of 32 stations swept
// across the 22 nebulas (station index 18, heading 0, 1600x900, fov 75, tier
// 'normal', pixelRatio 1), the frame still looked like this — every in-frustum
// submission, bucketed by its own projected DIAMETER:
//
//     under 2 px .... 2820        4-8 px ..... 199
//     2-4 px ........  867        over 8 px .. 342
//
// 3,677 of 4,228 submissions (87 %) were things the player cannot resolve as
// anything but a dot, and only 33 of them were worlds: the impostor tier had
// already taken those. What was left belongs to groups that are scene children
// and members of NO culled array, so in this game's whole history nothing has
// ever looked at them:
//
//     enemy ......................... 1566 sub-4px  (another file's, left alone)
//     gas_cloud_cluster .............  694 sub-4px, 117k tris
//     outer_interstellar_system .....  624 sub-4px, 136k tris
//     spaceDebris ...................  250 sub-4px
//     crystal_formation/dark_matter ..   93 sub-4px
//
// The gas clusters are the clearest case in the game. Each is ~14 additive puff
// shells, every one its own ShaderMaterial draw — inside a cluster that covers
// ELEVEN SCREEN PIXELS end to end (median of the 65 in frustum; 700 of the 785
// puff draws belong to a cluster under 20 px wide). Fourteen sub-pixel
// translucent spheres cannot resolve into anything one soft dot cannot draw.
//
// So the same machinery runs a second time, one level down: every DIRECT CHILD
// of a named scenery group is measured against the SAME threshold in the SAME
// pixels, and a child under it hands its silhouette to the SAME shared point
// cloud and stops submitting. Zero new draw calls — the cloud was already there
// — and the tier's kill switch (`__impostorLock = false`) puts every child back
// exactly as it was, which is what makes the A/B below a real measurement.
//
// WHY DIRECT CHILDREN, NOT LEAVES. An outer system's child is a whole orbiter
// assembly (body + ring + moon); hiding it as a unit is one decision instead of
// four, and _cullBodyRadius already measures a subtree. It is also the level at
// which the thing has a single position, which is what an impostor point is.
//
// WHY THE GROUP ITSELF IS NEVER TOUCHED. A scene child's `.visible` is somebody
// else's contract — the nebula fade owns the clouds, the discovery system owns
// the outer systems — and this tier cannot see those rules. It only ever writes
// `.visible` on a child, only when it hid that child itself (`_scenOff`), and
// it restores every one of them the moment it is switched off.
//
// WHAT IT BUYS, and it is the largest single win the culler has ever had.
// Densest of 32 swept stations (nebula 12, heading 3), 1120x630 backing store,
// fov 75, tier 'normal', pixelRatio 1, three interleaved repeats of 80 frames:
//
//                       draw calls   triangles   median fps   p95 frame
//     tier off ......... 4,308       1,495,954      33.9        35.1 ms
//     worlds only ...... 4,056       1,195,338      35.6        33.1 ms
//     + scenery ........ 2,475         907,750      48.3        28.7 ms
//
// -1,833 calls and -588k triangles against the binary switch, 33.9 -> 48.3 fps
// (+42 %), and 2,051 hidden children came back as 1,299 points in the one draw
// call that was already there. A second, independently generated universe at
// its own densest station measured -1,882 / -603k / 34.4 -> 51.3 fps.
//
// THE INVARIANT, at that station: of 1,579 scenery children inside the frustum,
// exactly 2 still submit a mesh under 4 px — both between 3.7 and 3.98 px, i.e.
// inside the come-back deadzone, which is what a deadzone is for — and ZERO are
// hidden above it. And the swap is not visible: nudging the boundary from 4.0
// to 4.6 px flips 55 bodies mesh -> impostor in one frame for a maximum 5x5
// local luminance step of 4.8/255, with not one pixel of the frame past 15.
//
// AND IT LETS GO. Approaching a gas cluster head-on: at 38,563 u (puffs 6.5 px)
// 7 of its 12 puffs are impostors; by 13,563 u (19.7 px) all twelve are meshes
// again, and they stay meshes all the way in. The far field is a far-field
// optimisation and it has no opinion about anything you can actually see.
//
// WHY A SUBTREE WITH A LIGHT IN IT IS NEVER HIDDEN. Toggling a light's
// visibility changes the renderer's light count, and a changed light count
// RECOMPILES every program in the scene. Doing that at the 6 Hz cull cadence
// would trade a draw-call win for a shader-compile stall — the worst possible
// exchange. `_scenLit` finds them once, at the same time as the radius, and
// they are exempt for good.
//
// WHY THE BRIGHTNESS COMES FROM THE MATERIAL AND NOT FROM A CLASS CONSTANT.
// The world tier could use one gain because a world is a world. Scenery spans a
// gas puff at 0.045 alpha and an opaque lit rock, and one constant applied to
// both would paint the nebula's own gas at twenty times its opacity — the
// white-orb flood again, wearing the far field's clothes. So a transparent
// child hands over its OWN alpha (literally how much of the frame it was
// contributing) and an opaque one falls back to a lit world's gain. Both then
// go through SCENERY_GAIN_K, the one number here that was CALIBRATED.
//
// THE CALIBRATION RIG, because a luminance claim is only worth its method.
// Two frames are rendered inside ONE synchronous turn — force the cull pass,
// renderer.render, gl.readPixels, flip the tier, force, render, read — so the
// game advances by nothing at all between them and the difference IS the tier.
// (Screenshots taken a second apart cannot do this: at a live station the frame
// churns by up to 57/255 per tile on its own, forty times the effect being
// measured.) Rig noise, the same setting read twice: max 2.6/255, zero pixels
// past 10. At SCENERY_GAIN_K = 1.45, over 705,600 pixels at the densest of 32
// swept stations:
//     mean frame luminance ....... -0.006/255   (the world tier's half: -0.003)
//     pixels differing by > 30 ....       74    (0.010 % — the world tier: 119)
// i.e. this tier is photometrically invisible in the mean and, at the peak,
// better behaved than the world tier it extends.
const SCENERY_GAIN_K = 1.45;        // measured, see above — not a taste value
// What an OPAQUE scenery surface is worth, before SCENERY_GAIN_K. This used to
// borrow IMPOSTOR_LIT_GAIN, which was fine while that was a flat 0.60 — but the
// world tier's gain now multiplies a measured 0..1 illumination and has been
// refitted to 4.5, and scenery does not take that term (see _impostorWrite). So
// the number scenery was actually calibrated against is written down here,
// where changing the world tier cannot move it by accident.
const SCENERY_OPAQUE_GAIN = 0.60;

// The groups this tier owns. NAMED, not sniffed: reaching into a scene child
// and rewriting its subtree's visibility is only safe when you can say out loud
// whose object it is, and a heuristic ("any group with lots of children") would
// happily have swallowed the player's own ship.
//   gas_cloud_cluster ......... this file, createNebulaGasCloud()
//   spaceDebris ............... this file, createAmbientSpaceDebris() (by .name)
//   outer_interstellar_system . outer-systems.js — read only, never edited
//   crystal_formation ......... cosmic-features.js — likewise
//   dark_matter ............... cosmic-features.js — likewise
// The value is a per-class trim on top of the material's own alpha, for the one
// case the material cannot answer: opaque scenery whose whole job is to be dim.
// Null-prototype on purpose: the key comes from `userData.type` or `.name`, i.e.
// from data, and on a plain object literal `IMPOSTOR_SCENERY['constructor']`
// answers with an inherited function. One scene child named 'toString' would
// then be admitted and multiply its impostor's brightness by a Function.
const IMPOSTOR_SCENERY = Object.assign(Object.create(null), {
    gas_cloud_cluster: 1.0,
    outer_interstellar_system: 1.0,
    spaceDebris: 0.5,          // ambient junk; it was never a light source
    crystal_formation: 1.0,
    dark_matter: 0.6           // the clue is in the name
});

let _scenRoots = null, _scenScanAt = -1e9, _scenSceneKids = -1, _scenHidden = 0;

// The scenery groups currently in the scene. Rescanned when scene.children
// changes length (a system built late, a cluster removed) and at worst every
// 1,200 frames otherwise, so this is not a per-pass walk of 3,000 objects.
function _sceneryRegistry() {
    if (typeof scene === 'undefined' || !scene || !scene.children) return null;
    const n = scene.children.length;
    if (_scenRoots && n === _scenSceneKids && (_cullFrameCount - _scenScanAt) < 1200) return _scenRoots;
    const out = [];
    for (let i = 0; i < n; i++) {
        const c = scene.children[i];
        if (!c || !c.children || !c.children.length) continue;
        const t = (c.userData && c.userData.type) || c.name;
        if (t && IMPOSTOR_SCENERY[t] !== undefined) out.push(c);
    }
    _scenRoots = out; _scenSceneKids = n; _scenScanAt = _cullFrameCount;
    return out;
}

// What one scenery child's silhouette is worth, in the same units the world
// tier's IMPOSTOR_LIT_GAIN is in — and whether it may be hidden at all.
// Cached: this walks a subtree's materials, and a puff's authored alpha is
// fixed at creation (game-core breathes it ±30 %, which is a wobble on a 3 px
// dot and is already a wobble on the mesh it replaces).
function _sceneryTrait(o) {
    const ud = o.userData;
    if (ud._scenTrait) return ud._scenTrait;
    let alpha = -1, lit = false;
    o.traverse(n => {
        if (n.isLight) { lit = true; return; }
        const m = n.material;
        if (!m || Array.isArray(m)) return;
        if (m.transparent || m.blending === THREE.AdditiveBlending) {
            // A ShaderMaterial's `opacity` means nothing unless the shader reads
            // it; the puff material proxies uOpacity onto it deliberately, so
            // ask the uniform first and the property second.
            const v = (m.uniforms && m.uniforms.uOpacity && typeof m.uniforms.uOpacity.value === 'number')
                ? m.uniforms.uOpacity.value : m.opacity;
            if (typeof v === 'number' && v > alpha) alpha = v;
        } else {
            alpha = Math.max(alpha, SCENERY_OPAQUE_GAIN);   // opaque: it is a surface
        }
    });
    if (!(alpha > 0)) alpha = SCENERY_OPAQUE_GAIN;
    const t = { gain: alpha * SCENERY_GAIN_K, keep: lit };
    ud._scenTrait = t;
    return t;
}

// One pass over the scenery, at the cull cadence, in the caller's pixels.
//   impR/impRBack — impostor threshold as a screen RADIUS, with its deadzone
//   floorPx       — the sub-pixel floor, same units: below this, nothing
function _sceneryPass(on, cx, cy, cz, pxPerAng, impR, impRBack, floorPx) {
    const roots = _sceneryRegistry();
    if (!roots || !roots.length) return;
    const f1 = floorPx * 3.5;
    let hidden = 0;
    for (let r = 0; r < roots.length; r++) {
        const root = roots[r];
        const kids = root.children;
        // OFF, or a group somebody else has hidden: give back everything this
        // tier took and touch nothing else. A hidden group's children are not
        // drawn either way, but leaving them flagged would strand them if the
        // group comes back while the tier is off.
        if (!on || !root.visible) {
            for (let i = 0; i < kids.length; i++) {
                const o = kids[i];
                if (o.userData._scenOff) { o.visible = true; o.userData._scenOff = false; }
            }
            continue;
        }
        const k = IMPOSTOR_SCENERY[(root.userData && root.userData.type) || root.name];
        // The group's matrices are one frame stale at worst (the renderer built
        // them last frame) — except immediately after a teleport, which is
        // exactly when this pass is forced to run early. Rebuild them.
        root.updateMatrixWorld(true);
        for (let i = 0; i < kids.length; i++) {
            const o = kids[i];
            if (!o || !o.position) continue;
            const trait = _sceneryTrait(o);
            if (trait.keep) continue;                 // holds a light: never ours
            const br = _cullBodyRadius(o);
            if (!(br > 0)) continue;                  // draws nothing measurable
            const e = o.matrixWorld.elements;
            const dx = e[12] - cx, dy = e[13] - cy, dz = e[14] - cz;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
            const rPx = br * pxPerAng / d;
            if (rPx >= (o.userData._scenOff ? impRBack : impR)) {
                if (o.userData._scenOff) { o.visible = true; o.userData._scenOff = false; }
                continue;
            }
            if (!o.userData._scenOff) { o.visible = false; o.userData._scenOff = true; }
            hidden++;
            if (rPx < floorPx) continue;              // under the floor: gone, as a world is
            const fade = rPx >= f1 ? 1 : (rPx - floorPx) / (f1 - floorPx);
            _impostorWrite(o, e[12], e[13], e[14], rPx, fade, trait.gain * k);
        }
    }
    _scenHidden = hidden;
}

if (typeof window !== 'undefined') {
    // Observability + levers, same convention as __qualityLock/__drawBudgetLock:
    //   window.__impostorLock = false   turn the tier off (bodies go back to
    //                                   meshes) — the A/B switch this was
    //                                   measured with, and the kill switch
    //   window.__impostorPx = <n>       move the boundary, in screen DIAMETER
    //   window.impostorDebug()          what the last pass decided
    //   window.__sceneryLock = false    turn OFF only the scenery half, so the
    //                                   two populations can be measured apart
    window.impostorDebug = function () {
        return {
            count: _impCount, cap: _impCap,
            drawn: !!(_impPoints && _impPoints.visible),
            enabled: window.__impostorLock !== false,
            scenery: window.__sceneryLock !== false,
            sceneryGroups: _scenRoots ? _scenRoots.length : 0,
            sceneryHidden: _scenHidden,
            px: (typeof window.__impostorPx === 'number') ? window.__impostorPx : CULL_IMPOSTOR_PX,
            // The illumination model, and the levers the calibration rig moves.
            lights: _impLightN, ambient: +_impAmbient.toFixed(3),
            tune: { lit: _impTune('lit', IMPOSTOR_LIT_GAIN), ceil: _impTune('ceil', IMPOSTOR_LIT_CEIL),
                    ph: _impTune('ph', IMPOSTOR_PHASE_KEEP), gain: _impTune('gain', IMPOSTOR_ILLUM_GAIN),
                    floor: _impTune('floor', IMPOSTOR_ILLUM_FLOOR),
                    ufloor: _impTune('ufloor', IMPOSTOR_UNLIT_FLOOR) }
        };
    };
    // HOW BIG IS THE BIGGEST THING ON SCREEN?
    //
    // The one number that says whether a frame has a subject in it. Returns the
    // projected DIAMETER, in CSS pixels, of the largest body currently inside
    // the frustum — the same measurement the impostor thresholds are expressed
    // in, so a claim about framing and a claim about culling are in one unit.
    // Black holes are excluded by default: they are set-piece scale by
    // construction and would mask the state of everything else.
    //
    // `noHeart` reports what the frame would have measured if the heart worlds
    // did not exist — the A/B baseline for that change, taken at the SAME
    // vantage in the SAME frame rather than across two page loads.
    //
    //   window.__celMeasure()               biggest world, as { name, px, dist }
    //   window.__celMeasure(true)           include black holes
    //   window.__celMeasure(false, true)    exclude heart worlds (the baseline)
    window.__celMeasure = function (withBH, noHeart) {
        if (typeof camera === 'undefined' || !camera) return null;
        const h = (typeof renderer !== 'undefined' && renderer && renderer.domElement &&
                   renderer.domElement.clientHeight) ? renderer.domElement.clientHeight : window.innerHeight;
        const pxPerAng = (h * 0.5) / Math.tan((camera.fov || 75) * Math.PI / 360);
        camera.updateMatrixWorld();
        const fr = new THREE.Frustum().setFromProjectionMatrix(
            new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        const sph = new THREE.Sphere();
        let best = null;
        const scan = (arr) => {
            if (!arr) return;
            for (let i = 0; i < arr.length; i++) {
                const o = arr[i];
                if (!o || !o.position || !o.visible || o.userData._distCulled) continue;
                const t = o.userData.type;
                if (!withBH && (t === 'blackhole' || t === 'black_hole' || o.userData.isBlackHole)) continue;
                if (noHeart && (o.userData.heartWorld ||
                    (o.userData.parentPlanet && o.userData.parentPlanet.userData.heartWorld))) continue;
                const r = _cullBodyRadius(o);
                if (!(r > 0)) continue;
                // FRUSTUM-TEST THE BODY, NOT THE ASSEMBLY. `r` spans the rings,
                // and a ringed giant's ring plane can clip the frustum from
                // 2,000 u off-screen while the world itself is nowhere in the
                // picture — which is how the first run of this measure credited
                // a 545 px body to a frame that only contained its rings.
                const gpF = o.geometry && o.geometry.parameters;
                const rF = (gpF && gpF.radius > 0) ? gpF.radius : r;
                _cullWorldPos(o);
                sph.center.set(_cullWP.x, _cullWP.y, _cullWP.z); sph.radius = rF;
                if (!fr.intersectsSphere(sph)) continue;
                const dx = _cullWP.x - camera.position.x,
                      dy = _cullWP.y - camera.position.y,
                      dz = _cullWP.z - camera.position.z;
                const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                // `px` is the whole assembly — rings, shells and all — which is
                // what the culler thresholds on. `bodyPx` is the bare sphere,
                // which is what "how big is that world" means to a player; on a
                // ringed giant the two differ by 3x. Rank on bodyPx: it is the
                // silhouette that reads as a world, and unlike the assembly it
                // stays finite when the camera is inside the ring plane.
                const gp = o.geometry && o.geometry.parameters;
                const br = (gp && gp.radius > 0) ? gp.radius : r;
                const bodyPx = 2 * br * pxPerAng / Math.max(d, 1);
                if (!best || bodyPx > best.bodyPx) {
                    best = { name: o.userData.name || '(unnamed)', type: t || '?',
                             bodyPx: Math.round(bodyPx * 10) / 10,
                             px: d > r ? Math.round((2 * r * pxPerAng / d) * 10) / 10 : -1,
                             dist: Math.round(d),
                             radius: Math.round(r), bodyRadius: Math.round(br), frameH: h };
                }
            }
        };
        scan(typeof planets !== 'undefined' ? planets : null);
        return best;
    };
    // FLY THE SHIP TO ONE STATION OF THE NEBULA BEAT.
    //
    // The demo's one "beauty" phase parks the ship near a nebula's centre and
    // aims it at a marker running around a 500 u circle at ~360 u/s while the
    // ship itself can only manage ~96 u/s (autopilot.js phaseOrbitNebulaPlanet:
    // ORBIT_RADIUS 500, _orbitAngle += 0.012, brake above speed 1.6). The ship
    // therefore does not lap anything — IT SPINS, sweeping its whole horizon
    // about once every nine seconds. So the framing that beat produces is a
    // grid: a few stations around the circle crossed with a full sweep of
    // headings, and this places the ship at one cell of it, dead in the water.
    //
    // It moves the SHIP, not just the camera — leave a beat between cells and
    // the game's own culling, LOD and impostor passes all run for real at that
    // vantage, so what gets measured is what the player would have seen.
    //
    //   window.__celStation({ k: 0, n: 6 })            station 0 of 6
    //   window.__celStation({ k: 0, n: 6, h: 3, hn: 12 })  ...heading 3 of 12
    //   window.__celStation({ index: 3, k: 2 })        ...of a specific nebula
    window.__celStation = function (opts) {
        const o = opts || {};
        if (typeof camera === 'undefined' || !camera ||
            typeof nebulaClouds === 'undefined' || !nebulaClouds || !nebulaClouds.length) return null;
        let neb;
        if (typeof o.index === 'number') neb = nebulaClouds[o.index];
        else {
            let bd = Infinity;
            for (let i = 0; i < nebulaClouds.length; i++) {
                const d = nebulaClouds[i].position.distanceToSquared(camera.position);
                if (d < bd) { bd = d; neb = nebulaClouds[i]; }
            }
        }
        if (!neb) return null;
        const c = neb.position;
        const R = o.radius === undefined ? 500 : o.radius;   // autopilot's ORBIT_RADIUS
        const N = o.n || 6;
        const a = ((o.k || 0) / N) * Math.PI * 2;
        camera.position.set(c.x + Math.cos(a) * R, c.y, c.z + Math.sin(a) * R);
        // Heading sweeps the full circle, because the real one does.
        const HN = o.hn || 12;
        const yaw = ((o.h || 0) / HN) * Math.PI * 2;
        camera.lookAt(camera.position.x + Math.cos(yaw) * 1000,
                      camera.position.y,
                      camera.position.z + Math.sin(yaw) * 1000);
        camera.updateMatrixWorld(true);
        // Dead in the water, or the ship drifts off the cell before the culling
        // cadence has caught up with where it now is.
        if (window.gameState && window.gameState.velocityVector) window.gameState.velocityVector.set(0, 0, 0);
        if (window.gameState) window.gameState.velocity = 0;
        let hearts = 0;
        if (typeof planets !== 'undefined' && planets) {
            for (let i = 0; i < planets.length; i++) if (planets[i].userData.heartWorld) hearts++;
        }
        return { nebula: (neb.userData && neb.userData.name) || '(unnamed)',
                 k: o.k || 0, n: N, h: o.h || 0, hn: HN, lapRadius: R,
                 nebulas: nebulaClouds.length, heartWorlds: hearts,
                 pos: camera.position.toArray().map(Math.round) };
    };
    // FLOATING ORIGIN: the buffer holds absolute world coords and is only
    // rewritten at the cull cadence, so a rebase between passes would smear the
    // entire far field for up to 10 frames. Subtract it in place instead — and
    // undo the shift applyWorldShift() has just applied to the Points object
    // itself as a scene child, which would otherwise subtract it a second time.
    window.__worldShiftHandlers = window.__worldShiftHandlers || [];
    window.__worldShiftHandlers.push(function (offset) {
        if (!offset) return;
        if (_impPoints) _impPoints.position.set(0, 0, 0);
        if (!_impPos || !_impCount) return;
        for (let i = 0; i < _impCount; i++) {
            _impPos[i * 3] -= offset.x; _impPos[i * 3 + 1] -= offset.y; _impPos[i * 3 + 2] -= offset.z;
        }
        if (_impGeo) _impGeo.attributes.position.needsUpdate = true;
    });
}

// Restate this pass's decision for the bodies the caller just force-showed.
// Only bodies we hid ourselves are touched, and only if something put them back.
function _cullReassert() {
    for (let i = 0; i < _cullStomped.length; i++) {
        const o = _cullStomped[i];
        if (o.userData._distCulled && o.visible) o.visible = false;
    }
}

// Wrap a game-core pass that force-shows moons. Both are top-level function
// declarations in a classic script, so the global property IS the binding their
// own caller resolves — assigning here redirects the call inside animate().
// Idempotent, and it retries until game-core has actually loaded.
function _wrapMoonStomper(name) {
    const base = window[name];
    if (typeof base !== 'function') return false;   // game-core not loaded yet
    if (base.__cullGuard) return true;
    const guarded = function () {
        const out = base.apply(this, arguments);
        _cullReassert();
        return out;
    };
    guarded.__cullGuard = true;
    window[name] = guarded;
    return true;
}

// updatePlanetOrbits() is the one that matters — it runs every frame and last
// in animate() before the render, so it gets the final word unless we take it.
// updateActivePlanets() is wrapped too so the flag is never even transiently
// wrong for a reader between the two.
function _installMoonVisibilityGuards() {
    if (_cullGuardsInstalled === 2 || typeof window === 'undefined') return;
    let n = 0;
    if (_wrapMoonStomper('updateActivePlanets')) n++;
    if (_wrapMoonStomper('updatePlanetOrbits')) n++;
    _cullGuardsInstalled = n;
}

// ═══════════════════════════════════════════════════════════════════════════
// LIGHT BUDGET — the bill the pixel controllers were paying for
// ═══════════════════════════════════════════════════════════════════════════
// Every procedural star ships its own PointLight (outer-systems.js:326/378/435/
// 626), plus supernovae and solar storms (cosmic-features.js:180/698) and the
// hero suns here. In a populated demo that is ~63 PointLights ALIVE AT ONCE —
// and three.js does not care where they are: `projectObject` pushes every
// visible light into the frame's light list, so NUM_POINT_LIGHTS is compiled
// into EVERY lit fragment shader and all 63 are evaluated per pixel, per frame.
//
// 62 of those 63 are further from the camera than their OWN authored
// `light.distance`. That is not "dim" — it is arithmetically zero: for
// cutoffDistance > 0 and decay > 0 the r128 falloff is
// `pow(saturate(1 - d/cutoff), decay)`, which is exactly 0.0 at and beyond the
// cutoff (the physically-correct path multiplies by `pow2(saturate(1 - pow4(
// d/cutoff)))`, also exactly 0 there). So the loop burns ~60 light evaluations
// per lit pixel to add nothing.
//
// The gate is therefore the light's own promise. But it has to be read the
// right way round: a light illuminates OBJECTS, not the camera. "Camera further
// than light.distance" is NOT a safe test — a star 20,000u away with an 8,000u
// reach is still the only thing lighting its own planets, which are 20,000u
// away too and right there on screen. The safe form of the same promise is the
// light's INFLUENCE SPHERE (centre = light, radius = light.distance, outside
// which its contribution is exactly zero): if that sphere does not intersect
// the view frustum, no drawn pixel can contain one photon of it. That is a
// provable no-op, not a tolerance — and it is what is implemented below.
//
// The frustum is WIDENED (LIGHT_FOV_SLACK) because this pass runs at 6 Hz: a
// fast turn can reveal up to ~10 frames' worth of new sky before the next pass,
// and the slack keeps the lights for that sky already switched on when it
// arrives. Hysteresis (LIGHT_OFF_SLACK) keeps a light on the boundary from
// strobing between passes.
//
// The frustum alone is not the whole answer: a star 70,000u away sits in front
// of you, and its 8,000u sphere clips the frustum, but that only matters if
// something DRAWN is standing in it. So the pass asks the sharper question —
// "does this light reach anything the culler decided to draw as a mesh?" — and
// it can ask it for almost nothing, because the pass that just ran KNOWS that
// set: the impostor tier reduced 905 on-screen worlds to ~30 meshes, and the
// cull walk records each survivor's world centre and true radius on its way
// past (`_litAdd`). A light with no drawn geometry inside its own cutoff cannot
// contribute to any pixel by definition — impostors are unlit point sprites,
// so they cannot receive light either. Measured on the live demo-combat
// vantage this is what takes the on-set from 36-48 to ~10 of 61.
//
// The player's own neighbourhood is not in that set (ship, enemies, stations,
// debris and their effects are drawn from elsewhere), so a bubble around the
// camera counts as lit: any light reaching within LIGHT_PLAYER_BUBBLE of the
// camera stays on unconditionally.
//
// TWO CARE POINTS, both handled below:
//  * SHADER COUNT CHURN. NUM_POINT_LIGHTS is a #define; every distinct value is
//    a distinct program variant. Flying through a cluster would otherwise walk
//    the count 4,5,6,7… and mint a variant of every lit material for each. So
//    the enabled set is padded up to a multiple of LIGHT_BUCKET with the
//    NEAREST out-of-range lights — they contribute exactly zero (they are past
//    their own cutoff), so the image is unchanged, but the count only ever
//    lands on 0/4/8/12… and the variant set stays tiny.
//  * OWNERSHIP. Other systems fade their own lights out (a dying supernova).
//    We only ever re-show a light WE hid (`__lgOff`), so this pass can never
//    resurrect something another system deliberately switched off.
// Floating origin needs no handler here: every distance is recomputed from live
// world positions at each pass, so a rebase is invisible to it.
const LIGHT_BUCKET = 4;              // quantum for NUM_POINT_LIGHTS
const LIGHT_RESCAN_PASSES = 30;      // ~5 s at the 6 Hz cull cadence
const LIGHT_FOV_SLACK = 2.0;         // frustum widened this much for turn slack
const LIGHT_OFF_SLACK = 1.3;         // an ON light needs to miss by this to go off
const LIGHT_PLAYER_BUBBLE = 4000;    // ship/enemies/stations/FX live in here
const _lights = [];
const _lightFrustum = (typeof THREE !== 'undefined') ? new THREE.Frustum() : null;
const _lightPM = (typeof THREE !== 'undefined') ? new THREE.Matrix4() : null;
const _lightSphere = (typeof THREE !== 'undefined') ? new THREE.Sphere() : null;
let _lightWideCam = null;
let _lightScanPass = -1e9;
let _lightSceneN = -1;
const _lightPad = [];                // scratch: out-of-range lights, nearest first
const _lightStats = { total: 0, managed: 0, on: 0, padded: 0, off: 0, exempt: 0,
                      scans: 0, scanMs: 0, lastMs: 0, passMs: 0 };

// THE LIT SET — every body the cull pass just decided to DRAW AS A MESH, as
// (centre, radius) in absolute world units. Written during the walk that is
// already computing exactly these two numbers, so it costs a store; read only
// by the light pass at the end of the same tick. Float64 because these are
// absolute galaxy coordinates, where float32 rounding is tens of units.
const LIT_MAX = 8192;
const _litBuf = new Float64Array(LIT_MAX * 4);
let _litN = 0, _litOverflow = false;
function _litReset() { _litN = 0; _litOverflow = false; }
function _litAdd(x, y, z, r) {
    if (_litN >= LIT_MAX) { _litOverflow = true; return; }
    const i = _litN * 4;
    _litBuf[i] = x; _litBuf[i + 1] = y; _litBuf[i + 2] = z; _litBuf[i + 3] = r;
    _litN++;
}
// Is any drawn body inside this sphere? Early-outs on the first hit.
function _litAny(x, y, z, r) {
    for (let i = 0, j = 0; i < _litN; i++, j += 4) {
        const dx = _litBuf[j] - x, dy = _litBuf[j + 1] - y, dz = _litBuf[j + 2] - z;
        const reach = r + _litBuf[j + 3];
        if (dx * dx + dy * dy + dz * dz <= reach * reach) return true;
    }
    return false;
}

// A light is ours to gate only if its own numbers make the cutoff meaningful:
// distance 0 means "reaches forever", and decay 0 makes the shader ignore the
// cutoff entirely (`return 1.0`), so in both cases `distance` is not a promise
// of zero contribution and the light is left alone.
function _lightGateable(l) {
    return l.distance > 0 && l.decay > 0;
}

// Lights are added in five different files, some to the scene and some as
// children of a star group, so discovery is a traverse — but a rare one: only
// when the scene's child count changes (every `scene.add` of a light lands
// there) or once every ~5 s as a backstop for lights parented deeper.
function _lightRescan() {
    const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    _lights.length = 0;
    scene.traverse(function (o) {
        if (!o.isPointLight) return;
        if (o.userData.__lgSeen !== true) {
            o.userData.__lgSeen = true;
            // A light created this frame has an identity matrixWorld until the
            // next render, which would read as "0,0,0 → miles away → hide it".
            if (o.parent && !o.parent.isScene) o.updateWorldMatrix(true, false);
        }
        _lights.push(o);
    });
    _lightStats.scans++;
    if (t0) { _lightStats.lastMs = performance.now() - t0; _lightStats.scanMs += _lightStats.lastMs; }
}

// The test volume: the live camera's frustum, widened by LIGHT_FOV_SLACK so the
// 6 Hz cadence cannot be out-turned. Falls back to the camera's own frustum for
// anything that isn't a perspective camera.
function _lightBuildFrustum() {
    if (!_lightFrustum || !_lightPM) return false;
    let pm = camera.projectionMatrix;
    if (camera.isPerspectiveCamera && camera.fov > 0 && LIGHT_FOV_SLACK > 1) {
        if (!_lightWideCam) _lightWideCam = new THREE.PerspectiveCamera();
        const c = _lightWideCam;
        c.fov = Math.min(170, camera.fov * LIGHT_FOV_SLACK);
        c.aspect = camera.aspect; c.near = camera.near; c.far = camera.far;
        c.updateProjectionMatrix();
        pm = c.projectionMatrix;
    }
    _lightPM.multiplyMatrices(pm, camera.matrixWorldInverse);
    _lightFrustum.setFromProjectionMatrix(_lightPM);
    return true;
}

function _lightRestoreAll() {
    for (let i = 0; i < _lights.length; i++) {
        const l = _lights[i];
        if (l.userData.__lgOff) { l.visible = true; l.userData.__lgOff = false; }
    }
    _lightStats.on = _lightStats.managed; _lightStats.off = 0; _lightStats.padded = 0;
}

function _lightBudgetPass(cx, cy, cz) {
    if (typeof scene === 'undefined' || !scene) return;
    const _t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    if (_cullFrameCount - _lightScanPass >= LIGHT_RESCAN_PASSES * 10 ||
        scene.children.length !== _lightSceneN) {
        _lightScanPass = _cullFrameCount;
        _lightSceneN = scene.children.length;
        _lightRescan();
    }
    _lightStats.total = _lights.length;
    if (typeof window !== 'undefined' && window.__lightBudgetLock === false) {
        _lightStats.managed = _lights.length;
        _lightRestoreAll();
        return;
    }

    if (!_lightBuildFrustum()) return;

    _lightPad.length = 0;
    let need = 0, managed = 0, exempt = 0;
    for (let i = 0; i < _lights.length; i++) {
        const l = _lights[i];
        if (!l.parent) { l.userData.__lgWant = false; continue; }   // removed from the graph
        if (!_lightGateable(l)) { l.userData.__lgWant = true; exempt++; continue; }
        managed++;
        _cullWorldPos(l);
        const r = l.distance;
        const dx = _cullWP.x - cx, dy = _cullWP.y - cy, dz = _cullWP.z - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        // Hysteresis lives in the RADIUS, so a light that is already on has to
        // miss by a margin before it goes off and nothing can strobe on a
        // boundary. Every test below uses this one inflated reach.
        const rr = l.visible ? r * LIGHT_OFF_SLACK : r;
        // 1. The player's neighbourhood — ship, enemies, stations, FX.
        const bubble = rr + LIGHT_PLAYER_BUBBLE;
        let want = d2 <= bubble * bubble;
        if (!want) {
            // 2. Can its influence sphere reach any drawn pixel at all?
            _lightSphere.center.set(_cullWP.x, _cullWP.y, _cullWP.z);
            _lightSphere.radius = rr;
            want = _lightFrustum.intersectsSphere(_lightSphere) &&
                // 3. …and is anything the culler kept as a MESH standing in it?
                (_litOverflow || _litAny(_cullWP.x, _cullWP.y, _cullWP.z, rr));
        }
        if (want) { l.userData.__lgWant = true; need++; }
        else {
            l.userData.__lgWant = false;
            // Padding picks the nearest zero-contribution lights first.
            l.userData.__lgExcess = d2 / (r * r);
            _lightPad.push(l);
        }
    }

    // Pad the count up to the next bucket with the nearest zero-contribution
    // lights, so NUM_POINT_LIGHTS lands on a multiple of LIGHT_BUCKET.
    const target = Math.ceil(need / LIGHT_BUCKET) * LIGHT_BUCKET;
    let pad = Math.min(target - need, _lightPad.length);
    _lightStats.padded = pad;
    if (pad > 0) {
        _lightPad.sort(function (a, b) { return a.userData.__lgExcess - b.userData.__lgExcess; });
        for (let i = 0; i < pad; i++) _lightPad[i].userData.__lgWant = true;
    }

    let on = 0, off = 0;
    for (let i = 0; i < _lights.length; i++) {
        const l = _lights[i];
        if (l.userData.__lgWant) {
            // Only ever un-hide what THIS pass hid — see the ownership note.
            if (l.userData.__lgOff) { l.visible = true; l.userData.__lgOff = false; }
            if (l.visible) on++;
        } else if (l.visible) {
            l.visible = false; l.userData.__lgOff = true; off++;
        } else if (l.userData.__lgOff) off++;
    }
    _lightStats.managed = managed; _lightStats.exempt = exempt;
    _lightStats.on = on; _lightStats.off = off;
    if (_t0) _lightStats.passMs = performance.now() - _t0;
}

if (typeof window !== 'undefined') {
    // Measurement hook: `__lightBudgetLock = false` restores every light this
    // pass hid on the next cull tick, so the gate can be A/B'd live without a
    // reload. Anything else (undefined/true) is the shipping behaviour.
    window.__lightBudgetLock = window.__lightBudgetLock !== false;
    window.lightBudgetDebug = function () {
        const out = { total: _lightStats.total, managed: _lightStats.managed,
                      exempt: _lightStats.exempt, on: _lightStats.on,
                      padded: _lightStats.padded, off: _lightStats.off,
                      lit: _litN, litOverflow: _litOverflow, passMs: +_lightStats.passMs.toFixed(2),
                      scans: _lightStats.scans, lastScanMs: +_lightStats.lastMs.toFixed(2),
                      lock: window.__lightBudgetLock !== false, lights: [] };
        const cp = (typeof camera !== 'undefined' && camera) ? camera.position : null;
        for (let i = 0; i < _lights.length && out.lights.length < 200; i++) {
            const l = _lights[i];
            _cullWorldPos(l);
            out.lights.push({
                name: l.name || (l.parent && l.parent.name) || '(anon)',
                d: cp ? Math.round(Math.sqrt((_cullWP.x - cp.x) * (_cullWP.x - cp.x) +
                                             (_cullWP.y - cp.y) * (_cullWP.y - cp.y) +
                                             (_cullWP.z - cp.z) * (_cullWP.z - cp.z))) : -1,
                range: l.distance, decay: l.decay, visible: l.visible,
                gated: !!l.userData.__lgOff
            });
        }
        return out;
    };
}

function updateDistanceCulling() {
    if (typeof camera === 'undefined' || !camera) return;
    // Throttle: visibility doesn't need per-frame precision. Every 10 frames
    // is ~6x/sec at 60fps, far faster than anything pops into meaningful view —
    // EXCEPT when the camera teleports, which no amount of drift budget covers.
    _cullFrameCount++;
    const jdx = camera.position.x - _cullPrevCam.x,
          jdy = camera.position.y - _cullPrevCam.y,
          jdz = camera.position.z - _cullPrevCam.z;
    const jumped = !(jdx * jdx + jdy * jdy + jdz * jdz < _cullJumpDist2);
    // A jump may re-decide at once, but never more than every other frame, so a
    // rebase storm cannot turn this into a per-frame full sweep.
    const forced = jumped && (_cullFrameCount - _cullLastPassFrame) >= 2;
    if (!forced && _cullFrameCount % 10 !== 0) return;
    _cullLastPassFrame = _cullFrameCount;
    _cullPrevCam.x = camera.position.x;
    _cullPrevCam.y = camera.position.y;
    _cullPrevCam.z = camera.position.z;
    _cullStomped.length = 0;
    _installMoonVisibilityGuards();

    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;

    // ADAPTIVE QUALITY: the quality controller shrinks cull ranges at lower
    // tiers (distance-LOD) — dense galaxy cores are draw-call bound and the
    // farthest objects are the cheapest look-loss to shed.
    const _cullScale = (typeof window !== 'undefined' && window.__quality)
        ? (window.__quality.TIERS[window.__quality.tier].cullScale || 1) : 1;

    // The tier's cull budget buys ANGULAR THRESHOLD, not range (see the
    // "THE DISTANCE GATE IS NOT A SECOND OPINION" note above): at cullScale
    // 0.85 the sub-pixel floor moves from ~0.6px to ~0.7px, at 0.6 to ~1.0px.
    // Same lever, same direction, applied where it costs the least look.
    const _cullAng = _cullScale > 0 ? 1 / _cullScale : 1;

    // IMPOSTOR BAND, in real screen pixels off the live camera. `_pxPerAng`
    // converts a silhouette's angular ratio (radius / distance) into a CSS-pixel
    // screen RADIUS, so every threshold below is a number you can go and measure
    // in a screenshot rather than a constant that only means 4px at one fov and
    // one window size. See the impostor-tier note above.
    const _cvH = (typeof renderer !== 'undefined' && renderer && renderer.domElement &&
                  renderer.domElement.clientHeight)
        ? renderer.domElement.clientHeight
        : (typeof window !== 'undefined' ? window.innerHeight : 900);
    const _fov = (camera.isPerspectiveCamera && camera.fov > 0) ? camera.fov : 75;
    const _pxPerAng = (_cvH * 0.5) / Math.tan(_fov * Math.PI / 360);
    const _impOn = (typeof window === 'undefined' || window.__impostorLock !== false);
    const _impPxLim = (typeof window !== 'undefined' && typeof window.__impostorPx === 'number')
        ? window.__impostorPx : CULL_IMPOSTOR_PX;
    // The tier moves this on the SAME lever it moves the sub-pixel floor on, so
    // a struggling machine sheds resolvable detail from the smallest end inward
    // instead of amputating the far sky (the lesson of the range-gate rewrite).
    const _impR = _impPxLim * 0.5 * _cullAng;      // threshold as a screen RADIUS
    const _impRBack = _impR * CULL_IMPOSTOR_BACK_K;
    _impCount = 0;
    _impPassBegin(cx, cy, cz);   // eye + light table for the illumination term
    _litReset();     // rebuilt by this pass, read by _lightBudgetPass at the end

    const cullArray = (arr, range, angular) => {
        if (typeof arr === 'undefined' || !arr || !arr.length) return;
        range *= _cullScale;
        const r2 = range * range;
        for (let i = 0; i < arr.length; i++) {
            const o = arr[i];
            if (!o || !o.position) continue;
            _cullWorldPos(o);
            const dx = _cullWP.x - cx, dy = _cullWP.y - cy, dz = _cullWP.z - cz;
            const d2 = dx * dx + dy * dy + dz * dz;
            const br = angular ? _cullBodyRadius(o) : 0;
            let inRange;
            if (br > 0) {
                // ANGULAR IS THE WHOLE RULE. No authored range gets a vote on a
                // body that has a silhouette — see the note above for why.
                //   * NEAR PROMISE — inside CULL_NEAR_RADII it is visible, full
                //     stop, even if the angular maths would round it away.
                //   * FAR IS ANGULAR — below a sub-pixel silhouette it is culled
                //     on its own account, with hysteresis so a body drifting on
                //     the boundary cannot strobe.
                const near = CULL_NEAR_RADII * br;
                let wantImp = false;
                if (d2 <= near * near) {
                    inRange = true;
                } else {
                    const lim = (o.userData._distCulled ? CULL_SUBPIXEL_BACK : CULL_SUBPIXEL_ANG) * _cullAng;
                    inRange = !(br * br < lim * lim * d2);
                    // IMPOSTOR TIER — above the floor but under a few pixels
                    // wide, this body is a coloured dot to the player and an
                    // 800-triangle mesh plus its rings to the GPU. Hand it to
                    // the shared point cloud and submit nothing.
                    if (inRange && _impOn) {
                        const rPx = br * _pxPerAng / Math.sqrt(d2);
                        if (rPx < (o.userData._impostorOn ? _impRBack : _impR)) {
                            // Dissolve across the last stretch before the floor
                            // so the far end of the band fades out instead of
                            // blinking out — the one seam the old binary switch
                            // left on screen.
                            const f0 = lim * _pxPerAng, f1 = f0 * 3.5;
                            const fade = rPx >= f1 ? 1 : Math.max(0, (rPx - f0) / (f1 - f0));
                            _impostorWrite(o, _cullWP.x, _cullWP.y, _cullWP.z, rPx, fade);
                            wantImp = true;
                            inRange = false;   // no mesh, no rings, no shells
                        }
                    }
                }
                o.userData._impostorOn = wantImp;
            } else {
                // No silhouette to measure at all — with the subtree measure
                // above this is now only reachable by an entry that draws no
                // geometry anywhere in itself (an empty Group placeholder), and
                // by the non-angular arrays below (belts, comets, ships) that
                // never ask for a radius. For those the authored range rules.
                inRange = d2 <= r2;
            }
            // The lit set: this body will be submitted as geometry, so it is a
            // surface a light can actually land on. (Impostors never get here —
            // point sprites take no lighting.) See the LIGHT BUDGET note.
            if (inRange) _litAdd(_cullWP.x, _cullWP.y, _cullWP.z, br || _cullBodyRadius(o));
            if (!inRange) {
                if (o.visible) { o.visible = false; o.userData._distCulled = true; }
                // Moons are the bodies game-core force-shows every frame.
                if (o.userData._distCulled &&
                    (o.userData.type === 'moon' || o.userData.parentPlanet)) _cullStomped.push(o);
            } else if (o.userData._distCulled) {
                o.visible = true; o.userData._distCulled = false;
            }
        }
    };

    // Worlds (and only worlds) get the angular rules — they are the bodies with
    // a meaningful silhouette, the ones you fly up to, and the ones whose moons
    // hang off them as children. The number below is a FALLBACK, reached only by
    // entries in `planets` whose geometry reports no radius at all; every real
    // world is decided by `br*br < lim*lim*d2` and nothing else.
    cullArray(typeof planets !== 'undefined' ? planets : null, 30000, true);
    // Cosmetic/static content: range sits just beyond the ~25k nebula-cloud
    // fade so a belt never winks out while its system's cloud is still drawn.
    cullArray(typeof asteroidBelts !== 'undefined' ? asteroidBelts : null, 30000);
    cullArray(typeof interstellarAsteroids !== 'undefined' ? interstellarAsteroids : null, 30000);
    // Dense-galaxy-field asteroids: hundreds per field, so cull them much
    // tighter (8,000u) — they only need to render when you're actually IN
    // that galaxy fighting, not as specks from 25k away. Runs AFTER the 30k
    // pass above (which would otherwise keep them visible out to 30k).
    if (typeof interstellarAsteroids !== 'undefined') {
        const dr2 = (8000 * _cullScale) * (8000 * _cullScale);
        for (let i = 0; i < interstellarAsteroids.length; i++) {
            const a = interstellarAsteroids[i];
            if (!a || !a.userData || !a.userData.denseField || !a.position) continue;
            _cullWorldPos(a);
            const dx = _cullWP.x - cx, dy = _cullWP.y - cy, dz = _cullWP.z - cz;
            const far = (dx * dx + dy * dy + dz * dz) > dr2;
            if (far) { if (a.visible) { a.visible = false; a.userData._distCulled = true; } }
            else if (a.userData._distCulled) { a.visible = true; a.userData._distCulled = false; }
            // NOTE (lit set): this pass runs after the 30k one, so a dense-field
            // rock it re-hides is still in the lit set for this tick. That can
            // only keep a light ON that could have gone off — the safe side of
            // the only error this gate is allowed to make.
        }
    }
    cullArray(typeof comets !== 'undefined' ? comets : null, 35000);
    // Trading ships read as a single dot well before this range.
    cullArray(typeof tradingShips !== 'undefined' ? tradingShips : null, 18000);

    // SCENERY, one level down — the 87 % of the frame that was never in an
    // array for anyone to walk. Same thresholds, same pixels, same cloud.
    _sceneryPass(_impOn && (typeof window === 'undefined' || window.__sceneryLock !== false),
                 cx, cy, cz, _pxPerAng, _impR, _impRBack,
                 CULL_SUBPIXEL_ANG * _cullAng * _pxPerAng);

    // Publish the far field the pass just decided: one upload, one draw call.
    _impostorFlush();

    // Same cadence, same camera, same idea one tier down the pipeline: a light
    // outside its own falloff radius is compiled into every lit shader and
    // evaluated per pixel to add exactly zero. See the LIGHT BUDGET note above.
    _lightBudgetPass(cx, cy, cz);
}
window.updateDistanceCulling = updateDistanceCulling;

// Shared instrument for the culling invariant. Counts every world that wears a
// planet-presence program, bucketed by how many of ITS OWN RADII away it is,
// and reports both the raw `.visible` flag and whether it is actually DRAWN
// (a child whose parent is culled is not drawn no matter what its flag says —
// that difference is what made the first census of this bug read backwards).
//
// Invariants, all reported: `nearHidden` must be 0 (nothing inside 40 radii is
// ever culled) and `farDrawn` must be 0 (nothing sub-pixel is ever submitted).
window.cullDebug = function () {
    return {
        frame: _cullFrameCount, lastPass: _cullLastPassFrame,
        guardsInstalled: _cullGuardsInstalled, stomped: _cullStomped.length
    };
};
window.cullCensus = function (bands) {
    const arr = (typeof planets !== 'undefined' && planets) ? planets : [];
    const cp = camera.position;
    const edges = bands || [5, 20, 40, 100, 1000, Infinity];
    const out = edges.map(e => ({ band: e, n: 0, flag: 0, drawn: 0 }));
    let nearHidden = 0, farDrawn = 0, total = 0;
    for (let i = 0; i < arr.length; i++) {
        const o = arr[i];
        if (!o || !o.material || !o.material.uniforms) continue;
        if (o.material.uniforms.uCity === undefined &&
            o.material.uniforms.uNightGlow === undefined) continue;
        const r = _cullBodyRadius(o);
        if (!(r > 0)) continue;
        _cullWorldPos(o);
        const d = Math.sqrt((_cullWP.x - cp.x) * (_cullWP.x - cp.x) +
                            (_cullWP.y - cp.y) * (_cullWP.y - cp.y) +
                            (_cullWP.z - cp.z) * (_cullWP.z - cp.z));
        let drawn = true;
        for (let p = o; p; p = p.parent) { if (!p.visible) { drawn = false; break; } }
        const radii = d / r;
        total++;
        if (radii < CULL_NEAR_RADII && !drawn) nearHidden++;
        if (r / d < CULL_SUBPIXEL_ANG && drawn) farDrawn++;
        for (let b = 0; b < edges.length; b++) {
            if (radii < edges[b]) {
                out[b].n++; if (o.visible) out[b].flag++; if (drawn) out[b].drawn++;
                break;
            }
        }
    }
    return { total, bands: out, nearHidden, farDrawn };
};

// THE ACCEPTANCE TEST FOR THIS PASS, IN THE ONLY UNIT THAT SETTLES IT: PIXELS.
// cullCensus() above only counts bodies wearing a planet-presence shader, which
// is precisely the set that does NOT include a galaxy core — that blind spot is
// how a 79x radius error survived a clean census. This one walks every entry in
// `planets`, converts each body's measured silhouette to a screen radius with
// the live camera, and reports the invariant that matters:
//
//     deleted[] must be empty for anything at or above `minPx`.
//
// A body is "deleted" only if this cull hid it (_distCulled) or an ancestor is
// hidden — a body some other system turned off is not ours to answer for.
// Returns the offenders, biggest first, so a failure names itself.
window.cullPixelCensus = function (minPx) {
    const arr = (typeof planets !== 'undefined' && planets) ? planets : [];
    const cp = camera.position;
    const h = (typeof renderer !== 'undefined' && renderer && renderer.domElement)
        ? renderer.domElement.clientHeight : 900;
    const k = (h / 2) / Math.tan(camera.fov * Math.PI / 360);  // px per radian-ish
    const floor = (minPx === undefined) ? 1 : minPx;
    const deleted = [];
    let total = 0, drawn = 0, big = 0, bigDrawn = 0, sub = 0, subDrawn = 0;
    for (let i = 0; i < arr.length; i++) {
        const o = arr[i];
        if (!o || !o.position) continue;
        const r = _cullBodyRadius(o);
        if (!(r > 0)) continue;
        _cullWorldPos(o);
        const d = Math.sqrt((_cullWP.x - cp.x) * (_cullWP.x - cp.x) +
                            (_cullWP.y - cp.y) * (_cullWP.y - cp.y) +
                            (_cullWP.z - cp.z) * (_cullWP.z - cp.z)) || 1e-6;
        let isDrawn = true;
        for (let p = o; p; p = p.parent) { if (!p.visible) { isDrawn = false; break; } }
        const px = k * r / d;
        total++; if (isDrawn) drawn++;
        if (px >= floor) {
            big++; if (isDrawn) bigDrawn++;
            else deleted.push({
                name: o.userData.name, type: o.userData.type,
                px: +px.toFixed(1), dist: Math.round(d), r: Math.round(r),
                mine: !!o.userData._distCulled
            });
        } else { sub++; if (isDrawn) subDrawn++; }
    }
    deleted.sort((a, b) => b.px - a.px);
    return {
        viewport: { h, fov: +camera.fov.toFixed(1), pxPerRad: +k.toFixed(1) },
        minPx: floor, total, drawn,
        atOrAbove: big, atOrAboveDrawn: bigDrawn, deletedCount: deleted.length,
        below: sub, belowDrawn: subDrawn,
        deleted: deleted.slice(0, 20)
    };
};

// =============================================================================
// ORBIT LINE VISIBILITY - Show orbits when near nebulas or black holes
// =============================================================================
// Frame counter for throttling
let _orbitVisibilityFrameCount = 0;

function updateOrbitLineVisibility() {
    // PERF: Only check every 30 frames instead of every frame
    _orbitVisibilityFrameCount++;
    if (_orbitVisibilityFrameCount % 30 !== 0) return;
    
    if (typeof orbitLines === 'undefined' || orbitLines.length === 0) return;
    if (typeof camera === 'undefined') return;
    
    const nebulaShowDistance = 3000; // Show orbits within 3000 units of nebula
    const blackHoleShowDistance = 5000; // Show orbits within 5000 units of black hole
    
    // Check proximity to nebulas
    let nearNebula = false;
    let nearestNebulaDistance = Infinity;
    
    if (typeof nebulaClouds !== 'undefined' && nebulaClouds.length > 0) {
        nebulaClouds.forEach(nebula => {
            if (nebula && nebula.position) {
                const distance = camera.position.distanceTo(nebula.position);
                if (distance < nearestNebulaDistance) {
                    nearestNebulaDistance = distance;
                }
                if (distance < nebulaShowDistance) {
                    nearNebula = true;
                }
            }
        });
    }
    
    // Check proximity to black holes (galaxy cores)
    let nearBlackHole = false;
    if (typeof galaxyTypes !== 'undefined') {
        for (let g = 0; g < galaxyTypes.length; g++) {
            const galaxyCenter = getGalaxy3DPosition ? getGalaxy3DPosition(g) : null;
            if (galaxyCenter) {
                const distance = camera.position.distanceTo(galaxyCenter);
                if (distance < blackHoleShowDistance) {
                    nearBlackHole = true;
                    break;
                }
            }
        }
    }
    
    // Update orbit visibility
    const shouldShowOrbits = nearNebula || nearBlackHole;

    // The player's Orbits toggle is the authority on whether these draw at
    // all; everything below only grades HOW they draw. `orbitLinesVisible` is
    // a game-core `let`, so read it directly and fall back to shown.
    const toggleOn = (typeof orbitLinesVisible !== 'undefined') ? orbitLinesVisible : true;

    orbitLines.forEach(line => {
        if (!line || !line.material) return;
        if (!line.userData) line.userData = {};

        // THE PLAYER'S TOGGLE WINS, ALWAYS. There are two independent orbit
        // switches: game-core's `orbitLinesVisible` (keyboard) and the HUD
        // "Orbits" button, which keeps its OWN local flag and writes
        // line.visible directly. Grading visibility here without watching for
        // that would silently switch the HUD button back on within 30 frames.
        // So: any visibility change we did not make is taken as the player's
        // word and latched.
        if (line.userData._orbitLastVis !== undefined && line.visible !== line.userData._orbitLastVis) {
            line.userData._orbitManualOff = !line.visible;
        }
        if (!toggleOn || line.userData._orbitManualOff) {
            line.visible = false;
            line.userData._orbitLastVis = false;
            return;
        }

        // ONE-TIME POLISH. These are RingGeometry ribbons 4 units wide with a
        // flat 0.3-opacity MeshBasicMaterial in the transparent queue. Seen
        // near edge-on — which is most of the time, since they all lie in the
        // ecliptic the player flies along — a 4-unit ribbon lands on well
        // under one pixel and turns into the crawling, sparkling 1px line the
        // sky critic measured. Additive blending makes a sub-pixel sliver
        // dim rather than a hard-edged bar (partial coverage now REDUCES the
        // contribution instead of drawing a saturated fragment), depthWrite
        // was already off, and fog:false stops distant orbits picking up the
        // horizon violet and turning into grey wire.
        if (!line.userData._orbitPolished) {
            line.userData._orbitPolished = true;
            line.userData._orbitBaseOpacity = line.material.opacity || 0.3;
            line.material.blending = THREE.AdditiveBlending;
            line.material.depthWrite = false;
            line.material.fog = false;
            line.material.needsUpdate = true;
            line.renderOrder = 2;
        }

        // createOrbitLines() puts the ring AT the system centre and never
        // writes userData.systemCenter — so the old body of this function,
        // which gated everything on `line.userData.systemCenter`, matched
        // nothing and no orbit line has ever faded. Use the ring's own
        // position, which IS the system centre.
        const systemDistance = camera.position.distanceTo(line.position);
        const r = line.userData.orbitRadius || 1;

        // 1. DISTANCE. Fade an orbit out once the camera is far enough that
        //    the whole ring is a small feature — beyond that it is a bright
        //    hairline scribble over the starfield and nothing else.
        let op = 1 - _gsmooth(r * 5.0, r * 11.0, systemDistance);

        // 2. VIEW ANGLE. The ring's plane normal is world +Y (its geometry is
        //    laid flat by rotation.x = PI/2). When the camera sits IN that
        //    plane the ribbon is edge-on and aliases worst, so that is exactly
        //    where it should be faintest.
        const dy = camera.position.y - line.position.y;
        const cosTilt = Math.abs(dy) / Math.max(1e-3, systemDistance);
        op *= 0.22 + 0.78 * _gsmooth(0.015, 0.30, cosTilt);

        // 3. PROXIMITY CONTEXT — the original intent of this function: orbits
        //    read as navigation aid near a system, clutter far from one.
        if (!shouldShowOrbits && systemDistance > r * 4.0) op *= 0.45;

        const base = line.userData._orbitBaseOpacity || 0.3;
        line.material.opacity = base * (op < 0 ? 0 : (op > 1 ? 1 : op));
        line.visible = line.material.opacity > 0.004;
        line.userData._orbitLastVis = line.visible;
    });
}

window.updateOrbitLineVisibility = updateOrbitLineVisibility;

// =============================================================================
// AREA CLEARED NOTIFICATION SYSTEM - Track and notify when areas are cleared
// =============================================================================
const areaClearTracker = {
    clearedAreas: new Set(),
    
    // Check if an area is newly cleared
    checkAreaCleared: function(galaxyId, areaType) {
        const areaKey = `${galaxyId}-${areaType}`;
        if (this.clearedAreas.has(areaKey)) return false;

        // Count remaining enemies in this area
        let remainingEnemies = 0;
        if (typeof enemies !== 'undefined') {
            remainingEnemies = enemies.filter(e =>
                e && e.userData &&
                e.userData.galaxyId === galaxyId &&
                (areaType === 'all' || e.userData.placementType === areaType)
            ).length;
        }

        if (remainingEnemies !== 0) return false;

        // Regulars are dead — but the area-clear announcement was firing
        // before the boss for this mission ever spawned (the discovery-
        // path system waits up to ~30s before spawning the boss). Hold
        // the notification until any boss attached to this area / galaxy
        // is also down. Three conditions block "cleared":
        //   (a) An areaBosses entry for this exact areaKey is alive.
        //   (b) Any mission-spawned boss for this galaxy is alive
        //       (areaKey form "galaxyId-mission_N").
        //   (c) A discovery-path mission for this galaxy is still
        //       outstanding (missionComplete === false) — the boss is
        //       pending and hasn't been added to enemies yet.
        if (typeof bossSystem !== 'undefined' && bossSystem.areaBosses) {
            for (const key in bossSystem.areaBosses) {
                if (!key.startsWith(galaxyId + '-')) continue;
                const boss = bossSystem.areaBosses[key];
                if (boss && boss.userData && boss.userData.health > 0) {
                    return false;
                }
            }
        }
        if (typeof window !== 'undefined' && Array.isArray(window.discoveryPaths)) {
            for (let i = 0; i < window.discoveryPaths.length; i++) {
                const p = window.discoveryPaths[i];
                if (!p) continue;
                const pid = (p.galaxyId !== undefined)
                    ? p.galaxyId
                    : (p.line && p.line.userData && p.line.userData.galaxyId);
                if (pid !== galaxyId) continue;
                const done = p.line && p.line.userData && p.line.userData.missionComplete;
                if (!done) return false; // boss hasn't been spawned yet
            }
        }

        this.clearedAreas.add(areaKey);
        return true;
    },
    
    // Notify Mission Command of cleared area
    notifyAreaCleared: function(galaxyId, areaType) {
        if (typeof galaxyTypes === 'undefined') return;
        
        const galaxy = galaxyTypes[galaxyId];
        if (!galaxy) return;
        
        let areaName = '';
        let message = '';
        
        if (areaType === 'all' || areaType === 'black_hole') {
            areaName = `${galaxy.name} Galaxy`;
            message = `SECTOR CLEARED!\n\n` +
                `Captain, all ${galaxy.faction} forces in the ${areaName} have been eliminated!\n\n` +
                `The local populations can now rebuild in peace. Mission Command commends your valor.\n\n` +
                `🏆 ${areaName} - LIBERATED`;
        } else if (areaType === 'cosmic_feature') {
            areaName = `${galaxy.name} Patrol Zone`;
            message = `PATROL ZONE SECURED!\n\n` +
                `The ${galaxy.faction} patrol forces in the ${areaName} have been neutralized.\n\n` +
                `Shipping lanes are now safe. Well done, Captain.`;
        } else if (areaType === 'nebula') {
            areaName = `${galaxy.name} Nebula Region`;
            message = `NEBULA SECURED!\n\n` +
                `${galaxy.faction} forces have been driven from the ${areaName}.\n\n` +
                `Scientists can now study these stellar nurseries in peace.`;
        }
        
        // Show notification
        if (typeof showMissionCommandTransmission === 'function') {
            showMissionCommandTransmission(message);
        } else if (typeof showNotification === 'function') {
            showNotification(message, 8000);
        }
        
        console.log(`🏆 AREA CLEARED: ${areaName} (Galaxy ${galaxyId}, Type: ${areaType})`);
    },
    
    // Called when an enemy is destroyed
    onEnemyDestroyed: function(enemy) {
        if (!enemy || !enemy.userData) return;
        
        const galaxyId = enemy.userData.galaxyId;
        const placementType = enemy.userData.placementType || 'all';
        const nebulaName = enemy.userData.nebulaName;
        const isDistantExotic = enemy.userData.isDistantGalaxy || enemy.userData.isExoticGalaxy;
        
        // Small delay to let the enemy be fully removed from array
        setTimeout(() => {
            // Check if entire galaxy is cleared
            if (this.checkAreaCleared(galaxyId, 'all')) {
                this.notifyAreaCleared(galaxyId, 'all');
            }
            // Check specific area types
            else if (this.checkAreaCleared(galaxyId, placementType)) {
                this.notifyAreaCleared(galaxyId, placementType);
            }
            
            // Check distant/exotic nebula areas
            if (nebulaName && this.checkNebulaCleared(nebulaName)) {
                this.notifyNebulaCleared(nebulaName);
            }
        }, 100);
    },
    
    // Check if a specific nebula area is cleared
    checkNebulaCleared: function(nebulaName) {
        const areaKey = `nebula-${nebulaName}`;
        if (this.clearedAreas.has(areaKey)) return false;
        
        let remainingEnemies = 0;
        if (typeof enemies !== 'undefined') {
            remainingEnemies = enemies.filter(e => 
                e && e.userData && e.userData.nebulaName === nebulaName
            ).length;
        }
        
        if (remainingEnemies === 0) {
            this.clearedAreas.add(areaKey);
            return true;
        }
        return false;
    },
    
    // Notify when nebula is cleared
    notifyNebulaCleared: function(nebulaName) {
        const message = `NEBULA SECURED!\n\n` +
            `All hostile forces in the ${nebulaName} have been eliminated!\n\n` +
            `This region of deep space is now safe for exploration and colonization.\n\n` +
            `🌟 ${nebulaName} - LIBERATED`;
        
        if (typeof showMissionCommandTransmission === 'function') {
            showMissionCommandTransmission(message);
        } else if (typeof showNotification === 'function') {
            showNotification(message, 8000);
        }
        
        console.log(`🌟 NEBULA CLEARED: ${nebulaName}`);
    }
};

window.areaClearTracker = areaClearTracker;

// =============================================================================
// DISTRESS BEACON SYSTEM - Triggers when species eliminated, leads to boss fight
// =============================================================================
const distressBeaconSystem = {
    // Track which species have had their beacons triggered
    triggeredSpecies: new Set(),
    // Track active beacons
    activeBeacons: [],
    // Track boss spawn locations
    bossSpawnLocations: {},
    // Available outer systems for boss spawns
    availableOuterSystems: [],
    
    // Initialize - called after outer systems are created
    initialize: function() {
        // Get list of outer systems for boss spawns
        if (typeof outerInterstellarSystems !== 'undefined') {
            this.availableOuterSystems = [...outerInterstellarSystems];
            console.log(`🚨 Distress Beacon System initialized with ${this.availableOuterSystems.length} potential boss locations`);
        }
    },
    
    // Check if Elite Guardian has been defeated for this species
    // Distress beacon only triggers AFTER Elite Guardian is killed
    checkEliteGuardianDefeated: function(galaxyId) {
        if (this.triggeredSpecies.has(galaxyId)) return false;
        
        if (typeof bossSystem === 'undefined') return false;
        if (typeof galaxyTypes === 'undefined') return false;
        
        const galaxy = galaxyTypes[galaxyId];
        if (!galaxy) return false;
        
        const faction = galaxy.faction;
        
        // Check if elite guardian was spawned AND defeated
        if (bossSystem.eliteGuardians && bossSystem.eliteGuardians[faction]) {
            const guardianStatus = bossSystem.eliteGuardians[faction];
            if (guardianStatus.spawned && guardianStatus.defeated) {
                console.log(`📊 ${faction} Elite Guardian defeated - ready for distress beacon`);
                return true;
            }
        }
        
        return false;
    },
    
    // Trigger distress beacon for a species
    triggerDistressBeacon: function(galaxyId) {
        if (this.triggeredSpecies.has(galaxyId)) return;
        if (typeof galaxyTypes === 'undefined') return;

        const galaxy = galaxyTypes[galaxyId];
        if (!galaxy) return;

        // FIRST-JOURNEY GATE (same rule as the core formation nebulas): the
        // HOME galaxy's Elite Guardian dies right at the Sgr A* liberation
        // set-piece, and this beacon draws ANOTHER faction-colored dotted
        // line across the local sky (galaxy center → outer system) before
        // the player has even started the white-path journey to the twins —
        // it reads as a competing "path of discovery". Defer it until the
        // first twin (clustered) nebula is charted; updateBeacons retries.
        if (typeof nebulaClouds !== 'undefined') {
            let twinCharted = false;
            for (let i = 0; i < nebulaClouds.length; i++) {
                const ud = nebulaClouds[i] && nebulaClouds[i].userData;
                if (ud && ud.deepDiscovered && !ud.isDistant && !ud.isExoticCore) {   // twins = non-distant, non-exotic (every nebula has a shape)
                    twinCharted = true; break;
                }
            }
            if (!twinCharted) {
                if (!this.pendingBeacons) this.pendingBeacons = [];
                if (this.pendingBeacons.indexOf(galaxyId) < 0) {
                    this.pendingBeacons.push(galaxyId);
                    console.log(`📡 Distress beacon for galaxy ${galaxyId} deferred until the first twin nebula is charted`);
                }
                return;
            }
        }

        this.triggeredSpecies.add(galaxyId);
        
        // Select an outer system for the boss
        const targetSystem = this.selectOuterSystemForBoss(galaxyId);
        if (!targetSystem) {
            console.warn(`⚠️ No available outer system for ${galaxy.faction} boss`);
            return;
        }
        
        this.bossSpawnLocations[galaxyId] = targetSystem;
        
        // Create the distress beacon visual
        this.createDistressBeacon(galaxyId, targetSystem);
        
        // Create the navigation line
        this.createNavigationLine(galaxyId, targetSystem);
        
        // Spawn the boss in the outer system
        this.spawnDistressBoss(galaxyId, targetSystem);
        
        // Show Mission Command transmission
        this.showDistressTransmission(galaxyId, targetSystem);
        
        console.log(`🚨 DISTRESS BEACON: ${galaxy.faction} boss spawned at ${targetSystem.userData.name}`);
    },
    
    // Select an outer system for boss spawn
    selectOuterSystemForBoss: function(galaxyId) {
        if (this.availableOuterSystems.length === 0) {
            // Refill from all outer systems if empty
            if (typeof outerInterstellarSystems !== 'undefined') {
                this.availableOuterSystems = outerInterstellarSystems.filter(s => 
                    !Object.values(this.bossSpawnLocations).includes(s)
                );
            }
        }
        
        if (this.availableOuterSystems.length === 0) return null;
        
        // Pick a random system and remove it from available
        const index = Math.floor(Math.random() * this.availableOuterSystems.length);
        const system = this.availableOuterSystems.splice(index, 1)[0];
        
        return system;
    },
    
    // Create visual distress beacon at galaxy center
    createDistressBeacon: function(galaxyId, targetSystem) {
        const galaxyCenter = getGalaxy3DPosition(galaxyId);
        const galaxy = galaxyTypes[galaxyId];
        
        const beaconGroup = new THREE.Group();
        
        // Pulsing beacon sphere
        const beaconGeometry = new THREE.SphereGeometry(150, 16, 16);
        const beaconMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.8
        });
        const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
        beaconGroup.add(beacon);
        
        // Outer glow
        const glowGeometry = new THREE.SphereGeometry(250, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff6666,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        beaconGroup.add(glow);
        
        // Vertical beam
        const beamGeometry = new THREE.CylinderGeometry(20, 20, 2000, 8);
        const beamMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending
        });
        const beam = new THREE.Mesh(beamGeometry, beamMaterial);
        beaconGroup.add(beam);
        
        beaconGroup.position.copy(galaxyCenter);
        beaconGroup.userData = {
            type: 'distress_beacon',
            galaxyId: galaxyId,
            faction: galaxy.faction,
            targetSystem: targetSystem,
            pulsePhase: 0
        };
        
        scene.add(beaconGroup);
        this.activeBeacons.push(beaconGroup);
    },
    
    // Create dotted navigation line to outer system
    createNavigationLine: function(galaxyId, targetSystem) {
        const galaxyCenter = getGalaxy3DPosition(galaxyId);
        const targetPosition = targetSystem.position;
        const galaxy = galaxyTypes[galaxyId];
        
        // Create dotted line using points
        const linePoints = [];
        const segments = 50;
        const dashLength = 0.6; // 60% visible, 40% gap
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            // Only add points for "visible" segments (dotted effect)
            if ((i % 2) === 0) {
                const point = new THREE.Vector3().lerpVectors(galaxyCenter, targetPosition, t);
                linePoints.push(point);
                
                const nextT = Math.min((i + 1) / segments, 1);
                const nextPoint = new THREE.Vector3().lerpVectors(galaxyCenter, targetPosition, nextT);
                linePoints.push(nextPoint);
            }
        }
        
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
        const lineMaterial = new THREE.LineBasicMaterial({
            color: galaxy.color || 0xff4444,
            transparent: true,
            opacity: 0.8,
            linewidth: 2
        });
        
        const navigationLine = new THREE.LineSegments(lineGeometry, lineMaterial);
        navigationLine.userData = {
            type: 'distress_navigation_line',
            galaxyId: galaxyId,
            faction: galaxy.faction
        };
        
        scene.add(navigationLine);
        
        // Store reference for cleanup
        if (!this.navigationLines) this.navigationLines = [];
        this.navigationLines.push(navigationLine);
    },
    
    // Spawn the faction boss in the outer system
    spawnDistressBoss: function(galaxyId, targetSystem) {
        const galaxy = galaxyTypes[galaxyId];
        const shapeData = enemyShapes[galaxyId];
        
        // Boss spawn position - near the system center
        const systemCenter = targetSystem.position.clone();
        const bossOffset = new THREE.Vector3(
            (Math.random() - 0.5) * 500,
            (Math.random() - 0.5) * 200,
            (Math.random() - 0.5) * 500
        );
        const bossPosition = systemCenter.add(bossOffset);
        
        // Create boss geometry (larger)
        const bossGeometry = createEnemyGeometry(galaxyId);
        const materials = createEnemyMaterial(shapeData, 'boss', 50000);
        
        let boss;
        if (typeof createEnemyMeshWithModel === 'function') {
            boss = createEnemyMeshWithModel(galaxyId + 1, bossGeometry, materials.enemyMaterial, 200); // 2x size
        } else {
            boss = new THREE.Mesh(bossGeometry, materials.enemyMaterial);
            boss.scale.set(2, 2, 2);
        }
        
        // Add glow
        const glowGeometry = bossGeometry.clone();
        const glow = new THREE.Mesh(glowGeometry, materials.glowMaterial);
        glow.scale.multiplyScalar(materials.glowScale);
        glow.userData.isGlowLayer = true;
        boss.add(glow);
        
        boss.position.copy(bossPosition);
        
        // Warlord health: 3x Elite Guardian (which is 2x boss) = 6x boss health
        const warlordHealth = getEnemyHealthForDifficulty(false, true, false) * 3;
        
        // Boss userData
        boss.userData = {
            name: `${galaxy.faction} Warlord`,
            type: 'enemy',
            health: warlordHealth, // 3x boss health (tougher than Elite Guardian)
            maxHealth: warlordHealth,
            speed: 0.8,
            aggression: 0.9,
            patrolCenter: bossPosition.clone(),
            patrolRadius: 1000,
            lastAttack: 0,
            isActive: true,
            visible: true,
            galaxyId: galaxyId,
            galaxyColor: shapeData.color,
            attackMode: 'aggressive',
            detectionRange: 3000,
            firingRange: 400,
            isLocal: false,
            isBoss: true,
            isDistressBoss: true, // Special flag
            isBossSupport: false,
            position3D: bossPosition.clone(),
            outerSystemName: targetSystem.userData.name,
            hitboxSize: 200
        };
        
        boss.visible = true;
        boss.frustumCulled = false;
        
        scene.add(boss);
        enemies.push(boss);
        
        // Spawn the escort swarm (was 3-5, now 6-9 to match the bigger boss)
        const supportCount = 6 + Math.floor(Math.random() * 4);
        for (let i = 0; i < supportCount; i++) {
            this.spawnBossSupport(galaxyId, bossPosition, i);
        }
        
        console.log(`👑 Spawned ${galaxy.faction} Warlord at ${targetSystem.userData.name} with ${supportCount} support ships`);
    },
    
    // Spawn support enemies for the boss
    spawnBossSupport: function(galaxyId, bossPosition, index) {
        const galaxy = galaxyTypes[galaxyId];
        const shapeData = enemyShapes[galaxyId];
        
        const angle = (index / 5) * Math.PI * 2;
        const distance = 300 + Math.random() * 400;
        const supportPosition = new THREE.Vector3(
            bossPosition.x + Math.cos(angle) * distance,
            bossPosition.y + (Math.random() - 0.5) * 100,
            bossPosition.z + Math.sin(angle) * distance
        );
        
        const supportGeometry = createEnemyGeometry(galaxyId);
        const materials = createEnemyMaterial(shapeData, 'regular', 50000);
        
        let support;
        if (typeof createEnemyMeshWithModel === 'function') {
            support = createEnemyMeshWithModel(galaxyId + 1, supportGeometry, materials.enemyMaterial, 96);
        } else {
            support = new THREE.Mesh(supportGeometry, materials.enemyMaterial);
        }
        
        support.position.copy(supportPosition);
        
        // Elite Guard health: 2x boss support
        const eliteGuardHealth = getEnemyHealthForDifficulty(false, false, true) * 2;
        
        support.userData = {
            name: `${galaxy.faction} Elite Guard ${index + 1}`,
            type: 'enemy',
            health: eliteGuardHealth, // 2x boss support health
            maxHealth: eliteGuardHealth,
            speed: 1.0,
            aggression: 0.85,
            patrolCenter: bossPosition.clone(),
            patrolRadius: 600,
            lastAttack: 0,
            isActive: true,
            visible: true,
            galaxyId: galaxyId,
            galaxyColor: shapeData.color,
            attackMode: 'defensive',
            detectionRange: 2000,
            firingRange: 300,
            isLocal: false,
            isBoss: false,
            isDistressBoss: false,
            isBossSupport: true,
            position3D: supportPosition.clone(),
            hitboxSize: 96
        };
        
        support.visible = true;
        scene.add(support);
        enemies.push(support);
    },
    
    // Show Mission Command transmission about distress beacon
    showDistressTransmission: function(galaxyId, targetSystem) {
        const galaxy = galaxyTypes[galaxyId];
        const systemName = targetSystem.userData.name;
        const systemType = targetSystem.userData.systemType === 'borg_patrol' ? 'Borg Patrol Zone' : 'Exotic System';
        
        const message = `🚨 PRIORITY ALERT - DISTRESS BEACON DETECTED 🚨\n\n` +
            `Captain, the ${galaxy.faction} Elite Guardian has fallen!\n\n` +
            `But this is not over. Our deep space sensors have intercepted a distress signal - the ${galaxy.faction} WARLORD has retreated to the ${systemName}!\n\n` +
            `This ${systemType} lies at the edge of known space. The Warlord has rallied their last elite forces for a final stand.\n\n` +
            `NAVIGATION: Follow the ${galaxy.name} colored beacon line to intercept.\n\n` +
            `⚠️ WARNING: The Warlord is more powerful than the Elite Guardian. Expect heavy resistance.\n\n` +
            `This is the final battle for ${galaxy.species} space. End this, Captain.`;
        
        if (typeof showMissionCommandTransmission === 'function') {
            showMissionCommandTransmission(message);
        } else if (typeof showNotification === 'function') {
            showNotification(message, 15000);
        }
    },
    
    // Update beacon visuals (called each frame)
    updateBeacons: function() {
        const time = Date.now() * 0.003;

        // Fire any beacon deferred by the first-journey gate once the first
        // twin nebula has been charted (cheap check, throttled to ~1Hz).
        if (this.pendingBeacons && this.pendingBeacons.length &&
            typeof nebulaClouds !== 'undefined' &&
            (!this._pendingCheckAt || Date.now() > this._pendingCheckAt)) {
            this._pendingCheckAt = Date.now() + 1000;
            let twinCharted = false;
            for (let i = 0; i < nebulaClouds.length; i++) {
                const ud = nebulaClouds[i] && nebulaClouds[i].userData;
                if (ud && ud.deepDiscovered && !ud.isDistant && !ud.isExoticCore) {   // twins = non-distant, non-exotic (every nebula has a shape)
                    twinCharted = true; break;
                }
            }
            if (twinCharted) {
                const queued = this.pendingBeacons.slice();
                this.pendingBeacons = [];
                queued.forEach(gid => this.triggerDistressBeacon(gid));
            }
        }

        this.activeBeacons.forEach(beacon => {
            if (!beacon || !beacon.userData) return;
            
            // Pulse the beacon
            const pulseFactor = 0.5 + Math.sin(time + beacon.userData.pulsePhase) * 0.5;
            
            beacon.children.forEach(child => {
                if (child.material && child.material.opacity !== undefined) {
                    if (child.geometry.type === 'SphereGeometry') {
                        child.material.opacity = 0.4 + pulseFactor * 0.4;
                    }
                }
            });
            
            // Rotate the beacon
            beacon.rotation.y += 0.01;
        });
    },
    
    // Called when any enemy is destroyed - check for Elite Guardian defeat
    onEnemyDestroyed: function(enemy) {
        if (!enemy || !enemy.userData) return;
        
        const galaxyId = enemy.userData.galaxyId;
        if (galaxyId === undefined || galaxyId === null) return;
        
        // Check if this was a distress boss - show victory!
        if (enemy.userData.isDistressBoss) {
            this.onDistressBossDefeated(galaxyId);
            return;
        }
        
        // Check if this was an Elite Guardian - trigger distress beacon!
        if (enemy.userData.isEliteGuardian) {
            console.log(`🛡️ Elite Guardian defeated for galaxy ${galaxyId} - checking for distress beacon trigger`);
            // Small delay to let the bossSystem update
            setTimeout(() => {
                if (this.checkEliteGuardianDefeated(galaxyId)) {
                    this.triggerDistressBeacon(galaxyId);
                }
            }, 500);
            return;
        }
    },
    
    // Called when a distress boss is defeated
    onDistressBossDefeated: function(galaxyId) {
        const galaxy = galaxyTypes[galaxyId];
        if (!galaxy) return;
        
        // Remove beacon and navigation line
        this.activeBeacons = this.activeBeacons.filter(beacon => {
            if (beacon.userData.galaxyId === galaxyId) {
                scene.remove(beacon);
                return false;
            }
            return true;
        });
        
        if (this.navigationLines) {
            this.navigationLines = this.navigationLines.filter(line => {
                if (line.userData.galaxyId === galaxyId) {
                    scene.remove(line);
                    return false;
                }
                return true;
            });
        }
        
        // Victory transmission
        const message = `🏆 WARLORD DEFEATED! 🏆\n\n` +
            `Captain, the ${galaxy.faction} Warlord has been destroyed!\n\n` +
            `With their military leadership eliminated, the ${galaxy.species} no longer pose a threat to the galaxy.\n\n` +
            `${galaxy.faction} space is now FULLY LIBERATED!\n\n` +
            `The universe grows safer thanks to your courage. Mission Command salutes you.\n\n` +
            `🌟 ${galaxy.faction} - COMPLETELY NEUTRALIZED 🌟`;
        
        if (typeof showMissionCommandTransmission === 'function') {
            showMissionCommandTransmission(message);
        }
        
        // Fireworks!
        if (typeof createFireworkCelebration === 'function') {
            createFireworkCelebration();
        }
        
        console.log(`🏆 ${galaxy.faction} WARLORD DEFEATED - Species fully neutralized!`);
    }
};

window.distressBeaconSystem = distressBeaconSystem;

// =============================================================================
// TRADING SHIPS IN NEBULAS - Civilian ships traveling between planets
// =============================================================================
const tradingShips = [];

// =============================================================================
// SHIP TYPE COLOR DEFINITIONS - Each ship type has a distinct color scheme
// =============================================================================
const SHIP_TYPE_COLORS = {
    freighter: { main: 0xff8844, emissive: 0xcc6622, glow: 0xffaa66, name: 'Orange' },     // Orange freighters
    tanker: { main: 0xffdd44, emissive: 0xccaa22, glow: 0xffee66, name: 'Yellow' },        // Yellow tankers
    science: { main: 0x44aaff, emissive: 0x2288dd, glow: 0x66ccff, name: 'Blue' },         // Blue science
    shuttle: { main: 0xaaffaa, emissive: 0x66dd66, glow: 0xccffcc, name: 'Green' },        // Green shuttles
    passenger: { main: 0xff88ff, emissive: 0xdd66dd, glow: 0xffaaff, name: 'Pink' },       // Pink passenger
    mining: { main: 0xddcc44, emissive: 0xaa9922, glow: 0xffee44, name: 'Gold' },          // Gold mining
    rescue: { main: 0xff4444, emissive: 0xdd2222, glow: 0xff6666, name: 'Red' },           // Red rescue
    military: { main: 0x44ff88, emissive: 0x22dd66, glow: 0x66ffaa, name: 'Teal' }         // Teal military
};

// =============================================================================
// FREIGHTER CARAVAN SYSTEM - Groups traveling between nebulas
// =============================================================================
const freighterCaravans = [];

function createTradingShipsInNebulas() {
    console.log('🚀 Creating civilian ships in nebulas...');
    
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) {
        console.log('No nebulas found, skipping civilian ships');
        return;
    }
    
    // Only add ships to clustered nebulas (galaxy-formation nebulas)
    const clusteredNebulas = nebulaClouds.filter(n => 
        n && n.userData && !n.userData.isDistant && !n.userData.isExoticCore
    );
    
    clusteredNebulas.forEach((nebula, nebulaIndex) => {
        // 15-25 civilian ships per nebula (much busier space lanes)
        const shipCount = 15 + Math.floor(Math.random() * 11);
        
        for (let i = 0; i < shipCount; i++) {
            createTradingShip(nebula, i);
        }
        
        // 8-15 mining ships per nebula (increased mining activity)
        const miningCount = 8 + Math.floor(Math.random() * 8);
        for (let i = 0; i < miningCount; i++) {
            createNebulaShip(nebula, i, 'mining');
        }
        
        // 3-6 science ships per nebula
        const scienceCount = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < scienceCount; i++) {
            createNebulaShip(nebula, i, 'science');
        }
    });
    
    // Create freighter caravans traveling between nebulas
    if (clusteredNebulas.length >= 2) {
        createFreighterCaravans(clusteredNebulas);
    }
    
    console.log(`✅ Created ${tradingShips.length} civilian ships across ${clusteredNebulas.length} nebulas`);
    console.log(`🚛 Created ${freighterCaravans.length} freighter caravans`);
    
    // Create mining expeditions at black holes
    createBlackHoleMiningExpeditions();
}

// =============================================================================
// BLACK HOLE MINING EXPEDITIONS - Mining ships sent from nearby nebulas to black holes
// =============================================================================
function createBlackHoleMiningExpeditions() {
    console.log('⛏️ Creating mining expeditions to black holes...');
    
    if (typeof planets === 'undefined') return;
    
    const blackHoles = planets.filter(p => 
        p && p.userData && p.userData.type === 'blackhole'
    );
    
    if (blackHoles.length === 0) {
        console.log('No black holes found for mining expeditions');
        return;
    }
    
    blackHoles.forEach((blackHole, index) => {
        // 5-12 mining ships per black hole (resource-rich areas)
        const minerCount = 5 + Math.floor(Math.random() * 8);
        
        for (let i = 0; i < minerCount; i++) {
            // Find nearest nebula to serve as home base
            let nearestNebula = null;
            let minDist = Infinity;
            
            if (typeof nebulaClouds !== 'undefined') {
                nebulaClouds.forEach(nebula => {
                    if (nebula && nebula.position) {
                        const dist = blackHole.position.distanceTo(nebula.position);
                        if (dist < minDist) {
                            minDist = dist;
                            nearestNebula = nebula;
                        }
                    }
                });
            }
            
            // Create mining ship with route to black hole
            if (nearestNebula) {
                createBlackHoleMiningShip(nearestNebula, blackHole, i);
            }
        }
    });
    
    console.log(`⛏️ Created mining expeditions to ${blackHoles.length} black holes`);
}

function createBlackHoleMiningShip(homeNebula, targetBlackHole, index) {
    const shipCategory = 'mining';
    let shipGroup;
    
    // Use civilian ship registry if available
    if (typeof civilianShipRegistry !== 'undefined') {
        shipGroup = civilianShipRegistry.getShipMesh(shipCategory);
    } else {
        // Fallback: create basic mesh
        shipGroup = new THREE.Group();
        const geometry = new THREE.BoxGeometry(3, 1.5, 6);
        const material = new THREE.MeshPhongMaterial({ color: 0x888888 });
        const mesh = new THREE.Mesh(geometry, material);
        shipGroup.add(mesh);
    }
    
    // Position near home nebula. Nebulas store their extent in userData.size,
    // NOT userData.radius — reading .radius gave undefined, so `undefined * 1.5`
    // = NaN, which set x/z to NaN for every black-hole mining ship (spawned them
    // invisible and unmovable). Fall back through radius -> size -> 2000.
    const angle = (index / 12) * Math.PI * 2;
    const radius = (homeNebula.userData.radius || homeNebula.userData.size || 2000) * 1.5;
    shipGroup.position.set(
        homeNebula.position.x + Math.cos(angle) * radius,
        homeNebula.position.y + (Math.random() - 0.5) * 100,
        homeNebula.position.z + Math.sin(angle) * radius
    );
    
    shipGroup.userData = {
        type: 'mining_ship',
        civilian: true,
        homeNebula: homeNebula,
        miningDestination: targetBlackHole.position.clone(),
        health: 100,
        maxHealth: 100,
        speed: 2 + Math.random() * 2,
        routePhase: 'outbound', // outbound to black hole, inbound to nebula
        name: `Mining Vessel ${index + 1}`
    };
    
    scene.add(shipGroup);
    tradingShips.push(shipGroup); // Add to trading ships array for tracking
}

// =============================================================================
// FREIGHTER CARAVAN CREATION - Groups of freighters traveling between nebulas
// =============================================================================
function createFreighterCaravans(nebulas) {
    console.log('🚛 Creating freighter caravans between nebulas...');
    
    // Create 5-10 caravans (more trade routes)
    const caravanCount = 5 + Math.floor(Math.random() * 6);
    
    for (let c = 0; c < caravanCount; c++) {
        // Pick two different nebulas as endpoints
        const sourceIndex = Math.floor(Math.random() * nebulas.length);
        let destIndex = Math.floor(Math.random() * nebulas.length);
        while (destIndex === sourceIndex && nebulas.length > 1) {
            destIndex = Math.floor(Math.random() * nebulas.length);
        }
        
        const sourceNebula = nebulas[sourceIndex];
        const destNebula = nebulas[destIndex];
        
        // Create a caravan of 3-6 freighters
        const caravanSize = 3 + Math.floor(Math.random() * 4);
        const caravan = {
            id: c,
            ships: [],
            source: sourceNebula.position.clone(),
            destination: destNebula.position.clone(),
            sourceName: sourceNebula.userData.name || `Nebula ${sourceIndex}`,
            destName: destNebula.userData.name || `Nebula ${destIndex}`,
            progress: Math.random(), // Start at random point along route
            speed: 0.0002 + Math.random() * 0.0002, // Slow caravan speed
            direction: 1, // 1 = toward dest, -1 = toward source
            underAttack: false,
            attackers: [],
            escortRequested: false
        };
        
        // Calculate caravan starting position along route
        const routeVector = new THREE.Vector3().subVectors(caravan.destination, caravan.source);
        const caravanCenter = caravan.source.clone().add(routeVector.multiplyScalar(caravan.progress));
        
        // Create the freighter ships in formation
        for (let i = 0; i < caravanSize; i++) {
            const shipGroup = createCaravanFreighter(caravan, i, caravanSize, caravanCenter);
            caravan.ships.push(shipGroup);
            tradingShips.push(shipGroup);
        }
        
        freighterCaravans.push(caravan);
        console.log(`  🚛 Caravan ${c + 1}: ${caravanSize} freighters (${caravan.sourceName} ↔ ${caravan.destName})`);
    }
}

function createCaravanFreighter(caravan, index, totalShips, caravanCenter) {
    let shipGroup;
    const shipCategory = 'freighter';
    const colors = SHIP_TYPE_COLORS.freighter;
    
    if (typeof civilianShipRegistry !== 'undefined') {
        shipGroup = civilianShipRegistry.getShipMesh(shipCategory);
        if (shipGroup) {
            shipGroup.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material.emissive = new THREE.Color(colors.emissive);
                    child.material.emissiveIntensity = 2.5;
                    child.material.color = new THREE.Color(colors.main);
                }
            });
        }
    }
    
    // Fallback procedural freighter
    if (!shipGroup || shipGroup.children.length === 0) {
        shipGroup = new THREE.Group();
        const hull = new THREE.Mesh(
            new THREE.BoxGeometry(12, 6, 24),
            new THREE.MeshStandardMaterial({ 
                color: colors.main, 
                metalness: 0.4, 
                roughness: 0.3,
                emissive: colors.emissive,
                emissiveIntensity: 2.5
            })
        );
        shipGroup.add(hull);
        
        // Cargo containers
        const containerMat = new THREE.MeshStandardMaterial({ 
            color: 0x666666, emissive: 0x333333, emissiveIntensity: 1.0 
        });
        const container = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 8), containerMat);
        container.position.set(0, 5, 0);
        shipGroup.add(container);
        
        // Engine glow
        const engineMat = new THREE.MeshBasicMaterial({ color: colors.glow });
        const engine = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 8), engineMat);
        engine.position.set(0, 0, 13);
        shipGroup.add(engine);
    }
    
    // Position in formation (V-shape or line)
    const formationOffset = new THREE.Vector3();
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    formationOffset.x = side * (row + 1) * 60; // Spread horizontally
    formationOffset.z = row * -80; // Trail behind
    formationOffset.y = (Math.random() - 0.5) * 40;
    
    shipGroup.position.copy(caravanCenter).add(formationOffset);
    
    shipGroup.userData = {
        type: 'caravan_freighter',
        shipCategory: shipCategory,
        name: `Caravan ${caravan.id + 1} - Freighter ${index + 1}`,
        caravanId: caravan.id,
        formationOffset: formationOffset,
        isNeutral: true,
        isCaravan: true,
        speed: caravan.speed,
        health: 3, // Freighters can take 3 hits before destroyed
        maxHealth: 3
    };
    
    shipGroup.visible = true;
    scene.add(shipGroup);
    return shipGroup;
}

function createTradingShip(nebula, index) {
    // Use civilian ship registry if available
    let shipGroup;
    let shipCategory;
    
    // Pick appropriate ship type for nebula location
    // 'military' patrol craft now spawn among nebula traffic — they're the
    // armed escorts: when fired upon (or when a nearby civilian raises a
    // distress call) they return fire while retreating (civilian-combat.js).
    const nebulaShipTypes = ['freighter', 'tanker', 'science', 'shuttle', 'passenger', 'military', 'military'];
    shipCategory = nebulaShipTypes[Math.floor(Math.random() * nebulaShipTypes.length)];
    
    // Get distinct colors for this ship type
    const colors = SHIP_TYPE_COLORS[shipCategory] || SHIP_TYPE_COLORS.shuttle;
    
    if (typeof civilianShipRegistry !== 'undefined') {
        shipGroup = civilianShipRegistry.getShipMesh(shipCategory);
        // Apply ship-type-specific colors for easy identification
        if (shipGroup) {
            shipGroup.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material.emissive = new THREE.Color(colors.emissive);
                    child.material.emissiveIntensity = 2.5;
                    child.material.color = new THREE.Color(colors.main);
                }
            });
        }
    }
    
    // Fallback if no ship created - with type-specific colors
    if (!shipGroup || shipGroup.children.length === 0) {
        shipGroup = new THREE.Group();
        const hull = new THREE.Mesh(
            new THREE.BoxGeometry(8, 4, 16),
            new THREE.MeshStandardMaterial({ 
                color: colors.main, 
                metalness: 0.3, 
                roughness: 0.4,
                emissive: colors.emissive,
                emissiveIntensity: 2.5
            })
        );
        shipGroup.add(hull);
        
        // Engine glow - MeshBasicMaterial always visible, matches ship type color
        const engineMat = new THREE.MeshBasicMaterial({ color: colors.glow });
        const engineL = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), engineMat);
        engineL.position.set(-3, 0, 9);
        shipGroup.add(engineL);
        const engineR = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), engineMat);
        engineR.position.set(3, 0, 9);
        shipGroup.add(engineR);
    }
    
    // Position within nebula
    const nebulaSize = nebula.userData.size || 1500;
    const orbitRadius = nebulaSize * 0.3 + Math.random() * nebulaSize * 0.4;
    const angle = (index / 5) * Math.PI * 2 + Math.random();
    const height = (Math.random() - 0.5) * 200;
    
    const startX = nebula.position.x + Math.cos(angle) * orbitRadius;
    const startY = nebula.position.y + height;
    const startZ = nebula.position.z + Math.sin(angle) * orbitRadius;
    
    shipGroup.position.set(startX, startY, startZ);
    
    // Get ship name from registry
    const categoryData = (typeof civilianShipRegistry !== 'undefined') 
        ? civilianShipRegistry.categories[shipCategory] 
        : { name: 'Cargo Freighter' };
    
    // Get speed from registry
    const shipSpeed = (typeof civilianShipRegistry !== 'undefined')
        ? civilianShipRegistry.getShipSpeed(shipCategory)
        : 0.5 + Math.random() * 0.5;
    
    // BI-DIRECTIONAL TRAFFIC: 50% chance to orbit in opposite direction
    const orbitDirection = Math.random() < 0.5 ? 1 : -1;
    
    // Ship data
    shipGroup.userData = {
        type: 'trading_ship',
        shipCategory: shipCategory,
        name: `${categoryData.name} ${index + 1}`,
        nebulaName: nebula.userData.name,
        nebulaPosition: nebula.position.clone(),
        orbitRadius: orbitRadius,
        orbitAngle: angle,
        orbitSpeed: 0.002 + Math.random() * 0.003, // Slow orbit
        orbitDirection: orbitDirection, // NEW: 1 = CCW, -1 = CW (two-way traffic)
        verticalOffset: height,
        destination: null,
        speed: shipSpeed,
        isNeutral: true,
        shipColorName: colors.name // Track color for debugging
    };
    
    // Find nearby planets for destinations
    if (typeof planets !== 'undefined' && planets.length > 0) {
        const nearbyPlanets = planets.filter(p => {
            if (!p || !p.position) return false;
            const distance = nebula.position.distanceTo(p.position);
            return distance < nebulaSize * 2;
        });
        
        if (nearbyPlanets.length > 0) {
            shipGroup.userData.nearbyPlanets = nearbyPlanets.map(p => p.position.clone());
            shipGroup.userData.destinationIndex = Math.floor(Math.random() * nearbyPlanets.length);
        }
    }
    
    shipGroup.visible = true;
    scene.add(shipGroup);
    tradingShips.push(shipGroup);
}

// Create specific ship types in nebulas (mining, science, etc.)
function createNebulaShip(nebula, index, shipCategory) {
    let shipGroup;
    
    // Use unified ship type colors
    const colors = SHIP_TYPE_COLORS[shipCategory] || SHIP_TYPE_COLORS.science;
    
    if (typeof civilianShipRegistry !== 'undefined') {
        shipGroup = civilianShipRegistry.getShipMesh(shipCategory);
        // Apply ship-type-specific colors
        if (shipGroup) {
            shipGroup.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material.emissive = new THREE.Color(colors.emissive);
                    child.material.emissiveIntensity = 2.5;
                    child.material.color = new THREE.Color(colors.main);
                }
            });
        }
    }
    
    // Fallback if no ship created
    if (!shipGroup || shipGroup.children.length === 0) {
        shipGroup = new THREE.Group();
        const hull = new THREE.Mesh(
            new THREE.BoxGeometry(8, 5, 15),
            new THREE.MeshStandardMaterial({ 
                color: colors.main, 
                metalness: 0.3, 
                roughness: 0.4,
                emissive: colors.emissive,
                emissiveIntensity: 2.5
            })
        );
        shipGroup.add(hull);
        
        // Engine glow - MeshBasicMaterial always visible
        const engineMat = new THREE.MeshBasicMaterial({ color: colors.glow });
        const engine = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), engineMat);
        engine.position.set(0, 0, 8);
        shipGroup.add(engine);
    }
    
    // Position within nebula
    const nebulaSize = nebula.userData.size || 1500;
    const orbitRadius = nebulaSize * 0.2 + Math.random() * nebulaSize * 0.5;
    const angle = Math.random() * Math.PI * 2;
    const height = (Math.random() - 0.5) * 300;
    
    const startX = nebula.position.x + Math.cos(angle) * orbitRadius;
    const startY = nebula.position.y + height;
    const startZ = nebula.position.z + Math.sin(angle) * orbitRadius;
    
    shipGroup.position.set(startX, startY, startZ);
    
    const shipNames = {
        'mining': 'Mining Vessel',
        'science': 'Research Ship',
        'rescue': 'Rescue Ship',
        'military': 'Patrol Craft'
    };
    
    // BI-DIRECTIONAL TRAFFIC: 50% chance to orbit in opposite direction
    const orbitDirection = Math.random() < 0.5 ? 1 : -1;
    
    shipGroup.userData = {
        type: 'trading_ship',
        shipCategory: shipCategory,
        name: `${shipNames[shipCategory] || 'Ship'} ${index + 1}`,
        nebulaName: nebula.userData.name,
        nebulaPosition: nebula.position.clone(),
        orbitRadius: orbitRadius,
        orbitAngle: angle,
        orbitSpeed: 0.002 + Math.random() * 0.003,
        orbitDirection: orbitDirection, // NEW: 1 = CCW, -1 = CW (two-way traffic)
        verticalOffset: height,
        speed: 0.3 + Math.random() * 0.4,
        isNeutral: true,
        shipColorName: colors.name // Track color for debugging
    };
    
    shipGroup.visible = true;
    scene.add(shipGroup);
    tradingShips.push(shipGroup);
}

// =============================================================================
// DISTANT & EXOTIC NEBULA SHIPS - Ships in outer nebulas with mining routes
// =============================================================================

function createShipsInDistantExoticNebulas() {
    console.log('🚀 Creating ships in distant and exotic nebulas...');
    
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) {
        console.log('No nebulas found, skipping distant/exotic ships');
        return;
    }
    
    // Get distant and exotic nebulas
    const distantNebulas = nebulaClouds.filter(n => 
        n && n.userData && n.userData.isDistant
    );
    const exoticNebulas = nebulaClouds.filter(n => 
        n && n.userData && n.userData.isExoticCore
    );
    
    console.log(`  Found ${distantNebulas.length} distant nebulas, ${exoticNebulas.length} exotic nebulas`);
    
    // Get outer systems for mining destinations
    const exoticSystems = (typeof outerInterstellarSystems !== 'undefined') 
        ? outerInterstellarSystems.filter(s => s.userData && s.userData.systemType === 'exotic_core')
        : [];
    const borgSystems = (typeof outerInterstellarSystems !== 'undefined')
        ? outerInterstellarSystems.filter(s => s.userData && s.userData.systemType === 'borg_patrol')
        : [];
    
    console.log(`  Found ${exoticSystems.length} exotic systems, ${borgSystems.length} BORG systems for mining routes`);
    
    // Create ships in distant nebulas
    distantNebulas.forEach((nebula, nebulaIndex) => {
        // 5-10 trading ships per distant nebula (less populated than core)
        const shipCount = 5 + Math.floor(Math.random() * 6);
        for (let i = 0; i < shipCount; i++) {
            createDistantNebulaShip(nebula, i, 'trading');
        }
        
        // 2-4 mining ships with routes to BORG systems
        const miningCount = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < miningCount; i++) {
            const targetSystem = borgSystems.length > 0 
                ? borgSystems[Math.floor(Math.random() * borgSystems.length)]
                : null;
            createMiningShipWithRoute(nebula, i, targetSystem, 'distant');
        }
        
        // 1-2 science ships
        const scienceCount = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < scienceCount; i++) {
            createDistantNebulaShip(nebula, i, 'science');
        }
    });
    
    // Create ships in exotic nebulas
    exoticNebulas.forEach((nebula, nebulaIndex) => {
        // 4-8 trading ships per exotic nebula
        const shipCount = 4 + Math.floor(Math.random() * 5);
        for (let i = 0; i < shipCount; i++) {
            createDistantNebulaShip(nebula, i, 'trading');
        }
        
        // 3-5 mining ships with routes to exotic systems
        const miningCount = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < miningCount; i++) {
            const targetSystem = exoticSystems.length > 0
                ? exoticSystems[Math.floor(Math.random() * exoticSystems.length)]
                : null;
            createMiningShipWithRoute(nebula, i, targetSystem, 'exotic');
        }
        
        // 2-3 science ships (exotic areas attract researchers)
        const scienceCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < scienceCount; i++) {
            createDistantNebulaShip(nebula, i, 'science');
        }
    });
    
    // Create freighter caravans between distant nebulas
    if (distantNebulas.length >= 2) {
        createOuterNebulaCaravans(distantNebulas, 'distant');
    }
    
    // Create freighter caravans between exotic nebulas
    if (exoticNebulas.length >= 2) {
        createOuterNebulaCaravans(exoticNebulas, 'exotic');
    }
    
    console.log(`✅ Created ships in distant/exotic nebulas`);
}

function createDistantNebulaShip(nebula, index, shipType) {
    let shipGroup;
    let shipCategory;
    
    if (shipType === 'trading') {
        const tradingTypes = ['freighter', 'tanker', 'shuttle', 'passenger'];
        shipCategory = tradingTypes[Math.floor(Math.random() * tradingTypes.length)];
    } else if (shipType === 'science') {
        shipCategory = 'science';
    } else {
        shipCategory = shipType;
    }
    
    const colors = SHIP_TYPE_COLORS[shipCategory] || SHIP_TYPE_COLORS.shuttle;
    
    if (typeof civilianShipRegistry !== 'undefined') {
        shipGroup = civilianShipRegistry.getShipMesh(shipCategory);
        if (shipGroup) {
            shipGroup.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material.emissive = new THREE.Color(colors.emissive);
                    child.material.emissiveIntensity = 2.5;
                    child.material.color = new THREE.Color(colors.main);
                }
            });
        }
    }
    
    if (!shipGroup || shipGroup.children.length === 0) {
        shipGroup = new THREE.Group();
        const hull = new THREE.Mesh(
            new THREE.BoxGeometry(8, 4, 16),
            new THREE.MeshStandardMaterial({ 
                color: colors.main, 
                metalness: 0.3, 
                roughness: 0.4,
                emissive: colors.emissive,
                emissiveIntensity: 2.5
            })
        );
        shipGroup.add(hull);
        
        const engineMat = new THREE.MeshBasicMaterial({ color: colors.glow });
        const engineL = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), engineMat);
        engineL.position.set(-3, 0, 9);
        shipGroup.add(engineL);
        const engineR = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), engineMat);
        engineR.position.set(3, 0, 9);
        shipGroup.add(engineR);
    }
    
    // Position within nebula
    const nebulaSize = nebula.userData.size || 2000;
    const orbitRadius = nebulaSize * 0.2 + Math.random() * nebulaSize * 0.5;
    const angle = (index / 5) * Math.PI * 2 + Math.random();
    const height = (Math.random() - 0.5) * 300;
    
    const startX = nebula.position.x + Math.cos(angle) * orbitRadius;
    const startY = nebula.position.y + height;
    const startZ = nebula.position.z + Math.sin(angle) * orbitRadius;
    
    shipGroup.position.set(startX, startY, startZ);
    
    const orbitDirection = Math.random() < 0.5 ? 1 : -1;
    
    shipGroup.userData = {
        type: 'trading_ship',
        shipCategory: shipCategory,
        name: `${shipCategory.charAt(0).toUpperCase() + shipCategory.slice(1)} ${index + 1}`,
        nebulaName: nebula.userData.name || nebula.userData.mythicalName,
        nebulaPosition: nebula.position.clone(),
        orbitRadius: orbitRadius,
        orbitAngle: angle,
        orbitSpeed: 0.001 + Math.random() * 0.002,
        orbitDirection: orbitDirection,
        verticalOffset: height,
        speed: 0.3 + Math.random() * 0.4,
        isNeutral: true,
        isDistantNebula: nebula.userData.isDistant || false,
        isExoticNebula: nebula.userData.isExoticCore || false,
        shipColorName: colors.name
    };
    
    shipGroup.visible = true;
    scene.add(shipGroup);
    tradingShips.push(shipGroup);
}

function createMiningShipWithRoute(nebula, index, targetSystem, regionType) {
    let shipGroup;
    const shipCategory = 'mining';
    const colors = SHIP_TYPE_COLORS.mining;
    
    if (typeof civilianShipRegistry !== 'undefined') {
        shipGroup = civilianShipRegistry.getShipMesh(shipCategory);
        if (shipGroup) {
            shipGroup.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material.emissive = new THREE.Color(colors.emissive);
                    child.material.emissiveIntensity = 2.5;
                    child.material.color = new THREE.Color(colors.main);
                }
            });
        }
    }
    
    if (!shipGroup || shipGroup.children.length === 0) {
        shipGroup = new THREE.Group();
        // Rugged mining ship design
        const hull = new THREE.Mesh(
            new THREE.BoxGeometry(10, 6, 20),
            new THREE.MeshStandardMaterial({ 
                color: colors.main, 
                metalness: 0.5, 
                roughness: 0.6,
                emissive: colors.emissive,
                emissiveIntensity: 2.5
            })
        );
        shipGroup.add(hull);
        
        // Mining arm
        const armMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.7 });
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 12), armMat);
        arm.position.set(0, -2, -10);
        shipGroup.add(arm);
        
        // Cargo hold
        const cargoMat = new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0x222222 });
        const cargo = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), cargoMat);
        cargo.position.set(0, 5, 2);
        shipGroup.add(cargo);
        
        const engineMat = new THREE.MeshBasicMaterial({ color: colors.glow });
        const engine = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 8), engineMat);
        engine.position.set(0, 0, 11);
        shipGroup.add(engine);
    }
    
    // Start at nebula
    const nebulaSize = nebula.userData.size || 2000;
    const orbitRadius = nebulaSize * 0.3;
    const angle = Math.random() * Math.PI * 2;
    
    const startX = nebula.position.x + Math.cos(angle) * orbitRadius;
    const startY = nebula.position.y + (Math.random() - 0.5) * 200;
    const startZ = nebula.position.z + Math.sin(angle) * orbitRadius;
    
    shipGroup.position.set(startX, startY, startZ);
    
    // Determine mining destination
    let miningDestination = null;
    let miningDestinationName = 'Unknown';
    
    if (targetSystem) {
        miningDestination = targetSystem.position.clone();
        miningDestinationName = targetSystem.userData.name || 'Outer System';
    }
    
    shipGroup.userData = {
        type: 'mining_ship',
        shipCategory: shipCategory,
        name: `Mining Vessel ${index + 1}`,
        nebulaName: nebula.userData.name || nebula.userData.mythicalName,
        nebulaPosition: nebula.position.clone(),
        homeNebula: nebula.position.clone(),
        miningDestination: miningDestination,
        miningDestinationName: miningDestinationName,
        regionType: regionType, // 'distant', 'exotic', or 'clustered'
        
        // Mining route state
        miningState: 'traveling_to_mine', // 'traveling_to_mine', 'mining', 'returning'
        miningProgress: 0,
        miningDuration: 30000 + Math.random() * 30000, // 30-60 seconds mining
        routeProgress: Math.random(), // Start at random point
        routeSpeed: 0.0001 + Math.random() * 0.0001,
        
        // Fallback orbit behavior
        orbitRadius: orbitRadius,
        orbitAngle: angle,
        orbitSpeed: 0.001 + Math.random() * 0.002,
        orbitDirection: Math.random() < 0.5 ? 1 : -1,
        verticalOffset: (Math.random() - 0.5) * 200,
        
        speed: 0.4 + Math.random() * 0.3,
        isNeutral: true,
        hasMiningRoute: miningDestination !== null,
        shipColorName: colors.name
    };
    
    shipGroup.visible = true;
    scene.add(shipGroup);
    tradingShips.push(shipGroup);
}

function createOuterNebulaCaravans(nebulas, regionType) {
    console.log(`🚛 Creating ${regionType} nebula caravans...`);
    
    // Create 1-2 caravans for outer nebulas
    const caravanCount = 1 + Math.floor(Math.random() * 2);
    
    for (let c = 0; c < caravanCount; c++) {
        const sourceIndex = Math.floor(Math.random() * nebulas.length);
        let destIndex = Math.floor(Math.random() * nebulas.length);
        while (destIndex === sourceIndex && nebulas.length > 1) {
            destIndex = Math.floor(Math.random() * nebulas.length);
        }
        
        const sourceNebula = nebulas[sourceIndex];
        const destNebula = nebulas[destIndex];
        
        const caravanSize = 2 + Math.floor(Math.random() * 3); // 2-4 ships (smaller caravans)
        const caravan = {
            id: freighterCaravans.length,
            ships: [],
            source: sourceNebula.position.clone(),
            destination: destNebula.position.clone(),
            sourceName: sourceNebula.userData.name || sourceNebula.userData.mythicalName || `Nebula`,
            destName: destNebula.userData.name || destNebula.userData.mythicalName || `Nebula`,
            progress: Math.random(),
            speed: 0.00015 + Math.random() * 0.0001, // Slightly slower (longer distances)
            direction: 1,
            regionType: regionType,
            underAttack: false,
            attackers: [],
            escortRequested: false
        };
        
        const routeVector = new THREE.Vector3().subVectors(caravan.destination, caravan.source);
        const caravanCenter = caravan.source.clone().add(routeVector.clone().multiplyScalar(caravan.progress));
        
        for (let i = 0; i < caravanSize; i++) {
            const shipGroup = createCaravanFreighter(caravan, i, caravanSize, caravanCenter);
            shipGroup.userData.regionType = regionType;
            caravan.ships.push(shipGroup);
        }
        
        freighterCaravans.push(caravan);
        console.log(`  🚛 ${regionType.charAt(0).toUpperCase() + regionType.slice(1)} Caravan: ${caravanSize} freighters (${caravan.sourceName} ↔ ${caravan.destName})`);
    }
}

// Update clustered nebula mining ships to travel to core systems
function updateClusteredMiningRoutes() {
    // Find core system (local solar system center)
    const coreSystemPosition = new THREE.Vector3(0, 0, 0); // Origin is local system
    
    tradingShips.forEach(ship => {
        const data = ship.userData;
        if (data.shipCategory === 'mining' && !data.hasMiningRoute && !data.isDistantNebula && !data.isExoticNebula) {
            // This is a clustered nebula mining ship - give it a route to core
            data.hasMiningRoute = true;
            data.miningDestination = coreSystemPosition.clone();
            data.miningDestinationName = 'Core System';
            data.regionType = 'clustered';
            data.miningState = 'traveling_to_mine';
            data.routeProgress = Math.random();
            data.routeSpeed = 0.0002 + Math.random() * 0.0001;
            data.miningDuration = 20000 + Math.random() * 20000;
            data.miningProgress = 0;
        }
    });
}

// =============================================================================
// CIVILIAN SHIP AI - States: idle, traveling, fleeing, distress, hailing
// =============================================================================
const civilianShipHails = [
    "Greetings, pilot! Safe travels out there.",
    "Watch out for pirates in this sector.",
    "Beautiful nebula, isn't it?",
    "Heading to the next station. Clear skies!",
    "Need any supplies? ...Just kidding, we're fully loaded.",
    "First time through here? Stick to the trade lanes.",
    "Heard there's trouble near the outer systems.",
    "Good hunting out there, friend!",
    "These cargo containers won't deliver themselves!",
    "If you see any Borg, we were never here.",
    "Long range sensors picking up hostiles. Stay sharp.",
    "Another day, another credit. Am I right?",
    "Don't mind us, just passing through.",
    "May the stars guide your path.",
    "Freelancer, huh? Respect."
];

const distressMessages = [
    "MAYDAY MAYDAY! We're under attack!",
    "This is an emergency! Hostile vessels engaging!",
    "Help! Our shields are failing!",
    "SOS! Any friendly ships in range?!",
    "We're taking heavy fire! Need assistance!",
    "Emergency beacon activated! Please respond!",
    "Hull breach imminent! Requesting immediate aid!"
];

// Track last hail time to prevent spam
let lastCivilianHailTime = 0;
const HAIL_COOLDOWN = 30000; // 30 seconds between hails
let lastDistressTime = 0;
const DISTRESS_COOLDOWN = 60000; // 60 seconds between distress events

function updateTradingShips() {
    if (tradingShips.length === 0) return;
    
    const now = Date.now();
    const playerPos = (typeof camera !== 'undefined' && camera) ? camera.position : null;
    
    tradingShips.forEach(ship => {
        if (!ship || !ship.userData) return;

        // PERF: skip AI for ships far from the player. They're distance-culled
        // from view anyway and their drift is imperceptible at this range, so
        // running the full state machine for all 584 ships every frame is pure
        // waste (was the single most expensive per-frame update function).
        if (playerPos) {
            const sdx = ship.position.x - playerPos.x;
            const sdy = ship.position.y - playerPos.y;
            const sdz = ship.position.z - playerPos.z;
            if (sdx * sdx + sdy * sdy + sdz * sdz > 20000 * 20000) return;
        }

        const data = ship.userData;

        // Skip caravan freighters - they have their own update via updateFreighterCaravans
        if (data.isCaravan) return;
        
        // Initialize AI state if not set
        if (!data.aiState) {
            data.aiState = 'idle';
            data.stateTimer = 0;
            data.fleeDirection = null;
            data.hasHailedPlayer = false;
            data.currentDestination = null;
            data.waitTime = 0;
        }
        
        // Check for nearby threats (enemies within 500 units)
        const nearbyThreat = checkForNearbyThreats(ship.position, 500);
        
        // State machine
        switch (data.aiState) {
            case 'idle':
                // Orbit around nebula center
                updateOrbitBehavior(ship, data);
                
                // Mining ships: use mining routes if available, otherwise local mining
                if (data.shipCategory === 'mining') {
                    if (data.hasMiningRoute && data.miningDestination && Math.random() < 0.01) {
                        // Start mining route to core system
                        data.aiState = 'traveling_to_mine';
                        if (window.GAME_DEBUG_VERBOSE) console.log(`⛏️ ${data.name} departing for ${data.miningDestinationName || 'mining site'}`);
                    } else if (!data.hasMiningRoute && Math.random() < 0.003) {
                        // Local mining (no route assigned)
                        data.aiState = 'mining';
                        data.stateTimer = 150 + Math.random() * 200;
                    }
                }
                
                // Science ships: chance to stop and scan
                if (data.shipCategory === 'science' && Math.random() < 0.003) {
                    data.aiState = 'scanning';
                    data.stateTimer = 100 + Math.random() * 150;
                }
                
                // Random chance to start traveling to a destination
                if (data.nearbyPlanets && data.nearbyPlanets.length > 0 && Math.random() < 0.005) {
                    data.aiState = 'traveling';
                    data.currentDestination = data.nearbyPlanets[Math.floor(Math.random() * data.nearbyPlanets.length)].clone();
                    data.stateTimer = 0;
                }
                
                // Check if player is nearby for hailing (100 units trigger distance)
                if (playerPos && !data.hasHailedPlayer && now - lastCivilianHailTime > HAIL_COOLDOWN) {
                    const distToPlayer = ship.position.distanceTo(playerPos);
                    if (distToPlayer < 100 && distToPlayer > 30) {
                        // Higher chance to hail at close range
                        if (Math.random() < 0.05) {
                            hailPlayer(ship, data);
                            lastCivilianHailTime = now;
                        }
                    }
                }
                
                // React to threats
                if (nearbyThreat) {
                    data.aiState = 'fleeing';
                    data.fleeDirection = new THREE.Vector3()
                        .subVectors(ship.position, nearbyThreat.position)
                        .normalize();
                    data.stateTimer = 0;
                    
                    // Chance to send distress
                    if (now - lastDistressTime > DISTRESS_COOLDOWN && Math.random() < 0.3) {
                        sendDistressSignal(ship, data);
                        lastDistressTime = now;
                    }
                }
                break;
                
            case 'traveling':
                data.stateTimer++;
                
                if (data.currentDestination) {
                    // Move toward destination
                    const toDestination = new THREE.Vector3()
                        .subVectors(data.currentDestination, ship.position);
                    const distance = toDestination.length();
                    
                    if (distance < 100) {
                        // Arrived - wait then return or pick new destination
                        data.aiState = 'waiting';
                        data.waitTime = 200 + Math.random() * 300;
                        data.stateTimer = 0;
                    } else {
                        // Travel toward destination
                        toDestination.normalize();
                        const travelSpeed = (data.speed || 0.5) * 2;
                        ship.position.add(toDestination.multiplyScalar(travelSpeed));
                        
                        // Face direction of travel
                        ship.lookAt(data.currentDestination);
                    }
                } else {
                    data.aiState = 'idle';
                }
                
                // React to threats while traveling
                if (nearbyThreat) {
                    data.aiState = 'fleeing';
                    data.fleeDirection = new THREE.Vector3()
                        .subVectors(ship.position, nearbyThreat.position)
                        .normalize();
                    data.stateTimer = 0;
                }
                
                // Timeout - return to idle
                if (data.stateTimer > 2000) {
                    data.aiState = 'idle';
                    data.currentDestination = null;
                }
                break;
                
            case 'waiting':
                data.waitTime--;
                if (data.waitTime <= 0) {
                    // Return to nebula or pick new destination
                    if (Math.random() < 0.5 && data.nearbyPlanets && data.nearbyPlanets.length > 1) {
                        data.currentDestination = data.nearbyPlanets[Math.floor(Math.random() * data.nearbyPlanets.length)].clone();
                        data.aiState = 'traveling';
                    } else {
                        data.currentDestination = data.nebulaPosition.clone();
                        data.aiState = 'returning';
                    }
                }
                
                // Still react to threats while waiting
                if (nearbyThreat) {
                    data.aiState = 'fleeing';
                    data.fleeDirection = new THREE.Vector3()
                        .subVectors(ship.position, nearbyThreat.position)
                        .normalize();
                }
                break;
                
            case 'returning':
                if (data.nebulaPosition) {
                    const toHome = new THREE.Vector3()
                        .subVectors(data.nebulaPosition, ship.position);
                    const homeDist = toHome.length();
                    
                    if (homeDist < data.orbitRadius) {
                        data.aiState = 'idle';
                        data.currentDestination = null;
                    } else {
                        toHome.normalize();
                        const returnSpeed = (data.speed || 0.5) * 1.5;
                        ship.position.add(toHome.multiplyScalar(returnSpeed));
                        ship.lookAt(data.nebulaPosition);
                    }
                } else {
                    data.aiState = 'idle';
                }
                break;
                
            case 'fleeing':
                data.stateTimer++;
                
                if (data.fleeDirection) {
                    // Flee at high speed
                    const fleeSpeed = (data.speed || 0.5) * 4;
                    ship.position.add(data.fleeDirection.clone().multiplyScalar(fleeSpeed));
                    
                    // Face away from threat
                    const lookTarget = ship.position.clone().add(data.fleeDirection.clone().multiplyScalar(100));
                    ship.lookAt(lookTarget);
                    
                    // Add some evasive jitter
                    ship.position.x += (Math.random() - 0.5) * 2;
                    ship.position.y += (Math.random() - 0.5) * 1;
                    ship.position.z += (Math.random() - 0.5) * 2;
                }
                
                // Stop fleeing after a while or if threat is gone
                if (data.stateTimer > 300 || !nearbyThreat) {
                    data.aiState = 'returning';
                    data.stateTimer = 0;
                    data.fleeDirection = null;
                }
                break;
                
            case 'mining':
                // Mining behavior - wobble in place
                ship.position.x += (Math.random() - 0.5) * 0.5;
                ship.position.y += (Math.random() - 0.5) * 0.3;
                ship.position.z += (Math.random() - 0.5) * 0.5;
                ship.rotation.z = Math.sin(Date.now() * 0.005) * 0.1;
                
                data.stateTimer--;
                if (data.stateTimer <= 0) {
                    data.aiState = 'idle';
                    ship.rotation.z = 0;
                }
                
                // Still react to threats
                if (nearbyThreat) {
                    data.aiState = 'fleeing';
                    data.fleeDirection = new THREE.Vector3()
                        .subVectors(ship.position, nearbyThreat.position)
                        .normalize();
                    ship.rotation.z = 0;
                }
                break;
                
            case 'scanning':
                // Science scanning - slow rotation while stationary
                ship.rotation.y += 0.02;
                
                // Gentle hover
                ship.position.y += Math.sin(Date.now() * 0.003) * 0.1;
                
                data.stateTimer--;
                if (data.stateTimer <= 0) {
                    data.aiState = 'idle';
                }
                
                // Still react to threats
                if (nearbyThreat) {
                    data.aiState = 'fleeing';
                    data.fleeDirection = new THREE.Vector3()
                        .subVectors(ship.position, nearbyThreat.position)
                        .normalize();
                }
                break;
            
            // =================================================================
            // MINING ROUTE STATES - Ships traveling between nebulas and systems
            // =================================================================
            case 'traveling_to_mine':
                if (data.hasMiningRoute && data.miningDestination) {
                    const toMine = new THREE.Vector3()
                        .subVectors(data.miningDestination, ship.position);
                    const mineDist = toMine.length();
                    
                    if (mineDist < 500) {
                        // Arrived at mining location
                        data.aiState = 'mining_at_destination';
                        data.miningProgress = 0;
                        data.stateTimer = data.miningDuration || 30000;
                    } else {
                        // Travel toward mining destination
                        toMine.normalize();
                        const travelSpeed = (data.speed || 0.4) * 1.5;
                        ship.position.add(toMine.multiplyScalar(travelSpeed));
                        ship.lookAt(data.miningDestination);
                        
                        // Update route progress
                        if (data.homeNebula) {
                            const totalDist = data.homeNebula.distanceTo(data.miningDestination);
                            const currentDist = ship.position.distanceTo(data.homeNebula);
                            data.routeProgress = Math.min(1, currentDist / totalDist);
                        }
                    }
                } else {
                    // No route, fall back to idle orbit
                    data.aiState = 'idle';
                }
                
                // React to threats
                if (nearbyThreat) {
                    data.aiState = 'fleeing';
                    data.fleeDirection = new THREE.Vector3()
                        .subVectors(ship.position, nearbyThreat.position)
                        .normalize();
                }
                break;
            
            case 'mining_at_destination':
                // Mining behavior at destination system
                ship.position.x += (Math.random() - 0.5) * 0.8;
                ship.position.y += (Math.random() - 0.5) * 0.4;
                ship.position.z += (Math.random() - 0.5) * 0.8;
                ship.rotation.z = Math.sin(Date.now() * 0.004) * 0.15;
                
                data.miningProgress += (typeof gameState !== 'undefined' && gameState.dtMs) || 16.67; // real elapsed ms
                if (data.miningProgress >= (data.miningDuration || 30000)) {
                    // Done mining, head back home
                    data.aiState = 'returning_with_cargo';
                    ship.rotation.z = 0;
                }
                
                // React to threats even while mining
                if (nearbyThreat) {
                    data.aiState = 'fleeing';
                    data.fleeDirection = new THREE.Vector3()
                        .subVectors(ship.position, nearbyThreat.position)
                        .normalize();
                    ship.rotation.z = 0;
                }
                break;
            
            case 'returning_with_cargo':
                if (data.homeNebula) {
                    const toHome = new THREE.Vector3()
                        .subVectors(data.homeNebula, ship.position);
                    const homeDist = toHome.length();
                    
                    if (homeDist < (data.orbitRadius || 500)) {
                        // Back home - reset to traveling state after a brief rest
                        data.aiState = 'idle';
                        data.stateTimer = 500 + Math.random() * 500; // Rest before next trip
                        
                        // After resting, start another mining trip
                        setTimeout(() => {
                            if (data.hasMiningRoute && ship.userData) {
                                ship.userData.aiState = 'traveling_to_mine';
                            }
                        }, (data.stateTimer || 500) * 16.67);
                    } else {
                        // Travel home (slightly slower when loaded with cargo)
                        toHome.normalize();
                        const returnSpeed = (data.speed || 0.4) * 1.2;
                        ship.position.add(toHome.multiplyScalar(returnSpeed));
                        ship.lookAt(data.homeNebula);
                        
                        // Update route progress (going back)
                        if (data.miningDestination) {
                            const totalDist = data.homeNebula.distanceTo(data.miningDestination);
                            const currentDist = ship.position.distanceTo(data.miningDestination);
                            data.routeProgress = Math.min(1, currentDist / totalDist);
                        }
                    }
                } else if (data.nebulaPosition) {
                    // Fallback to nebulaPosition if homeNebula not set
                    data.homeNebula = data.nebulaPosition.clone();
                } else {
                    data.aiState = 'idle';
                }
                
                // React to threats
                if (nearbyThreat) {
                    data.aiState = 'fleeing';
                    data.fleeDirection = new THREE.Vector3()
                        .subVectors(ship.position, nearbyThreat.position)
                        .normalize();
                }
                break;
        }
    });
}

function updateOrbitBehavior(ship, data) {
    // Safety check: Skip if no nebulaPosition (e.g., caravan freighters)
    if (!data.nebulaPosition) return;
    
    // BI-DIRECTIONAL ORBIT: Use orbitDirection to determine CW vs CCW
    const direction = data.orbitDirection || 1; // Default to CCW if not set
    data.orbitAngle += data.orbitSpeed * direction;
    
    const newX = data.nebulaPosition.x + Math.cos(data.orbitAngle) * data.orbitRadius;
    const newZ = data.nebulaPosition.z + Math.sin(data.orbitAngle) * data.orbitRadius;
    
    // Gentle vertical bob
    const verticalBob = Math.sin(data.orbitAngle * 3) * 20;
    const newY = data.nebulaPosition.y + data.verticalOffset + verticalBob;
    
    // Smooth movement
    ship.position.x += (newX - ship.position.x) * 0.02;
    ship.position.y += (newY - ship.position.y) * 0.02;
    ship.position.z += (newZ - ship.position.z) * 0.02;
    
    // Face direction of travel (accounts for orbit direction)
    const movementDir = new THREE.Vector3(
        newX - ship.position.x,
        0,
        newZ - ship.position.z
    ).normalize();
    
    if (movementDir.length() > 0.01) {
        ship.lookAt(ship.position.x + movementDir.x * 100, ship.position.y, ship.position.z + movementDir.z * 100);
    }
}

function checkForNearbyThreats(position, range) {
    // Check for enemies near this position
    if (typeof enemies !== 'undefined' && enemies.length > 0) {
        for (const enemy of enemies) {
            if (!enemy || !enemy.position || !enemy.visible) continue;
            if (enemy.userData && enemy.userData.isDead) continue;
            
            const distance = position.distanceTo(enemy.position);
            if (distance < range) {
                return enemy;
            }
        }
    }
    
    // Check for player projectiles (lasers) near this position
    if (typeof lasers !== 'undefined' && lasers.length > 0) {
        for (const laser of lasers) {
            if (!laser || !laser.position) continue;
            
            const distance = position.distanceTo(laser.position);
            if (distance < range * 0.5) { // Smaller range for projectiles
                // Return a fake "threat" at the projectile position to flee from
                return { position: laser.position.clone(), isProjectile: true };
            }
        }
    }
    
    return null;
}

// =============================================================================
// FREIGHTER CARAVAN UPDATE SYSTEM
// =============================================================================

// Track caravan attack events
let lastCaravanAttackTime = 0;
const CARAVAN_ATTACK_COOLDOWN = 90000; // 90 seconds between caravan attacks
let caravanDistressShown = false;

function updateFreighterCaravans() {
    if (freighterCaravans.length === 0) return;
    
    const now = Date.now();
    const playerPos = (typeof camera !== 'undefined' && camera) ? camera.position : null;
    
    freighterCaravans.forEach(caravan => {
        if (!caravan || caravan.ships.length === 0) return;
        
        // Update caravan progress along route
        caravan.progress += caravan.speed * caravan.direction;
        
        // Reverse direction at endpoints (ping-pong between nebulas)
        if (caravan.progress >= 1.0) {
            caravan.progress = 1.0;
            caravan.direction = -1;
        } else if (caravan.progress <= 0.0) {
            caravan.progress = 0.0;
            caravan.direction = 1;
        }
        
        // Calculate caravan center position
        const routeVector = new THREE.Vector3().subVectors(caravan.destination, caravan.source);
        const caravanCenter = caravan.source.clone().add(routeVector.clone().multiplyScalar(caravan.progress));
        
        // Calculate facing direction
        const facingDir = caravan.direction > 0 
            ? routeVector.clone().normalize() 
            : routeVector.clone().negate().normalize();
        
        // Update each ship in caravan
        caravan.ships.forEach((ship, shipIndex) => {
            if (!ship || !ship.userData) return;
            
            // Calculate target position (formation offset rotated to face direction)
            const offset = ship.userData.formationOffset.clone();
            
            // Rotate offset to align with travel direction
            const angle = Math.atan2(facingDir.x, facingDir.z);
            const rotatedOffset = new THREE.Vector3(
                offset.x * Math.cos(angle) - offset.z * Math.sin(angle),
                offset.y,
                offset.x * Math.sin(angle) + offset.z * Math.cos(angle)
            );
            
            const targetPos = caravanCenter.clone().add(rotatedOffset);
            
            // Smooth movement toward target
            ship.position.lerp(targetPos, 0.02);
            
            // Face travel direction
            const lookTarget = ship.position.clone().add(facingDir.clone().multiplyScalar(100));
            ship.lookAt(lookTarget);
        });
        
        // Check for enemy attacks on caravan
        if (!caravan.underAttack && now - lastCaravanAttackTime > CARAVAN_ATTACK_COOLDOWN) {
            checkCaravanForAttack(caravan, playerPos);
        }
        
        // Update attack state
        if (caravan.underAttack) {
            updateCaravanUnderAttack(caravan, playerPos);
        }
    });
}

function checkCaravanForAttack(caravan, playerPos) {
    // Only trigger attacks when player is somewhat nearby (within 5000 units)
    if (!playerPos) return;
    
    const caravanPos = caravan.ships[0]?.position;
    if (!caravanPos) return;
    
    const distToPlayer = caravanPos.distanceTo(playerPos);
    if (distToPlayer > 5000) return;
    
    // Check for nearby enemies
    if (typeof enemies === 'undefined' || enemies.length === 0) return;
    
    for (const enemy of enemies) {
        if (!enemy || !enemy.position || !enemy.visible) continue;
        if (enemy.userData && enemy.userData.isDead) continue;
        
        const distToCaravan = enemy.position.distanceTo(caravanPos);
        if (distToCaravan < 800) {
            // ATTACK! Enemy is close to caravan
            triggerCaravanAttack(caravan, enemy);
            return;
        }
    }
    
    // Random chance for enemies to intercept caravan when player is nearby
    if (Math.random() < 0.001 && distToPlayer < 3000) { // 0.1% chance per frame
        // Find nearest enemy to redirect
        let nearestEnemy = null;
        let nearestDist = Infinity;
        
        for (const enemy of enemies) {
            if (!enemy || !enemy.position || !enemy.visible) continue;
            if (enemy.userData && (enemy.userData.isDead || enemy.userData.isBoss)) continue;
            
            const dist = enemy.position.distanceTo(caravanPos);
            if (dist < nearestDist && dist < 3000) {
                nearestDist = dist;
                nearestEnemy = enemy;
            }
        }
        
        if (nearestEnemy) {
            triggerCaravanAttack(caravan, nearestEnemy);
        }
    }
}

function triggerCaravanAttack(caravan, enemy) {
    console.log(`🚨 CARAVAN UNDER ATTACK! Caravan ${caravan.id + 1} targeted by enemy!`);
    
    caravan.underAttack = true;
    caravan.attackers = [enemy];
    lastCaravanAttackTime = Date.now();
    
    // Redirect enemy to attack caravan
    if (enemy.userData) {
        enemy.userData.targetCaravan = caravan;
        enemy.userData.originalTarget = enemy.userData.swarmTarget;
        enemy.userData.swarmTarget = caravan.ships[0];
    }
    
    // Show distress call to player
    if (!caravanDistressShown) {
        const distressMsg = `MAYDAY! This is Caravan ${caravan.id + 1} en route from ${caravan.sourceName}! We're under attack! Any friendly ships, please assist!`;
        showIncomingTransmission(`Caravan ${caravan.id + 1} DISTRESS`, distressMsg, true);
        caravanDistressShown = true;
        
        // Reset distress flag after cooldown
        setTimeout(() => { caravanDistressShown = false; }, 60000);
    }
    
    // Show achievement/mission prompt
    if (typeof showAchievement === 'function') {
        showAchievement('⚠️ CONVOY IN DANGER', `Defend Caravan ${caravan.id + 1}! Freighters need protection!`);
    }
}

function updateCaravanUnderAttack(caravan, playerPos) {
    // Check if attackers are still alive
    caravan.attackers = caravan.attackers.filter(enemy => {
        return enemy && enemy.visible && enemy.userData && !enemy.userData.isDead;
    });
    
    // Attack resolved if no attackers left
    if (caravan.attackers.length === 0) {
        caravan.underAttack = false;
        console.log(`✅ Caravan ${caravan.id + 1} is safe!`);
        
        // Thank player if they're nearby
        if (playerPos) {
            const caravanPos = caravan.ships[0]?.position;
            if (caravanPos && caravanPos.distanceTo(playerPos) < 1500) {
                showIncomingTransmission(`Caravan ${caravan.id + 1}`, 
                    "Thank you, pilot! You saved our cargo and our lives. Safe travels!");
                
                // Award player (optional - could add credits/XP)
                if (typeof showAchievement === 'function') {
                    showAchievement('🛡️ CONVOY SAVED', `Caravan ${caravan.id + 1} successfully defended!`);
                }
            }
        }
        return;
    }
    
    // Caravan ships try to flee during attack
    caravan.ships.forEach(ship => {
        if (!ship || !ship.userData) return;
        
        // Evasive maneuvers
        ship.position.x += (Math.random() - 0.5) * 1.5;
        ship.position.y += (Math.random() - 0.5) * 0.5;
        ship.position.z += (Math.random() - 0.5) * 1.5;
    });
    
    // Enemies actively pursue caravan ships
    caravan.attackers.forEach(enemy => {
        if (!enemy || !enemy.userData) return;
        
        // Pick a random caravan ship to target
        const targetShip = caravan.ships[Math.floor(Math.random() * caravan.ships.length)];
        if (targetShip && targetShip.position) {
            enemy.userData.swarmTarget = targetShip;
        }
    });
}

// Damage caravan freighter when hit by enemy fire
function damageCaravanFreighter(ship) {
    if (!ship || !ship.userData || !ship.userData.isCaravan) return false;
    
    ship.userData.health = (ship.userData.health || 3) - 1;
    
    console.log(`💥 Caravan freighter hit! Health: ${ship.userData.health}/${ship.userData.maxHealth}`);
    
    if (ship.userData.health <= 0) {
        // Freighter destroyed
        destroyCaravanFreighter(ship);
        return true;
    }
    
    // Visual damage feedback - flash red
    ship.traverse((child) => {
        if (child.isMesh && child.material) {
            const originalEmissive = child.material.emissive.getHex();
            child.material.emissive.setHex(0xff0000);
            setTimeout(() => {
                if (child.material) child.material.emissive.setHex(originalEmissive);
            }, 200);
        }
    });
    
    return false;
}

function destroyCaravanFreighter(ship) {
    console.log(`💀 Caravan freighter destroyed: ${ship.userData.name}`);
    
    // Create explosion effect
    if (typeof createExplosionEffect === 'function') {
        createExplosionEffect(ship);
    }
    
    // Remove from caravan
    const caravanId = ship.userData.caravanId;
    const caravan = freighterCaravans[caravanId];
    if (caravan) {
        const idx = caravan.ships.indexOf(ship);
        if (idx > -1) caravan.ships.splice(idx, 1);
        
        // If all ships destroyed, caravan is lost
        if (caravan.ships.length === 0) {
            console.log(`☠️ Caravan ${caravanId + 1} completely destroyed!`);
            if (typeof showAchievement === 'function') {
                showAchievement('💀 CONVOY LOST', `Caravan ${caravanId + 1} was destroyed. The cargo is lost.`);
            }
        }
    }
    
    // Remove from trading ships array
    const tradingIdx = tradingShips.indexOf(ship);
    if (tradingIdx > -1) tradingShips.splice(tradingIdx, 1);
    
    // Remove from scene
    scene.remove(ship);
}

function hailPlayer(ship, data) {
    const message = civilianShipHails[Math.floor(Math.random() * civilianShipHails.length)];
    const shipName = data.name || 'Civilian Ship';
    
    // Display transmission using Mission Command style UI
    showIncomingTransmission(shipName, message);
    
    console.log(`📡 ${shipName} hails: "${message}"`);
    data.hasHailedPlayer = true;
    
    // Reset hail flag after a while so they can hail again later
    setTimeout(() => {
        if (data) data.hasHailedPlayer = false;
    }, 120000); // Can hail again after 2 minutes
}

// Show incoming transmission with game-matching UI style
// NOTE: This is dead code — game-controls.js defines a later (and active)
// showIncomingTransmission(title, text, factionColor) that overrides this one
// (both are global function declarations; the last-loaded wins). Kept as-is;
// the live comms styling/colour-coding lives in game-controls.js.
function showIncomingTransmission(sender, message, isDistress = false) {
    // Check if transmission container exists, create if not
    let container = document.getElementById('incomingTransmission');
    if (!container) {
        container = document.createElement('div');
        container.id = 'incomingTransmission';
        document.body.appendChild(container);
    }

    // Match game UI style - transparent like HUD elements
    // Keep border color matching (cyan for normal, red for distress)
    const borderColor = isDistress ? 'rgba(255, 80, 80, 0.5)' : 'rgba(0, 150, 255, 0.5)';
    const glowColor = isDistress ? 'rgba(255, 50, 50, 0.3)' : 'rgba(0, 150, 255, 0.3)';
    const titleColor = isDistress ? '#ff6666' : '#00ddff';
    const accentColor = isDistress ? 'rgba(255, 80, 80, 0.3)' : 'rgba(0, 150, 255, 0.3)';

    // Transmission type label - NO emoji for distress
    const transmissionLabel = isDistress ? 'DISTRESS SIGNAL' : 'INCOMING TRANSMISSION';

    container.style.cssText = `
        position: fixed;
        top: 72px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.35) 0%, rgba(30, 41, 59, 0.35) 100%);
        border: 1px solid ${borderColor};
        border-radius: 4px;
        padding: 11px 18px;
        z-index: 1000;
        min-width: 240px;
        max-width: 360px;
        font-family: 'Orbitron', 'Courier New', monospace;
        opacity: 0;
        transition: opacity 0.4s ease;
        pointer-events: none;
        box-shadow:
            0 12px 40px ${glowColor},
            inset 0 1px 0 ${accentColor},
            inset 0 -1px 0 ${accentColor};
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
    `;

    container.innerHTML = `
        <div style="
            color: ${titleColor};
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 3px;
            margin-bottom: 10px;
            text-shadow: 0 0 8px ${titleColor};
            border-bottom: 1px solid ${borderColor};
            padding-bottom: 8px;
        ">
            ${transmissionLabel}
        </div>
        <div style="
            color: #aaccff;
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 8px;
            text-shadow: 0 0 5px rgba(100, 150, 255, 0.5);
        ">
            FROM: ${sender.toUpperCase()}
        </div>
        <div style="
            color: #88aacc;
            font-size: 11px;
            line-height: 1.5;
            font-style: italic;
            padding-left: 8px;
            border-left: 2px solid ${accentColor};
        ">
            "${message}"
        </div>
    `;

    // Show with fade in
    requestAnimationFrame(() => {
        container.style.opacity = '1';
    });

    // Auto-hide after delay. 3x the originals (6s/4.5s -> 18s/13.5s)
    // so message reads aren't snatched off the screen before they
    // can be read.
    const hideDelay = isDistress ? 18000 : 13500;
    setTimeout(() => {
        container.style.opacity = '0';
    }, hideDelay);
}

window.showIncomingTransmission = showIncomingTransmission;

function sendDistressSignal(ship, data) {
    const message = distressMessages[Math.floor(Math.random() * distressMessages.length)];
    const shipName = data.name || 'Civilian Ship';
    
    // Mark ship as in distress
    data.inDistress = true;
    
    // Display distress message using Mission Command style
    showIncomingTransmission(shipName, message, true);
    
    console.log(`🆘 DISTRESS: ${shipName}: "${message}"`);
    
    // Add visual distress indicator (flashing beacon, not PointLight)
    if (!ship.userData.distressBeacon) {
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const distressBeacon = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), beaconMat);
        distressBeacon.position.set(0, 10, 0);
        ship.add(distressBeacon);
        ship.userData.distressBeacon = distressBeacon;
        
        // Flash the beacon
        let flashOn = true;
        const flashInterval = trackInterval(setInterval(() => {
            if (!ship || !ship.userData || !ship.userData.distressBeacon) {
                clearInterval(flashInterval);
                return;
            }
            flashOn = !flashOn;
            ship.userData.distressBeacon.visible = flashOn;
        }, 500));
        
        // Stop flashing after 30 seconds
        setTimeout(() => {
            clearInterval(flashInterval);
            if (ship && ship.userData && ship.userData.distressBeacon) {
                ship.remove(ship.userData.distressBeacon);
                ship.userData.distressBeacon = null;
                ship.userData.inDistress = false;
            }
        }, 30000);
    }
}

window.tradingShips = tradingShips;
window.createTradingShipsInNebulas = createTradingShipsInNebulas;
window.createShipsInDistantExoticNebulas = createShipsInDistantExoticNebulas;
window.createDistantNebulaShip = createDistantNebulaShip;
window.createMiningShipWithRoute = createMiningShipWithRoute;
window.createOuterNebulaCaravans = createOuterNebulaCaravans;
window.updateClusteredMiningRoutes = updateClusteredMiningRoutes;
window.updateTradingShips = updateTradingShips;
window.freighterCaravans = freighterCaravans;
window.updateFreighterCaravans = updateFreighterCaravans;
window.damageCaravanFreighter = damageCaravanFreighter;
window.SHIP_TYPE_COLORS = SHIP_TYPE_COLORS;

// =============================================================================
// CIVILIAN SHIPS THROUGHOUT THE UNIVERSE - Various ship types in different areas
// =============================================================================
const civilianShips = [];

function createCivilianShipsNearPlanets() {
    console.log('🚀 Creating civilian ships near planets...');
    
    if (typeof planets === 'undefined' || planets.length === 0) {
        console.log('No planets found, skipping civilian ships near planets');
        return;
    }
    
    let shipsCreated = 0;
    
    // Add ships around some planets (not all, to avoid clutter)
    const planetsWithShips = planets.filter(() => Math.random() < 0.3); // 30% of planets
    
    planetsWithShips.forEach((planet, index) => {
        if (!planet || !planet.position) return;
        
        // 1-3 ships per planet
        const shipCount = 1 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < shipCount; i++) {
            const ship = createCivilianShipNearPlanet(planet, i);
            if (ship) {
                civilianShips.push(ship);
                shipsCreated++;
            }
        }
    });
    
    console.log(`✅ Created ${shipsCreated} civilian ships near planets`);
}

function createCivilianShipNearPlanet(planet, index) {
    // Pick ship type appropriate for planet
    const planetShipTypes = ['shuttle', 'passenger', 'freighter', 'science'];
    const shipCategory = planetShipTypes[Math.floor(Math.random() * planetShipTypes.length)];
    
    let shipGroup;
    if (typeof civilianShipRegistry !== 'undefined') {
        shipGroup = civilianShipRegistry.getShipMesh(shipCategory);
    } else {
        // Simple fallback
        shipGroup = new THREE.Group();
        const hull = new THREE.Mesh(
            new THREE.BoxGeometry(20, 10, 40),
            new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.5, roughness: 0.5 })
        );
        shipGroup.add(hull);
    }
    
    // Position in orbit around planet
    const planetRadius = planet.userData.radius || 100;
    const orbitRadius = planetRadius * 2 + 50 + Math.random() * 100;
    const angle = Math.random() * Math.PI * 2;
    const inclination = (Math.random() - 0.5) * 0.5;
    
    const x = planet.position.x + Math.cos(angle) * orbitRadius;
    const y = planet.position.y + Math.sin(inclination) * orbitRadius * 0.3;
    const z = planet.position.z + Math.sin(angle) * orbitRadius;
    
    shipGroup.position.set(x, y, z);
    
    const categoryData = (typeof civilianShipRegistry !== 'undefined')
        ? civilianShipRegistry.categories[shipCategory]
        : { name: 'Shuttle' };
    
    shipGroup.userData = {
        type: 'civilian_ship',
        shipCategory: shipCategory,
        name: `${categoryData.name} ${index + 1}`,
        planetName: planet.userData.name,
        planetPosition: planet.position.clone(),
        orbitRadius: orbitRadius,
        orbitAngle: angle,
        orbitSpeed: 0.0002 + Math.random() * 0.0003,
        orbitInclination: inclination,
        isNeutral: true
    };
    
    shipGroup.visible = true;
    scene.add(shipGroup);
    
    return shipGroup;
}

function createMiningShipsInAsteroidBelts() {
    console.log('⛏️ Creating mining ships in asteroid belts...');
    
    if (typeof asteroidBelts === 'undefined' || asteroidBelts.length === 0) {
        console.log('No asteroid belts found, skipping mining ships');
        return;
    }
    
    let shipsCreated = 0;
    
    asteroidBelts.forEach((belt, beltIndex) => {
        if (!belt || !belt.position) return;
        
        // 2-4 mining ships per belt
        const shipCount = 2 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < shipCount; i++) {
            const ship = createMiningShip(belt, i);
            if (ship) {
                civilianShips.push(ship);
                shipsCreated++;
            }
        }
    });
    
    console.log(`✅ Created ${shipsCreated} mining ships in asteroid belts`);
}

function createMiningShip(belt, index) {
    let shipGroup;
    if (typeof civilianShipRegistry !== 'undefined') {
        shipGroup = civilianShipRegistry.getShipMesh('mining');
    } else {
        shipGroup = new THREE.Group();
        const hull = new THREE.Mesh(
            new THREE.BoxGeometry(30, 20, 45),
            new THREE.MeshStandardMaterial({ color: 0xaaaa55, metalness: 0.5, roughness: 0.6 })
        );
        shipGroup.add(hull);
    }
    
    // Position within the belt
    const beltRadius = belt.userData.radius || 500;
    const angle = Math.random() * Math.PI * 2;
    const radiusVariation = beltRadius * 0.3;
    const actualRadius = beltRadius + (Math.random() - 0.5) * radiusVariation;
    
    const x = belt.position.x + Math.cos(angle) * actualRadius;
    const y = belt.position.y + (Math.random() - 0.5) * 50;
    const z = belt.position.z + Math.sin(angle) * actualRadius;
    
    shipGroup.position.set(x, y, z);
    
    shipGroup.userData = {
        type: 'civilian_ship',
        shipCategory: 'mining',
        name: `Mining Vessel ${index + 1}`,
        beltPosition: belt.position.clone(),
        orbitRadius: actualRadius,
        orbitAngle: angle,
        orbitSpeed: 0.00005 + Math.random() * 0.0001, // Very slow
        isNeutral: true
    };
    
    shipGroup.visible = true;
    scene.add(shipGroup);
    
    return shipGroup;
}

function createScienceShipsNearAnomalies() {
    console.log('🔬 Creating science ships near anomalies...');
    
    let shipsCreated = 0;
    
    // Near pulsars
    if (typeof cosmicFeatures !== 'undefined' && cosmicFeatures.pulsars) {
        cosmicFeatures.pulsars.forEach((pulsar, i) => {
            if (Math.random() < 0.5) { // 50% chance
                const ship = createScienceShip(pulsar.position, 'pulsar', i);
                if (ship) {
                    civilianShips.push(ship);
                    shipsCreated++;
                }
            }
        });
    }
    
    // Near black holes (galaxy centers)
    if (typeof galaxyTypes !== 'undefined') {
        for (let g = 0; g < 8; g++) {
            if (Math.random() < 0.3) { // 30% chance per galaxy
                const center = getGalaxy3DPosition(g);
                const ship = createScienceShip(center, 'black_hole', g);
                if (ship) {
                    civilianShips.push(ship);
                    shipsCreated++;
                }
            }
        }
    }
    
    console.log(`✅ Created ${shipsCreated} science ships near anomalies`);
}

function createScienceShip(targetPosition, targetType, index) {
    let shipGroup;
    if (typeof civilianShipRegistry !== 'undefined') {
        shipGroup = civilianShipRegistry.getShipMesh('science');
    } else {
        shipGroup = new THREE.Group();
        const hull = new THREE.Mesh(
            new THREE.CylinderGeometry(20, 15, 8, 12),
            new THREE.MeshStandardMaterial({ color: 0x4488ff, metalness: 0.7, roughness: 0.3 })
        );
        shipGroup.add(hull);
    }
    
    // Position at safe distance from anomaly
    const safeDistance = targetType === 'black_hole' ? 2000 : 500;
    const angle = Math.random() * Math.PI * 2;
    
    const x = targetPosition.x + Math.cos(angle) * safeDistance;
    const y = targetPosition.y + (Math.random() - 0.5) * 200;
    const z = targetPosition.z + Math.sin(angle) * safeDistance;
    
    shipGroup.position.set(x, y, z);
    
    shipGroup.userData = {
        type: 'civilian_ship',
        shipCategory: 'science',
        name: `Research Vessel ${index + 1}`,
        targetPosition: targetPosition.clone(),
        targetType: targetType,
        orbitRadius: safeDistance,
        orbitAngle: angle,
        orbitSpeed: 0.002 + Math.random() * 0.003,
        isNeutral: true
    };
    
    shipGroup.visible = true;
    scene.add(shipGroup);
    
    return shipGroup;
}

// Mining ship specific messages
const miningShipHails = [
    "Rich deposits in this sector!",
    "Another load of ore coming up.",
    "These asteroids aren't going to mine themselves!",
    "Careful around the belt - debris everywhere.",
    "Found some rare minerals. Today's a good day!",
    "Watch your hull in here, friend.",
    "Mining is honest work. Dangerous, but honest."
];

// Science ship specific messages
const scienceShipHails = [
    "Fascinating readings from this anomaly!",
    "Running spectral analysis... don't mind us.",
    "The data we're collecting here is unprecedented!",
    "Anomaly stability at 73%... probably safe.",
    "For science!",
    "Recording some unusual phenomena here.",
    "These energy signatures are off the charts!"
];

function updateCivilianShips() {
    if (civilianShips.length === 0) return;
    
    const now = Date.now();
    const playerPos = (typeof camera !== 'undefined' && camera) ? camera.position : null;
    
    civilianShips.forEach(ship => {
        if (!ship || !ship.userData) return;
        
        const data = ship.userData;
        
        // Initialize AI state if not set
        if (!data.aiState) {
            data.aiState = 'working'; // Mining/scanning/orbiting
            data.stateTimer = 0;
            data.fleeDirection = null;
            data.hasHailedPlayer = false;
            data.workCycleTimer = 0;
        }
        
        // Get center position for this ship's work area
        let centerPos;
        if (data.planetPosition) {
            centerPos = data.planetPosition;
        } else if (data.beltPosition) {
            centerPos = data.beltPosition;
        } else if (data.targetPosition) {
            centerPos = data.targetPosition;
        } else {
            return;
        }
        
        // Check for nearby threats
        const nearbyThreat = checkForNearbyThreats(ship.position, 400);
        
        switch (data.aiState) {
            case 'working':
                // Update orbit angle (normal work behavior)
                data.orbitAngle += data.orbitSpeed || 0.0001;
                
                const newX = centerPos.x + Math.cos(data.orbitAngle) * data.orbitRadius;
                const newZ = centerPos.z + Math.sin(data.orbitAngle) * data.orbitRadius;
                
                // Smooth movement
                ship.position.x += (newX - ship.position.x) * 0.02;
                ship.position.z += (newZ - ship.position.z) * 0.02;
                
                // Face direction of travel
                const direction = new THREE.Vector3(newX - ship.position.x, 0, newZ - ship.position.z);
                if (direction.length() > 0.01) {
                    ship.lookAt(ship.position.x + direction.x * 100, ship.position.y, ship.position.z + direction.z * 100);
                }
                
                // Mining ships: occasional "mining" behavior (stop and hover)
                if (data.shipCategory === 'mining') {
                    data.workCycleTimer++;
                    if (data.workCycleTimer > 500 && Math.random() < 0.005) {
                        data.aiState = 'mining';
                        data.stateTimer = 100 + Math.random() * 200;
                        data.workCycleTimer = 0;
                    }
                }
                
                // Science ships: occasional "scanning" behavior
                if (data.shipCategory === 'science') {
                    data.workCycleTimer++;
                    if (data.workCycleTimer > 400 && Math.random() < 0.005) {
                        data.aiState = 'scanning';
                        data.stateTimer = 150 + Math.random() * 150;
                        data.workCycleTimer = 0;
                    }
                }
                
                // Check if player is nearby for hailing (100 units trigger distance)
                if (playerPos && !data.hasHailedPlayer && now - lastCivilianHailTime > HAIL_COOLDOWN) {
                    const distToPlayer = ship.position.distanceTo(playerPos);
                    if (distToPlayer < 100 && distToPlayer > 30) {
                        if (Math.random() < 0.05) {
                            hailPlayerCivilian(ship, data);
                            lastCivilianHailTime = now;
                        }
                    }
                }
                
                // React to threats
                if (nearbyThreat) {
                    data.aiState = 'fleeing';
                    data.fleeDirection = new THREE.Vector3()
                        .subVectors(ship.position, nearbyThreat.position)
                        .normalize();
                    data.stateTimer = 0;
                    
                    if (now - lastDistressTime > DISTRESS_COOLDOWN && Math.random() < 0.25) {
                        sendDistressSignal(ship, data);
                        lastDistressTime = now;
                    }
                }
                break;
                
            case 'mining':
                // Stationary mining - slight wobble
                ship.position.x += (Math.random() - 0.5) * 0.3;
                ship.position.z += (Math.random() - 0.5) * 0.3;
                
                data.stateTimer--;
                if (data.stateTimer <= 0) {
                    data.aiState = 'working';
                }
                
                if (nearbyThreat) {
                    data.aiState = 'fleeing';
                    data.fleeDirection = new THREE.Vector3()
                        .subVectors(ship.position, nearbyThreat.position)
                        .normalize();
                }
                break;
                
            case 'scanning':
                // Slow rotation while scanning
                ship.rotation.y += 0.01;
                
                data.stateTimer--;
                if (data.stateTimer <= 0) {
                    data.aiState = 'working';
                }
                
                if (nearbyThreat) {
                    data.aiState = 'fleeing';
                    data.fleeDirection = new THREE.Vector3()
                        .subVectors(ship.position, nearbyThreat.position)
                        .normalize();
                }
                break;
                
            case 'fleeing':
                data.stateTimer++;
                
                if (data.fleeDirection) {
                    const fleeSpeed = 3;
                    ship.position.add(data.fleeDirection.clone().multiplyScalar(fleeSpeed));
                    
                    const lookTarget = ship.position.clone().add(data.fleeDirection.clone().multiplyScalar(100));
                    ship.lookAt(lookTarget);
                    
                    // Evasive maneuvers
                    ship.position.x += (Math.random() - 0.5) * 1.5;
                    ship.position.z += (Math.random() - 0.5) * 1.5;
                }
                
                // Return to work when safe
                if (data.stateTimer > 250 || !nearbyThreat) {
                    data.aiState = 'returning';
                    data.stateTimer = 0;
                    data.fleeDirection = null;
                }
                break;
                
            case 'returning':
                const toCenter = new THREE.Vector3().subVectors(centerPos, ship.position);
                const distToCenter = toCenter.length();
                
                if (distToCenter < data.orbitRadius * 1.2) {
                    data.aiState = 'working';
                } else {
                    toCenter.normalize();
                    ship.position.add(toCenter.multiplyScalar(1.5));
                    ship.lookAt(centerPos);
                }
                break;
        }
    });
}

function hailPlayerCivilian(ship, data) {
    let messages;
    if (data.shipCategory === 'mining') {
        messages = miningShipHails;
    } else if (data.shipCategory === 'science') {
        messages = scienceShipHails;
    } else {
        messages = civilianShipHails;
    }
    
    const message = messages[Math.floor(Math.random() * messages.length)];
    const shipName = data.name || 'Civilian Ship';
    
    // Use Mission Command style transmission UI
    showIncomingTransmission(shipName, message);
    
    console.log(`📡 ${shipName} hails: "${message}"`);
    data.hasHailedPlayer = true;
    
    setTimeout(() => {
        if (data) data.hasHailedPlayer = false;
    }, 90000);
}

// Function to spawn all civilian ships
function createAllCivilianShips() {
    // Civilian ships only in nebulas now - disabled for core systems
    console.log('🌍 Civilian ships disabled for core systems (nebula trading ships only)');
    // createCivilianShipsNearPlanets();  // Disabled - only nebula ships
    // createMiningShipsInAsteroidBelts(); // Disabled - only nebula ships
    // createScienceShipsNearAnomalies();  // Disabled - only nebula ships
    console.log(`✅ Total civilian ships created: ${civilianShips.length}`);
}

window.civilianShips = civilianShips;
window.createAllCivilianShips = createAllCivilianShips;
window.updateCivilianShips = updateCivilianShips;

// Fast-forward every nebula fleet (civilian / mining / science / trading
// orbital ships AND freighter caravans) to where they'd be after N
// minutes of play, so the universe looks "lived-in" the instant the
// game starts instead of every ship sitting at its spawn phase. Phases
// (orbitAngle / routeProgress / caravan.progress) are advanced
// deterministically and orbital positions snapped. Latched so it runs
// once.
function prewarmNebulaFleets(minutes) {
    if (typeof window !== 'undefined') {
        if (window._fleetsPrewarmed) return;
        window._fleetsPrewarmed = true;
    }
    const frames = (minutes || 20) * 3600; // minutes × 60s × 60fps

    if (typeof civilianShips !== 'undefined') {
        for (let i = 0; i < civilianShips.length; i++) {
            const ship = civilianShips[i];
            const d = ship && ship.userData;
            if (!d) continue;
            // Orbital workers (orbit a planet/belt/anomaly/nebula center)
            if (typeof d.orbitSpeed === 'number' && typeof d.orbitRadius === 'number') {
                if (typeof d.orbitAngle !== 'number') d.orbitAngle = Math.random() * Math.PI * 2;
                d.orbitAngle += d.orbitSpeed * frames;
                const c = d.planetPosition || d.beltPosition || d.targetPosition || d.nebulaPosition;
                if (c) {
                    ship.position.x = c.x + Math.cos(d.orbitAngle) * d.orbitRadius;
                    ship.position.z = c.z + Math.sin(d.orbitAngle) * d.orbitRadius;
                }
            }
            // Route runners (clustered-nebula mining ships)
            if (typeof d.routeProgress === 'number' && typeof d.routeSpeed === 'number') {
                let p = (d.routeProgress + d.routeSpeed * frames) % 1;
                d.routeProgress = p < 0 ? p + 1 : p;
            }
        }
    }

    // Freighter caravans ping-pong source↔destination; walk the travel
    // over the elapsed time so they end up mid-route in either direction.
    if (typeof freighterCaravans !== 'undefined') {
        for (let i = 0; i < freighterCaravans.length; i++) {
            const cv = freighterCaravans[i];
            if (!cv || typeof cv.progress !== 'number') continue;
            let p = cv.progress, dir = cv.direction || 1, travel = (cv.speed || 0.0002) * frames;
            let guard = 0;
            while (travel > 1e-6 && guard++ < 100000) {
                const rem = dir > 0 ? (1 - p) : p;
                if (travel <= rem) { p += dir * travel; travel = 0; }
                else { travel -= rem; p = (dir > 0) ? 1 : 0; dir = -dir; }
            }
            cv.progress = p; cv.direction = dir;
        }
    }
    console.log('🛰️ Nebula fleets pre-warmed to ~' + (minutes || 20) + ' min of play');
}
if (typeof window !== 'undefined') window.prewarmNebulaFleets = prewarmNebulaFleets;

// =============================================================================
// ENEMIES IN DISTANT/EXOTIC GALAXIES - Add patrols to outer regions
// =============================================================================
function createDistantExoticEnemies() {
    console.log('👾 Creating enemies in distant and exotic galaxies...');
    
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) {
        console.log('No nebulas found, skipping distant enemies');
        return;
    }
    
    let enemiesCreated = 0;
    
    // Get distant and exotic nebulas
    const outerNebulas = nebulaClouds.filter(n => 
        n && n.userData && (n.userData.isDistant || n.userData.isExoticCore)
    );
    
    // Assign enemy types to distant/exotic areas (cycle through galaxy types)
    outerNebulas.forEach((nebula, index) => {
        // Assign a galaxy type (enemy faction) to this nebula
        const galaxyId = index % 8;
        const galaxyType = galaxyTypes[galaxyId];
        
        // Store the faction info in the nebula
        nebula.userData.assignedFaction = galaxyId;
        nebula.userData.factionName = galaxyType.faction;
        
        // Create 3-5 patrol enemies per distant/exotic nebula
        const enemyCount = 3 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < enemyCount; i++) {
            createDistantEnemy(nebula, galaxyId, i);
            enemiesCreated++;
        }
    });
    
    console.log(`✅ Created ${enemiesCreated} enemies across ${outerNebulas.length} distant/exotic nebulas`);
}

function createDistantEnemy(nebula, galaxyId, index) {
    const galaxyType = galaxyTypes[galaxyId];
    const shapeData = enemyShapes[galaxyId];
    
    // Create enemy geometry
    const enemyGeometry = createEnemyGeometry(galaxyId);
    const distance = nebula.userData.distanceFromOrigin || 50000;
    const materials = createEnemyMaterial(shapeData, 'regular', distance);
    
    // Create enemy mesh
    let enemy;
    let isGLBModel = false;
    if (typeof createEnemyMeshWithModel === 'function') {
        enemy = createEnemyMeshWithModel(galaxyId + 1, enemyGeometry, materials.enemyMaterial, 96.0);
        isGLBModel = enemy.isGroup || (enemy.children && enemy.children.length > 0);
    } else {
        enemy = new THREE.Mesh(enemyGeometry, materials.enemyMaterial);
    }
    
    // Add glow for non-GLB enemies
    if (!isGLBModel) {
        const glowGeometry = enemyGeometry.clone();
        const glow = new THREE.Mesh(glowGeometry, materials.glowMaterial);
        glow.scale.multiplyScalar(materials.glowScale);
        glow.visible = true;
        glow.frustumCulled = false;
        enemy.add(glow);
    }
    
    // Position around the nebula
    const nebulaSize = nebula.userData.size || 2000;
    const patrolRadius = nebulaSize * 0.5 + Math.random() * nebulaSize * 0.5;
    const angle = (index / 5) * Math.PI * 2 + Math.random();
    const height = (Math.random() - 0.5) * 500;
    
    const enemyX = nebula.position.x + Math.cos(angle) * patrolRadius;
    const enemyY = nebula.position.y + height;
    const enemyZ = nebula.position.z + Math.sin(angle) * patrolRadius;
    
    enemy.position.set(enemyX, enemyY, enemyZ);
    
    // Calculate hitbox size
    let hitboxSize = 96;
    try {
        const box = new THREE.Box3().setFromObject(enemy);
        const size = new THREE.Vector3();
        box.getSize(size);
        hitboxSize = Math.max(size.x, size.y, size.z);
    } catch (e) {}
    
    enemy.userData = {
        name: `${galaxyType.faction} Deep Space Patrol ${index + 1}`,
        type: 'enemy',
        health: getEnemyHealthForDifficulty(false, false, false) * 1.2, // Slightly tougher
        maxHealth: getEnemyHealthForDifficulty(false, false, false) * 1.2,
        speed: 0.3 + Math.random() * 0.7,
        aggression: 0.6 + Math.random() * 0.4,
        patrolCenter: nebula.position.clone(),
        patrolRadius: patrolRadius,
        lastAttack: 0,
        isActive: false,
        visible: true,
        galaxyId: galaxyId,
        galaxyColor: shapeData.color,
        swarmTarget: null,
        circlePhase: Math.random() * Math.PI * 2,
        attackMode: 'patrol',
        detectionRange: 2000, // Larger detection range in deep space
        firingRange: 300,
        isLocal: false,
        isBoss: false,
        isBossSupport: false,
        position3D: enemy.position.clone(),
        placementType: 'distant_patrol',
        hitboxSize: hitboxSize,
        nebulaName: nebula.userData.name,
        isDistantGalaxy: nebula.userData.isDistant || false,
        isExoticGalaxy: nebula.userData.isExoticCore || false
    };
    
    enemy.visible = true;
    enemy.frustumCulled = true;
    
    scene.add(enemy);
    enemies.push(enemy);
}

window.createDistantExoticEnemies = createDistantExoticEnemies;

// Spawn a single regular enemy for `galaxyId` at `position`, anchored to a
// tight patrol radius.  Used when a nebula mission endpoint doesn't have
// enough hostiles to relocate and we need to top it up with fresh spawns
// so the dotted line always leads to a real fight.
function spawnMissionEnemyAt(galaxyId, position) {
    if (typeof galaxyTypes === 'undefined' || typeof enemyShapes === 'undefined') return null;
    const galaxyType = galaxyTypes[galaxyId];
    const shapeData = enemyShapes[galaxyId];
    if (!galaxyType || !shapeData) return null;

    const enemyGeometry = createEnemyGeometry(galaxyId);
    const galaxyCenter = (typeof getGalaxy3DPosition === 'function')
        ? getGalaxy3DPosition(galaxyId)
        : new THREE.Vector3();
    const distance = galaxyCenter.distanceTo(position);
    const materials = createEnemyMaterial(shapeData, 'regular', distance);

    let enemy;
    let isGLBModel = false;
    if (typeof createEnemyMeshWithModel === 'function') {
        enemy = createEnemyMeshWithModel(galaxyId + 1, enemyGeometry, materials.enemyMaterial, 96.0);
        isGLBModel = enemy.isGroup || (enemy.children && enemy.children.length > 0 && enemy.children[0].isMesh);
    } else {
        enemy = new THREE.Mesh(enemyGeometry, materials.enemyMaterial);
    }

    if (!isGLBModel) {
        const glowGeometry = enemyGeometry.clone();
        const glow = new THREE.Mesh(glowGeometry, materials.glowMaterial);
        glow.scale.multiplyScalar(materials.glowScale);
        glow.visible = true;
        glow.frustumCulled = false;
        enemy.add(glow);
    }

    // Scatter within a 1200u sphere around the endpoint
    const off = new THREE.Vector3(
        (Math.random() - 0.5) * 1500,
        (Math.random() - 0.5) * 600,
        (Math.random() - 0.5) * 1500
    );
    enemy.position.copy(position).add(off);

    let hitboxSize = 96;
    try {
        const box = new THREE.Box3().setFromObject(enemy);
        const size = new THREE.Vector3();
        box.getSize(size);
        hitboxSize = Math.max(size.x, size.y, size.z);
    } catch (e) {}

    const isLocal = (galaxyId === 7);
    enemy.userData = {
        name: `${galaxyType.faction} Hostile (mission)`,
        type: 'enemy',
        health: getEnemyHealthForDifficulty(isLocal, false, false),
        maxHealth: getEnemyHealthForDifficulty(isLocal, false, false),
        speed: 0.2 + Math.random() * 0.8,
        aggression: Math.random(),
        patrolCenter: position.clone(),
        patrolRadius: 1200,
        lastAttack: 0,
        isActive: false,
        visible: true,
        galaxyId: galaxyId,
        galaxyColor: shapeData.color,
        swarmTarget: null,
        circlePhase: Math.random() * Math.PI * 2,
        attackMode: 'patrol',
        detectionRange: isLocal ? 1200 : 1600,
        firingRange: isLocal ? 180 : 240,
        isLocal: isLocal,
        isBoss: false,
        isBossSupport: false,
        position3D: enemy.position.clone(),
        placementType: 'mission',
        hitboxSize: hitboxSize,
        missionAnchored: true
    };

    enemy.visible = true;
    enemy.frustumCulled = true;
    scene.add(enemy);
    enemies.push(enemy);
    return enemy;
}

window.spawnMissionEnemyAt = spawnMissionEnemyAt;

// =============================================================================
// UFO ENEMIES - Mysterious aliens patrolling exotic systems with erratic movement
// =============================================================================
const ufoEnemies = [];
let ufoModelCache = null;

async function loadUFOModel() {
    if (ufoModelCache) return ufoModelCache;
    
    return new Promise((resolve) => {
        if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
            resolve(null);
            return;
        }
        
        const loader = new THREE.GLTFLoader();
        loader.load(
            'models/UFO.glb',
            (gltf) => {
                ufoModelCache = gltf.scene;
                console.log('🛸 UFO model loaded');
                resolve(ufoModelCache);
            },
            undefined,
            (error) => {
                console.warn('⚠️ UFO model not found, using procedural');
                resolve(null);
            }
        );
    });
}

function createProceduralUFO() {
    const ufoGroup = new THREE.Group();

    // Hostile palette to match the rest of the enemies (Martian Pirate
    // red 0xff4444 family) — the old green/cyan read as friendly, the
    // same colour as the wingmen. Dark metal hull + red glow accents +
    // an additive glow layer like createEnemyMaterial uses.
    const HOSTILE = 0xff4444;
    const HOT = 0xff7733;

    // Classic saucer shape — dark warm metal.
    const saucerGeom = new THREE.CylinderGeometry(40, 50, 12, 24);
    const saucerMat = new THREE.MeshStandardMaterial({
        color: 0x3a2a2a,
        metalness: 0.9,
        roughness: 0.25,
        emissive: 0x220808,
        emissiveIntensity: 0.6
    });
    const saucer = new THREE.Mesh(saucerGeom, saucerMat);
    ufoGroup.add(saucer);

    // Additive glow shell around the hull (enemy-style aura).
    const auraMat = new THREE.MeshBasicMaterial({
        color: HOSTILE, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const aura = new THREE.Mesh(new THREE.CylinderGeometry(46, 58, 14, 24), auraMat);
    ufoGroup.add(aura);

    // Dome on top — glowing red cockpit.
    const domeGeom = new THREE.SphereGeometry(20, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshStandardMaterial({
        color: 0xff6655,
        metalness: 0.3,
        roughness: 0.1,
        transparent: true,
        opacity: 0.75,
        emissive: 0xff3322,
        emissiveIntensity: 0.8
    });
    const dome = new THREE.Mesh(domeGeom, domeMat);
    dome.position.y = 6;
    ufoGroup.add(dome);

    // Glowing underside (the abduction-beam ring) — hostile red.
    const glowGeom = new THREE.RingGeometry(15, 45, 24);
    const glowMat = new THREE.MeshBasicMaterial({
        color: HOSTILE,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.rotation.x = Math.PI / 2;
    glow.position.y = -6;
    ufoGroup.add(glow);

    // Pulsing rim lights — hot orange.
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const light = new THREE.Mesh(
            new THREE.SphereGeometry(3, 8, 8),
            new THREE.MeshBasicMaterial({
                color: HOT, transparent: true, opacity: 0.95,
                blending: THREE.AdditiveBlending
            })
        );
        light.position.set(Math.cos(angle) * 42, 0, Math.sin(angle) * 42);
        light.userData.lightIndex = i;
        ufoGroup.add(light);
    }

    return ufoGroup;
}

function createUFOEnemy(position, systemName, index) {
    let ufo;
    
    if (ufoModelCache) {
        ufo = ufoModelCache.clone();
        ufo.scale.set(3, 3, 3); // Reasonable UFO scale
        
        // Enhance materials for game style + a hostile red emissive so
        // GLB UFOs read as enemies (not the friendly-green default).
        ufo.traverse((child) => {
            if (child.isMesh && child.material) {
                if (child.material.isMeshStandardMaterial) {
                    child.material.metalness = 0.85;
                    child.material.roughness = 0.15;
                    child.material.envMapIntensity = 2.0;
                    if (child.material.emissive) {
                        child.material.emissive.setHex(0xff3322);
                        child.material.emissiveIntensity = 0.5;
                    }
                }
            }
        });
    } else {
        ufo = createProceduralUFO();
    }
    
    ufo.position.copy(position);
    
    // UFO userData - erratic movement parameters
    ufo.userData = {
        name: `Unknown Craft ${index + 1}`,
        type: 'enemy',
        enemyType: 'ufo',
        health: 4, // Takes 4 hits
        maxHealth: 4,
        speed: 1.5, // Fast!
        aggression: 0.7,
        patrolCenter: position.clone(),
        patrolRadius: 2000,
        lastAttack: 0,
        isActive: false,
        visible: true,
        galaxyId: -1, // No faction
        galaxyColor: 0xff4444, // hostile red on radar/HUD, like other enemies
        attackMode: 'erratic',
        detectionRange: 3200,
        firingRange: 700,
        beamCooldownMs: 1500,
        beamDamage: 5,
        isLocal: false,
        isBoss: false,
        isUFO: true,
        alwaysDropMissile: true, // Always drop missile on death
        systemName: systemName,
        hitboxSize: 190,
        // Erratic movement parameters
        erraticPhase: Math.random() * Math.PI * 2,
        erraticSpeed: 0.02 + Math.random() * 0.03,
        wobbleAmplitude: 300 + Math.random() * 200,
        verticalBob: Math.random() * Math.PI * 2,
        spiralPhase: Math.random() * Math.PI * 2
    };
    
    ufo.visible = true;
    ufo.frustumCulled = false;

    // Invisible hitbox sphere so the UFO is reliably TARGETABLE. A UFO is
    // a Group with no top-level geometry, so raycast-based targeting/lock
    // (which other enemies satisfy via this same isHitbox child) would
    // skip it. Sized ~95 world units regardless of the GLB/procedural
    // scale so the reticle catches the whole saucer.
    let _uws = new THREE.Vector3();
    try { ufo.getWorldScale(_uws); } catch (e) { _uws.set(1, 1, 1); }
    const _us = Math.max(0.0001, (Math.abs(_uws.x) + Math.abs(_uws.y) + Math.abs(_uws.z)) / 3);
    const _hbMat = new THREE.MeshBasicMaterial({ visible: false });
    const _hitbox = new THREE.Mesh(new THREE.SphereGeometry(95 / _us, 10, 8), _hbMat);
    _hitbox.userData.isHitbox = true;
    _hitbox.frustumCulled = false;
    ufo.add(_hitbox);

    scene.add(ufo);
    enemies.push(ufo);
    ufoEnemies.push(ufo);

    return ufo;
}

function createUFOsInExoticSystems() {
    // Latch so the various startup paths (and the loadUFOModel.then) can
    // all call this without double-spawning.
    if (typeof window !== 'undefined') {
        if (window._exoticUFOsCreated) return;
        window._exoticUFOsCreated = true;
    }
    console.log('🛸 Creating UFO enemies in exotic systems...');

    if (typeof outerInterstellarSystems === 'undefined' || outerInterstellarSystems.length === 0) {
        console.log('No outer systems found, skipping UFOs');
        if (typeof window !== 'undefined') window._exoticUFOsCreated = false; // allow a retry once systems exist
        return;
    }

    let ufosCreated = 0;
    
    // Add UFOs to exotic core systems only
    outerInterstellarSystems.forEach((system, sysIndex) => {
        if (!system || !system.userData) return;
        
        // Only exotic core systems get UFOs (not borg patrol)
        if (system.userData.systemType !== 'exotic_core') return;
        
        // 2-4 UFOs per exotic system
        const ufoCount = 2 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < ufoCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 1000 + Math.random() * 2000;
            const height = (Math.random() - 0.5) * 500;
            
            const ufoPosition = new THREE.Vector3(
                system.position.x + Math.cos(angle) * distance,
                system.position.y + height,
                system.position.z + Math.sin(angle) * distance
            );
            
            createUFOEnemy(ufoPosition, system.userData.name, ufosCreated);
            ufosCreated++;
        }
    });
    
    console.log(`✅ Created ${ufosCreated} UFO enemies in exotic systems`);
}

// UFO erratic movement update
const _ufoV1 = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _ufoV2 = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _ufoV3 = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

// Intelligent UFO update. Patrol erratically until the player comes
// within detectionRange, then HUNT: hold a strafing standoff just inside
// firing range, orbit the player, and fire ray beams on cooldown.
function updateUFOMovement() {
    if (!_ufoV1) return;
    const now = Date.now();
    // Frame-rate-independent easing: scale the per-frame lerps / spin / phase
    // advance by elapsed frames so UFO motion stays smooth and consistent
    // whether the game is at 30 or 60fps (the old fixed 0.02/0.04 factors ran
    // faster at high FPS and slower at low FPS, which read as uneven motion).
    const _ufoNow = (typeof performance !== 'undefined') ? performance.now() : now;
    if (!updateUFOMovement._lt) updateUFOMovement._lt = _ufoNow - 16.67;
    const _f = Math.max(0.5, Math.min(4, (_ufoNow - updateUFOMovement._lt) / 16.67));
    updateUFOMovement._lt = _ufoNow;
    const live = (typeof camera !== 'undefined' && camera &&
                  typeof gameState !== 'undefined' && gameState &&
                  gameState.gameStarted && !gameState.gameOver);
    const playerPos = live ? camera.position : null;

    // Game-time step (slow-mo aware, vsync-aligned) — replaces the private
    // performance.now() clock, so saucers obey hitstop/slow-mo like every
    // other agent and stop drifting against the fixed-step world.
    const dtMs = (typeof gameState !== 'undefined' && gameState.dtMs) ? gameState.dtMs : (_f * 16.67);

    ufoEnemies.forEach(ufo => {
        if (!ufo || !ufo.userData || ufo.userData.health <= 0) return;
        const data = ufo.userData;

        // Saucers always spin lazily on their axis.
        ufo.rotation.y += 0.03 * _f;

        const dist = playerPos ? ufo.position.distanceTo(playerPos) : Infinity;
        const hunting = playerPos && dist < (data.detectionRange || 3000);
        data.isActive = !!hunting;
        data.attackMode = hunting ? 'hunting' : 'erratic';

        // ── SAUCER STATE MACHINE: hover ⇄ dart ──────────────────────────
        // The old exponential-lerp toward a drifting point read as mushy.
        // Real saucer character is the CONTRAST: a menacing, near-stationary
        // hover (where the beam fires — it reads as deliberate), then an
        // explosive eased dash to a new vantage with a hard bank into the
        // motion. The dash is parametric (from→to, easeOutCubic on the
        // game-time clock), so it is perfectly smooth at any frame rate.
        data._ufoClock = (data._ufoClock || 0) + dtMs;
        const tNow = data._ufoClock;
        if (!data._moveState) {
            data._moveState = 'hover';
            data._stateUntil = tNow + 400 + Math.random() * 600;
        }

        if (data._moveState === 'hover') {
            // Near-stationary micro-wobble + upright scanning posture
            data.verticalBob = (data.verticalBob || 0) + 0.0035 * dtMs;
            ufo.position.y += Math.sin(data.verticalBob) * 0.08 * _f;
            ufo.rotation.x += (0.06 - ufo.rotation.x) * Math.min(1, 0.12 * _f);
            ufo.rotation.z += (0 - ufo.rotation.z) * Math.min(1, 0.12 * _f);

            // Beam fire lands during the pause
            if (hunting && dist < (data.firingRange || 700) * 1.3 &&
                now - (data.lastAttack || 0) > (data.beamCooldownMs || 1500)) {
                data.lastAttack = now;
                _fireUFORayBeam(ufo.position.clone(), playerPos.clone());
                _ufoDamagePlayer(ufo, data.beamDamage || 5);
            }

            if (tNow >= data._stateUntil) {
                // Pick the next dash destination.
                let tx, ty, tz;
                if (hunting) {
                    const standoff = Math.max(260, (data.firingRange || 700) * 0.85);
                    if (dist > standoff * 1.7) {
                        // Far out — dash INWARD in bursts (approach by dashes,
                        // never a straight cruise).
                        const k = 1 - (standoff * 1.2) / dist;
                        tx = ufo.position.x + (playerPos.x - ufo.position.x) * Math.min(0.6, k);
                        ty = ufo.position.y + (playerPos.y - ufo.position.y) * Math.min(0.6, k)
                            + (Math.random() - 0.5) * 160;
                        tz = ufo.position.z + (playerPos.z - ufo.position.z) * Math.min(0.6, k);
                    } else {
                        // On station — zig-zag to a new point on the standoff
                        // ring: rotate the radial by a random ±35–100° and add
                        // a vertical pop. Sudden repositioning = saucer.
                        _ufoV1.subVectors(ufo.position, playerPos);
                        const ang = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.15);
                        const ca = Math.cos(ang), sa = Math.sin(ang);
                        const rx = _ufoV1.x * ca - _ufoV1.z * sa;
                        const rz = _ufoV1.x * sa + _ufoV1.z * ca;
                        _ufoV2.set(rx, _ufoV1.y, rz).normalize().multiplyScalar(standoff);
                        tx = playerPos.x + _ufoV2.x;
                        ty = playerPos.y + _ufoV2.y + (Math.random() - 0.5) * 260;  // vertical pop
                        tz = playerPos.z + _ufoV2.z;
                    }
                } else {
                    // Patrol: dash to a fresh point inside the patrol bubble
                    const R = data.wobbleAmplitude || 300;
                    tx = data.patrolCenter.x + (Math.random() - 0.5) * 2 * R;
                    ty = data.patrolCenter.y + (Math.random() - 0.5) * 320;
                    tz = data.patrolCenter.z + (Math.random() - 0.5) * 2 * R;
                }
                data._dartFrom = { x: ufo.position.x, y: ufo.position.y, z: ufo.position.z };
                data._dartTo = { x: tx, y: ty, z: tz };
                data._dartStart = tNow;
                const dashLen = Math.hypot(tx - ufo.position.x, ty - ufo.position.y, tz - ufo.position.z);
                data._dartDur = Math.max(280, Math.min(750, dashLen * 1.4));  // farther = a bit longer
                data._moveState = 'dart';
            }
        } else {
            // DART: explosive ease-out dash from→to on the game-time clock
            const pRaw = (tNow - data._dartStart) / (data._dartDur || 400);
            const p = Math.min(1, pRaw);
            const e = 1 - Math.pow(1 - p, 3);   // easeOutCubic — violent start, soft stop
            const f0 = data._dartFrom, t0 = data._dartTo;
            ufo.position.set(
                f0.x + (t0.x - f0.x) * e,
                f0.y + (t0.y - f0.y) * e,
                f0.z + (t0.z - f0.z) * e);
            // Bank HARD into the motion (decays as the dash lands)
            const punch = (1 - p);
            const bankZ = Math.max(-0.75, Math.min(0.75, -(t0.x - f0.x) * 0.004)) * punch;
            const bankX = Math.max(-0.55, Math.min(0.55, (t0.z - f0.z) * 0.004)) * punch + 0.06;
            ufo.rotation.z += (bankZ - ufo.rotation.z) * Math.min(1, 0.3 * _f);
            ufo.rotation.x += (bankX - ufo.rotation.x) * Math.min(1, 0.3 * _f);
            if (p >= 1) {
                data._moveState = 'hover';
                // Hunting saucers pause briefly (pressure); patrols linger.
                data._stateUntil = tNow + (hunting ? 260 + Math.random() * 520
                                                   : 550 + Math.random() * 950);
            }
        }

        // UFOs also stay out of black-hole event-horizon warp zones.
        if (typeof window !== 'undefined' && typeof window._enemyAvoidBlackHoles === 'function') {
            window._enemyAvoidBlackHoles(ufo);
        }
    });
}

// Special UFO weapon — a thick pulsing red ray beam (distinct from the
// thin faction lasers). Visual only; damage is applied separately.
function _fireUFORayBeam(startPos, endPos) {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;
    const dir = new THREE.Vector3().subVectors(endPos, startPos);
    const len = dir.length();
    if (len < 1) return;
    const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const mid = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);

    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff2211, transparent: true, opacity: 0.95 });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, len, 10), coreMat);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xff7744, transparent: true, opacity: 0.45,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, len, 10), glowMat);

    [core, glow].forEach(m => {
        m.position.copy(mid);
        m.quaternion.copy(quat);
        m.frustumCulled = false;
        m.renderOrder = 55;
        scene.add(m);
    });

    let op = 1.0;
    const iv = setInterval(() => {
        op -= 0.25;
        coreMat.opacity = Math.max(0, 0.95 * op);
        glowMat.opacity = Math.max(0, 0.45 * op);
        if (op <= 0) {
            clearInterval(iv);
            scene.remove(core); scene.remove(glow);
            core.geometry.dispose(); glow.geometry.dispose();
            coreMat.dispose(); glowMat.dispose();
        }
    }, 55);

    // UFO ray beams get their own profile via the faction-laser synth.
    if (typeof playFactionLaserSound === 'function') playFactionLaserSound('ufo');
    else if (typeof playSound === 'function') playSound('enemy_fire');
}

// Apply ray-beam damage to the player, honouring shields / warp
// invulnerability — mirrors the player-hit path in fireEnemyWeapon.
function _ufoDamagePlayer(ufo, damage) {
    if (typeof gameState === 'undefined') return;
    const invuln = typeof isBlackHoleWarpInvulnerable === 'function' && isBlackHoleWarpInvulnerable();
    const shielded = typeof isShieldActive === 'function' && isShieldActive();
    if (invuln) return;
    const reduction = (typeof getShieldDamageReduction === 'function') ? getShieldDamageReduction() : 0;
    const actual = damage * (1 - reduction);
    if (gameState.hull !== undefined) gameState.hull = Math.max(0, gameState.hull - actual);
    else if (gameState.health !== undefined) gameState.health = Math.max(0, gameState.health - actual);
    if (shielded && typeof createShieldHitEffect === 'function') createShieldHitEffect(ufo.position);
    if (typeof createEnhancedScreenDamageEffect === 'function') createEnhancedScreenDamageEffect(ufo.position);
    if (!shielded && typeof flashPlayerShipHit === 'function') flashPlayerShipHit();
}

window.ufoEnemies = ufoEnemies;
window.createUFOsInExoticSystems = createUFOsInExoticSystems;
window.updateUFOMovement = updateUFOMovement;
window.loadUFOModel = loadUFOModel;

// =============================================================================
// SATELLITES & SPACE PROBES - Near inhabited areas and cosmic features
// =============================================================================
const satellites = [];
let satelliteModelsLoaded = false;
const satelliteModelCache = {};

async function loadSatelliteModels() {
    if (satelliteModelsLoaded) return;
    
    const models = ['Satellite.glb', 'Satellite2.glb', 'SpaceProbe.glb'];
    
    for (const modelFile of models) {
        try {
            const model = await new Promise((resolve) => {
                if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
                    resolve(null);
                    return;
                }
                const loader = new THREE.GLTFLoader();
                loader.load(
                    `models/${modelFile}`,
                    (gltf) => resolve(gltf.scene),
                    undefined,
                    () => resolve(null)
                );
            });
            
            if (model) {
                const key = modelFile.replace('.glb', '');
                satelliteModelCache[key] = model;
                console.log(`  📡 Loaded ${modelFile}`);
            }
        } catch (e) {
            console.warn(`  ⚠️ Failed to load ${modelFile}`);
        }
    }
    
    satelliteModelsLoaded = true;
    console.log(`📡 Satellite models loaded: ${Object.keys(satelliteModelCache).length}`);
}

function createSatellite(position, type = 'satellite') {
    let sat;
    
    // Pick model based on type
    const modelKeys = Object.keys(satelliteModelCache);
    if (modelKeys.length > 0) {
        let modelKey;
        if (type === 'probe') {
            modelKey = 'SpaceProbe';
        } else {
            // Random satellite
            const satKeys = modelKeys.filter(k => k.includes('Satellite'));
            modelKey = satKeys.length > 0 ? satKeys[Math.floor(Math.random() * satKeys.length)] : modelKeys[0];
        }
        
        if (satelliteModelCache[modelKey]) {
            sat = satelliteModelCache[modelKey].clone();
            sat.scale.set(2, 2, 2); // Reasonable satellite scale
            
            // Enhance materials with strong emissive (no point lights!)
            sat.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0xdddddd,
                        metalness: 0.5,
                        roughness: 0.3,
                        emissive: 0x446688,
                        emissiveIntensity: 1.5
                    });
                }
            });
            
            // Add blinking beacon (MeshBasicMaterial, not PointLight)
            const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), beaconMat);
            beacon.position.set(0, 5, 0);
            sat.add(beacon);
            sat.userData.blinkBeacon = beacon;
        }
    }
    
    // Fallback procedural
    if (!sat) {
        sat = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(10, 10, 15),
            new THREE.MeshStandardMaterial({ 
                color: 0xdddddd, 
                metalness: 0.5, 
                roughness: 0.4,
                emissive: 0x446688,
                emissiveIntensity: 1.5
            })
        );
        sat.add(body);
        
        // Solar panels - blue emissive glow
        const panelMat = new THREE.MeshStandardMaterial({ 
            color: 0x66aaff, 
            metalness: 0.4, 
            roughness: 0.3,
            emissive: 0x4488dd,
            emissiveIntensity: 2.0
        });
        const panel1 = new THREE.Mesh(new THREE.BoxGeometry(30, 1, 10), panelMat);
        panel1.position.x = -20;
        sat.add(panel1);
        const panel2 = new THREE.Mesh(new THREE.BoxGeometry(30, 1, 10), panelMat);
        panel2.position.x = 20;
        sat.add(panel2);
        
        // Add blinking beacon (MeshBasicMaterial, not PointLight)
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), beaconMat);
        beacon.position.set(0, 8, 0);
        sat.add(beacon);
        sat.userData.blinkBeacon = beacon;
    }
    
    sat.position.copy(position);
    
    sat.userData = {
        type: 'satellite',
        subType: type,
        name: type === 'probe' ? 'Deep Space Probe' : 'Communications Satellite',
        isNeutral: true,
        rotationSpeed: 0.002 + Math.random() * 0.003,
        orbitSpeed: 0.002 + Math.random() * 0.003
    };
    
    sat.visible = true;
    scene.add(sat);
    satellites.push(sat);
    
    return sat;
}

function createSatellitesNearCosmicFeatures() {
    console.log('📡 Creating satellites and probes near cosmic features...');
    
    let created = 0;
    
    // Near cosmic features where enemies patrol
    if (typeof cosmicFeatures !== 'undefined') {
        // Near space whales
        if (cosmicFeatures.spaceWhales) {
            cosmicFeatures.spaceWhales.forEach((whale, i) => {
                if (whale && whale.position && Math.random() < 0.6) {
                    const offset = new THREE.Vector3(
                        (Math.random() - 0.5) * 500,
                        (Math.random() - 0.5) * 200,
                        (Math.random() - 0.5) * 500
                    );
                    createSatellite(whale.position.clone().add(offset), 'probe');
                    created++;
                }
            });
        }
        
        // Near crystal formations
        if (cosmicFeatures.crystalFormations) {
            cosmicFeatures.crystalFormations.forEach((crystal, i) => {
                if (crystal && crystal.position && Math.random() < 0.5) {
                    const offset = new THREE.Vector3(
                        (Math.random() - 0.5) * 300,
                        (Math.random() - 0.5) * 150,
                        (Math.random() - 0.5) * 300
                    );
                    createSatellite(crystal.position.clone().add(offset), 'probe');
                    created++;
                }
            });
        }
        
        // Near plasma storms
        if (cosmicFeatures.plasmaStorms) {
            cosmicFeatures.plasmaStorms.forEach((storm, i) => {
                if (storm && storm.position && Math.random() < 0.4) {
                    const offset = new THREE.Vector3(
                        (Math.random() - 0.5) * 600,
                        (Math.random() - 0.5) * 200,
                        (Math.random() - 0.5) * 600
                    );
                    createSatellite(storm.position.clone().add(offset), 'satellite');
                    created++;
                }
            });
        }
    }
    
    // Near outer interstellar systems (where enemies patrol)
    if (typeof outerInterstellarSystems !== 'undefined') {
        outerInterstellarSystems.forEach((system, i) => {
            if (!system || !system.position) return;
            
            // 1-3 satellites per system
            const satCount = 1 + Math.floor(Math.random() * 3);
            for (let s = 0; s < satCount; s++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = 500 + Math.random() * 1000;
                const offset = new THREE.Vector3(
                    Math.cos(angle) * distance,
                    (Math.random() - 0.5) * 200,
                    Math.sin(angle) * distance
                );
                createSatellite(system.position.clone().add(offset), Math.random() < 0.3 ? 'probe' : 'satellite');
                created++;
            }
        });
    }
    
    console.log(`✅ Created ${created} satellites and probes`);
}

function updateSatellites() {
    satellites.forEach(sat => {
        if (!sat || !sat.userData) return;
        
        // Slow rotation
        sat.rotation.y += sat.userData.rotationSpeed || 0.002;
        
        // Gentle bob for probes
        if (sat.userData.subType === 'probe') {
            sat.rotation.x = Math.sin(Date.now() * 0.001) * 0.1;
        }
    });
}

window.satellites = satellites;
window.loadSatelliteModels = loadSatelliteModels;
window.createSatellitesNearCosmicFeatures = createSatellitesNearCosmicFeatures;
window.updateSatellites = updateSatellites;

// =============================================================================
// ENHANCED PLANET CLUSTERS - FROM EARLY VERSION
// Creates rich planetary systems with rings, moons, and asteroid belts within nebulas
// =============================================================================

// =============================================================================
// ENHANCED PLANET CLUSTERS - MASSIVELY DIVERSE VERSION
// Creates rich planetary systems with rings, moons, and asteroid belts within nebulas
// Matches the vibrant planet cluster diversity from stellar_slingshot_enhanced_copy.html
// =============================================================================

// =============================================================================
// ENHANCED PLANET CLUSTERS - MASSIVELY DIVERSE VERSION WITH LARGER PLANETS
// Creates rich planetary systems with rings, moons, and asteroid belts within nebulas
// ALL PLANETS support collision detection and gravitational slingshot assists
// =============================================================================

function createEnhancedPlanetClustersInNebulas() {
    console.log('🌟 Creating MASSIVELY DIVERSE enhanced planet clusters within nebulas...');
    
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) {
        console.warn('⚠️ No nebulas found - creating planet clusters in space instead');
    }
    
    const enhancedClusters = [];
    const clustersPerNebula = 2; // PERF: Reduced from 3 to 2 star systems per nebula
    
    // Create clusters within each nebula
    nebulaClouds.forEach((nebula, nebulaIndex) => {
        const nebulaPos = nebula.position;
        const nebulaSize = nebula.userData.size || 2000;
        
        console.log(`  🌌 Processing Nebula ${nebulaIndex + 1}...`);
        
        for (let c = 0; c < clustersPerNebula; c++) {
            // Position cluster within nebula bounds
            const clusterDistance = (Math.random() * 0.6 + 0.2) * nebulaSize;
            const clusterAngle = Math.random() * Math.PI * 2;
            const clusterElevation = (Math.random() - 0.5) * Math.PI * 0.3;
            
            const clusterX = nebulaPos.x + clusterDistance * Math.cos(clusterAngle) * Math.cos(clusterElevation);
            const clusterY = nebulaPos.y + clusterDistance * Math.sin(clusterElevation);
            const clusterZ = nebulaPos.z + clusterDistance * Math.sin(clusterAngle) * Math.cos(clusterElevation);
            
            const clusterCenter = new THREE.Vector3(clusterX, clusterY, clusterZ);
            
            // Create central star — 4× visual bump (60–140 vs the
            // earlier 15–35) so it dominates the cluster like a sun.
            // mass / gravity below still use starSize so slingshot
            // physics stay tuned to the original scale.
            const starSize = 15 + Math.random() * 20;
            const _starVisualSize = starSize * 2;
            const starGeometry = new THREE.SphereGeometry(_starVisualSize, 32, 32);
            const starColor = nebula.userData.color || new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
            const starMaterial = new THREE.MeshBasicMaterial({ 
                color: starColor,
                transparent: true,
                opacity: 0.9
            });
            const star = new THREE.Mesh(starGeometry, starMaterial);
            star.position.copy(clusterCenter);
            
            // Add star glow (scaled with the 4× visual radius)
            const glowGeometry = new THREE.SphereGeometry(_starVisualSize * 1.5, 32, 32);
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: starColor,
                transparent: true,
                opacity: 0.3,
                blending: THREE.AdditiveBlending
            });
            const starGlow = new THREE.Mesh(glowGeometry, glowMaterial);
            star.add(starGlow);
            
            star.userData = {
                name: `Nebula-${nebulaIndex + 1} Star System ${c + 1}`,
                type: 'star',
                mass: starSize * 3, // INCREASED mass for better slingshot
                gravity: 5.0, // INCREASED gravity
                nebulaId: nebulaIndex,
                clusterCenter: true
            };
            
            star.visible = true;
            star.frustumCulled = false;
            scene.add(star);
            planets.push(star);
            if (typeof addStarCorona === 'function') {
                addStarCorona(star, _starVisualSize, starColor);
            }

            // PERF: Reduced from 5-12 to 3-7 planets per star
            const planetCount = 3 + Math.floor(Math.random() * 5);
            console.log(`    🪐 Creating ${planetCount} planets for System ${c + 1}...`);
            
            for (let p = 0; p < planetCount; p++) {
                // ⭐ MUCH LARGER planet sizes
                let planetSize;
                const distanceFactor = p / planetCount;
                
                // 4x from original, 2x from previous — planets should
                // now clearly dwarf the player ship.
                // 1.45x on top of the previous pass. Combined with the wider
                // orbit spacing below, a nebula system now has bodies that
                // fill the frame when you fly past one instead of sliding by
                // as marbles. Collision + slingshot ranges are derived from
                // geometry.parameters.radius, so they scale with this.
                if (distanceFactor < 0.2) {
                    planetSize = 18 + Math.random() * 28;    // 18-46
                } else if (distanceFactor < 0.5) {
                    planetSize = 30 + Math.random() * 46;    // 30-76
                } else if (distanceFactor < 0.8) {
                    planetSize = 58 + Math.random() * 86;    // 58-144
                } else {
                    planetSize = 40 + Math.random() * 58;    // 40-98
                }
                
                // Segment count follows the (now larger) radius so the limb
                // never reads as a polygon when you fly past one.
                const planetGeometry = new THREE.SphereGeometry(
                    planetSize, planetSize >= 90 ? 56 : 36, planetSize >= 90 ? 40 : 28);
                
                // Diverse planet colors and types
                let planetHue, planetSaturation, planetLightness;
                const planetTypeRoll = Math.random();
                
                if (planetTypeRoll < 0.15) {
                    // Desert/Rocky (tan, orange, red)
                    planetHue = 0.05 + Math.random() * 0.12;
                    planetSaturation = 0.5 + Math.random() * 0.4;
                    planetLightness = 0.4 + Math.random() * 0.3;
                } else if (planetTypeRoll < 0.30) {
                    // Water worlds (blue, cyan)
                    planetHue = 0.55 + Math.random() * 0.15;
                    planetSaturation = 0.6 + Math.random() * 0.3;
                    planetLightness = 0.5 + Math.random() * 0.3;
                } else if (planetTypeRoll < 0.45) {
                    // Forest/Jungle (green)
                    planetHue = 0.25 + Math.random() * 0.15;
                    planetSaturation = 0.5 + Math.random() * 0.4;
                    planetLightness = 0.3 + Math.random() * 0.3;
                } else if (planetTypeRoll < 0.60) {
                    // Ice worlds (white, light blue)
                    planetHue = 0.55 + Math.random() * 0.05;
                    planetSaturation = 0.2 + Math.random() * 0.3;
                    planetLightness = 0.7 + Math.random() * 0.25;
                } else if (planetTypeRoll < 0.75) {
                    // Gas giants (yellow, orange, red, purple)
                    planetHue = Math.random() < 0.5 ? 
                                 (0.08 + Math.random() * 0.12) : 
                                 (0.75 + Math.random() * 0.2);
                    planetSaturation = 0.6 + Math.random() * 0.3;
                    planetLightness = 0.5 + Math.random() * 0.2;
                } else if (planetTypeRoll < 0.85) {
                    // Volcanic (dark red, orange glow)
                    planetHue = 0.0 + Math.random() * 0.08;
                    planetSaturation = 0.7 + Math.random() * 0.3;
                    planetLightness = 0.2 + Math.random() * 0.3;
                } else {
                    // Exotic/Crystal (purple, pink, teal)
                    planetHue = 0.65 + Math.random() * 0.25;
                    planetSaturation = 0.7 + Math.random() * 0.3;
                    planetLightness = 0.4 + Math.random() * 0.3;
                }
                
                // PRESENCE, not a coloured circle. These used to be unlit
                // MeshBasicMaterial spheres at 0.85 opacity: no terminator, no
                // limb falloff, and — being in the transparent queue — sorted
                // against the nebula gas sprites they sit inside, so they
                // flickered in front of and behind the cloud. The presence
                // material is opaque and does terminator + limb darkening +
                // night-side city lights + cloud shell + atmosphere rim, lit
                // from the cluster's own star (uSun), so every world in a
                // nebula points at its sun and reads as a globe.
                const _pColor = new THREE.Color().setHSL(planetHue, planetSaturation, planetLightness);
                // Habitable-looking worlds (water / forest bands) get cities;
                // gas giants and ice balls get weather instead.
                const _isLiving = (planetTypeRoll >= 0.15 && planetTypeRoll < 0.45);
                const _isGas = (planetTypeRoll >= 0.60 && planetTypeRoll < 0.75);
                const planetMaterial = createPlanetPresenceMaterial({
                    color: _pColor,
                    sun: clusterCenter,
                    city: _isLiving ? (0.55 + Math.random() * 0.45) : (Math.random() < 0.25 ? 0.25 : 0.0),
                    cloud: _isGas ? (0.75 + Math.random() * 0.25) : (0.20 + Math.random() * 0.45),
                    // Exotic / crystal worlds glow in their own hue at night —
                    // the synthwave read, not sodium-lamp Earth.
                    nightColor: planetTypeRoll >= 0.85
                        ? new THREE.Color().setHSL(planetHue + 0.12, 0.95, 0.62)
                        : 0xffbe5c,
                    rim: 0.55 + Math.random() * 0.35,
                    seed: Math.random() * 40
                });
                const planet = new THREE.Mesh(planetGeometry, planetMaterial);
                
                const orbitRadius = 700 + p * 560; // widened to match the bigger bodies
                const orbitSpeed = 0.002 + Math.random() * 0.008;
                const orbitPhase = Math.random() * Math.PI * 2;
                const orbitTilt = (Math.random() - 0.5) * 0.4;
                
                planet.position.set(
                    clusterX + Math.cos(orbitPhase) * orbitRadius,
                    clusterY + Math.sin(orbitTilt) * orbitRadius * 0.2,
                    clusterZ + Math.sin(orbitPhase) * orbitRadius
                );
                
                // ⭐ CRITICAL: Full collision and slingshot support
                planet.userData = {
                    name: `Nebula-${nebulaIndex + 1} System ${c + 1} Planet ${String.fromCharCode(65 + p)}`,
                    type: 'planet',
                    orbitRadius: orbitRadius,
                    orbitSpeed: orbitSpeed,
                    orbitPhase: orbitPhase,
                    orbitTilt: orbitTilt,
                    systemCenter: clusterCenter.clone(),
                    mass: planetSize * 2.5, // INCREASED mass for better slingshot
                    gravity: 1.5 + (planetSize * 0.3), // INCREASED gravity based on size
                    nebulaId: nebulaIndex,
                    inNebula: true
                };
                
                planet.visible = true;
                planet.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling for planets
                scene.add(planet);
                planets.push(planet);
                
                // Add RING SYSTEMS to 50% of planets
                const ringChance = distanceFactor > 0.5 ? 0.60 : 0.35;
                
                if (Math.random() < ringChance) {
                    // One banded plane instead of 2-5 flat coloured hoops.
                    // Ring planes are how the reference plates give a system a
                    // readable ecliptic; a stack of concentric outlines just
                    // reads as UI. A second wide, faint plane at a slight lean
                    // gives the dusty outer halo real systems have.
                    addPlanetRings(planet, planetSize, new THREE.Color().setHSL(
                        planetHue + 0.06, Math.max(0.18, planetSaturation - 0.15), 0.58
                    ), {
                        outerK: 2.2 + Math.random() * 0.6,
                        tilt: (Math.random() - 0.5) * 0.30,
                        roll: (Math.random() - 0.5) * 0.20,
                        opacity: 0.72 + Math.random() * 0.22,
                        segments: 96
                    });
                    if (Math.random() < 0.5) {
                        addPlanetRings(planet, planetSize, new THREE.Color().setHSL(
                            planetHue + 0.14, Math.max(0.15, planetSaturation - 0.3), 0.66
                        ), {
                            outerK: 3.3 + Math.random() * 0.9,
                            tilt: (Math.random() - 0.5) * 0.34,
                            roll: (Math.random() - 0.5) * 0.24,
                            opacity: 0.22 + Math.random() * 0.14,
                            segments: 72
                        });
                    }
                }
                
                // Add MOON SYSTEMS - LARGER MOONS
                const moonChance = planetSize > 5 ? 0.65 : 0.30; // Adjusted for larger planet sizes
                
                if (Math.random() < moonChance) {
                    const moonCount = 1 + Math.floor(Math.random() * 4);
                    
                    for (let m = 0; m < moonCount; m++) {
                        // Moons were a flat 1-4 units next to planets of
                        // 12-100 — at any distance where the planet reads as a
                        // world, its moons were sub-pixel. Sized as a FRACTION
                        // of their primary they stay in proportion, which is
                        // what makes a system read as a system.
                        const moonSize = Math.max(3, planetSize * (0.10 + Math.random() * 0.17));
                        const moonGeometry = new THREE.SphereGeometry(moonSize, 16, 16);

                        const moonHue = planetHue + (Math.random() - 0.5) * 0.2;
                        const moonMaterial = createPlanetPresenceMaterial({
                            color: new THREE.Color().setHSL(moonHue, 0.28 + Math.random() * 0.3, 0.55 + Math.random() * 0.2),
                            sun: clusterCenter,
                            city: 0.0,
                            cloud: Math.random() < 0.3 ? 0.25 : 0.0,
                            rim: 0.22,
                            seed: Math.random() * 40
                        });
                        const moon = new THREE.Mesh(moonGeometry, moonMaterial);

                        const moonOrbitRadius = planetSize * 1.9 + 40 + m * 60;
                        const moonOrbitSpeed = 0.012 + Math.random() * 0.028;
                        const moonOrbitPhase = Math.random() * Math.PI * 2;
                        
                        moon.position.set(
                            moonOrbitRadius * Math.cos(moonOrbitPhase),
                            (Math.random() - 0.5) * 5,
                            moonOrbitRadius * Math.sin(moonOrbitPhase)
                        );
                        
                        // ⭐ CRITICAL: Moons also support collision and slingshot
                        moon.userData = {
                            name: `${planet.userData.name} Moon ${m + 1}`,
                            type: 'moon',
                            orbitRadius: moonOrbitRadius,
                            orbitSpeed: moonOrbitSpeed,
                            orbitPhase: moonOrbitPhase,
                            parentPlanet: planet,
                            mass: moonSize * 2, // INCREASED mass
                            gravity: 0.5 + moonSize * 0.4, // INCREASED gravity based on size
                            nebulaId: nebulaIndex
                        };
                        
                        moon.visible = true;
                        moon.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
                        planets.push(moon);
                        planet.add(moon);
                    }
                    
                    console.log(`      🌙 Added ${moonCount} moon(s) to ${planet.userData.name}`);
                }
            }
            
            // Add ambient gas clouds
            if (Math.random() < 0.5) {
                createNebulaGasCloud(clusterCenter, nebulaIndex, starColor);
            }

            if (c === 0) {
                const ambientCloudCount = 2 + Math.floor(Math.random() * 3);
                for (let ac = 0; ac < ambientCloudCount; ac++) {
                    const ambientDistance = (Math.random() * 0.7 + 0.3) * nebulaSize;
                    const ambientAngle = Math.random() * Math.PI * 2;
                    const ambientElevation = (Math.random() - 0.5) * Math.PI * 0.4;
                    
                    const ambientPos = new THREE.Vector3(
                        nebulaPos.x + ambientDistance * Math.cos(ambientAngle) * Math.cos(ambientElevation),
                        nebulaPos.y + ambientDistance * Math.sin(ambientElevation),
                        nebulaPos.z + ambientDistance * Math.sin(ambientAngle) * Math.cos(ambientElevation)
                    );
                    
                    createNebulaGasCloud(ambientPos, nebulaIndex, starColor);
                }
                console.log(`    🌫️ Added ${ambientCloudCount} ambient gas cloud clusters to nebula`);
            }
            
            enhancedClusters.push({
                center: clusterCenter,
                nebulaId: nebulaIndex,
                systemId: c,
                planetCount: planetCount
            });
        }

        createNebulaHeartWorld(nebula, nebulaIndex);
    });

    console.log(`✅ Created ${enhancedClusters.length} MASSIVELY DIVERSE enhanced planet clusters`);
    console.log(`   💫 ALL PLANETS support collision detection and gravitational slingshots`);
    console.log(`   🪐 Average planet size: 3-25 units (MUCH LARGER)`);
    console.log(`   💍 50-60% have ring systems`);
    console.log(`   🌙 65% of large planets have 1-4 moons (also larger)`);
}

// =============================================================================
// THE HEART WORLD — one hero-scale body per nebula
// =============================================================================
// NOTHING IN THIS GAME WAS EVER BIG. Measured over 21 s of live demo (14
// samples, 1.5 s apart, 1600x900), the largest non-black-hole body on screen
// had a MEDIAN projected diameter of 96 px — 10.7 % of frame height — and it
// was Sol every single time. A wide vista was ~90 % empty void speckled with
// ~255 uniformly-bright 4 px impostor dots: no surface, no terminator, no
// cloud layer, no limb anywhere in frame. The impostor tier above exists to
// protect a near-LOD path that nothing ever entered.
//
// The cause is geometric, not artistic. A nebula system's worlds top out at
// radius 144 and orbit their cluster star at 700-2,940 u, and the cluster
// itself sits 400-1,600 u off the cloud centre — so from anywhere the demo
// actually flies, the biggest of them subtends 15-40 px.
//
// So every nebula gets ONE body sized and placed for the FRAME rather than for
// the orbital diagram. The demo laps the cloud centre at 500 u and breaks off
// its approach at 700 u (autopilot.js phaseOrbitNebulaPlanet), and the numbers
// below are solved against that path at fov 75 on a 900 px frame:
//
//   placement: HEART_WORLD_OFFSET out from the cloud centre, in the lap plane,
//              lifted HEART_WORLD_LIFT so it frames off-centre, on an azimuth
//              CHOSEN (not rolled) to stay out of every neighbour's envelope
//
//   closest point of the 500 u lap circle .... 1167 u  -> 625 px  (69 % of frame)
//   quarter-lap, the typical frame ........... 1735 u  -> 420 px  (47 %)
//   far side of the lap ...................... 2159 u  -> 337 px  (37 %)
//   worst-case approach standoff (1650 - 700) . 950 u  -> 330 u of clearance
//
// It is never closer than half its own radius to the demo's flight path, and
// it never leaves the near-LOD band. 620 u of radius is a super-Jupiter beside
// the 18-144 u worlds above — which is the point: a system needs one body that
// dwarfs everything else in it. It is also the body the HUD nav-locks, for
// free: autopilot's _findPlanetNearNebula scores candidates on
// `userData.radius`, and this is the only world in a nebula that sets it.
//
// GAMEPLAY MASS AND GRAVITY ARE DELIBERATELY NOT SCALED FROM 620. The slingshot
// is tuned against radius-100-ish worlds; extending the field's own formula
// linearly would give the heart world gravity 187 against a field maximum of
// 45, and it would drag anything that came near it off course. Both are pinned
// to what a radius-150 world would carry, so the physics the player has already
// learned still applies to the biggest thing they have ever seen.
// =============================================================================
const HEART_WORLD_RADIUS = 620;   // silhouette radius, world units
const HEART_WORLD_OFFSET = 1650;  // from the cloud centre, in the demo's lap plane
const HEART_WORLD_LIFT   = 200;   // above that plane, so it frames off-centre
const HEART_WORLD_PHYS_R = 150;   // radius the mass/gravity numbers are taken from
// Nothing may sit inside this of any OTHER cloud centre: 500 u of lap circle,
// 620 u of body, 200 u of margin. Nebulas come in twin pairs and a twin's
// centre can be under 3,000 u away, so an unconstrained azimuth will happily
// drop a 620 u sphere on top of its neighbour's flight path. The first probe
// run measured exactly that — 2,378 px of body, i.e. the camera 305 u inside a
// heart world it had no business being near, and the demo ship destroyed
// against it a moment later.
const HEART_WORLD_KEEPOUT = 500 + HEART_WORLD_RADIUS + 200;

function createNebulaHeartWorld(nebula, nebulaIndex) {
    if (!nebula || typeof THREE === 'undefined' || typeof scene === 'undefined') return null;

    const nebulaPos = nebula.position;
    // Choose the azimuth, don't roll it: walk 16 candidates and keep the one
    // that puts the body furthest from every OTHER cloud centre (and from every
    // heart world already placed). Ties are broken by a random start offset so
    // the pairs don't all point the same way.
    const pos = new THREE.Vector3();
    const cand = new THREE.Vector3();
    let bestClear = -Infinity;
    const jitter = Math.random() * Math.PI * 2;
    for (let a = 0; a < 16; a++) {
        const th = jitter + (a / 16) * Math.PI * 2;
        cand.set(nebulaPos.x + Math.cos(th) * HEART_WORLD_OFFSET,
                 nebulaPos.y + HEART_WORLD_LIFT,
                 nebulaPos.z + Math.sin(th) * HEART_WORLD_OFFSET);
        let clear = Infinity;
        if (typeof nebulaClouds !== 'undefined' && nebulaClouds) {
            for (let i = 0; i < nebulaClouds.length; i++) {
                if (nebulaClouds[i] === nebula) continue;
                clear = Math.min(clear, cand.distanceTo(nebulaClouds[i].position));
            }
        }
        if (typeof planets !== 'undefined' && planets) {
            for (let i = 0; i < planets.length; i++) {
                if (!planets[i].userData || !planets[i].userData.heartWorld) continue;
                clear = Math.min(clear, cand.distanceTo(planets[i].position) - HEART_WORLD_RADIUS);
            }
        }
        if (clear > bestClear) { bestClear = clear; pos.copy(cand); }
    }
    // If even the best azimuth is inside a neighbour's flight envelope, this
    // nebula does not get one. A missing hero beat costs a frame; a 620 u
    // sphere parked on the demo's route costs the run.
    if (bestClear < HEART_WORLD_KEEPOUT) {
        console.log(`    ⚠️ No room for a heart world at nebula ${nebulaIndex} (best clearance ${bestClear | 0}u)`);
        return null;
    }

    // Lit by this nebula's own nearest cluster star, so the terminator runs
    // where the system's light actually says it should. A hero body lit from
    // nowhere in particular is exactly the flat disc this is here to replace.
    let sun = null, sunD2 = Infinity;
    if (typeof planets !== 'undefined' && planets) {
        for (let i = 0; i < planets.length; i++) {
            const s = planets[i];
            if (!s || !s.userData || !s.userData.clusterCenter) continue;
            if (s.userData.nebulaId !== nebulaIndex) continue;
            const d2 = s.position.distanceToSquared(pos);
            if (d2 < sunD2) { sunD2 = d2; sun = s.position; }
        }
    }
    if (!sun) sun = nebulaPos;

    // Complement the cloud rather than match it. A world in the same hue as the
    // gas it sits inside has no silhouette at all — the one thing a 625 px body
    // cannot afford. Still inside the synthwave wheel, just the other side of it.
    const nebCol = nebula.userData && nebula.userData.color
        ? new THREE.Color(nebula.userData.color) : new THREE.Color(0xff4fd8);
    const hsl = { h: 0, s: 0, l: 0 };
    nebCol.getHSL(hsl);
    const hue = (hsl.h + 0.42) % 1;
    const bodyColor = new THREE.Color().setHSL(hue, 0.60, 0.44);

    const material = createPlanetPresenceMaterial({
        color: bodyColor,
        sun: sun,
        city: 0.9,      // an inhabited night side — the detail the vistas lacked
        cloud: 0.8,     // banded weather across the day side
        nightColor: new THREE.Color().setHSL((hue + 0.5) % 1, 0.95, 0.62),
        rim: 0.9,       // the limb is ~40 deg of arc here; it has to hold up close
        seed: Math.random() * 40
    });

    // 128x72. At 625 px of silhouette the 36x28 sphere the field worlds use
    // shows its polygons along the limb, and the limb is the one place a
    // "world" gives itself away as a primitive.
    const world = new THREE.Mesh(
        new THREE.SphereGeometry(HEART_WORLD_RADIUS, 128, 72), material);
    world.position.copy(pos);

    const nebName = (nebula.userData && nebula.userData.name) || ('Nebula-' + (nebulaIndex + 1));
    world.userData = {
        name: nebName + ' Prime',
        type: 'planet',
        // The ONLY world in a nebula that publishes this — it is what
        // autopilot's _findPlanetNearNebula scores on, so the HUD nav-locks
        // the body the camera is actually framing.
        radius: HEART_WORLD_RADIUS,
        heartWorld: true,
        // No orbitRadius / systemCenter on purpose: game-core's
        // updatePlanetOrbits() only moves a body that has BOTH, and the framing
        // maths above is solved against a fixed position.
        mass: HEART_WORLD_PHYS_R * 2.5,
        gravity: 1.5 + HEART_WORLD_PHYS_R * 0.3,
        nebulaId: nebulaIndex,
        inNebula: true
    };
    world.visible = true;
    world.frustumCulled = true;
    scene.add(world);
    if (typeof planets !== 'undefined' && planets) planets.push(world);

    // Rings, always. At this size the ring plane is what turns a big circle
    // into a place — it gives the frame a horizon line and a sense of scale
    // that a bare sphere at any radius cannot.
    // Ring saturation is quantised to thirds inside _planetRingTexture, so
    // anything under ~0.5 collapses to 0.33 and paints a Saturn-grey plate.
    // These sit in the upper bucket on purpose: the ring is the largest single
    // area of colour in the frame and it has to carry the palette.
    addPlanetRings(world, HEART_WORLD_RADIUS, new THREE.Color().setHSL(
        (hue + 0.06) % 1, 0.72, 0.60), {
        outerK: 2.30, tilt: 0.22, roll: -0.10, opacity: 0.80, segments: 160
    });
    addPlanetRings(world, HEART_WORLD_RADIUS, new THREE.Color().setHSL(
        (hue + 0.14) % 1, 0.62, 0.68), {
        outerK: 3.30, tilt: 0.26, roll: -0.13, opacity: 0.20, segments: 120
    });

    // NO MOONS. They were the obvious next scale cue and they are the reason
    // this body would have killed the demo. A moon is a child at orbit O, so
    // the assembly reaches offset ± (O + r) — and the demo's lap circle sits at
    // 500 u from the cloud centre, inside that annulus for every O worth
    // drawing. At the first sizing (O = 3.7 R) a 102 u moon swept to within
    // 144 u of the lap circle and 26 u of where the approach terminates; the
    // only orbits that clear the flight path are the ones tucked against the
    // planet's own surface, which is not a moon, it is a bump. The rings carry
    // the scale cue instead: their plane is 2,046 u across, so the ship flies
    // THROUGH it during the lap, which is the shot.
    console.log(`    🌍 Heart world "${world.userData.name}" — r${HEART_WORLD_RADIUS} at ${HEART_WORLD_OFFSET}u`);
    return world;
}
// =============================================================================
// NEBULA GAS CLOUD CREATION - CLUSTERED VERSION
// Creates a cluster of soft volumetric puffs for a realistic nebula appearance
// =============================================================================

// -----------------------------------------------------------------------------
// SOFT VOLUMETRIC PUFF MATERIAL
//
// MeshBasicMaterial paints a CONSTANT colour across the whole silhouette, so an
// additive sphere renders as a flat oval with a razor-sharp circular rim. Three
// or four of those stacked up is a countable pile of primitives, not a nebula —
// and since nebulae fill most of every wide vista, it was the single largest
// "untextured primitive" tell in the frame.
//
// This material has the exact same cost profile — one draw call per puff, same
// SphereGeometry, additive, no depth write — but:
//   (a) fades alpha to zero at the rim via pow(|N·V|, 2.5), so the hard disc
//       becomes a soft gaussian puff whose edge is invisible; and
//   (b) modulates by 4 octaves of cheap 3D ridged value noise in OBJECT space,
//       which breaks the ellipse into filaments. Object space (not world) so
//       the pattern rides along with the cluster's per-frame rotation, the way
//       real gas would, instead of swimming through it.
// Deliberately unfogged, matching the other gas clouds in this file: scene.fog
// starts at 55k units and would only flatten the puff's own core→rim gradient.
// -----------------------------------------------------------------------------
const NEBULA_PUFF_VERT = `
varying vec3 vPos;
varying vec3 vNrm;
varying vec3 vView;
void main() {
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNrm  = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
}
`;

const NEBULA_PUFF_FRAG = `
uniform vec3  uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uFreq;
uniform vec3  uSeed;
varying vec3 vPos;
varying vec3 vNrm;
varying vec3 vView;

// sin-free hash: stable across drivers, cheaper than the classic fract(sin(..))
float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), f.x);
    float b = mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x);
    float c = mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x);
    float d = mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x);
    return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

// Ridged noise: folding the band about its midpoint turns smooth blobs into
// creases, which is what reads as gas filaments rather than mottled haze.
float ridge(float n) {
    n = 1.0 - abs(2.0 * n - 1.0);
    return n * n;
}

void main() {
    // Soft rim: 1 at the centre of the silhouette, 0 at the edge. This is the
    // whole trick — it replaces the hard circular cliff with a gaussian falloff.
    float rim  = abs(dot(normalize(vNrm), normalize(vView)));
    float soft = pow(rim, 2.5);

    // 4 octaves of ridged value noise, drifting slowly so the gas churns.
    vec3 q = vPos * uFreq + uSeed + vec3(0.0, uTime * 0.02, uTime * 0.011);
    float n = ridge(vnoise(q))                 * 0.50
            + ridge(vnoise(q * 2.07 + 17.1))   * 0.28
            + ridge(vnoise(q * 4.13 + 43.7))   * 0.14
            + ridge(vnoise(q * 8.21 + 91.3))   * 0.08;

    // Squared again, over a dim floor: thin gas everywhere, tight bright veins
    // where the octaves line up. A linear map here just gives even haze.
    float fil = clamp(0.30 + 2.60 * n * n, 0.0, 2.4);

    float a = uOpacity * soft * fil;
    if (a < 0.0035) discard;   // prunes the invisible outer rim band
    gl_FragColor = vec4(uColor * (0.78 + 0.62 * n), a);
}
`;

function createNebulaPuffMaterial(color, baseOpacity, cloudSize) {
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uColor:   { value: color.clone() },
            uOpacity: { value: baseOpacity },
            uTime:    { value: 0 },
            // ~7 noise cells across the puff's diameter at the first octave
            // (so ~56 at the fourth), jittered per puff so no two share a
            // pattern. Puffs of different SIZE therefore also get different
            // filament scales, which is where the multi-scale look comes from.
            uFreq:    { value: (3.0 + Math.random() * 1.4) / Math.max(1, cloudSize) },
            uSeed:    { value: new THREE.Vector3(Math.random() * 90, Math.random() * 90, Math.random() * 90) }
        },
        vertexShader: NEBULA_PUFF_VERT,
        fragmentShader: NEBULA_PUFF_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide   // keep the far shell so flying inside still shows gas
    });

    // game-core.js breathes these clouds by writing material.opacity with a
    // fixed ±0.05 swing that was tuned against the old 0.15 base. At the new
    // ~0.045 base that same swing would blink the gas out completely, so proxy
    // the property onto the uniform and damp it back to the ±30% it always was.
    Object.defineProperty(mat, 'opacity', {
        configurable: true,
        get() { return mat.uniforms.uOpacity.value; },
        set(v) {
            mat.uniforms.uOpacity.value = Math.max(0, baseOpacity + (v - baseOpacity) * 0.3);
        }
    });

    return mat;
}

function createNebulaGasCloud(centerPos, nebulaId, starColor) {
    // Many small soft puffs, not a few big ones: with an invisible rim we can
    // afford a lot more of them at a much lower opacity each, and it is the
    // spread of SIZES that produces multi-scale structure. Total covered area
    // (and therefore overdraw) stays roughly where it was.
    const clusterSize = 10 + Math.floor(Math.random() * 5); // 10-14 puffs per cluster

    console.log(`    ☁️ Creating cluster of ${clusterSize} gas puffs for Nebula-${nebulaId + 1}`);

    // Create a group to hold all clouds in the cluster
    const cloudCluster = new THREE.Group();
    let coreSize = 0;

    for (let i = 0; i < clusterSize; i++) {
        // One dominant core, then a falling tail of smaller puffs. A single
        // size band is exactly what makes a nebula read as one blob.
        const t = clusterSize > 1 ? i / (clusterSize - 1) : 0;
        const sizeMultiplier = 1.15 - 0.85 * Math.pow(t, 0.65); // 1.15x -> 0.30x
        const cloudSize = (120 + Math.random() * 180) * sizeMultiplier;
        if (i === 0) coreSize = cloudSize;

        // 12x8 instead of 16x16. The old flat material showed its silhouette as
        // a hard outline, so it needed the tessellation; the puff material fades
        // alpha to zero there, so the polygon edge is literally never drawn.
        // That pays for 4x the puffs at roughly the old triangle budget
        // (12 x 192 = 2304 tris/cluster vs the old 3-4 x 512 = 1536-2048).
        const cloudGeometry = new THREE.SphereGeometry(cloudSize, 12, 8);

        // Vary colors slightly within the cluster
        const colorVariation = starColor.clone();
        colorVariation.offsetHSL(
            (Math.random() - 0.5) * 0.15, // Hue variation
            (Math.random() - 0.5) * 0.2,  // Saturation variation
            (Math.random() - 0.5) * 0.15  // Lightness variation
        );

        // Low per-puff opacity — brightness now comes from many overlapping
        // soft puffs, not from a few opaque shells. Smaller puffs run slightly
        // denser so the fine structure still reads.
        const baseOpacity = 0.044 + 0.030 * (1 - sizeMultiplier / 1.15);
        const cloudMaterial = createNebulaPuffMaterial(colorVariation, baseOpacity, cloudSize);

        const gasCloud = new THREE.Mesh(cloudGeometry, cloudMaterial);

        // Position clouds in overlapping cluster pattern
        // First cloud at center, others scattered around
        if (i === 0) {
            // Center cloud - largest
            gasCloud.position.set(0, 0, 0);
        } else {
            // Golden-angle spiral over a flattened sphere: fills the cluster
            // volume evenly instead of laying the puffs out on a visible ring.
            const ga = i * 2.399963;                        // golden angle
            const cy = 1.0 - 2.0 * ((i + 0.5) / clusterSize);
            const sr = Math.sqrt(Math.max(0, 1.0 - cy * cy));
            const spread = coreSize * (0.30 + Math.random() * 0.85);

            gasCloud.position.set(
                Math.cos(ga) * sr * spread,
                cy * spread * 0.55,   // flattened — nebulae are not spherical
                Math.sin(ga) * sr * spread
            );
        }

        // Drive the noise drift. Cheap (one uniform write per DRAWN puff) and
        // it keeps the gas churning without any per-frame work in game-core.
        gasCloud.onBeforeRender = function () {
            cloudMaterial.uniforms.uTime.value = performance.now() * 0.001;
        };

        gasCloud.userData = {
            name: `Nebula-${nebulaId + 1} Gas Cloud ${i + 1}`,
            type: 'gas_cloud',
            nebulaId: nebulaId,
            cloudIndex: i,
            size: cloudSize,
            baseOpacity: baseOpacity,
            pulseSpeed: 0.0003 + Math.random() * 0.0005,
            pulsePhase: Math.random() * Math.PI * 2 // Different phase for each cloud
        };
        
        gasCloud.visible = true;
        // PERF: these additive spheres are a big overdraw source; cull
        // them when off-screen. Their bounding sphere is exact.
        gasCloud.frustumCulled = true;

        cloudCluster.add(gasCloud);
    }
    
    // Position the entire cluster near the star system
    const offsetX = (Math.random() - 0.5) * 400;
    const offsetY = (Math.random() - 0.5) * 150;
    const offsetZ = (Math.random() - 0.5) * 400;
    
    cloudCluster.position.set(
        centerPos.x + offsetX,
        centerPos.y + offsetY,
        centerPos.z + offsetZ
    );
    
    // Slight rotation for variety
    cloudCluster.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
    );
    
    cloudCluster.userData = {
        name: `Nebula-${nebulaId + 1} Gas Cloud Cluster`,
        type: 'gas_cloud_cluster',
        nebulaId: nebulaId,
        cloudCount: clusterSize
    };
    
    cloudCluster.visible = true;
    cloudCluster.frustumCulled = false;
    scene.add(cloudCluster);
    
    // Track gas clouds for animation
    if (typeof window.nebulaGasClouds === 'undefined') {
        window.nebulaGasClouds = [];
    }
    window.nebulaGasClouds.push(cloudCluster);
    
    console.log(`      ✓ Added ${clusterSize} overlapping soft gas puffs (sizes: ${cloudCluster.children.map(c => c.userData.size.toFixed(0)).join(', ')} units)`);
}
// =============================================================================
// ENHANCED ENEMY CREATION - DISTANCE-BASED SPAWNING
// =============================================================================

function createEnemies3D() {
    console.log('Creating enemies for ALL galaxies on game start...');
    
    // Initialize currentGalaxyEnemies safely
    if (typeof gameState !== 'undefined') {
        if (!gameState.currentGalaxyEnemies) {
            gameState.currentGalaxyEnemies = {};
        }
    }
    
    // ✅ FIXED: Create enemies for ALL galaxies on initial game load
    // The old system skipped distant galaxies, but this caused enemies to never spawn
    
    // Create enemies for each galaxy
    for (let g = 0; g < 8; g++) {
        const galaxyType = galaxyTypes[g];
        const galaxy3DCenter = getGalaxy3DPosition(g);
        
        console.log(`Creating enemies for galaxy ${g} (${galaxyType.name}) at 3D position:`, galaxy3DCenter);
        
        // Spawn enemies scattered throughout the galaxy
        const enemiesPerGalaxy = galaxyEnemyLimits[g];
        if (typeof gameState !== 'undefined' && gameState.currentGalaxyEnemies) {
            gameState.currentGalaxyEnemies[g] = enemiesPerGalaxy;
        }
        
        // Spawn enemies in spread-out GROUPS of 2-3 instead of individuals
        // so the galaxy isn't a homogeneous swarm clustered around the BH.
        // Every galaxy is guaranteed at least MIN_BH_ENEMIES hostiles
        // patrolling the black hole (in groups of 2-3) and at least one
        // group at a cosmic feature, then the rest are randomized. Total
        // enemy count is allowed to exceed enemiesPerGalaxy when needed
        // to satisfy the black-hole minimum — the player should always
        // find significant resistance there.
        const MIN_BH_ENEMIES = 15;
        let i = 0;
        let bhEnemies = 0;
        let cosmicSpawned = false;
        while (i < enemiesPerGalaxy || bhEnemies < MIN_BH_ENEMIES) {
            const groupSize = 2 + Math.floor(Math.random() * 2); // 2 or 3

            let groupPlacementType;
            if (bhEnemies < MIN_BH_ENEMIES) {
                groupPlacementType = 'black_hole';
            } else if (!cosmicSpawned) {
                groupPlacementType = 'cosmic_feature';
                cosmicSpawned = true;
            } else {
                const groupRoll = Math.random();
                if (groupRoll < 0.40) {
                    groupPlacementType = 'cosmic_feature';
                } else if (groupRoll < 0.65) {
                    groupPlacementType = 'black_hole';
                } else {
                    groupPlacementType = 'random';
                }
            }
            if (groupPlacementType === 'black_hole') bhEnemies += groupSize;
            const groupCenter = getEnemyPlacementPosition(g, groupPlacementType);

            for (let p = 0; p < groupSize; p++, i++) {
                const enemyGeometry = createEnemyGeometry(g);
                const shapeData = enemyShapes[g];
                const placementType = groupPlacementType;

                // Tight 80-150u cluster around the group center
                const spreadAngle = (p / groupSize) * Math.PI * 2 + Math.random() * 0.5;
                const spreadDist = 80 + Math.random() * 70;
                const enemyPosition = new THREE.Vector3(
                    groupCenter.x + Math.cos(spreadAngle) * spreadDist,
                    groupCenter.y + (Math.random() - 0.5) * 60,
                    groupCenter.z + Math.sin(spreadAngle) * spreadDist
                );
                const distance = galaxy3DCenter.distanceTo(enemyPosition);

            const materials = createEnemyMaterial(shapeData, 'regular', distance);

            // Try to use 3D model first, fallback to geometry (g+1 because models are 1-8, galaxies are 0-7)
            let enemy;
            let isGLBModel = false;
            if (typeof createEnemyMeshWithModel === 'function') {
                // Galaxy enemies are 20% smaller: 120 * 0.8 = 96
                enemy = createEnemyMeshWithModel(g + 1, enemyGeometry, materials.enemyMaterial, 96.0);
                // Check if we got a GLB model (Group) or fallback mesh
                isGLBModel = enemy.isGroup || (enemy.children && enemy.children.length > 0 && enemy.children[0].isMesh);
            } else {
                enemy = new THREE.Mesh(enemyGeometry, materials.enemyMaterial);
            }

            // Only add procedural glow to fallback geometry enemies
            // GLB models have their own materials and don't need procedural glow
            if (!isGLBModel) {
                const glowGeometry = enemyGeometry.clone();
                const glow = new THREE.Mesh(glowGeometry, materials.glowMaterial);
                glow.scale.multiplyScalar(materials.glowScale);

                glow.visible = true;
                glow.frustumCulled = false;

                enemy.add(glow);
            }
            enemy.position.copy(enemyPosition);
            
            // Determine if this enemy is in the local galaxy (galaxy 7)
            const isLocal = (g === 7);
            
            // Calculate hitbox size from scaled model (like asteroids)
            let hitboxSize = 96; // Default for 96x scaled model
            try {
                const box = new THREE.Box3().setFromObject(enemy);
                const size = new THREE.Vector3();
                box.getSize(size);
                hitboxSize = Math.max(size.x, size.y, size.z);
            } catch (e) {
                // Use default if calculation fails
            }

            enemy.userData = {
                name: `${galaxyType.faction} Hostile ${i + 1}`,
                type: 'enemy',
                health: getEnemyHealthForDifficulty(isLocal, false, false),
                maxHealth: getEnemyHealthForDifficulty(isLocal, false, false),
                speed: 0.2 + Math.random() * 0.8, // FIXED: 0.2-1.0 range (200-1000 km/s)
                aggression: Math.random(),
                patrolCenter: enemyPosition.clone(),
                patrolRadius: 2000 + Math.random() * 3000,
                lastAttack: 0,
                isActive: false,
                visible: true,
                galaxyId: g,
                galaxyColor: shapeData.color,
                swarmTarget: null,
                circlePhase: Math.random() * Math.PI * 2,
                attackMode: 'patrol',
                detectionRange: isLocal ? 1200 : 1600,
                firingRange: isLocal ? 180 : 240,
                isLocal: isLocal,
                isBoss: false,
                isBossSupport: false,
                position3D: enemyPosition.clone(),
                placementType: placementType,
                hitboxSize: hitboxSize // Store hitbox size for accurate collision detection
            };
            
            enemy.visible = true;
            enemy.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
            
            scene.add(enemy);
            enemies.push(enemy);
            } // close inner for-each-in-group
        } // close while groups
    }

    console.log(`✅ Created ${enemies.length} enemies across all galaxies`);
    
    // Log breakdown by galaxy
    for (let g = 0; g < 8; g++) {
        const count = enemies.filter(e => e.userData && e.userData.galaxyId === g).length;
        console.log(`   Galaxy ${g} (${galaxyTypes[g].name}): ${count} enemies`);
    }
    
    // Create local galaxy enemies (Martian Pirates) — patrol in groups of 3.
    // BREADCRUMB CORRIDOR: the groups are staged along the Sol → Sagittarius
    // A* line at increasing depth, so clearing pirates naturally walks the
    // player from the Sol spawn toward the galactic core (where the Vulcans
    // and the liberation set-piece wait). The old full Fibonacci sphere
    // scattered them in every direction — combat wandered instead of led.
    const patrolGroupCount = 8;
    const piratesPerGroup = 3;
    // Martian Pirates patrol the Sol system, so the corridor starts at the
    // Sol-system offset (the origin is Sgr A* — Vulcan turf below).
    const solCenter = (typeof window !== 'undefined' && window.localSystemOffset)
        ? window.localSystemOffset : { x: 8000, y: 0, z: 4800 };
    const _solV = new THREE.Vector3(solCenter.x, solCenter.y, solCenter.z);
    // Direction Sol → Sgr A* (origin) + two perpendicular axes for scatter
    const _corridorDir = _solV.clone().negate().normalize();
    const _corridorSide = new THREE.Vector3().crossVectors(_corridorDir, new THREE.Vector3(0, 1, 0)).normalize();
    const _corridorUp = new THREE.Vector3().crossVectors(_corridorSide, _corridorDir).normalize();
    const _corridorLen = _solV.length();   // ~9.4k units Sol → core
    let pirateIndex = 0;
    for (let g = 0; g < patrolGroupCount; g++) {
        // Stage depth along the corridor. The FIRST TWO groups are opening-
        // beat skirmishers close to the Sol spawn (~1,200u / ~1,900u, still
        // on the Sgr A* side): the player's very first move is turn +
        // double-tap-W to intercept, and early combat stays on the corridor
        // instead of scattering behind Sol. The remaining six stage from
        // ~3,000u out to ~75% of the way to Sgr A* — close enough to hand
        // the fight over to the Vulcan patrol ring without overlapping it.
        let depth, side, lift;
        const t = (g + 0.5) / patrolGroupCount;               // 0..1 along corridor
        if (g < 2) {
            depth = (g === 0 ? 1200 : 1900) + Math.random() * 300;
            side = (g % 2 === 0 ? 1 : -1) * (250 + Math.random() * 250);  // tight — clearly "ahead"
            lift = (Math.random() - 0.5) * 300;
        } else {
            depth = 3000 + ((g - 2 + 0.5) / (patrolGroupCount - 2)) * (_corridorLen * 0.75 - 3000);
            // Alternating lateral scatter keeps the trail readable but not a
            // literal straight line; scatter widens slightly with depth.
            side = (g % 2 === 0 ? 1 : -1) * (500 + Math.random() * 700) * (0.7 + t * 0.6);
            lift = (Math.random() - 0.5) * (600 + t * 600);
        }
        const groupCenter = _solV.clone()
            .addScaledVector(_corridorDir, depth)
            .addScaledVector(_corridorSide, side)
            .addScaledVector(_corridorUp, lift);

        for (let p = 0; p < piratesPerGroup; p++) {
            pirateIndex++;
            const enemyGeometry = createEnemyGeometry(0);

            const localShapeData = { color: 0xff4444 };
            const materials = createEnemyMaterial(localShapeData, 'local', depth);

            let enemy;
            let isGLBModel = false;
            if (typeof createEnemyMeshWithModel === 'function') {
                enemy = createEnemyMeshWithModel(1, enemyGeometry, materials.enemyMaterial);
                isGLBModel = enemy.isGroup || (enemy.children && enemy.children.length > 0 && enemy.children[0].isMesh);
            } else {
                enemy = new THREE.Mesh(enemyGeometry, materials.enemyMaterial);
            }

            if (!isGLBModel) {
                const glowGeometry = enemyGeometry.clone();
                const glow = new THREE.Mesh(glowGeometry, materials.glowMaterial);
                glow.scale.multiplyScalar(materials.glowScale);
                glow.visible = true;
                glow.frustumCulled = false;
                enemy.add(glow);
            }

            // Add an invisible hitbox sphere so the raycaster always has
            // something to hit, even if a GLB model hasn't loaded yet.
            const hitboxGeo = new THREE.SphereGeometry(40, 8, 6);
            const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
            const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
            hitbox.userData.isHitbox = true;
            enemy.add(hitbox);

            // Spread within the group (tight 80-unit cluster)
            const spreadAngle = (p / piratesPerGroup) * Math.PI * 2;
            const spreadDist = 40 + Math.random() * 40;
            enemy.position.set(
                groupCenter.x + Math.cos(spreadAngle) * spreadDist,
                groupCenter.y + (Math.random() - 0.5) * 30,
                groupCenter.z + Math.sin(spreadAngle) * spreadDist
            );

            let hitboxSize = 96;
            try {
                const box = new THREE.Box3().setFromObject(enemy);
                const size = new THREE.Vector3();
                box.getSize(size);
                hitboxSize = Math.max(size.x, size.y, size.z);
            } catch (e) {}

            enemy.userData = {
                name: `Martian Pirate ${pirateIndex}`,
                type: 'enemy',
                health: getEnemyHealthForDifficulty(true, false, false),
                maxHealth: getEnemyHealthForDifficulty(true, false, false),
                speed: 1.2 + Math.random() * 0.8,
                aggression: 0.95 + Math.random() * 0.05,
                patrolCenter: groupCenter.clone(),
                // Tight patrol radius: each group holds its corridor station
                // (the old value was the distance-from-Sol, ~3-4k, which let
                // groups wander right off the breadcrumb trail).
                patrolRadius: 700,
                lastAttack: 0,
                isActive: false,
                visible: true,
                galaxyId: 7,
                galaxyColor: 0xff4444,
                swarmTarget: null,
                circlePhase: Math.random() * Math.PI * 2,
                attackMode: 'patrol',
                detectionRange: 2400,
                firingRange: 360,
                isMartianPirate: true,
                isLocal: true,
                isBoss: false,
                isBossSupport: false,
                position3D: enemy.position.clone(),
                hitboxSize: hitboxSize
            };

            enemy.visible = true;
            enemy.frustumCulled = true;
            scene.add(enemy);
            enemies.push(enemy);
        }
    }

    // =============================================================================
    // VULCAN PATROL SHIPS — tight patrol ring around Sagittarius A* (700-1500u
    // from the origin). The player now starts ~9.5k away at Sol (Martian
    // Pirate turf), so Vulcans stay origin-centred, guarding the galactic
    // centre well clear of the spawn.
    // =============================================================================
    const vulcanGroupCount = 6;
    const vulcansPerGroup = 3;
    const vulcanGoldenAngle = Math.PI * (3 - Math.sqrt(5));
    let vulcanIndex = 0;
    for (let g = 0; g < vulcanGroupCount; g++) {
        const groupDistance = 700 + Math.random() * 800;
        // Fibonacci-lattice sphere: even 3D coverage around Sagittarius A*.
        // Offset starting index so Vulcans don't overlap with Martian Pirates.
        const cosPolar = 1 - 2 * (g + 0.5) / vulcanGroupCount;
        const sinPolar = Math.sqrt(Math.max(0, 1 - cosPolar * cosPolar));
        const azimuth = vulcanGoldenAngle * (g + 3.5) + Math.random() * 0.5;
        const groupCenter = new THREE.Vector3(
            Math.cos(azimuth) * sinPolar * groupDistance,
            cosPolar * groupDistance,
            Math.sin(azimuth) * sinPolar * groupDistance
        );

        for (let p = 0; p < vulcansPerGroup; p++) {
            vulcanIndex++;
            const enemyGeometry = createEnemyGeometry(0);
            const localShapeData = { color: 0xff6633 };
            const materials = createEnemyMaterial(localShapeData, 'local', groupDistance);

            let enemy;
            let isGLBModel = false;
            if (typeof createEnemyMeshWithModel === 'function') {
                // Vulcan Patrols use Enemy8.glb (different from Martian Pirates' Enemy1)
                enemy = createEnemyMeshWithModel(8, enemyGeometry, materials.enemyMaterial);
                isGLBModel = enemy.isGroup || (enemy.children && enemy.children.length > 0 && enemy.children[0].isMesh);
                // Enemy8.glb is authored nose-toward-+Z, but the game's
                // lookAt makes a ship's local -Z face its target. Every
                // prior fix failed for a real reason:
                //   • root.rotation.y / child.rotateY were overwritten by
                //     _smoothEnemyLookAt's quaternion.slerp every frame.
                //   • geometry.applyMatrix4 mutated the SHARED cached
                //     BufferGeometry (model.clone() shares geometry), so
                //     every Vulcan spawn re-flipped the same mesh and the
                //     net rotation depended on spawn count.
                // Clone-safe, transform-stack-safe fix: wrap the model in
                // an outer Group. The game drives the WRAPPER (position /
                // quaternion / userData); the inner model keeps a
                // permanent local 180° Y rotation that lookAt never
                // touches. Move the model's scale onto the wrapper so the
                // thruster-cone sizing (which reads ship.getWorldScale)
                // still sees ~96 and matches every other GLB enemy.
                if (enemy && isGLBModel && typeof THREE !== 'undefined') {
                    const inner = enemy;
                    const wrapper = new THREE.Group();
                    wrapper.scale.copy(inner.scale);     // carry the 96x scale
                    inner.scale.set(1, 1, 1);            // wrapper owns scale now
                    inner.position.set(0, 0, 0);
                    inner.rotation.set(0, Math.PI, 0);   // persistent nose flip
                    wrapper.add(inner);
                    enemy = wrapper;
                }
            } else {
                enemy = new THREE.Mesh(enemyGeometry, materials.enemyMaterial);
            }

            if (!isGLBModel) {
                const glowGeometry = enemyGeometry.clone();
                const glow = new THREE.Mesh(glowGeometry, materials.glowMaterial);
                glow.scale.multiplyScalar(materials.glowScale);
                glow.visible = true;
                glow.frustumCulled = false;
                enemy.add(glow);
            }

            // Invisible hitbox sphere so the raycaster always has a target
            const hitboxGeo = new THREE.SphereGeometry(40, 8, 6);
            const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
            const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
            hitbox.userData.isHitbox = true;
            enemy.add(hitbox);

            const spreadAngle = (p / vulcansPerGroup) * Math.PI * 2;
            const spreadDist = 60 + Math.random() * 60;
            enemy.position.set(
                groupCenter.x + Math.cos(spreadAngle) * spreadDist,
                groupCenter.y + (Math.random() - 0.5) * 40,
                groupCenter.z + Math.sin(spreadAngle) * spreadDist
            );

            let hitboxSize = 96;
            try {
                const box = new THREE.Box3().setFromObject(enemy);
                const size = new THREE.Vector3();
                box.getSize(size);
                hitboxSize = Math.max(size.x, size.y, size.z);
            } catch (e) {}

            enemy.userData = {
                name: `Vulcan Patrol ${vulcanIndex}`,
                type: 'enemy',
                health: getEnemyHealthForDifficulty(true, false, false),
                maxHealth: getEnemyHealthForDifficulty(true, false, false),
                speed: 1.4 + Math.random() * 0.8,
                aggression: 0.9 + Math.random() * 0.1,
                patrolCenter: groupCenter.clone(),
                patrolRadius: 300,
                lastAttack: 0,
                isActive: false,
                visible: true,
                galaxyId: 7,
                galaxyColor: 0xff6633,
                swarmTarget: null,
                circlePhase: Math.random() * Math.PI * 2,
                attackMode: 'patrol',
                detectionRange: 800,
                firingRange: 380,
                isMartianPirate: true,
                isVulcanPatrol: true,
                isLocal: true,
                isBoss: false,
                isBossSupport: false,
                position3D: enemy.position.clone(),
                hitboxSize: hitboxSize
            };

            enemy.visible = true;
            enemy.frustumCulled = true;
            scene.add(enemy);
            enemies.push(enemy);
        }
    }

    console.log(`✅ Created ${enemies.length} enemies with full 3D positioning`);
    console.log(`📊 Breakdown: ${enemies.filter(e => e.userData.isLocal).length} local enemies, ${enemies.filter(e => !e.userData.isLocal).length} distant enemies`);
    console.log(`⏭️ Distant galaxies will load on-demand when you warp to them`);
}

// =============================================================================
// BLACK HOLE GUARDIAN ENEMIES - DISTANCE-BASED SPAWNING
// =============================================================================

function spawnBlackHoleGuardians() {
    // ⭐ Guardians now only spawn AFTER boss defeat via loadGuardiansForGalaxy()
    // This function is kept for backwards compatibility but does nothing on initial load
    console.log('🛡️ Guardian spawning system initialized - guardians will spawn after defeating galaxy bosses');
    
    // Initialize guardian tracking in bossSystem
    if (typeof bossSystem !== 'undefined') {
        if (!bossSystem.galaxyGuardiansDefeated) {
            bossSystem.galaxyGuardiansDefeated = {};
        }
    }
}

// =============================================================================
// LOAD GUARDIANS WHEN PLAYER ENTERS GALAXY
// =============================================================================

function loadGuardiansForGalaxy(galaxyId, opts) {
    opts = opts || {};
    console.log(`🛡️ Loading guardians for galaxy ${galaxyId}...`);
    
    // Safety checks
    if (typeof planets === 'undefined' || typeof scene === 'undefined' || typeof enemies === 'undefined') {
        console.warn('Required objects not available for guardian loading');
        return;
    }
    
    // ⭐ CHANGED: Now allow Local Galaxy (ID 7) to have guardians too!
    // Skip only Sagittarius A*
    if (galaxyId === 8) {
        console.log('Skipping Sagittarius A* - no guardians for central black hole');
        return;
    }
    
    // ⭐ CRITICAL: Only spawn guardians AFTER boss is defeated — unless the
    // twin-pair campaign is spawning them (both discovery missions done →
    // the black-hole path opens WITH its guardians, per design).
    if (!opts.ignoreBossGate &&
        typeof bossSystem !== 'undefined' && bossSystem.galaxyBossDefeated && !bossSystem.galaxyBossDefeated[galaxyId]) {
        console.log(`Galaxy ${galaxyId} boss not yet defeated - guardians will spawn after boss victory`);
        return;
    }
    
    // Check if guardians already exist for this galaxy
    const existingGuardians = enemies.filter(e => 
        e.userData && 
        e.userData.isBlackHoleGuardian && 
        e.userData.galaxyId === galaxyId &&
        e.userData.health > 0
    );
    
    if (existingGuardians.length > 0) {
        console.log(`Galaxy ${galaxyId} already has ${existingGuardians.length} guardians`);
        return;
    }
    
    // Check if guardians were already defeated
    if (typeof bossSystem !== 'undefined' && bossSystem.galaxyGuardiansDefeated && bossSystem.galaxyGuardiansDefeated[galaxyId]) {
        console.log(`Galaxy ${galaxyId} guardians already defeated - galaxy liberated`);
        return;
    }
    
    // Find the black hole for this galaxy
    const blackHole = planets.find(p => 
        p.userData.type === 'blackhole' && 
        p.userData.isGalacticCore === true &&
        p.userData.galaxyId === galaxyId
    );
    
    if (!blackHole) {
        console.warn(`No black hole found for galaxy ${galaxyId}`);
        return;
    }
    
    // Verify galaxyType exists
    if (!galaxyTypes[galaxyId]) {
        console.warn(`No galaxyType found for galaxyId ${galaxyId}`);
        return;
    }
    
    const galaxyType = galaxyTypes[galaxyId];
    const blackHolePosition = blackHole.position.clone();
    
    // Determine number of guardians based on galaxy type. The twin-pair
    // campaign spawns exactly 3 (opts.count) with its black-hole path.
    const guardianCount = opts.count ? opts.count :
                         (galaxyType.name === 'Quasar' ? 8 :
                         galaxyType.name === 'Dwarf' ? 3 : 5);
    
    // Guardian ring distance from black hole
    const guardianOrbitRadius = blackHole.userData.warpThreshold + 100;
    
    console.log(`🛡️ Spawning ${guardianCount} guardians for galaxy ${galaxyId} (${galaxyType.name})`);
    
    // ⭐ CRITICAL: Add guardians to the enemy count for this galaxy
    if (typeof gameState !== 'undefined' && gameState.currentGalaxyEnemies) {
        gameState.currentGalaxyEnemies[galaxyId] = (gameState.currentGalaxyEnemies[galaxyId] || 0) + guardianCount;
        console.log(`📊 Galaxy ${galaxyId} enemy count increased to ${gameState.currentGalaxyEnemies[galaxyId]} (added ${guardianCount} guardians)`);
    }
    
    for (let i = 0; i < guardianCount; i++) {
        const guardianGeometry = createEnemyGeometry(galaxyId);
        const shapeData = enemyShapes[galaxyId];
        
        const angle = (i / guardianCount) * Math.PI * 2;
        const heightVariation = (Math.random() - 0.5) * 300;
        
        const guardianPosition = new THREE.Vector3(
            blackHolePosition.x + Math.cos(angle) * guardianOrbitRadius,
            blackHolePosition.y + heightVariation,
            blackHolePosition.z + Math.sin(angle) * guardianOrbitRadius
        );
        
        const distanceFromCenter = guardianOrbitRadius;
        const materials = createEnemyMaterial(shapeData, 'regular', distanceFromCenter);

        // Try to use 3D model first, fallback to geometry (galaxyId+1 because models are 1-8, galaxies are 0-7)
        let guardian;
        if (typeof createEnemyMeshWithModel === 'function') {
            guardian = createEnemyMeshWithModel(galaxyId + 1, guardianGeometry, materials.enemyMaterial);
        } else {
            guardian = new THREE.Mesh(guardianGeometry, materials.enemyMaterial);
        }

        guardian.scale.multiplyScalar(1.3); // ⭐ Slightly larger
        
        const glowGeometry = guardianGeometry.clone();
        const glow = new THREE.Mesh(glowGeometry, materials.glowMaterial);
        glow.scale.multiplyScalar(materials.glowScale * 1.2); // ⭐ Brighter glow
        
        glow.visible = true;
        glow.frustumCulled = false;
        
        guardian.add(glow);
        guardian.position.copy(guardianPosition);
        
        guardian.userData = {
            name: `${galaxyType.faction} Black Hole Guardian ${i + 1}`,
            type: 'enemy',
            health: getEnemyHealthForDifficulty(false, false, false) * 1.5, // ⭐ 50% more health
            maxHealth: getEnemyHealthForDifficulty(false, false, false) * 1.5,
            speed: 1.2 + Math.random() * 1.0, // ⭐ Faster
            aggression: 0.95, // ⭐ Very aggressive
            patrolCenter: blackHolePosition.clone(),
            patrolRadius: guardianOrbitRadius,
            lastAttack: 0,
            isActive: true, // ⭐ Active immediately
            visible: true,
            galaxyId: galaxyId,
            galaxyColor: shapeData.color,
            swarmTarget: null,
            circlePhase: angle,
            attackMode: 'patrol',
            detectionRange: 5000, // ⭐ VERY long detection range - can detect from anywhere in galaxy
            firingRange: 320, // ⭐ Longer firing range
            isLocal: (galaxyId === 7), // ⭐ Mark local guardians
            isBoss: false,
            isBossSupport: false,
            isBlackHoleGuardian: true, // ⭐ Critical flag
            guardingBlackHole: blackHole,
            position3D: guardianPosition.clone()
        };
        
        guardian.visible = true;
        guardian.frustumCulled = false;
        
        scene.add(guardian);
        enemies.push(guardian);
        
        console.log(`  ✅ Guardian ${i + 1}/${guardianCount} spawned at black hole`);
    }
    
    console.log(`✅ Loaded ${guardianCount} guardians for galaxy ${galaxyId} (${galaxyType.name})`);
    console.log(`🎯 Guardians are now targetable and detectable from anywhere in the galaxy`);
}

function createEnemyGeometry(galaxyId) {
    const shapeData = enemyShapes[galaxyId];
    
    switch (shapeData.geometry) {
        case 'cone':
            return new THREE.ConeGeometry(2, 6, 6);
        case 'octahedron':
            return new THREE.OctahedronGeometry(3);
        case 'tetrahedron':
            return new THREE.TetrahedronGeometry(3);
        case 'cylinder':
            return new THREE.CylinderGeometry(2, 2, 6, 8);
        case 'sphere':
            return new THREE.SphereGeometry(3, 8, 8);
        case 'box':
            return new THREE.BoxGeometry(4, 4, 4);
        case 'diamond':
            return new THREE.OctahedronGeometry(3);
        case 'torus':
            return new THREE.TorusGeometry(2, 1, 8, 16);
        default:
            return new THREE.ConeGeometry(2, 6, 6);
    }
}

// BENPROOF.HTML EXACT VERSION - Semi-transparent glowing enemies
function createEnemyMaterial(shapeData, enemyType, distance) {
    const isBoss = enemyType === 'boss';
    
    // Main enemy body - MORE VISIBLE with higher opacity
    const enemyMaterial = new THREE.MeshBasicMaterial({
        color: shapeData.color,
        transparent: true,
        opacity: 0.85,       // INCREASED: 85% opacity for better visibility
        blending: THREE.NormalBlending
    });
    
    // Glow layer - bright and additive
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: shapeData.color,
        transparent: true,
        opacity: 0.6,  // INCREASED: Brighter base glow
        blending: THREE.AdditiveBlending
    });
    
    return {
        enemyMaterial: enemyMaterial,
        glowMaterial: glowMaterial,
        glowScale: isBoss ? 1.4 : 1.25
    };
}
    
// =============================================================================
// WORMHOLES, COMETS, AND OTHER SPACE OBJECTS
// =============================================================================

// =============================================================================
// WORMHOLE NETWORK
//
// 3 shortcut pairs (6 mouths) + 2 reward pockets (4 mouths) = 10 total,
// all persistent (no more 12-and-growing random spawns that fade out).
//
//   Shortcut pair  →  enter mouth A, pop out at mouth B halfway across
//                     the universe with your velocity preserved. Mouths
//                     are colour-matched so the player learns the network.
//
//   Reward pocket  →  enter a small isolated bubble far out in space.
//                     Grants a one-off bonus (warp charge, missile reload,
//                     hull repair, energy refill) the FIRST time it's
//                     visited. A return mouth at the destination drops
//                     the player back at the entry side.
//
// All wormhole logic that used to flip the renderer into the inverted
// "Minus World" has been removed.
// =============================================================================

// Generated descriptors for the network. transitionHandler in game-core.js
// reads `_partner`, `_pairId`, `_isRewardPocket` and `_pocketReward` to
// decide what to do on entry.
const WORMHOLE_NETWORK = [
    // ── 3 shortcut pairs (entry, exit) ────────────────────────────────
    { pairId: 'cyan',    color: 0x44d9ff, label: 'Cyan Shortcut',
      a: { x:  16000, y: 800, z:  12000 },   // outside the Sol system (~11k from Sol)
      b: { x: -38000, y: 1200, z:  32000 } },// across the galactic plane
    { pairId: 'magenta', color: 0xff44cc, label: 'Magenta Shortcut',
      a: { x:  28000, y: -800, z: -22000 },
      b: { x: -30000, y:  800, z: -20000 } },
    { pairId: 'gold',    color: 0xffcc33, label: 'Gold Shortcut',
      a: { x:  15000, y: 2000, z:  18000 },
      b: { x:  42000, y:-1500, z: -34000 } },

    // ── 2 reward pockets (entry → pocket destination + return mouth) ──
    // pocketReward is granted ONCE per entry mouth, on first transit.
    { pairId: 'pocket-orange', color: 0xff7733, label: 'Anomaly: Munitions Cache',
      a: { x:   6000, y: -1800, z:  -7000 },                     // entry
      b: { x: 110000, y:  6500, z:  90000 },                     // pocket return mouth
      isRewardPocket: true,
      pocketReward: { type: 'munitions', missiles: 3, warpCharge: 1,
                      message: 'Derelict cache: +3 missiles, +1 emergency warp charge.' } },
    { pairId: 'pocket-green',  color: 0x66ff88, label: 'Anomaly: Resupply Depot',
      a: { x:  -8000, y:  1500, z:   6000 },                     // entry
      b: { x:-115000, y: -5500, z: -88000 },                     // pocket return mouth
      isRewardPocket: true,
      pocketReward: { type: 'resupply', hull: 60, energy: 100,
                      message: 'Resupply depot: hull patched, energy fully restored.' } }
];

function createEnhancedWormholes() {
    if (typeof wormholes === 'undefined') {
        if (typeof window !== 'undefined' && Array.isArray(window.wormholes)) {
            // existing global
        } else {
            console.warn('wormholes array not defined; skipping network build');
            return;
        }
    }

    WORMHOLE_NETWORK.forEach(spec => {
        const mouthA = _createWormholeMouth(spec.a, spec.color);
        const mouthB = _createWormholeMouth(spec.b, spec.color);

        const baseUD = {
            type: 'wormhole',
            warpThreshold: 120,
            detectionRange: 3600,
            detected: false,
            isTemporary: false,
            _pairId: spec.pairId,
            _color: spec.color,
            _isRewardPocket: !!spec.isRewardPocket,
            _pocketReward: spec.pocketReward || null
        };

        mouthA.userData = Object.assign({}, baseUD, {
            name: spec.isRewardPocket ? spec.label : (spec.label + ' (A)'),
            _isPocketEntry: !!spec.isRewardPocket,
            _isPocketReturn: false
        });
        mouthB.userData = Object.assign({}, baseUD, {
            name: spec.isRewardPocket ? (spec.label + ' Return') : (spec.label + ' (B)'),
            _isPocketEntry: false,
            _isPocketReturn: !!spec.isRewardPocket
        });

        // Cross-link partners.
        mouthA.userData._partner = mouthB;
        mouthB.userData._partner = mouthA;

        scene.add(mouthA);
        scene.add(mouthB);
        wormholes.push(mouthA, mouthB);

        // For reward pockets, decorate the destination with a small
        // asteroid shrine so the pocket has a clear visual landmark.
        if (spec.isRewardPocket) _decoratePocketDestination(mouthB);
    });

    console.log(`🌀 Wormhole network built: ${wormholes.length} mouths ` +
                `(${WORMHOLE_NETWORK.filter(s => !s.isRewardPocket).length} shortcut pairs, ` +
                `${WORMHOLE_NETWORK.filter(s => s.isRewardPocket).length} reward pockets)`);
}

// Build one wormhole mouth at `position` tinted `colorNum`. The
// whirlpool visual (void + spiral rings + particle halo) is preserved
// from the original spawner so the network feels familiar.
function _createWormholeMouth(position, colorNum) {
    const group = new THREE.Group();
    const baseHue = new THREE.Color(colorNum).getHSL({}).h;

    // Central void.
    const voidMesh = new THREE.Mesh(
        new THREE.SphereGeometry(24, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.9 })
    );
    voidMesh.frustumCulled = false;
    group.add(voidMesh);

    // Spiral rings — tinted around the mouth's hue so a colour-matched
    // pair reads as a pair at distance.
    for (let i = 0; i < 5; i++) {
        const ringRadius = 36 + i * 12;
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(ringRadius, 4.5, 8, 32),
            new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(baseHue, 0.85, 0.55 + i * 0.04),
                transparent: true,
                opacity: 0.7 - i * 0.1,
                wireframe: true
            })
        );
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = i * 0.3;
        ring.frustumCulled = true;
        group.add(ring);
    }

    // Particle halo, tinted to the mouth colour.
    const particleGeometry = new THREE.BufferGeometry();
    const verts = [];
    for (let i = 0; i < 200; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 60 + Math.random() * 120;
        const height = (Math.random() - 0.5) * 90;
        verts.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    }
    particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({
        color: colorNum, size: 4.5, transparent: true, opacity: 0.6,
        map: getPointSprite(), depthWrite: false   // soft dust motes, not 4.5px squares
    }));
    particles.frustumCulled = false;
    group.add(particles);

    group.position.set(position.x, position.y, position.z);
    group.frustumCulled = false;
    group.userData = group.userData || {};
    group.userData.spiralSpeed = 0.02 + Math.random() * 0.02;
    return group;
}

// Drop a few inert asteroid-sized rocks around a reward-pocket return
// mouth so the destination has a visual landmark instead of empty
// space. Purely cosmetic; not added to the gameplay asteroids list.
function _decoratePocketDestination(returnMouth) {
    if (typeof THREE === 'undefined') return;
    const COUNT = 7;
    for (let i = 0; i < COUNT; i++) {
        const r = 380 + Math.random() * 520;
        const a = Math.random() * Math.PI * 2;
        const y = (Math.random() - 0.5) * 220;
        const size = 18 + Math.random() * 26;
        const rock = new THREE.Mesh(
            new THREE.IcosahedronGeometry(size, 0),
            new THREE.MeshBasicMaterial({ color: 0x665544 })
        );
        rock.position.set(
            returnMouth.position.x + Math.cos(a) * r,
            returnMouth.position.y + y,
            returnMouth.position.z + Math.sin(a) * r
        );
        rock.frustumCulled = true;
        scene.add(rock);
    }
}

// Kept as a no-op so any leftover callers don't crash. The previous
// "phasing-in-and-out" behaviour was dropped — network mouths are
// persistent so the player can rely on them.
function updateUnstableWormholes(/* deltaTime */) { /* intentionally empty */ }

// Create burst of light effect for wormhole phase transitions
function createWormholeBurst(position, appearing) {
    const burstGeometry = new THREE.SphereGeometry(20, 16, 16);
    const burstMaterial = new THREE.MeshBasicMaterial({
        color: appearing ? 0x00ffff : 0xff00ff,
        transparent: true,
        opacity: 0.8
    });
    const burst = new THREE.Mesh(burstGeometry, burstMaterial);
    burst.position.copy(position);
    scene.add(burst);

    let scale = 0.5;
    let opacity = 0.8;
    const interval = setInterval(() => {
        scale += 0.3;
        opacity -= 0.05;

        burst.scale.set(scale, scale, scale);
        burstMaterial.opacity = opacity;

        if (opacity <= 0) {
            clearInterval(interval);
            scene.remove(burst);
            burstGeometry.dispose();
            burstMaterial.dispose();
        }
    }, 50);
}

// Create ambient space debris and particles
function createAmbientSpaceDebris() {
    // Create MASSIVE debris field with various particle types
    const debrisCount = 2500; // Significantly more particles for better atmosphere
    const debrisGroup = new THREE.Group();
    debrisGroup.name = 'spaceDebris';

    // Debris particles
    const debrisGeometry = new THREE.BufferGeometry();
    const debrisPositions = [];
    const debrisColors = [];
    const debrisSizes = [];

    for (let i = 0; i < debrisCount; i++) {
        // Spread across MASSIVE area to cover the entire universe
        debrisPositions.push(
            (Math.random() - 0.5) * 80000,  // Doubled spread area
            (Math.random() - 0.5) * 5000,   // More vertical spread
            (Math.random() - 0.5) * 80000   // Doubled spread area
        );

        // Various colors for different debris types
        const debrisType = Math.random();
        let color;
        if (debrisType < 0.3) {
            // Metallic debris (gray/silver)
            color = new THREE.Color(0.6 + Math.random() * 0.3, 0.6 + Math.random() * 0.3, 0.6 + Math.random() * 0.3);
        } else if (debrisType < 0.6) {
            // Rocky debris (brown/gray)
            color = new THREE.Color().setHSL(0.05 + Math.random() * 0.1, 0.3, 0.3 + Math.random() * 0.2);
        } else {
            // Ice debris (blue/white)
            color = new THREE.Color().setHSL(0.55 + Math.random() * 0.1, 0.5, 0.7 + Math.random() * 0.2);
        }
        debrisColors.push(color.r, color.g, color.b);

        // Varying sizes with more variety
        debrisSizes.push(0.5 + Math.random() * 3.5);
    }

    debrisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(debrisPositions, 3));
    debrisGeometry.setAttribute('color', new THREE.Float32BufferAttribute(debrisColors, 3));
    debrisGeometry.setAttribute('size', new THREE.Float32BufferAttribute(debrisSizes, 1));

    const debrisMaterial = new THREE.PointsMaterial({
        size: 2,
        map: getPointSprite(),          // soft round grit, not a square
        depthWrite: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        sizeAttenuation: true
    });

    const debrisPoints = new THREE.Points(debrisGeometry, debrisMaterial);
    debrisPoints.frustumCulled = false;
    debrisGroup.add(debrisPoints);

    // Add MANY MORE larger floating debris chunks for better atmosphere
    for (let i = 0; i < 250; i++) {  // 5x more chunks
        const chunkSize = 1 + Math.random() * 3;
        const chunkGeometry = new THREE.BoxGeometry(chunkSize, chunkSize * 0.5, chunkSize);
        const chunkMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(Math.random() * 0.1, 0.2, 0.3),
            transparent: true,
            opacity: 0.4
        });
        const chunk = new THREE.Mesh(chunkGeometry, chunkMaterial);

        chunk.position.set(
            (Math.random() - 0.5) * 70000,  // Doubled spread to match debris particles
            (Math.random() - 0.5) * 4000,   // More vertical spread
            (Math.random() - 0.5) * 70000   // Doubled spread to match debris particles
        );

        chunk.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );

        chunk.userData = {
            rotationSpeed: {
                x: (Math.random() - 0.5) * 0.01,
                y: (Math.random() - 0.5) * 0.01,
                z: (Math.random() - 0.5) * 0.01
            },
            driftSpeed: new THREE.Vector3(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.1,
                (Math.random() - 0.5) * 0.5
            )
        };

        chunk.frustumCulled = false;
        debrisGroup.add(chunk);
    }

    scene.add(debrisGroup);

    // Store reference for updates
    if (typeof window.spaceDebris === 'undefined') {
        window.spaceDebris = debrisGroup;
    }

    console.log(`Created ${debrisCount} debris particles and 50 floating chunks`);
}

// Update ambient space debris - slow drift and rotation
function updateAmbientSpaceDebris() {
    if (typeof spaceDebris === 'undefined' || !spaceDebris) return;

    spaceDebris.children.forEach(child => {
        if (child.userData && child.userData.rotationSpeed) {
            // Rotate chunks slowly
            child.rotation.x += child.userData.rotationSpeed.x;
            child.rotation.y += child.userData.rotationSpeed.y;
            child.rotation.z += child.userData.rotationSpeed.z;

            // Drift slowly
            child.position.add(child.userData.driftSpeed);

            // Wrap around if too far
            const maxDist = 20000;
            if (Math.abs(child.position.x) > maxDist) child.position.x *= -0.9;
            if (Math.abs(child.position.y) > maxDist) child.position.y *= -0.9;
            if (Math.abs(child.position.z) > maxDist) child.position.z *= -0.9;
        }
    });
}

function createEnhancedComets() {
    const cometCount = 25;
    for (let i = 0; i < cometCount; i++) {
        const headR = 0.8 + Math.random() * 1.5;
        // Bright white-pink nucleus.
        const cometGeometry = new THREE.SphereGeometry(headR, 10, 10);
        const cometMaterial = new THREE.MeshBasicMaterial({
            color: 0xfff0f5,
            transparent: true,
            opacity: 0.97
        });

        const comet = new THREE.Mesh(cometGeometry, cometMaterial);
        comet.visible = true;
        comet.frustumCulled = false;

        comet.position.set(
            (Math.random() - 0.5) * 36000,
            (Math.random() - 0.5) * 2400,
            (Math.random() - 0.5) * 36000
        );

        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 1.6,
            (Math.random() - 0.5) * 6
        );

        // Soft glowing coma around the head — additive radial sprite,
        // pink-white, so the nucleus blooms like the reference photo.
        if (typeof _starCoronaTexture === 'function') {
            const comaMat = new THREE.SpriteMaterial({
                map: _starCoronaTexture(0xff9ec8),
                color: 0xffffff, transparent: true,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            const coma = new THREE.Sprite(comaMat);
            const cs = headR * 11;
            coma.scale.set(cs, cs, 1);
            coma.frustumCulled = false;
            comet.add(coma);
        }

        // Long FANNED dust tail: vertex-coloured white→pink→peach with
        // the spread widening toward the tail and brightness fading out,
        // streaming opposite the velocity (like a real dust tail).
        const TAIL_N = 140;
        const tailGeometry = new THREE.BufferGeometry();
        const tailVertices = [];
        const tailColors = [];
        const dir = velocity.clone().normalize();
        // Two perpendicular axes to fan the tail into a sheet.
        const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        const perpA = new THREE.Vector3().crossVectors(dir, up).normalize();
        const perpB = new THREE.Vector3().crossVectors(dir, perpA).normalize();
        for (let j = 0; j < TAIL_N; j++) {
            const t = j / TAIL_N;                 // 0 head → 1 tail tip
            const offset = j * 1.6;               // length along the tail
            const spread = 1.5 + t * 26;          // fans out toward the tip
            const sa = (Math.random() - 0.5) * spread;
            const sb = (Math.random() - 0.5) * spread * 0.5; // flatter sheet
            tailVertices.push(
                -dir.x * offset + perpA.x * sa + perpB.x * sb,
                -dir.y * offset + perpA.y * sa + perpB.y * sb,
                -dir.z * offset + perpA.z * sa + perpB.z * sb
            );
            // White at the head → pink → peach, dimming toward the tip.
            const b = Math.max(0, 1 - t * 0.9);
            tailColors.push(b * 1.0, b * (0.8 - t * 0.2), b * (0.92 - t * 0.45));
        }
        tailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tailVertices, 3));
        tailGeometry.setAttribute('color', new THREE.Float32BufferAttribute(tailColors, 3));
        const tailMaterial = new THREE.PointsMaterial({
            size: 2.4,
            map: getPointSprite(),      // soft round tail grain, not a square
            transparent: true,
            opacity: 0.85,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
            depthWrite: false
        });
        const tail = new THREE.Points(tailGeometry, tailMaterial);
        tail.visible = true;
        tail.frustumCulled = false;

        comet.add(tail);
        
        comet.userData = {
            name: `Comet ${String.fromCharCode(65 + i)}`,
            type: 'comet',
            velocity: velocity,
            trailLength: 0,
            mass: 1.6 + Math.random() * 2.4, // Doubled mass
            gravity: 0.3, // Doubled
            tail: tail,
            isVisible: true
        };
        
        scene.add(comet);
        comets.push(comet);
    }
}

function createSunSpikes(star) {
    // Create animated plasma tendrils for distant stars
    const tendrilGroup = new THREE.Group();
    const tendrilCount = 4;
    const starRadius = (star.geometry && star.geometry.parameters && star.geometry.parameters.radius) ? star.geometry.parameters.radius : 5;
    
    for (let i = 0; i < tendrilCount; i++) {
        const tendril = createPlasmaTendril(starRadius, i);
        tendrilGroup.add(tendril);
    }
    
    // FIXED: Prevent frustum culling for tendril group
    tendrilGroup.visible = true;
    tendrilGroup.frustumCulled = false;
    
    star.add(tendrilGroup);
    star.userData.tendrilGroup = tendrilGroup;
    star.userData.tendrilTime = 0;
}

function createPlasmaTendril(starRadius, index) {
    // Create curved path for tendril (doubled length)
    const tendrilLength = starRadius * 2.4 + Math.random() * starRadius * 1.6; // Doubled
    const segments = 12;
    const points = [];
    
    // Starting point on star surface
    const startAngle = (index / 4) * Math.PI * 2;
    const startX = Math.cos(startAngle) * starRadius;
    const startZ = Math.sin(startAngle) * starRadius;
    const startY = (Math.random() - 0.5) * starRadius * 0.6; // Doubled
    
    // Generate curved path points
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const distance = t * tendrilLength;
        
        const x = startX + Math.cos(startAngle) * distance;
        const z = startZ + Math.sin(startAngle) * distance;
        const y = startY + Math.sin(t * Math.PI * 2) * starRadius * 0.4; // Doubled
        
        const randomOffset = starRadius * 0.2 * t; // Doubled
        points.push(new THREE.Vector3(
            x + (Math.random() - 0.5) * randomOffset,
            y + (Math.random() - 0.5) * randomOffset,
            z + (Math.random() - 0.5) * randomOffset
        ));
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeometry = new THREE.TubeGeometry(curve, segments, starRadius * 0.1, 4, false); // Doubled tube radius
    
    const plasmaMaterial = new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0.5
    });
    
    const tendrilMesh = new THREE.Mesh(tubeGeometry, plasmaMaterial);
    
    // FIXED: Prevent frustum culling for plasma tendrils
    tendrilMesh.visible = true;
    tendrilMesh.frustumCulled = false;
    
    tendrilMesh.userData = {
        originalPoints: points.map(p => p.clone()),
        curve: curve,
        geometry: tubeGeometry,
        animationOffset: Math.random() * Math.PI * 2,
        writheSpeed: 0.2 + Math.random() * 0.3,
        lifeTime: 6000 + Math.random() * 3000,
        age: 0,
        startAngle: startAngle
    };
    
    return tendrilMesh;
}

function createNebulas() {
    console.log('Creating nebulas with realistic galaxy-like formations...');
    
    if (typeof nebulaClouds === 'undefined') {
        window.nebulaClouds = [];
    }
    
    // Define nebula types matching galaxy formations
    const nebulaTypes = [
        { name: 'Olympus', shape: 'spiral', arms: 3, color: 0x4488ff },      // Home of the gods
        { name: 'Titan', shape: 'elliptical', color: 0xff8844 },             // Primordial giants
        { name: 'Atlantis', shape: 'ring', arms: 1, color: 0x88ff44 },       // Lost City of the heavens
        { name: 'Prometheus', shape: 'irregular', color: 0xff4488 },         // Bringer of fire
        { name: 'Elysium', shape: 'quasar', color: 0xff44ff },               // Paradise realm
        { name: 'Tartarus', shape: 'lenticular', color: 0x44ffff },          // Deepest abyss
        { name: 'Hyperion', shape: 'ancient', color: 0xffaa88 },             // Titan of light
        { name: 'Chronos', shape: 'spiral', arms: 2, color: 0x8844ff }       // God of time
    ];
    
    // Cluster positions for nebulas
    const nebulaClusterPositions = generateSphericalNebulaPositions(4);
    
    nebulaTypes.forEach((nebulaType, i) => {
        const nebulaGroup = new THREE.Group();
        
        // Assign to cluster
        const clusterIndex = i % nebulaClusterPositions.length;
        const cluster = nebulaClusterPositions[clusterIndex];
        
        // Position within cluster using 3D spherical distribution
        const spread = cluster.spread;
        const localPhi = Math.random() * Math.PI * 2;
        const localTheta = Math.acos(1 - 2 * Math.random());
        const localDistance = Math.random() * spread;
        
        const nebulaX = cluster.center.x + localDistance * Math.sin(localTheta) * Math.cos(localPhi);
        const nebulaY = cluster.center.y + localDistance * Math.cos(localTheta);
        const nebulaZ = cluster.center.z + localDistance * Math.sin(localTheta) * Math.sin(localPhi);
        
        // Create particles with realistic galaxy-like distribution.
        // Mobile gets ~40% to keep additive fill-rate manageable.
        const particleCount = _isMobileRenderTier()
            ? (1600 + Math.floor(Math.random() * 800))
            : (4000 + Math.floor(Math.random() * 2000));
        const nebulaGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        
        const nebulaSize = 1200 + Math.random() * 800;
        const hue = Math.random();
        const nebulaColor = new THREE.Color().setHSL(hue, 0.7, 0.6);
        // Two-tone core->rim gradient (see createClusteredNebulas for rationale)
        const nebulaCoreColor = nebulaColor.clone().offsetHSL(0.04, 0.1, 0.22);
        const nebulaRimColor = nebulaColor.clone().offsetHSL(-0.07, 0.05, -0.18);
        
        for (let p = 0; p < particleCount; p++) {
            const i3 = p * 3;
            let x, y, z;
            
            // Use same distribution logic as galaxies
            if (nebulaType.shape === 'spiral' || nebulaType.shape === 'ring') {
                // SPIRAL/RING: Arms and center bulge
                if (Math.random() < 0.4) {
                    // Center bulge (40% of particles)
                    const bulgeRadius = Math.pow(Math.random(), 2.5) * (nebulaSize * 0.3);
                    const bulgeAngle = Math.random() * Math.PI * 2;
                    const bulgePhi = (Math.random() - 0.5) * Math.PI;
                    
                    x = bulgeRadius * Math.cos(bulgeAngle) * Math.cos(bulgePhi);
                    z = bulgeRadius * Math.sin(bulgeAngle) * Math.cos(bulgePhi);
                    y = bulgeRadius * Math.sin(bulgePhi) * 0.8;
                } else {
                    // Spiral arms
                    const arm = Math.floor(p / (particleCount / nebulaType.arms)) % nebulaType.arms;
                    const armAngle = (p / (particleCount / nebulaType.arms)) * Math.PI * 2;
                    const armDistance = Math.pow(Math.random(), 1.8) * nebulaSize;
                    const armWidth = nebulaType.shape === 'ring' ? 0.03 : 0.12;
                    
                    // Ring: skip center
                    if (nebulaType.shape === 'ring' && armDistance < nebulaSize * 0.4) {
                        p--; // Don't count this particle
                        continue;
                    }
                    
                    const angle = armAngle + (armDistance / nebulaSize) * Math.PI * 2;
                    x = Math.cos(angle + arm * (Math.PI * 2 / nebulaType.arms)) * armDistance +
                        (Math.random() - 0.5) * armWidth * armDistance;
                    z = Math.sin(angle + arm * (Math.PI * 2 / nebulaType.arms)) * armDistance +
                        (Math.random() - 0.5) * armWidth * armDistance;
                    y = (Math.random() - 0.5) * 30; // Flat disk
                }
                
            } else if (nebulaType.shape === 'elliptical') {
                // ELLIPTICAL: Flattened spheroid (like pancake)
                const distance = Math.pow(Math.random(), 1.3) * nebulaSize;
                const theta = Math.random() * Math.PI * 2;
                const phi = (Math.random() - 0.5) * Math.PI * 0.6;
                
                x = distance * Math.sin(phi) * Math.cos(theta);
                z = distance * Math.sin(phi) * Math.sin(theta);
                y = distance * Math.cos(phi) * 0.5; // 50% flattening
                
            } else if (nebulaType.shape === 'lenticular') {
                // LENTICULAR: Very flat disk with bright center
                if (Math.random() < 0.4) {
                    // Bright center bulge
                    const bulgeRadius = Math.pow(Math.random(), 3) * (nebulaSize * 0.3);
                    const bulgeAngle = Math.random() * Math.PI * 2;
                    x = Math.cos(bulgeAngle) * bulgeRadius;
                    z = Math.sin(bulgeAngle) * bulgeRadius;
                    y = (Math.random() - 0.5) * 50;
                } else {
                    // Very flat disk
                    const distance = Math.pow(Math.random(), 1.5) * nebulaSize;
                    const theta = Math.random() * Math.PI * 2;
                    x = Math.cos(theta) * distance;
                    z = Math.sin(theta) * distance;
                    y = (Math.random() - 0.5) * 20; // Very flat (only 10% height)
                }
                
            } else if (nebulaType.shape === 'irregular') {
    // IRREGULAR: Asymmetric spiral with 2 uneven arms (galaxy-like)
    if (Math.random() < 0.3) {
        // Small center bulge (30% of particles)
        const bulgeRadius = Math.pow(Math.random(), 2.5) * (nebulaSize * 0.25);
        const bulgeAngle = Math.random() * Math.PI * 2;
        const bulgePhi = (Math.random() - 0.5) * Math.PI;
        
        x = bulgeRadius * Math.cos(bulgeAngle) * Math.cos(bulgePhi);
        z = bulgeRadius * Math.sin(bulgeAngle) * Math.cos(bulgePhi);
        y = bulgeRadius * Math.sin(bulgePhi) * 0.7;
    } else {
        // Asymmetric spiral arms (70% of particles)
        const arms = 2; // Two main arms
        const arm = Math.floor(p / (particleCount / arms)) % arms;
        const armAngle = (p / (particleCount / arms)) * Math.PI * 2;
        const armDistance = Math.pow(Math.random(), 1.6) * nebulaSize;
        
        // Make arms irregular - different widths and tightness
        const armWidth = arm === 0 ? 0.15 : 0.20; // One arm thicker than the other
        const spiralTightness = arm === 0 ? 2.5 : 3.0; // Different spiral rates
        
        const angle = armAngle + (armDistance / nebulaSize) * Math.PI * spiralTightness;
        x = Math.cos(angle + arm * Math.PI) * armDistance +
            (Math.random() - 0.5) * armWidth * armDistance;
        z = Math.sin(angle + arm * Math.PI) * armDistance +
            (Math.random() - 0.5) * armWidth * armDistance;
        y = (Math.random() - 0.5) * 40; // Relatively flat
    }
                
            } else if (nebulaType.shape === 'quasar') {
                // QUASAR: Central bulge + bright polar jets
                if (Math.random() < 0.7) {
                    // Central bulge (70%)
                    const bulgeRadius = Math.pow(Math.random(), 2.5) * (nebulaSize * 0.4);
                    const bulgeAngle = Math.random() * Math.PI * 2;
                    const bulgePhi = (Math.random() - 0.5) * Math.PI * 0.5;
                    
                    x = bulgeRadius * Math.cos(bulgeAngle) * Math.cos(bulgePhi);
                    z = bulgeRadius * Math.sin(bulgeAngle) * Math.cos(bulgePhi);
                    y = bulgeRadius * Math.sin(bulgePhi);
                } else {
                    // Polar jets (30%)
                    const jetDirection = Math.random() < 0.5 ? 1 : -1;
                    const jetDistance = Math.random() * nebulaSize * 1.5;
                    const jetSpread = nebulaSize * 0.08; // Narrow jet
                    
                    x = (Math.random() - 0.5) * jetSpread;
                    y = jetDirection * jetDistance; // Vertical jets
                    z = (Math.random() - 0.5) * jetSpread;
                }
                
            } else { // ancient/dwarf
                // ANCIENT/DWARF: Small irregular cluster
                const clusterRadius = Math.pow(Math.random(), 1.5) * nebulaSize;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(1 - 2 * Math.random());
                
                x = clusterRadius * Math.sin(phi) * Math.cos(theta);
                y = clusterRadius * Math.cos(phi) * 0.6;
                z = clusterRadius * Math.sin(phi) * Math.sin(theta);
            }
            
            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;

            // Color variation: two-tone core->rim gradient (see
            // createClusteredNebulas for rationale), except quasar jets
            // which keep their distinct blue-white tint.
            let colorVar;
            if (nebulaType.shape === 'quasar' && Math.abs(y) > nebulaSize * 0.5) {
                colorVar = new THREE.Color(0xaaddff);
            } else {
                const rNorm = Math.min(1, Math.sqrt(x * x + z * z) / nebulaSize);
                colorVar = nebulaCoreColor.clone().lerp(nebulaRimColor, rNorm);
                colorVar.offsetHSL((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.15);
            }
            
            colors[i3] = colorVar.r;
            colors[i3 + 1] = colorVar.g;
            colors[i3 + 2] = colorVar.b;
        }
        
        nebulaGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        nebulaGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const nebulaMaterial = new THREE.PointsMaterial({
            size: 2.5,
            // Soft round puff instead of a hard axis-aligned square. Without a
            // map the fragment stage never reads gl_PointCoord and WebGL fills
            // the whole gl_PointSize quad flat — 5,000 grey blocks per cloud.
            map: getPointSprite(),
            vertexColors: true,
            transparent: true,
            opacity: 0.65,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
            // Required with the sprite: the quad's transparent corners must not
            // punch a square hole in the depth buffer for everything behind.
            depthWrite: false,
            fog: false // preserve the cloud's own core->rim gradient; scene fog would flatten it
        });
        
        const nebulaPoints = new THREE.Points(nebulaGeometry, nebulaMaterial);
        nebulaPoints.visible = true;
        nebulaPoints.frustumCulled = true;  // PERF: off-screen nebulas skip the additive draw
        
        nebulaGroup.add(nebulaPoints);
        nebulaGroup.position.set(nebulaX, nebulaY, nebulaZ);
        
        // Random orientation in 3D space
        nebulaGroup.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        
        nebulaGroup.visible = true;
        nebulaGroup.frustumCulled = false;
        
        nebulaGroup.userData = {
            name: `${nebulaType.name} Nebula`,
            type: 'nebula',
            shape: nebulaType.shape,
            size: nebulaSize,
            color: nebulaColor,
            cluster: clusterIndex,
            rotationSpeed: (Math.random() - 0.5) * 0.0008,
            position3D: nebulaGroup.position.clone()
        };
        
        scene.add(nebulaGroup);
        nebulaClouds.push(nebulaGroup);
    });
    
    console.log(`✅ Created ${nebulaClouds.length} nebulas with realistic galaxy formations`);
}

// OPTIMIZED: Shared asteroid resources (create once, reuse many times)
const asteroidResources = {
    geometries: [],
    materials: [],
    initialized: false
};

function initializeAsteroidResources() {
    if (asteroidResources.initialized) return;
    
    // Create 5 different asteroid shapes (reused for all asteroids)
    asteroidResources.geometries = [
        new THREE.DodecahedronGeometry(1, 0),
        new THREE.IcosahedronGeometry(1, 0),
        new THREE.TetrahedronGeometry(1, 0),
        new THREE.OctahedronGeometry(1, 0),
        new THREE.SphereGeometry(1, 4, 4)
    ];
    
    // FIXED: Enhanced visibility with brighter emissive and base colors
    const colorVariants = [
        { hue: 0, sat: 0.15, light: 0.7 },      // Lighter gray
        { hue: 0.09, sat: 0.5, light: 0.6 },    // Lighter brown
        { hue: 0.58, sat: 0.4, light: 0.75 }    // Lighter blue-metallic
    ];

    colorVariants.forEach(color => {
    asteroidResources.materials.push(
        new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(color.hue, color.sat, color.light),
            roughness: 0.9,
            metalness: color.hue > 0.5 ? 0.3 : 0.1,
            emissive: new THREE.Color().setHSL(color.hue, color.sat * 0.5, 0.35), // FIXED: 0.1 → 0.35 for much brighter glow
            emissiveIntensity: 0.8  // FIXED: Added emissive intensity for better visibility
        })
    );
});
    
    asteroidResources.initialized = true;
    console.log('✅ Asteroid resources initialized with self-lit materials');
}

function createAsteroidBelts() {
    console.log('Creating OPTIMIZED asteroid belts for nearby galaxies...');
    
    // Initialize shared resources
    initializeAsteroidResources();
    
    // SAFETY: Ensure asteroidBelts array exists
    if (typeof window.asteroidBelts === 'undefined') {
        window.asteroidBelts = [];
    }
    
    const nearbyDistance = 80000;
    
    // FIXED: Find actual black holes in the scene
    const blackHoles = planets.filter(p => 
    p.userData.type === 'blackhole' && 
    typeof p.userData.galaxyId === 'number' &&
    !p.userData.isLocalGateway  // Only exclude the small local gateway
);
    
    console.log(`Found ${blackHoles.length} galaxy black holes for asteroid placement`);
    
    galaxyTypes.forEach((galaxyType, galaxyIndex) => {
        
        // FIXED: Find the actual black hole for this galaxy
        const blackHole = blackHoles.find(bh => bh.userData.galaxyId === galaxyIndex);
        
        if (!blackHole) {
            console.warn(`No black hole found for galaxy ${galaxyIndex}`);
            return;
        }

        // Galaxy 7 is the local Sol system. Its only non-gateway black
        // hole is the Companion Core near the universe origin (~0,±500,0),
        // but the Sol system — and the player start — live at the local
        // system offset (~2000,0,1200). Anchoring the "local" belt to the
        // origin black hole put it ~2600u from the player and nowhere near
        // the solar plane the offset code claims to use. Anchor it to the
        // Sol star instead so it spawns in the local system as intended.
        let galaxyCenter = blackHole.position.clone();
        if (galaxyIndex === 7) {
            const solStar = planets.find(p => p.userData && p.userData.isLocalStar);
            if (solStar) galaxyCenter = solStar.position.clone();
        }

        // CHECK DISTANCE: Only create if player is nearby
        const distanceToPlayer = camera.position.distanceTo(galaxyCenter);
        if (distanceToPlayer > nearbyDistance) {
            console.log(`Skipping distant galaxy ${galaxyIndex} (${galaxyType.name}) - ${Math.floor(distanceToPlayer)} units away`);
            return;
        }
        
        console.log(`Creating OPTIMIZED belt for galaxy ${galaxyIndex} (${galaxyType.name}) at black hole position:`, galaxyCenter);
        
        const beltCount = Math.random() > 0.5 ? 2 : 1;
        
        for (let b = 0; b < beltCount; b++) {
            const beltGroup = new THREE.Group();
            
            // PLENTIFUL: 50-150 asteroids
            const asteroidCount = 75 + Math.random() * 37; // Reduced 25% for performance
            
            // CLOSER: 800-2000 units from black hole
        	let beltRadius = 1600 + Math.random() * 1000;
            let beltWidth = 400 + Math.random() * 800;

            // Local Sol system (galaxy 7): a much larger belt that rings the
            // outer system instead of hugging the star (was radius ~1600-2600).
            if (galaxyIndex === 7) {
                beltRadius = 5000 + Math.random() * 2000; // ~5000-7000
                beltWidth = 1000 + Math.random() * 1200;  // fuller band at the larger radius
            }
            
            for (let j = 0; j < asteroidCount; j++) {
    // Use shared resources
    const geomIndex = Math.floor(Math.random() * 3);
    const geometry = asteroidResources.geometries[geomIndex];
    
    const matIndex = Math.floor(Math.random() * asteroidResources.materials.length);
    const material = asteroidResources.materials[matIndex];
    
    const asteroid = new THREE.Mesh(geometry, material);
    
    // INCREASED: Make asteroids 2-3x larger for visibility
    const scale = 3 + Math.random() * 6; // Was 1-5, now 3-9
    asteroid.scale.setScalar(scale);
    
    // CRITICAL: Disable frustum culling so distant asteroids stay visible
    asteroid.frustumCulled = false;
    
    const ringAngle = (j / asteroidCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const ringDistance = beltRadius + (Math.random() - 0.5) * beltWidth;
    const ringHeight = (Math.random() - 0.5) * 200;
    
    asteroid.position.set(
        Math.cos(ringAngle) * ringDistance,
        ringHeight,
        Math.sin(ringAngle) * ringDistance
    );
    
    asteroid.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
    );
    
    asteroid.userData = {
        name: `${galaxyType.name} Asteroid ${j + 1}`,
        type: 'asteroid',
        health: 2,
        maxHealth: 2,
        orbitSpeed: 0.0005 + Math.random() * 0.001,
        rotationSpeed: (Math.random() - 0.5) * 0.015,
        beltCenter: galaxyCenter,
        orbitRadius: ringDistance,
        orbitPhase: ringAngle,
        galaxyId: galaxyIndex, // or galaxyId for loadAsteroidsForGalaxy
        isTargetable: true,
        isDestructible: true,
        beltGroup: beltGroup
    };
    
    beltGroup.add(asteroid);
    planets.push(asteroid);
}

// After the loop, ensure belt group is visible
// OFFSET LOCAL GALAXY BELTS: Position above or below the solar system plane
if (galaxyIndex === 7) {
    // Local galaxy - offset significantly above or below
    const yOffset = (Math.random() < 0.5 ? 1 : -1) * (600 + Math.random() * 400); // 600-1000 units offset
    beltGroup.position.set(galaxyCenter.x, galaxyCenter.y + yOffset, galaxyCenter.z);
    console.log(`✅ Local asteroid belt ${b + 1} offset ${yOffset > 0 ? 'ABOVE' : 'BELOW'} solar plane by ${Math.abs(yOffset).toFixed(0)} units`);
} else {
    beltGroup.position.copy(galaxyCenter);
}
beltGroup.visible = true; // Force visible
beltGroup.frustumCulled = false; // Don't cull the entire group
            
            beltGroup.userData = {
                name: `${galaxyType.name} Galaxy Asteroid Belt ${b + 1}`,
                type: 'asteroidBelt',
                center: galaxyCenter,
                radius: beltRadius,
                asteroidCount: asteroidCount,
                galaxyId: galaxyIndex,
                blackHolePosition: galaxyCenter.clone() // Store reference
            };
            
            scene.add(beltGroup);

            // REMOVED: Asteroid belt PointLight for performance
            // Asteroids use emissive materials for visibility instead

            asteroidBelts.push(beltGroup);
        }
    });
    
    console.log(`✅ Created ${asteroidBelts.length} OPTIMIZED asteroid belts around actual black holes`);

    // Add extra scattered, breakable asteroid clusters across the
    // universe so the player has obstacles to use (and shoot for hull)
    // during dogfights, not just at the BH-orbit rings.
    if (typeof createScatteredAsteroidFields === 'function') {
        try { createScatteredAsteroidFields(); } catch (e) {
            console.warn('createScatteredAsteroidFields failed:', e);
        }
    }
}

// =============================================================================
// SCATTERED ASTEROID FIELDS — small breakable clusters placed both
// inside each black-hole galaxy and out in deep interstellar space.
// Each cluster is a tight ~30-asteroid swarm that the player can shoot
// apart (uses the same userData shape as the main belts), so it
// integrates with destroyAsteroid, asteroid-mining rewards, and the
// raycast targeting that already exists.
// =============================================================================
function createScatteredAsteroidFields() {
    if (typeof window.asteroidBelts === 'undefined') window.asteroidBelts = [];
    if (!asteroidResources || !asteroidResources.geometries) {
        initializeAsteroidResources();
    }

    function _spawnCluster(galaxyIndex, center, opts) {
        const cluster = new THREE.Group();
        const count = (opts && opts.count) || (22 + Math.floor(Math.random() * 16));
        const spread = (opts && opts.spread) || (350 + Math.random() * 250);
        const minScale = (opts && opts.minScale) || 2.5;
        const scaleRange = (opts && opts.scaleRange) || 4.5;
        const galaxyType = (typeof galaxyTypes !== 'undefined' && galaxyTypes[galaxyIndex])
            ? galaxyTypes[galaxyIndex] : { name: 'Deep Space' };

        for (let j = 0; j < count; j++) {
            const geom = asteroidResources.geometries[Math.floor(Math.random() * asteroidResources.geometries.length)];
            const mat  = asteroidResources.materials[Math.floor(Math.random() * asteroidResources.materials.length)];
            const a = new THREE.Mesh(geom, mat);
            a.scale.setScalar(minScale + Math.random() * scaleRange);
            a.frustumCulled = false;
            // Random within a flattened sphere so it reads as a clumpy
            // field rather than a tight ring.
            const phi = Math.random() * Math.PI * 2;
            const r   = Math.random() * spread;
            const h   = (Math.random() - 0.5) * spread * 0.4;
            a.position.set(Math.cos(phi) * r, h, Math.sin(phi) * r);
            a.rotation.set(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            );
            a.userData = {
                name: `${galaxyType.name} Scatter ${j + 1}`,
                type: 'asteroid',
                health: 2,
                maxHealth: 2,
                orbitSpeed: 0.0003 + Math.random() * 0.0008,
                rotationSpeed: (Math.random() - 0.5) * 0.012,
                beltCenter: center.clone(),
                orbitRadius: r,
                orbitPhase: phi,
                galaxyId: galaxyIndex,
                isTargetable: true,
                isDestructible: true,
                beltGroup: cluster
            };
            cluster.add(a);
            planets.push(a);
        }

        cluster.position.copy(center);
        cluster.visible = true;
        cluster.frustumCulled = false;
        cluster.userData = {
            name: `${galaxyType.name} Asteroid Cluster`,
            type: 'asteroidBelt',
            center: center.clone(),
            radius: spread,
            asteroidCount: count,
            galaxyId: galaxyIndex,
            isScatterCluster: true,
            blackHolePosition: center.clone()
        };
        scene.add(cluster);
        asteroidBelts.push(cluster);
    }

    let added = 0;
    // 1) Inside each black-hole galaxy: 3-5 extra clusters at random
    //    positions in the galactic plane, used as cover during fights.
    const blackHoles = planets.filter(p =>
        p.userData && p.userData.type === 'blackhole' &&
        typeof p.userData.galaxyId === 'number' &&
        !p.userData.isLocalGateway);
    blackHoles.forEach(bh => {
        const galaxyIndex = bh.userData.galaxyId;
        // Skip the local Sol system (galaxy 7): it already has its dedicated
        // asteroid belt; the extra scattered clusters near the Companion Core
        // are unnecessary clutter right by the player start (and cost draw calls).
        if (galaxyIndex === 7) return;
        const clusters = 3 + Math.floor(Math.random() * 3);
        for (let k = 0; k < clusters; k++) {
            const ang = Math.random() * Math.PI * 2;
            // Place 3,000-7,000 units from the BH so they don't pile on
            // the existing BH ring and they overlap the regular combat
            // zones where enemies spawn.
            const dist = 3000 + Math.random() * 4000;
            const yJitter = (Math.random() - 0.5) * 600;
            const center = new THREE.Vector3(
                bh.position.x + Math.cos(ang) * dist,
                bh.position.y + yJitter,
                bh.position.z + Math.sin(ang) * dist
            );
            _spawnCluster(galaxyIndex, center, { count: 25 + Math.floor(Math.random() * 15) });
            added++;
        }
    });

    // 2) Interstellar space between galaxies: 12 deep-space clusters
    //    placed at random points within ±45,000 of the origin so the
    //    player encounters them while warping or coasting.
    for (let k = 0; k < 12; k++) {
        const center = new THREE.Vector3(
            (Math.random() - 0.5) * 90000,
            (Math.random() - 0.5) * 18000,
            (Math.random() - 0.5) * 90000
        );
        // Larger spread + sparser fill — these are loose asteroid
        // streams between galaxies, not tight combat-cover clusters.
        _spawnCluster(-1, center, {
            count: 18 + Math.floor(Math.random() * 14),
            spread: 700 + Math.random() * 400,
            minScale: 3.0,
            scaleRange: 6.0
        });
        added++;
    }

    console.log(`💎 Created ${added} extra scattered asteroid clusters (galaxy + interstellar)`);
}

// =============================================================================
// DYNAMIC ASTEROID LOADING FOR GALAXIES
// =============================================================================

function loadAsteroidsForGalaxy(galaxyId) {
    console.log(`Loading asteroids for galaxy ${galaxyId}...`);
    
    // Check if asteroids already exist for this galaxy
    if (typeof asteroidBelts !== 'undefined') {
        const existingBelts = asteroidBelts.filter(belt => 
            belt.userData && belt.userData.galaxyId === galaxyId
        );
        
        if (existingBelts.length > 0) {
            console.log(`Galaxy ${galaxyId} already has ${existingBelts.length} asteroid belts`);
            return;
        }
    }
    
    // Initialize shared resources if needed
    if (typeof asteroidResources === 'undefined' || !asteroidResources.initialized) {
        initializeAsteroidResources();
    }
    
    // SAFETY: Ensure asteroidBelts array exists
    if (typeof window.asteroidBelts === 'undefined') {
        window.asteroidBelts = [];
    }
    
    // Find black holes in the scene
    const blackHoles = planets.filter(p => 
        p.userData.type === 'blackhole' && 
        typeof p.userData.galaxyId === 'number' &&
        !p.userData.isLocalGateway
    );
    
    // Find the black hole for this specific galaxy
    const blackHole = blackHoles.find(bh => bh.userData.galaxyId === galaxyId);
    
    if (!blackHole) {
        console.warn(`No black hole found for galaxy ${galaxyId}`);
        return;
    }
    
    const galaxyType = galaxyTypes[galaxyId];
    // Galaxy 7 (local Sol): anchor the belt to the Sol star, not the
    // origin Companion Core — see createAsteroidBelts for rationale.
    let galaxyCenter = blackHole.position.clone();
    if (galaxyId === 7) {
        const solStar = planets.find(p => p.userData && p.userData.isLocalStar);
        if (solStar) galaxyCenter = solStar.position.clone();
    }

    console.log(`Creating asteroid belt for galaxy ${galaxyId} (${galaxyType.name})`);
    
    const beltCount = Math.random() > 0.5 ? 2 : 1;
    
    for (let b = 0; b < beltCount; b++) {
        const beltGroup = new THREE.Group();
        const asteroidCount = 37 + Math.random() * 75; // Reduced 25% for performance
        const beltRadius = 1600 + Math.random() * 1000;
        const beltWidth = 400 + Math.random() * 800;
        
        for (let j = 0; j < asteroidCount; j++) {
            const geomIndex = Math.floor(Math.random() * 3);
            const geometry = asteroidResources.geometries[geomIndex];
            
            const matIndex = Math.floor(Math.random() * asteroidResources.materials.length);
            const material = asteroidResources.materials[matIndex];
            
            const asteroid = new THREE.Mesh(geometry, material);
            const scale = 3 + Math.random() * 6;
            asteroid.scale.setScalar(scale);
            asteroid.frustumCulled = false;
            
            const ringAngle = (j / asteroidCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
            const ringDistance = beltRadius + (Math.random() - 0.5) * beltWidth;
            const ringHeight = (Math.random() - 0.5) * 200;
            
            asteroid.position.set(
                Math.cos(ringAngle) * ringDistance,
                ringHeight,
                Math.sin(ringAngle) * ringDistance
            );
            
            asteroid.rotation.set(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            );
            
            asteroid.userData = {
                name: `${galaxyType.name} Asteroid ${j + 1}`,
                type: 'asteroid',
                health: 2,
                maxHealth: 2,
                orbitSpeed: 0.0005 + Math.random() * 0.001,
                rotationSpeed: (Math.random() - 0.5) * 0.015,
                beltCenter: galaxyCenter,
                orbitRadius: ringDistance,
                orbitPhase: ringAngle,
                galaxyId: galaxyId,
                isTargetable: true,
                isDestructible: true,
                beltGroup: beltGroup
            };
            
            beltGroup.add(asteroid);
            planets.push(asteroid);
        }
        
        if (galaxyId === 7) {
            const yOffset = (Math.random() < 0.5 ? 1 : -1) * (600 + Math.random() * 400);
            beltGroup.position.set(galaxyCenter.x, galaxyCenter.y + yOffset, galaxyCenter.z);
            console.log(`✅ Local asteroid belt ${b + 1} offset ${yOffset > 0 ? 'ABOVE' : 'BELOW'} solar plane`);
        } else {
            beltGroup.position.copy(galaxyCenter);
        }
        beltGroup.visible = true;
        beltGroup.frustumCulled = false;
        
        beltGroup.userData = {
            name: `${galaxyType.name} Galaxy Asteroid Belt ${b + 1}`,
            type: 'asteroidBelt',
            center: galaxyCenter,
            radius: beltRadius,
            asteroidCount: asteroidCount,
            galaxyId: galaxyId,
            blackHolePosition: galaxyCenter.clone()
        };
        
        scene.add(beltGroup);
        
        // REMOVED: Asteroid belt PointLight for performance
        // Asteroids use emissive materials for visibility instead
        
        asteroidBelts.push(beltGroup);
    }
    
    console.log(`✅ Loaded ${beltCount} asteroid belts for galaxy ${galaxyId}`);
}

// =============================================================================
// DYNAMIC ENEMY LOADING FOR GALAXIES
// =============================================================================

function loadEnemiesForGalaxy(galaxyId) {
    console.log(`Loading enemies for galaxy ${galaxyId}...`);
    
    // Check if enemies already exist for this galaxy
    const existingEnemies = enemies.filter(enemy => 
        enemy.userData && 
        enemy.userData.galaxyId === galaxyId &&
        enemy.userData.health > 0
    );
    
    if (existingEnemies.length > 0) {
        console.log(`Galaxy ${galaxyId} already has ${existingEnemies.length} enemies`);
        return;
    }
    
    // Check if this galaxy's boss was already defeated
    if (bossSystem.galaxyBossDefeated[galaxyId]) {
        console.log(`Galaxy ${galaxyId} already cleared - no enemies to spawn`);
        return;
    }
    
    const galaxyType = galaxyTypes[galaxyId];
    const galaxy3DCenter = getGalaxy3DPosition(galaxyId);
    
    console.log(`Spawning enemies for galaxy ${galaxyId} (${galaxyType.name}) at 3D position:`, galaxy3DCenter);
    
    // Spawn enemies for this galaxy
    const enemiesPerGalaxy = galaxyEnemyLimits[galaxyId];
    if (typeof gameState !== 'undefined' && gameState.currentGalaxyEnemies) {
        gameState.currentGalaxyEnemies[galaxyId] = enemiesPerGalaxy;
    }
    
    for (let i = 0; i < enemiesPerGalaxy; i++) {
        // Enemy geometry and material creation
        const enemyGeometry = createEnemyGeometry(galaxyId);
        const shapeData = enemyShapes[galaxyId];
        
        // ENHANCED: Use different placement strategies for variety
        let placementType;
        const roll = Math.random();
        
        if (roll < 0.33) {
            // 33% chance: spawn near cosmic features
            placementType = 'cosmic_feature';
        } else if (roll < 0.66) {
            // 33% chance: spawn near black holes
            placementType = 'black_hole';
        } else {
            // 34% chance: spawn randomly in galaxy
            placementType = 'random';
        }
        
        const enemyPosition = getEnemyPlacementPosition(galaxyId, placementType);
        const distance = galaxy3DCenter.distanceTo(enemyPosition);

        // Enhanced enemy creation with adaptive rendering
        const materials = createEnemyMaterial(shapeData, 'regular', distance);

        // Try to use 3D model first, fallback to geometry (galaxyId+1 because models are 1-8, galaxies are 0-7)
        let enemy;
        if (typeof createEnemyMeshWithModel === 'function') {
            enemy = createEnemyMeshWithModel(galaxyId + 1, enemyGeometry, materials.enemyMaterial);
        } else {
            enemy = new THREE.Mesh(enemyGeometry, materials.enemyMaterial);
        }

        const glowGeometry = enemyGeometry.clone();
        const glow = new THREE.Mesh(glowGeometry, materials.glowMaterial);
        glow.scale.multiplyScalar(materials.glowScale);
        
        // Prevent frustum culling for enemy glow
        glow.visible = true;
        glow.frustumCulled = false;
        
        enemy.add(glow);
        
        // Position using 3D coordinates
        enemy.position.copy(enemyPosition);
        
        // Complete userData with all properties
        enemy.userData = {
            name: `${galaxyType.faction} Hostile ${i + 1}`,
            type: 'enemy',
            health: getEnemyHealthForDifficulty(false, false, false),
            maxHealth: getEnemyHealthForDifficulty(false, false, false),
            speed: 0.8 + Math.random() * 1.5,
            aggression: Math.random(),
            patrolCenter: enemyPosition.clone(),
            patrolRadius: distance,
            lastAttack: 0,
            isActive: false,
            visible: true,
            galaxyId: galaxyId,
            galaxyColor: shapeData.color,
            swarmTarget: null,
            circlePhase: Math.random() * Math.PI * 2,
            attackMode: 'patrol',
            detectionRange: 1600,
            firingRange: 240,
            isLocal: false,
            isBoss: false,
            isBossSupport: false,
            position3D: enemyPosition.clone(),
            placementType: placementType // Track how this enemy was placed
        };
        
        // Ensure visibility and prevent frustum culling
        enemy.visible = true;
        enemy.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
        
        scene.add(enemy);
        enemies.push(enemy);
    }
    
    console.log(`✅ Loaded ${enemiesPerGalaxy} enemies for galaxy ${galaxyId}`);
}

// =============================================================================
// WARP SPEED STARFIELD EFFECT - 3D Streaking Stars
// Runs alongside createHyperspaceEffect() for enhanced visual immersion
// =============================================================================

function createWarpSpeedStarfield() {
    console.log('Creating 3D warp speed starfield with streaks...');
    
    const starCount = 200;
    const starSpeed = 80;
    const starSpread = 2000;
    const starDepth = 4000;
    
    // Create line segments for each star (2 vertices per star)
    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(starCount * 2 * 3); // 2 points per line
    const starVelocities = new Float32Array(starCount);
    const starData = []; // Store star info
    
    // Initialize stars
    for (let i = 0; i < starCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * starSpread;
        
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const z = -Math.random() * starDepth;
        
        starData.push({ x, y, z });
        starVelocities[i] = 0.8 + Math.random() * 0.4;
        
        // Set initial line positions (both points at same location initially)
        const i6 = i * 6;
        linePositions[i6] = x;
        linePositions[i6 + 1] = y;
        linePositions[i6 + 2] = z;
        linePositions[i6 + 3] = x;
        linePositions[i6 + 4] = y;
        linePositions[i6 + 5] = z;
    }
    
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    
    // White lines with additive blending
    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    lines.frustumCulled = false;
    lines.visible = false; // ✅ Start hidden
    lines.renderOrder = 1;  // Render behind player ship (which has renderOrder 100)
    
    if (typeof scene !== 'undefined') {
        scene.add(lines);
    }
    
    window.warpStarfield = {
        lines: lines,
        starData: starData,
        velocities: starVelocities,
        speed: starSpeed,
        spread: starSpread,
        depth: starDepth
    };
    
    console.log('✅ 3D warp speed starfield created (hidden by default)');
}

window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'x') braking = true;
});

window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'x') braking = false;
});

function updateWarpSpeedStarfield() {
    if (!window.warpStarfield?.lines) return;

    const starfield = window.warpStarfield;

    // Smoothly ease toward brake or resume
    const target = braking ? 0 : 80; // 0 when braking, 80 when normal
    starfield.speed += (target - starfield.speed) * 0.05; // easing factor 0.05 = smooth decel/accel

    // NEW: Align starfield with ship's velocity vector instead of camera
    if (typeof camera !== 'undefined' && typeof gameState !== 'undefined' && gameState.velocityVector) {
        // Position follows camera
        starfield.lines.position.copy(camera.position);
        
        // NEW: Rotate to match velocity direction (ship trajectory)
        const velocityDirection = gameState.velocityVector.clone().normalize();
        
        // Only update rotation if we have meaningful velocity
        if (velocityDirection.length() > 0.01) {
            // Create a quaternion that orients the starfield along the velocity vector
            const up = new THREE.Vector3(0, 1, 0);
            const quaternion = new THREE.Quaternion();
            
            // Look along the velocity direction
            const matrix = new THREE.Matrix4();
            matrix.lookAt(new THREE.Vector3(0, 0, 0), velocityDirection, up);
            quaternion.setFromRotationMatrix(matrix);
            
            starfield.lines.quaternion.copy(quaternion);
        }
    }

    const positions = starfield.lines.geometry.attributes.position.array;
    const starData = starfield.starData;
    const velocities = starfield.velocities;
    const speed = starfield.speed;
    const spread = starfield.spread;
    const depth = starfield.depth;
    
    for (let i = 0; i < starData.length; i++) {
        const star = starData[i];
        const velocity = velocities[i];
        
        // Move star toward camera (in LOCAL space, so it's always along trajectory)
        star.z += speed * velocity;
        
        // Reset if passed camera
        if (star.z > 100) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * spread;
            star.x = Math.cos(angle) * radius;
            star.y = Math.sin(angle) * radius;
            star.z = -depth;
            velocities[i] = 0.8 + Math.random() * 0.4;
        }
        
        // Update line positions (create streak effect)
        const i6 = i * 6;
        const streakLength = speed * velocity * 1; // Length of the streak
        
        // Front point (head of streak)
        positions[i6] = star.x;
        positions[i6 + 1] = star.y;
        positions[i6 + 2] = star.z;
        
        // Back point (tail of streak)
        positions[i6 + 3] = star.x;
        positions[i6 + 4] = star.y;
        positions[i6 + 5] = star.z - streakLength;
    }
    
    starfield.lines.geometry.attributes.position.needsUpdate = true;
}

function toggleWarpSpeedStarfield(enabled) {
    if (typeof window.warpStarfield === 'undefined') {
        return;
    }
    
    if (window.warpStarfield.lines) {
        window.warpStarfield.lines.visible = enabled;
    }
    
    console.log(`⚡ 3D Warp starfield ${enabled ? 'ACTIVATED' : 'deactivated'}`);
}

function cleanupDistantEnemies(currentGalaxyId) {
    // ✅ DISABLED: Keep all enemies loaded across all galaxies
    // This function is now a no-op to preserve enemies in all galaxies
    // Performance optimization disabled in favor of gameplay experience
    
    console.log(`✅ Enemy cleanup disabled - all ${enemies.length} enemies preserved across galaxies`);
    
    // Optional: Log enemy distribution for debugging
    if (typeof enemies !== 'undefined') {
        const distribution = {};
        enemies.forEach(enemy => {
            if (enemy.userData && enemy.userData.galaxyId !== undefined) {
                distribution[enemy.userData.galaxyId] = (distribution[enemy.userData.galaxyId] || 0) + 1;
            }
        });
        console.log('Enemy distribution by galaxy:', distribution);
    }
    
    // Function kept for compatibility but does nothing
    return;
}

function cleanupDistantAsteroids(currentGalaxyId) {
    console.log(`Cleaning up distant asteroids (keeping galaxy ${currentGalaxyId})...`);
    
    if (typeof asteroidBelts === 'undefined') {
        console.warn('asteroidBelts array not found');
        return;
    }
    
    const cleanupDistance = 80000; // Same distance as creation threshold
    const currentGalaxyCenter = getGalaxy3DPosition(currentGalaxyId);
    
    let removedBelts = 0;
    let keptBelts = 0;
    
    // Iterate backwards to safely remove belts
    for (let i = asteroidBelts.length - 1; i >= 0; i--) {
        const belt = asteroidBelts[i];
        
        if (!belt || !belt.userData) continue;
        
        const beltGalaxyId = belt.userData.galaxyId;
        
        // Keep current galaxy and adjacent galaxies
        if (beltGalaxyId === currentGalaxyId) {
            keptBelts++;
            continue;
        }
        
        // Check distance from current position
        const distanceToPlayer = camera.position.distanceTo(belt.position);
        
        if (distanceToPlayer > cleanupDistance) {
            // Remove all asteroids from the belt
            const asteroidCount = belt.children.length;
            
            // Remove each asteroid from scene arrays
            for (let j = belt.children.length - 1; j >= 0; j--) {
                const asteroid = belt.children[j];
                
                // Remove from planets array
                const planetIndex = planets.indexOf(asteroid);
                if (planetIndex > -1) {
                    planets.splice(planetIndex, 1);
                }
                
                // Remove from activePlanets array
                const activeIndex = activePlanets.indexOf(asteroid);
                if (activeIndex > -1) {
                    activePlanets.splice(activeIndex, 1);
                }
                
                // Dispose geometry and material if not shared
                if (asteroid.geometry && asteroid.geometry.dispose) {
                    // Don't dispose - these are shared resources
                }
                if (asteroid.material && asteroid.material.dispose) {
                    // Don't dispose - these are shared resources
                }
            }
            
            // Remove the belt light if it exists
            if (belt.userData.light) {
                scene.remove(belt.userData.light);
                belt.userData.light = null;
            }
            
            // Remove belt from scene
            scene.remove(belt);
            
            // Remove from asteroidBelts array
            asteroidBelts.splice(i, 1);
            
            removedBelts++;
            console.log(`  ♻️ Removed ${asteroidCount} asteroids from galaxy ${beltGalaxyId}`);
        } else {
            keptBelts++;
        }
    }
    
    console.log(`✅ Asteroid cleanup complete: removed ${removedBelts} belts, kept ${keptBelts} belts`);
}

// Animate brown dwarfs orbiting supernova cores
function animateNebulaBrownDwarfs() {
    if (typeof nebulaClouds === 'undefined') return;
    
    nebulaClouds.forEach(nebula => {
        if (!nebula.children) return;
        
        nebula.children.forEach(child => {
            if (child.userData && child.userData.type === 'brown_dwarf') {
                // Update orbit angle
                child.userData.orbitAngle += child.userData.orbitSpeed;
                
                // Calculate new position
                const x = Math.cos(child.userData.orbitAngle) * child.userData.orbitRadius;
                const z = Math.sin(child.userData.orbitAngle) * child.userData.orbitRadius;
                
                child.position.x = x;
                child.position.z = z;
            }
        });
    });
}

// =============================================================================
// WINDOW EXPORTS FOR GLOBAL ACCESS
// =============================================================================

if (typeof window !== 'undefined') {
    // Progressive difficulty system
    window.calculateDifficultySettings = calculateDifficultySettings;
    window.getEnemyHealthForDifficulty = getEnemyHealthForDifficulty;
    window.refreshEnemyDifficulty = refreshEnemyDifficulty;
    window.getDifficultyStatusText = getDifficultyStatusText;
    window.testDifficultyScaling = testDifficultyScaling;
    window.isEnemyInLocalGalaxy = isEnemyInLocalGalaxy;
    
    // ENHANCED: Boss system exports (area-based + elite guardians)
    window.bossSystem = bossSystem;
    window.lastKillPositions = lastKillPositions;
    window.recordEnemyKillPosition = recordEnemyKillPosition;
    window.checkAndSpawnAreaBosses = checkAndSpawnAreaBosses;
    window.checkGalaxyBossSpawn = checkGalaxyBossSpawn;
    window.checkSpeciesBossSpawn = checkSpeciesBossSpawn;
    window.checkAndSpawnEliteGuardians = checkAndSpawnEliteGuardians;
    window.spawnBossForArea = spawnBossForArea;
    window.spawnEliteGuardian = spawnEliteGuardian;
    window.spawnBossSupport = spawnBossSupport;
    window.checkBossVictory = checkBossVictory;

    // LEGACY: Keep old function names for backwards compatibility (redirect to new system)
    window.checkAndSpawnBoss = checkAndSpawnAreaBosses;
    window.checkAndSpawnBoss3D = checkAndSpawnAreaBosses;
    window.spawnBossForGalaxy = spawnBossForArea;
    window.spawnBossForGalaxy3D = spawnBossForArea;
    window.spawnBossSupport3D = spawnBossSupport;
    window.checkBossVictory3D = checkBossVictory;
    
    // Add these exports
	window.initializeAsteroidResources = initializeAsteroidResources;
	window.loadEnemiesForGalaxy = loadEnemiesForGalaxy;
	window.cleanupDistantEnemies = cleanupDistantEnemies;
	window.cleanupDistantAsteroids = cleanupDistantAsteroids;
	window.spawnBlackHoleGuardians = spawnBlackHoleGuardians;
	window.loadGuardiansForGalaxy = loadGuardiansForGalaxy;
	window.animateNebulaBrownDwarfs = animateNebulaBrownDwarfs;
	window.createWarpSpeedStarfield = createWarpSpeedStarfield;
    window.updateWarpSpeedStarfield = updateWarpSpeedStarfield;
    window.toggleWarpSpeedStarfield = toggleWarpSpeedStarfield;
    window.loadAsteroidsForGalaxy = loadAsteroidsForGalaxy;
    
    // Core creation functions
    window.createOptimizedPlanets = createOptimizedPlanets3D;
    window.createEnemies = createEnemies3D;
    window.createEnhancedComets = createEnhancedComets;
    window.createEnhancedWormholes = createEnhancedWormholes;
    window.updateUnstableWormholes = updateUnstableWormholes;
    window.createAmbientSpaceDebris = createAmbientSpaceDebris;
    window.updateAmbientSpaceDebris = updateAmbientSpaceDebris;
    window.createNebulas = createNebulas;
    window.createClusteredNebulas = createClusteredNebulas;
	window.createSpectacularClusteredNebulas = createSpectacularClusteredNebulas;
    window.createDistantNebulas = createDistantNebulas;
    window.createExoticCoreNebulas = createExoticCoreNebulas;
    window.createAsteroidBelts = createAsteroidBelts;
    window.createScatteredAsteroidFields = createScatteredAsteroidFields;
    window.isPositionTooClose = isPositionTooClose;
    
    // Utility functions
    window.generatePlanetName = generatePlanetName;
    window.createEnemyGeometry = createEnemyGeometry;
    window.createSunSpikes = createSunSpikes;
    window.createPlasmaTendril = createPlasmaTendril;
    window.isPositionTooClose = isPositionTooClose;
	window.createEnemyMaterial = createEnemyMaterial;
	window.getRandomGalaxyPosition = getRandomGalaxyPosition;
	window.createGalaxyEnvironmentalEffects = createGalaxyEnvironmentalEffects;
	window.updateCMBOpacity = updateCMBOpacity;
	
    // Data exports
    window.galaxyTypes = galaxyTypes;
    window.galaxyMapPositions = galaxyMapPositions;
    window.enemyShapes = enemyShapes;
    window.galaxyEnemyLimits = galaxyEnemyLimits;
    window.createEnhancedPlanetClustersInNebulas = createEnhancedPlanetClustersInNebulas;
    window.createNebulaGasCloud = createNebulaGasCloud;
	window.updateCMBOpacity = updateCMBOpacity;
	window.updateHubbleSkybox2Opacity = updateHubbleSkybox2Opacity;
    
    console.log('Enhanced game objects with planet clusters loaded');
}
// CMB OPACITY HELPER FUNCTION
// =============================================================================
function setCMBOpacity(value) {
    if (window.cosmicSkybox && window.cosmicSkybox.material && window.cosmicSkybox.material.uniforms && window.cosmicSkybox.material.uniforms.opacity) {
        window.cosmicSkybox.material.uniforms.opacity.value = value;
        console.log('✅ CMB opacity set to:', value);
    } else {
        console.warn('❌ CMB opacity uniform not available');
    }
}

// ✅ ENHANCED: Dynamic CMB opacity based on distance from Sagittarius A, nebula proximity, AND storm proximity
// =============================================================================
function updateCMBOpacity() {
    if (!window.cosmicSkybox || !window.cosmicSkybox.material || !window.cosmicSkybox.material.uniforms) {
        return;
    }
    
    if (typeof camera === 'undefined') {
        return;
    }
    
    // PART 1: Calculate base opacity based on distance from Sagittarius A* (at origin 0,0,0)
    const distanceFromSgrA = (window.trueDistanceFromOrigin) ? window.trueDistanceFromOrigin(camera.position) : camera.position.length();
    
    // Linear interpolation: 0.01 at origin, 0.09 at 4000+ units
    const maxDistance = 110000;
    const minOpacity = 0.01;
    const maxOpacity = 0.07;
    
    let baseOpacity = minOpacity + (distanceFromSgrA / maxDistance) * (maxOpacity - minOpacity);
    baseOpacity = Math.max(minOpacity, Math.min(maxOpacity, baseOpacity)); // Clamp between 0.03 and 0.09
    
    // PART 2: Check proximity to nebula centers and boost opacity
    let finalOpacity = baseOpacity;
    let inNebulaEffect = false;
    
    if (typeof nebulaClouds !== 'undefined' && nebulaClouds.length > 0) {
        let closestNebulaDistance = Infinity;
        
        // Find the closest nebula
        nebulaClouds.forEach(nebula => {
            if (nebula && nebula.position) {
                const distance = camera.position.distanceTo(nebula.position);
                if (distance < closestNebulaDistance) {
                    closestNebulaDistance = distance;
                }
            }
        });
        
        // If within 1500 units of a nebula, start boosting opacity
        if (closestNebulaDistance <= 1500) {
            inNebulaEffect = true;
            const nebulaMaxOpacity = 0.2;
            
            if (closestNebulaDistance <= 500) {
                // Within 250 units: full nebula opacity
                finalOpacity = nebulaMaxOpacity;
            } else {
                // Between 250-750 units: fade from base opacity to nebula opacity
                const fadeRange = 1500 - 500; // 500 units
                const fadeDistance = closestNebulaDistance - 500;
                const fadeFactor = fadeDistance / fadeRange; // 0 at 250 units, 1 at 750 units
                
                // Interpolate between nebula max opacity and base opacity
                finalOpacity = nebulaMaxOpacity * (1 - fadeFactor) + baseOpacity * fadeFactor;
            }
        }
    }
    
    // PART 3: ✅ NEW - Check proximity to solar storms and plasma storms
    if (!inNebulaEffect && typeof cosmicFeatures !== 'undefined') {
        const stormMaxOpacity = 0.2;
        let inStormEffect = false;
        
        // Check solar storms
        if (cosmicFeatures.solarStorms && cosmicFeatures.solarStorms.length > 0) {
            cosmicFeatures.solarStorms.forEach(storm => {
                if (storm && storm.position && !inStormEffect) {
                    const distance = camera.position.distanceTo(storm.position);
                    const stormRadius = 200; // Solar storms have waves extending to ~200 units
                    
                    // If inside or very close to storm radius
                    if (distance <= stormRadius) {
                        inStormEffect = true;
                        // Quick fade: full effect at center, fades to edge
                        const fadeFactor = distance / stormRadius; // 0 at center, 1 at edge
                        finalOpacity = stormMaxOpacity * (1 - fadeFactor * 0.5) + baseOpacity * (fadeFactor * 0.5);
                    }
                }
            });
        }
        
        // Check plasma storms
        if (cosmicFeatures.plasmaStorms && cosmicFeatures.plasmaStorms.length > 0 && !inStormEffect) {
            cosmicFeatures.plasmaStorms.forEach(storm => {
                if (storm && storm.position && !inStormEffect) {
                    const distance = camera.position.distanceTo(storm.position);
                    const stormRadius = 280; // Plasma storms have glow layer at 280 units
                    
                    // If inside or very close to storm radius
                    if (distance <= stormRadius) {
                        inStormEffect = true;
                        // Quick fade: full effect at center, fades to edge
                        const fadeFactor = distance / stormRadius; // 0 at center, 1 at edge
                        finalOpacity = stormMaxOpacity * (1 - fadeFactor * 0.5) + baseOpacity * (fadeFactor * 0.5);
                    }
                }
            });
        }
    }
    
    // Update the CMB shader uniform (with safety check)
    if (window.cosmicSkybox.material.uniforms && window.cosmicSkybox.material.uniforms.opacity) {
        window.cosmicSkybox.material.uniforms.opacity.value = finalOpacity;
    }
}

// =============================================================================
// NEBULA SKYBOX OPACITY CONTROL — distance-driven, same family as
// updateCMBOpacity / updateHubbleSkybox2Opacity.
//
// The layer is ADDITIVE now, so its opacity is literally "how much extra
// light the sky emits". Anchored on Sol (the player's start) rather than the
// world origin for the same reason the Hubble layer is: post-relocation the
// player spawns ~9.3k units out, and an origin-anchored ramp would open the
// game already half-lit.
//
//   • Open void near Sol → 0.15: dust is a rumour, blacks are real black.
//   • Deep travel / galactic core → 0.32: the sky opens up and the dust
//     lanes and baked galaxy cores bloom, so distance READS as spectacle.
//   • Boss battle → ~0, so only the pulsing blood-red boss dome shows
//     (identical policy to hubbleSkybox2).
// =============================================================================
function updateNebulaSkyboxOpacity() {
    const sky = (typeof window !== 'undefined') ? window.nebulaSkybox : null;
    if (!sky || !sky.material) return;
    if (typeof camera === 'undefined' || !camera || !camera.position) return;

    const _solB = (typeof window !== 'undefined' && window.localSystemOffset)
        ? window.localSystemOffset : { x: 8000, y: 0, z: 4800 };
    const _ndx = camera.position.x - _solB.x;
    const _ndy = camera.position.y - _solB.y;
    const _ndz = camera.position.z - _solB.z;
    const distanceFromStart = Math.sqrt(_ndx * _ndx + _ndy * _ndy + _ndz * _ndz);

    const fadeStart = 1500;
    const fadeEnd = 70000;
    const minOp = 0.12;
    const maxOp = 0.20;

    let targetOpacity;
    if (distanceFromStart < fadeStart) {
        targetOpacity = minOp;
    } else if (distanceFromStart > fadeEnd) {
        targetOpacity = maxOp;
    } else {
        const progress = (distanceFromStart - fadeStart) / (fadeEnd - fadeStart);
        targetOpacity = minOp + progress * (maxOp - minOp);
    }

    if (typeof isBossBattleActive === 'function' && isBossBattleActive()) {
        targetOpacity = 0.02;
    }

    const cur = sky.material.opacity;
    sky.material.opacity = cur + (targetOpacity - cur) * 0.02;
}
if (typeof window !== 'undefined') window.updateNebulaSkyboxOpacity = updateNebulaSkyboxOpacity;

// =============================================================================
// HUBBLE SKYBOX 2 OPACITY CONTROL - FADES IN AS PLAYER TRAVELS DEEPER
// =============================================================================
function updateHubbleSkybox2Opacity() {
    // Piggybacked here rather than added to animate()'s call list because
    // index.html / game-core.js are sealed by the integrator this wave, and
    // this is the per-frame backdrop-opacity pass — exactly where the nebula
    // dome's own distance fade belongs. Runs BEFORE the early-outs below so
    // it still ticks if the Hubble texture never loaded.
    updateNebulaSkyboxOpacity();

    if (!window.hubbleSkybox2 || !window.hubbleSkybox2.material) {
        return;
    }

    if (typeof camera === 'undefined' || typeof gameState === 'undefined') {
        return;
    }
    
    // Distance travelled FROM the player's start (relocated Sol system),
    // not from the world origin. Pre-fix this used camera.position
    // .length(); after the SOL relocation the player spawns ~9.3k units
    // from origin, so this deep layer started at ~0.31 instead of its
    // floor and washed out the early sky / scene. Sol-anchored, it
    // sits at the 0.25 floor at spawn and fades in only on real travel.
    const _solB = (typeof window !== 'undefined' && window.localSystemOffset)
        ? window.localSystemOffset : { x: 8000, y: 0, z: 4800 };
    const _s2dx = camera.position.x - _solB.x;
    const _s2dy = camera.position.y - _solB.y;
    const _s2dz = camera.position.z - _solB.z;
    const distanceFromStart = Math.sqrt(_s2dx * _s2dx + _s2dy * _s2dy + _s2dz * _s2dz);

    // Define fade-in range (starts later, for deeper exploration)
    const fadeStartDistance = 1000;        // Start fading at 1,000 units from Sol
    const fadeEndDistance = 75000;         // Reach max opacity at 75,000 units
    
    // Calculate opacity based on distance (0.32 floor to 0.45 max).
    //
    // Raised, not lowered, on purpose. These numbers used to be a budget for
    // "how much flat violet fog can we tolerate", because that is all this
    // layer ever drew (see the fog:false note at its creation). Now that it
    // renders the actual plate — black with pinprick galaxies — additively,
    // opacity buys deep-field DETAIL rather than a wash, so it can afford to
    // be much stronger while the sky gets darker overall.
    let targetOpacity;
    if (distanceFromStart < fadeStartDistance) {
        targetOpacity = 0.32; // Visible from the start without washing out the early sky
    } else if (distanceFromStart > fadeEndDistance) {
        targetOpacity = 0.45;
    } else {
        const progress = (distanceFromStart - fadeStartDistance) / (fadeEndDistance - fadeStartDistance);
        targetOpacity = 0.32 + (progress * 0.13); // 0.32 → 0.45
    }
    
    // Boss / elite-guardian battle: hide this deeper Hubble layer too so
    // only the pulsing blood-red boss skybox shows. Auto-resumes when
    // the boss/guardian is defeated.
    if (typeof isBossBattleActive === "function" && isBossBattleActive()) {
        targetOpacity = 0;
    }

    // Smoothly transition to target opacity
    const currentOpacity = window.hubbleSkybox2.material.opacity;
    const lerpSpeed = 0.02; // Smooth transition speed
    window.hubbleSkybox2.material.opacity = currentOpacity + (targetOpacity - currentOpacity) * lerpSpeed;
}


// =============================================================================
// BOSS BATTLE SKYBOX - Blood-red pulsing heartbeat effect
// =============================================================================

let bossSkybox = null;
let bossSkyboxOpacity = 0;
let bossHeartbeatPhase = 0;

// Lightning in the boss sky — occasional storm cells of 1-3 white strokes.
// Each stroke is an ENVELOPE (fast-but-smooth attack, slower decay), not a
// hard strobe, so the flash reads as lightning behind the clouds: the dome
// color lerps crimson → white and opacity lifts with the envelope.
const _bossLightning = { nextAt: 0, strokes: 0, flash: null };
const _bossSkyBaseColor = (typeof THREE !== 'undefined') ? new THREE.Color(0xdd2222) : null;
const _bossSkyWhite = (typeof THREE !== 'undefined') ? new THREE.Color(0xffffff) : null;
const _bossSkyTmp = (typeof THREE !== 'undefined') ? new THREE.Color() : null;

// Single source of truth: is a real boss / elite-guardian set-piece
// fight currently live AND in front of the player? Drives the pulsing
// boss skybox AND the Hubble fade-out.
//   • Black-hole guardians are excluded — they LOAD as a persistent
//     patrol the moment a galaxy's boss is beaten, so counting them
//     pinned this true forever.
//   • PROXIMITY-SCOPED: a boss only counts if it's within
//     BATTLE_RADIUS of the player. Galaxies sit ≥25k apart, so this
//     was effectively game-wide before — a live boss in ANY other
//     galaxy kept the blood-red skybox up and the Hubble backdrop
//     never returned once the local fight ended.
const _bossNearTmp = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
function isBossBattleActive() {
    const BATTLE_RADIUS = 12000;   // ≫ combat range, ≪ inter-galaxy gap
    const haveCam = (typeof camera !== 'undefined' && camera && camera.position);
    const _near = (obj) => {
        if (!haveCam || !_bossNearTmp || !obj) return true; // can't tell → assume in-fight
        if (obj.getWorldPosition) obj.getWorldPosition(_bossNearTmp);
        else if (obj.position) _bossNearTmp.copy(obj.position);
        else return true;
        return camera.position.distanceTo(_bossNearTmp) <= BATTLE_RADIUS;
    };

    if (typeof bossSystem !== "undefined" && bossSystem &&
        Array.isArray(bossSystem.activeBosses) &&
        bossSystem.activeBosses.some(b =>
            b && b.userData && b.userData.health > 0 && _near(b))) {
        return true;
    }
    // Fallback: scan live enemies for any boss-tier set-piece. Excludes
    // isBlackHoleGuardian on purpose (post-boss patrol, not a fight).
    if (typeof enemies !== "undefined" && Array.isArray(enemies)) {
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e && e.userData && e.userData.health > 0 &&
                (e.userData.isBoss || e.userData.isEliteGuardian) && _near(e)) {
                return true;
            }
        }
    }
    return false;
}
if (typeof window !== "undefined") window.isBossBattleActive = isBossBattleActive;

// One-time procedural cloud texture for the boss dome: 5-octave value
// noise baked into a canvas — white billows in the ALPHA channel, so the
// material's red tint colors them and the heartbeat opacity pulse breathes
// through the cloud pattern instead of a flat wash. MirroredRepeat hides
// the tiling seam on the sphere wrap.
function _makeBossCloudTexture() {
    const SIZE = 512;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(SIZE, SIZE);
    const rand = (x, y) => {
        const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        return n - Math.floor(n);
    };
    const smooth = t => t * t * (3 - 2 * t);
    const noise2 = (x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y);
        const xf = x - xi, yf = y - yi;
        const a = rand(xi, yi), b = rand(xi + 1, yi);
        const c = rand(xi, yi + 1), d = rand(xi + 1, yi + 1);
        const u = smooth(xf), v = smooth(yf);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            let v = 0, amp = 0.5, freq = 4 / SIZE;
            for (let o = 0; o < 5; o++) {
                v += amp * noise2(x * freq, y * freq);
                amp *= 0.5; freq *= 2;
            }
            // Billowy contrast: hollow out the troughs, keep bright crests
            v = Math.max(0, Math.min(1, (v - 0.35) * 1.8));
            // POLE FADE: the sphere's UV rows converge at the poles, which
            // pinched the pattern into a swirl. The texture's vertical
            // edges land exactly on the poles (mirrored repeat.y = 2), so
            // fading cloud alpha to zero over the outer 12% of rows clears
            // the polar caps smoothly — no clouds to pinch.
            const edge = Math.min(y, SIZE - 1 - y) / (SIZE * 0.12);
            if (edge < 1) v *= edge * edge * (3 - 2 * edge); // smoothstep
            const i = (y * SIZE + x) * 4;
            img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255;
            img.data[i + 3] = Math.floor(v * 255);
        }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.MirroredRepeatWrapping;
    tex.wrapT = THREE.MirroredRepeatWrapping;
    // Repeat counts must be EVEN: mirrored wrapping only meets itself
    // seamlessly when the pattern completes a full mirror cycle, so an
    // odd count (was 3) left a hard discontinuity on the sphere's UV
    // seam — the "strong line" across the sky. Even counts make the
    // texture's mirrored edge land exactly on the wrap.
    tex.repeat.set(4, 2);
    return tex;
}

function createBossBattleSkybox() {
    // Re-entry guard: both init paths may call this; one dome only.
    if (bossSkybox) return;
    console.log("Creating boss battle skybox...");

    const geometry = new THREE.SphereGeometry(135000, 64, 64);
    const material = new THREE.MeshBasicMaterial({
        color: 0xdd2222,  // Vivid crimson — old 0x8b0000 (R=139) read muted
        map: _makeBossCloudTexture(),
        side: THREE.BackSide,
        transparent: true,
        opacity: 0,
        fog: false,
        depthWrite: false
    });

    bossSkybox = new THREE.Mesh(geometry, material);
    bossSkybox.name = "BossBattleSkybox";
    bossSkybox.frustumCulled = false;
    // renderOrder 0 (in front of CMB at -1 and Hubble at -2/-3) so the
    // blood-red heartbeat reads clearly over the cosmic backgrounds.
    bossSkybox.renderOrder = 0;

    scene.add(bossSkybox);
    // Re-export: the load-time `window.bossSkybox = bossSkybox` below ran
    // while this was still null, which made console checks read null even
    // when the dome existed.
    if (typeof window !== 'undefined') window.bossSkybox = bossSkybox;

    console.log("✅ Boss battle skybox created (initially transparent)");
}

// Update boss skybox opacity with heartbeat effect
function updateBossSkyboxHeartbeat() {
    if (!bossSkybox || typeof bossSystem === "undefined") return;

    // Keep the dome CENTERED ON THE PLAYER so it always envelops them.
    // It used to sit at the world origin (radius 90k), so during boss
    // fights far from origin (distant galaxies out to 75k, the gateway at
    // −32k, etc.) the player was near/outside its edge and the blood-red
    // never showed. Following the camera (radius now 135k) guarantees it
    // surrounds the player wherever the fight happens.
    if (typeof camera !== 'undefined' && camera) {
        bossSkybox.position.copy(camera.position);
    }

    // Drift the cloud layer slowly so the red billows crawl during the
    // fight — two mismatched axis rates so the motion never reads as a
    // simple spin.
    bossSkybox.rotation.y += 0.00035;
    bossSkybox.rotation.x += 0.00011;

    // Boss OR elite/black-hole guardian — not just bossSystem.activeBoss
    // (which only tracks regular bosses, never elite guardians).
    const hasBoss = isBossBattleActive();

    if (hasBoss) {
        // Heartbeat pulsing effect
        bossHeartbeatPhase += 0.08;  // Speed of heartbeat

        // Double-beat pattern like a real heartbeat: lub-dub, pause, lub-dub
        const beat1 = Math.sin(bossHeartbeatPhase * 2) * 0.5 + 0.5;  // Fast beat
        const beat2 = Math.sin((bossHeartbeatPhase - 0.3) * 2) * 0.5 + 0.5;  // Second beat slightly delayed
        const pause = Math.sin(bossHeartbeatPhase) * 0.5 + 0.5;  // Slower pulse for pause

        // Combine beats for realistic heartbeat pattern
        const heartbeat = Math.max(beat1 * 0.6, beat2 * 0.4) * pause;

        // Target opacity with heartbeat — range 0.2 (baseline) to 0.45
        // (peak). Tuned down twice from the original 0.5–1.0, which was
        // set while the dome was accidentally never created on normal
        // launches; the vivid 0xdd2222 color reads clearly even this low.
        const targetOpacity = 0.2 + (heartbeat * 0.25);  // Range: 0.2 to 0.45

        // Smooth transition to target
        bossSkyboxOpacity += (targetOpacity - bossSkyboxOpacity) * 0.1;

    } else {
        // Fade out when no boss
        bossSkyboxOpacity -= bossSkyboxOpacity * 0.05;
        if (bossSkyboxOpacity < 0.01) bossSkyboxOpacity = 0;
    }

    // LIGHTNING: storm cells fire every 4-13s while a boss is up; each
    // cell is 1-3 strokes ~0.1-0.5s apart with smooth rise/fade envelopes.
    let _lEnv = 0;
    const _now = Date.now();
    if (hasBoss) {
        if (!_bossLightning.nextAt) _bossLightning.nextAt = _now + 1200 + Math.random() * 2500;
        if (!_bossLightning.flash && _now >= _bossLightning.nextAt) {
            if (_bossLightning.strokes <= 0) _bossLightning.strokes = 1 + Math.floor(Math.random() * 3);
            _bossLightning.flash = {
                t0: _now,
                attack: 80 + Math.random() * 140,   // gradual rise (ms)
                decay: 260 + Math.random() * 380,   // slower fade (ms)
                peak: 0.45 + Math.random() * 0.55   // stroke intensity varies
            };
        }
        if (_bossLightning.flash) {
            const f = _bossLightning.flash;
            const dt = _now - f.t0;
            _lEnv = (dt < f.attack
                ? dt / f.attack
                : Math.max(0, 1 - (dt - f.attack) / f.decay)) * f.peak;
            if (dt > f.attack + f.decay) {
                _bossLightning.flash = null;
                _bossLightning.strokes--;
                _bossLightning.nextAt = _bossLightning.strokes > 0
                    ? _now + 100 + Math.random() * 400    // next stroke in this cell
                    : _now + 2200 + Math.random() * 4500; // next storm cell (2.2-6.7s)
            }
        }
    } else {
        _bossLightning.flash = null;
        _bossLightning.strokes = 0;
        _bossLightning.nextAt = 0;
    }

    // Apply: the flash whitens the cloud tint and lifts opacity on top of
    // the heartbeat, then hands the sky back to the red pulse.
    if (_bossSkyTmp && _bossSkyBaseColor && _bossSkyWhite) {
        _bossSkyTmp.copy(_bossSkyBaseColor).lerp(_bossSkyWhite, Math.min(1, _lEnv * 1.4));
        bossSkybox.material.color.copy(_bossSkyTmp);
    }
    // Opacity lift trimmed (0.35 → 0.16, cap 0.85 → 0.58): the flash should
    // read in the COLOR shift to white more than in raw opacity.
    bossSkybox.material.opacity = Math.min(0.58, bossSkyboxOpacity + _lEnv * 0.16);
}

// =============================================================================
// GALAXY ATMOSPHERE DOME — the boss dome's calm sibling. While flying deep
// space, a cloudy camera-following dome fades in tinted with the NEAREST
// black-hole galaxy's faction color. No pulse: opacity scales purely with
// proximity to that galaxy core. The fade begins FAR out — well beyond even
// the largest accretion rings — so the region announces itself long before
// the core is reached. Suppressed during boss battles (the blood-red
// heartbeat owns the sky) and in the home system.
// =============================================================================
let galaxyAtmosphereDome = null;
let _gaCores = null;
const _gaTargetColor = (typeof THREE !== 'undefined') ? new THREE.Color() : null;
// Deep-space haze: in open space the cloud layer occasionally breathes up
// in plain WHITE at whisper opacity, then fades back out — ambient texture
// for the long empty stretches, distinct from the colored regional tints.
const _gaHaze = { nextAt: 0, until: 0, peak: 0 };

function updateGalaxyAtmosphere() {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' ||
        typeof camera === 'undefined' || typeof gameState === 'undefined') return;
    if (!gameState.gameStarted) return;

    if (!galaxyAtmosphereDome) {
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            map: _makeBossCloudTexture(),
            side: THREE.BackSide,
            transparent: true,
            opacity: 0,
            fog: false,
            depthWrite: false
        });
        galaxyAtmosphereDome = new THREE.Mesh(new THREE.SphereGeometry(140000, 48, 48), mat);
        galaxyAtmosphereDome.name = 'GalaxyAtmosphereDome';
        galaxyAtmosphereDome.frustumCulled = false;
        galaxyAtmosphereDome.renderOrder = -0.5; // behind boss dome (0), over CMB (-1)
        scene.add(galaxyAtmosphereDome);
    }

    // Envelop the player; drift slowly (mismatched rates ≠ spin).
    galaxyAtmosphereDome.position.copy(camera.position);
    galaxyAtmosphereDome.rotation.y += 0.00022;
    galaxyAtmosphereDome.rotation.x -= 0.00007;

    // Cache the distant galaxy cores once (home system / companion excluded).
    if (!_gaCores && typeof planets !== 'undefined' && planets.length) {
        const cores = planets.filter(p => p && p.userData &&
            p.userData.type === 'blackhole' && p.userData.isGalacticCore &&
            !p.userData.isCompanionCore &&
            typeof p.userData.galaxyId === 'number' && p.userData.galaxyId !== 7);
        if (cores.length) _gaCores = cores;
    }

    // Proximity ramp: begins at 28,000u out — far beyond the largest
    // accretion rings — and builds to full strength by 5,000u from the core.
    const FADE_START = 28000;
    const FADE_FULL = 5000;
    const MAX_OPACITY = 0.22; // trimmed from 0.30 — regional tint should whisper, not shout

    let targetOpacity = 0;
    if (_gaCores) {
        let best = null, bestD = Infinity;
        for (let i = 0; i < _gaCores.length; i++) {
            const d = camera.position.distanceTo(_gaCores[i].position);
            if (d < bestD) { bestD = d; best = _gaCores[i]; }
        }
        if (best && bestD < FADE_START) {
            const t = Math.max(0, Math.min(1, (FADE_START - bestD) / (FADE_START - FADE_FULL)));
            targetOpacity = MAX_OPACITY * t;
            const gid = best.userData.galaxyId;
            const hex = (typeof galaxyTypes !== 'undefined' && galaxyTypes[gid] && galaxyTypes[gid].color)
                ? galaxyTypes[gid].color : 0x8888ff;
            if (_gaTargetColor) {
                // COMPLEMENTARY tint: rotate the faction hue 180° so the
                // regional sky CONTRASTS with that galaxy's ships, lines,
                // and orbit colors instead of drowning in the same hue.
                // Saturation/lightness clamped so every faction's
                // complement reads as a usable sky color.
                _gaTargetColor.setHex(hex);
                const _hsl = { h: 0, s: 0, l: 0 };
                _gaTargetColor.getHSL(_hsl);
                _gaTargetColor.setHSL(
                    (_hsl.h + 0.5) % 1,
                    Math.min(0.9, Math.max(0.45, _hsl.s)),
                    Math.min(0.62, Math.max(0.42, _hsl.l))
                );
                galaxyAtmosphereDome.material.color.lerp(_gaTargetColor, 0.02);
            }
        }
    }

    // DEEP-SPACE HAZE: when no galaxy region is tinting the sky, run an
    // occasional white fade-up episode. The slow opacity lerp below gives
    // it the gradual swell and fade; color drifts to plain white.
    if (targetOpacity <= 0) {
        const _hNow = Date.now();
        if (!_gaHaze.nextAt) _gaHaze.nextAt = _hNow + 15000 + Math.random() * 30000;
        if (!_gaHaze.until && _hNow >= _gaHaze.nextAt) {
            _gaHaze.until = _hNow + 12000 + Math.random() * 12000; // 12-24s episode
            _gaHaze.peak = 0.05 + Math.random() * 0.05;            // whisper: 0.05-0.10
        }
        if (_gaHaze.until) {
            if (_hNow >= _gaHaze.until) {
                _gaHaze.until = 0;
                _gaHaze.nextAt = _hNow + 25000 + Math.random() * 45000; // next episode 25-70s
            } else {
                targetOpacity = _gaHaze.peak;
                if (_gaTargetColor) {
                    _gaTargetColor.setHex(0xffffff);
                    galaxyAtmosphereDome.material.color.lerp(_gaTargetColor, 0.02);
                }
            }
        }
    }

    // Boss fights own the sky.
    if (typeof isBossBattleActive === 'function' && isBossBattleActive()) targetOpacity = 0;

    // Soft fade toward target — no pulsing.
    const cur = galaxyAtmosphereDome.material.opacity;
    galaxyAtmosphereDome.material.opacity = cur + (targetOpacity - cur) * 0.015;
}
window.updateGalaxyAtmosphere = updateGalaxyAtmosphere;

// Export functions
window.createBossBattleSkybox = createBossBattleSkybox;
window.updateBossSkyboxHeartbeat = updateBossSkyboxHeartbeat;
window.bossSkybox = bossSkybox;

// =============================================================================
// DEBUG: NEBULA RED BEACONS - Visible markers at all nebula positions
// =============================================================================

let nebulaDebugBeacons = [];

function createNebulaDebugBeacons() {
    console.log('🔴 Creating debug beacons at all nebula positions...');
    
    // Remove any existing beacons first
    removeNebulaDebugBeacons();
    
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) {
        console.warn('⚠️ No nebulas found - cannot create debug beacons');
        return;
    }
    
    nebulaClouds.forEach((nebula, index) => {
        if (!nebula || !nebula.position) return;
        
        // Create a bright red sphere beacon
        const beaconGeometry = new THREE.SphereGeometry(100, 16, 16);
        const beaconMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: false
        });
        const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
        beacon.position.copy(nebula.position);
        
        // Add pulsing outer glow ring
        const glowGeometry = new THREE.RingGeometry(150, 200, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.rotation.x = Math.PI / 2; // Horizontal ring
        beacon.add(glow);
        
        // Add second ring perpendicular
        const glow2 = new THREE.Mesh(glowGeometry.clone(), glowMaterial.clone());
        glow2.rotation.y = Math.PI / 2; // Vertical ring
        beacon.add(glow2);
        
        // Add vertical spike for visibility from distance
        const spikeGeometry = new THREE.CylinderGeometry(10, 10, 1000, 8);
        const spikeMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.8
        });
        const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
        spike.position.y = 500;
        beacon.add(spike);
        
        // Add point light for visibility
        const light = new THREE.PointLight(0xff0000, 5, 3000, 1);
        beacon.add(light);
        
        beacon.userData = {
            name: `Debug Beacon ${index + 1}`,
            type: 'debug_beacon',
            nebulaIndex: index,
            nebulaName: nebula.userData?.name || `Nebula ${index + 1}`
        };
        
        beacon.visible = true;
        beacon.frustumCulled = false;
        
        scene.add(beacon);
        nebulaDebugBeacons.push(beacon);
        
        const nebulaName = nebula.userData?.name || `Nebula ${index + 1}`;
        console.log(`  🔴 Beacon ${index + 1} at ${nebulaName}: (${Math.round(nebula.position.x)}, ${Math.round(nebula.position.y)}, ${Math.round(nebula.position.z)})`);
    });
    
    console.log(`✅ Created ${nebulaDebugBeacons.length} debug beacons at nebula positions`);
}

function removeNebulaDebugBeacons() {
    nebulaDebugBeacons.forEach(beacon => {
        if (beacon && beacon.parent) {
            scene.remove(beacon);
        }
    });
    nebulaDebugBeacons = [];
    console.log('🔴 Removed all nebula debug beacons');
}

function toggleNebulaDebugBeacons() {
    if (nebulaDebugBeacons.length === 0) {
        createNebulaDebugBeacons();
    } else {
        removeNebulaDebugBeacons();
    }
}

// Export debug beacon functions
window.createNebulaDebugBeacons = createNebulaDebugBeacons;
window.removeNebulaDebugBeacons = removeNebulaDebugBeacons;
window.toggleNebulaDebugBeacons = toggleNebulaDebugBeacons;
window.nebulaDebugBeacons = nebulaDebugBeacons;


// =============================================================================
// FLOATING ORIGIN — shift this module's cached absolute coordinates when the
// world is rebased (see applyWorldShift in game-core.js). Everything here
// stores CURRENT-frame coords, so a uniform subtract keeps them correct.
// =============================================================================
if (typeof window !== 'undefined') {
    window.__worldShiftHandlers = window.__worldShiftHandlers || [];
    window.__worldShiftHandlers.push(function (offset) {
        const sh = (o) => {
            if (!o) return;
            if (o.isVector3) { o.sub(offset); return; }
            if (typeof o.x === 'number' && typeof o.y === 'number' && typeof o.z === 'number') {
                o.x -= offset.x; o.y -= offset.y; o.z -= offset.z;
            }
        };
        // Wormhole mouth table (source of truth for re-reads)
        if (typeof WORMHOLE_NETWORK !== 'undefined') {
            WORMHOLE_NETWORK.forEach((w) => { sh(w.a); sh(w.b); });
        }
        // Sol / Dune gateway anchors
        sh(window.localGatewayPosition);
        sh(window.localSystemOffset);
        // Elite-guardian respawn anchors (per-faction last kill sites)
        if (typeof lastKillPositions !== 'undefined') {
            Object.keys(lastKillPositions).forEach((k) => sh(lastKillPositions[k]));
        }
        // Freighter caravan routes (plain objects, not scene children —
        // their ships are positioned each tick from source/destination)
        if (typeof freighterCaravans !== 'undefined') {
            freighterCaravans.forEach((cv) => { sh(cv.source); sh(cv.destination); });
        }
    });
}
