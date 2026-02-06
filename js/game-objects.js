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
    const maxRadius = 45000; // Maximum distance for outer galaxies
    
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
    const minRadius = 15000; // Closer than galaxies
    const maxRadius = 30000;
    
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
    0: 12, 1: 15, 2: 10, 3: 13, 4: 8, 5: 14, 6: 18, 7: 16
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

    activeBoss: null,
    activeBosses: [], // Track multiple active bosses
    bossThreshold: 0 // Spawn boss when 0 enemies remain in area (all cleared)
};

// Track where the last enemy of each faction was killed (for elite guardian spawning)
const lastKillPositions = {};

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
        // Local enemy health: 1-3 hits
        if (galaxiesCleared === 0) return 1; // Tutorial level
        return Math.min(1 + Math.floor(galaxiesCleared / 3), 3);
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
    const distanceFromOrigin = enemy.position.length();
    return distanceFromOrigin < 5000; // Local galaxy radius
}

// ENHANCED: Area-based boss spawning system
function checkAndSpawnAreaBosses() {
    if (typeof enemies === 'undefined' || typeof scene === 'undefined') return;

    // Track all enemy areas (combinations of galaxyId and placementType)
    const areaEnemyCounts = {};

    // Count enemies by area
    enemies.forEach(enemy => {
        if (!enemy.userData || enemy.userData.health <= 0) return;
        if (enemy.userData.isBoss || enemy.userData.isBossSupport || enemy.userData.isEliteGuardian) return;

        const galaxyId = enemy.userData.galaxyId;
        const placementType = enemy.userData.placementType || 'random';
        const areaKey = `${galaxyId}-${placementType}`;

        areaEnemyCounts[areaKey] = (areaEnemyCounts[areaKey] || 0) + 1;
    });

    // Check each area - spawn boss if area is cleared
    Object.keys(areaEnemyCounts).forEach(areaKey => {
        const count = areaEnemyCounts[areaKey];

        // Check if this area's boss has already been spawned/defeated
        if (bossSystem.areaBosses[areaKey]) return;

        // Spawn boss when all enemies in area are cleared
        if (count <= bossSystem.bossThreshold) {
            const [galaxyId, placementType] = areaKey.split('-');
            spawnBossForArea(parseInt(galaxyId), placementType, areaKey);
        }
    });
}

// ENHANCED: Spawn boss for specific area
function spawnBossForArea(galaxyId, placementType, areaKey) {
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
    
    // ENHANCED: Use 3D positioning if available, fallback to 2D
    let bossPosition;
    
    // Try 3D positioning first
    if (typeof getRandomPositionInGalaxy3D === 'function') {
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

    // Try to use 3D boss model first, fallback to geometry (galaxyId+1 because models are 1-8, galaxies are 0-7)
    let boss;
    if (typeof createBossMeshWithModel === 'function') {
        boss = createBossMeshWithModel(galaxyId + 1, bossGeometry, bossMaterial);
    } else {
        boss = new THREE.Mesh(bossGeometry, bossMaterial);
        boss.scale.multiplyScalar(2.5); // PRESERVED: Boss scaling (only if using fallback)
    }
    
    // ENHANCED: Position boss using 3D coordinates
    boss.position.copy(bossPosition);
    
    // PRESERVED: Enhanced boss glow with all original features
    const bossGlowGeometry = bossGeometry.clone();
    const bossGlowMaterial = new THREE.MeshBasicMaterial({
        color: shapeData.color,
        transparent: true,
        opacity: 0.4, // PRESERVED: Boss glow opacity
        blending: THREE.AdditiveBlending
    });
    const bossGlow = new THREE.Mesh(bossGlowGeometry, bossGlowMaterial);
    bossGlow.scale.multiplyScalar(1.3); // PRESERVED: Glow scaling
    
    // PRESERVED: Prevent frustum culling for boss glow
    bossGlow.visible = true;
    bossGlow.frustumCulled = false;
    
    boss.add(bossGlow);

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
        name: `${galaxyType.faction} Overlord (${placementType})`, // ENHANCED: Include area type
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

    // ENHANCED: Update boss system tracking
    bossSystem.areaBosses[areaKey].bossRef = boss;
    bossSystem.activeBosses.push(boss);
    bossSystem.activeBoss = boss; // Keep for backwards compatibility
    
    // PRESERVED: Spawn 2-3 support ships with enhanced 3D positioning
    for (let i = 0; i < 3; i++) {
        spawnBossSupport(galaxyId, bossPosition, i, areaKey);
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

    console.log(`Boss spawned: ${boss.userData.name} in ${galaxyType.name} Galaxy at 3D position:`, bossPosition);
    return boss;
}

// =============================================================================
// ENHANCED 3D BOSS SUPPORT SPAWNING - PRESERVES ALL ORIGINAL FEATURES
// =============================================================================

function spawnBossSupport(galaxyId, bossPosition, supportIndex, areaKey = null) {
    const galaxyType = galaxyTypes[galaxyId];
    const shapeData = enemyShapes[galaxyId];
    
    // PRESERVED: Create support geometry and material
    const supportGeometry = createEnemyGeometry(galaxyId);
    const supportMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(shapeData.color).multiplyScalar(1.1), // PRESERVED: Support coloring
        roughness: 0.4,
        metalness: 0.6,
        emissive: new THREE.Color(shapeData.color).multiplyScalar(0.2),
        emissiveIntensity: 0.5
    });

    // Try to use 3D model first, fallback to geometry (galaxyId+1 because models are 1-8, galaxies are 0-7)
    let support;
    if (typeof createEnemyMeshWithModel === 'function') {
        support = createEnemyMeshWithModel(galaxyId + 1, supportGeometry, supportMaterial);
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
        name: `${galaxyType.faction} Support ${supportIndex + 1}`, // PRESERVED: Support naming
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
    
    console.log(`Boss support spawned: ${support.userData.name} at 3D position:`, supportPosition);
}

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

        // Mark elite guardian as defeated
        if (bossSystem.eliteGuardians[faction]) {
            bossSystem.eliteGuardians[faction].defeated = true;
        }

        // Remove from active bosses list
        const bossIndex = bossSystem.activeBosses.indexOf(defeatedEnemy);
        if (bossIndex > -1) {
            bossSystem.activeBosses.splice(bossIndex, 1);
        }

        // Show victory message
        if (typeof showAchievement === 'function') {
            showAchievement('Elite Guardian Eliminated!',
                `${defeatedEnemy.userData.name} has been defeated! Hostile Forces have been Eliminated!`);
        }

        return true;

    } else if (defeatedEnemy.userData.isBoss) {
        // AREA BOSS DEFEATED
        console.log(`🎯 Area Boss defeated: ${defeatedEnemy.userData.name} (${areaKey})`);

        // Mark area boss as defeated
        if (areaKey && bossSystem.areaBosses[areaKey]) {
            bossSystem.areaBosses[areaKey].defeated = true;
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

        // Remove all support ships for this area
        const supportShips = enemies.filter(enemy =>
            enemy.userData.isBossSupport &&
            enemy.userData.areaKey === areaKey
        );

        supportShips.forEach(support => {
            if (typeof createExplosionEffect === 'function') {
                createExplosionEffect(support);
            }

            scene.remove(support);
            const index = enemies.indexOf(support);
            if (index > -1) enemies.splice(index, 1);
        });

        console.log(`Boss victory: Defeated ${defeatedEnemy.userData.name} and ${supportShips.length} support ships in area ${areaKey}`);

        // Check if we should spawn elite guardians now
        checkAndSpawnEliteGuardians();

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
    console.log(`📍 Recorded kill position for ${faction} at`, enemy.position);
}

function checkAndSpawnEliteGuardians() {
    if (typeof enemies === 'undefined' || typeof scene === 'undefined') return;

    // Track enemy counts by faction/species across ALL galaxies
    const factionCounts = {};

    enemies.forEach(enemy => {
        if (!enemy.userData || enemy.userData.health <= 0) return;
        if (enemy.userData.isBoss || enemy.userData.isBossSupport || enemy.userData.isEliteGuardian) return;

        const galaxyId = enemy.userData.galaxyId;
        const faction = galaxyTypes[galaxyId].faction;

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
    if (typeof createBossMeshWithModel === 'function') {
        guardian = createBossMeshWithModel(galaxyId + 1, guardianGeometry, guardianMaterial);
        // Apply additional scaling for elite guardian (200x total = 80% of original 250x)
        guardian.scale.multiplyScalar(200.0 / 144.0); // Scale up from boss size
    } else {
        guardian = new THREE.Mesh(guardianGeometry, guardianMaterial);
        guardian.scale.multiplyScalar(3.5); // Larger than regular boss
    }

    guardian.position.copy(guardianPosition);

    // Elite guardian glow - much more intense
    const guardianGlowGeometry = guardianGeometry.clone();
    const guardianGlowMaterial = new THREE.MeshBasicMaterial({
        color: shapeData.color,
        transparent: true,
        opacity: 0.6, // More opaque than boss glow
        blending: THREE.AdditiveBlending
    });
    const guardianGlow = new THREE.Mesh(guardianGlowGeometry, guardianGlowMaterial);
    guardianGlow.scale.multiplyScalar(1.5); // Larger glow
    guardianGlow.visible = true;
    guardianGlow.frustumCulled = false;
    guardian.add(guardianGlow);

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

    // Show warning
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
        transparent: true,
        opacity: 0.3,
        vertexColors: true,
        blending: THREE.AdditiveBlending
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
    
    const localSystemOffset = { x: 2000, y: 0, z: 1200 };
    
    // =============================================================================
    // LOCAL SOLAR SYSTEM
    // =============================================================================
    
    try {
        // Create Sun
        const sunGeometry = new THREE.SphereGeometry(8, 24, 24);
        const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff44 });
        const sun = new THREE.Mesh(sunGeometry, sunMaterial);
        sun.position.set(localSystemOffset.x, localSystemOffset.y, localSystemOffset.z);
        sun.visible = true;
        sun.frustumCulled = false;

        const sunLight = new THREE.PointLight(0xffff88, 1.5, 4000, 0.8);
        sunLight.position.copy(sun.position);
        sunLight.castShadow = false;
        
        if (scene && scene.add) {
            scene.add(sunLight);
        }

        const localAmbientLight = new THREE.AmbientLight(0x404040, 0.2);
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

        const glowGeometry = new THREE.SphereGeometry(12, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffdd44,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });
        const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);
        glowSphere.visible = true;
        glowSphere.frustumCulled = false;
        sun.add(glowSphere);
        sun.userData.glowSphere = glowSphere;
        
        console.log('✅ Sun created successfully');
        
    } catch (error) {
        console.error('❌ Error creating sun:', error);
        return;
    }
    
    // Create local planets
    const localPlanets = [
        { name: 'Earth', distance: 160, size: 5, color: 0x2233ff, moons: [{ name: 'Luna', distance: 30, size: 1.5, color: 0xdddddd }] },
        { name: 'Venus', distance: 120, size: 4.8, color: 0xffc649, moons: [] },
        { name: 'Mars', distance: 240, size: 3, color: 0xff4422, moons: [
            { name: 'Phobos', distance: 16, size: 0.8, color: 0x8b4513 },
            { name: 'Deimos', distance: 24, size: 0.6, color: 0x696969 }
        ]},
        { name: 'Jupiter', distance: 500, size: 15, color: 0xffaa22, moons: [
            { name: 'Io', distance: 50, size: 1.8, color: 0xffff99 },
            { name: 'Europa', distance: 64, size: 1.6, color: 0x99ccff },
            { name: 'Ganymede', distance: 84, size: 2.2, color: 0xcc9966 },
            { name: 'Callisto', distance: 110, size: 2.0, color: 0x666666 }
        ]},
        { name: 'Saturn', distance: 800, size: 12, color: 0xffdd88, rings: true, moons: [
            { name: 'Titan', distance: 130, size: 2.5, color: 0xff9933 },
            { name: 'Enceladus', distance: 90, size: 1.0, color: 0xffffff }
        ]},
        { name: 'Uranus', distance: 1100, size: 8, color: 0x4fccff, moons: [
            { name: 'Titania', distance: 84, size: 1.4, color: 0x888888 }
        ]},
        { name: 'Neptune', distance: 1400, size: 7, color: 0x4169e1, moons: [
            { name: 'Triton', distance: 44, size: 1.3, color: 0x99ccff }
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
        // ✅ FIXED: Random Y positioning between 500-2000 units above or below solar plane
        const randomYOffset = (Math.random() > 0.5 ? 1 : -1) * (500 + Math.random() * 1500); // ±500 to ±2000
        
        // ✅ FIXED: Random Z positioning between -2000 and +2000 units
        const randomZOffset = (Math.random() - 0.5) * 4000; // -2000 to +2000
        
        // Keep X positioning varied but more controlled
        const baseXOffsets = [-1200, 1400, -800];
        const randomXOffset = baseXOffsets[sysIndex] + (Math.random() - 0.5) * 400; // Add ±200 variation
        
        const systemOffset = { 
            x: localSystemOffset.x + randomXOffset, 
            y: localSystemOffset.y + randomYOffset, 
            z: localSystemOffset.z + randomZOffset 
        };
        
        console.log(`Creating ${systemData.name} at offset: Y=${randomYOffset.toFixed(0)}, Z=${randomZOffset.toFixed(0)}`);
        
        // Create star
        const starGeometry = new THREE.SphereGeometry(systemData.starSize, 24, 24);
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
                            orbitSpeed: 0.1 + moonIndex * 0.02,
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
            const planetGeometry = new THREE.SphereGeometry(planetData.size, 20, 20);
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
            
            // Add rings for Saturn
            if (planetData.rings) {
                for (let r = 0; r < 3; r++) {
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
                    
                    if (planet && planet.add) {
                        planet.add(ring);
                    }
                }
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
                        orbitSpeed: 0.1 + moonIndex * 0.02,
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
        const centralBlackHoleGeometry = new THREE.SphereGeometry(70, 24, 24);
        const centralBlackHoleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x000000,
            transparent: true,
            opacity: 0.95
        });
        const centralBlackHole = new THREE.Mesh(centralBlackHoleGeometry, centralBlackHoleMaterial);
        centralBlackHole.position.set(0, 0, 0);
        centralBlackHole.visible = true;
        centralBlackHole.frustumCulled = false;
        
        centralBlackHole.userData = {
            name: 'Sagittarius A* (Galactic Center)',
            type: 'blackhole',
            mass: 8000,
            gravity: 400.0,
            warpThreshold: 160,
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
        const centralRingGeometry = new THREE.RingGeometry(60, 90, 48);
        const centralRingMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff4500,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const centralRing = new THREE.Mesh(centralRingGeometry, centralRingMaterial);
        centralRing.rotation.x = Math.PI / 2;
        centralRing.visible = true;
        centralRing.frustumCulled = false;
        
        if (centralBlackHole && centralBlackHole.add) {
            centralBlackHole.add(centralRing);
        }
        
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
const core8Distance = (400 + Math.random() * 220) * (Math.random() < 0.5 ? 1 : -1);
    const core8Geometry = new THREE.SphereGeometry(45, 24, 24); // Smaller than Sagittarius A* (45 vs 80)
    const core8Material = new THREE.MeshBasicMaterial({ 
        color: 0x000000,
        transparent: true,
        opacity: 0.95
    });
    const core8BlackHole = new THREE.Mesh(core8Geometry, core8Material);
    core8BlackHole.position.set(0, core8Distance, 0); // Y-axis (vertical)
    core8BlackHole.visible = true;
    core8BlackHole.frustumCulled = false;
    
    core8BlackHole.userData = {
    name: 'Companion Core', // RENAMED from "Twin Galactic Core"
    type: 'blackhole',
    mass: 2800, // Smaller mass than Sagittarius A*
    gravity: 150.0,
    warpThreshold: 80,
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
    const core8RingGeometry = new THREE.RingGeometry(25, 40, 48);
   const core8RingMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x6644dd, // Darker purple to distinguish from Sagittarius A*
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide
});
    const core8Ring = new THREE.Mesh(core8RingGeometry, core8RingMaterial);
    core8Ring.rotation.x = Math.PI / 2;
    core8Ring.visible = true;
    core8Ring.frustumCulled = false;
    
    if (core8BlackHole && core8BlackHole.add) {
        core8BlackHole.add(core8Ring);
    }
    // ADD SPIRAL GALAXY STARFIELD around 8th core (same as local galaxy)
const core8GalaxyStarsGeometry = new THREE.BufferGeometry();
const core8GalaxyStarsMaterial = new THREE.PointsMaterial({
    size: 2.0,
    transparent: true,
    opacity: 0.9,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
});

const core8LocalStarsVertices = [];
const core8LocalStarsColors = [];

// Create 3000 stars in spiral pattern (same as local galaxy)
for (let i = 0; i < 3000; i++) {
    const armAngle = Math.random() * Math.PI * 2;
    const armDistance = Math.pow(Math.random(), 1.8) * 2000;
    const armWidth = 0.20;
    
    let x, y, z;
    
    if (Math.random() < 0.3) {
        // Dense center bulge
        const bulgeRadius = Math.pow(Math.random(), 3) * 700;
        const bulgeAngle = Math.random() * Math.PI * 2;
        const bulgeHeight = (Math.random() - 0.5) * 300;
        x = Math.cos(bulgeAngle) * bulgeRadius;
        z = Math.sin(bulgeAngle) * bulgeRadius;
        y = bulgeHeight;
    } else {
        // Spiral arms
        const angle = armAngle + (armDistance / 360) * Math.PI;
        x = Math.cos(angle) * armDistance + (Math.random() - 0.5) * armWidth * armDistance;
        z = Math.sin(angle) * armDistance + (Math.random() - 0.5) * armWidth * armDistance;
        y = (Math.random() - 0.5) * 120;
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

try {
    console.log('Creating Dune star systems around local black hole gateway...');
    
    // Local gateway position
    const localGatewayPosition = {
    x: localSystemOffset.x + 2600,
    y: localSystemOffset.y - 3000,  // ✅ FIXED: Match the actual gateway Y position
    z: localSystemOffset.z + 2000
};
    
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
    // ✅ ENHANCED: Much larger vertical spacing (±400 to ±1000 units from gateway plane)
    const verticalOffset = (Math.random() > 0.5 ? 1 : -1) * (400 + Math.random() * 600);
    
    // ✅ ENHANCED: Much more dramatic orbital plane tilts (up to ±30 degrees)
    const orbitalTilt = {
        x: (Math.random() - 0.5) * 1.0, // Tilt up to ±28.6 degrees around X-axis
        z: (Math.random() - 0.5) * 1.0  // Tilt up to ±28.6 degrees around Z-axis
    };
    
    // Calculate system position orbiting the local gateway
    const systemX = localGatewayPosition.x + Math.cos(systemData.orbitalAngle) * systemData.orbitalDistance;
    const systemY = localGatewayPosition.y + verticalOffset; // ✅ Use calculated vertical offset
    const systemZ = localGatewayPosition.z + Math.sin(systemData.orbitalAngle) * systemData.orbitalDistance;
    
    const systemOffset = { 
        x: systemX, 
        y: systemY, 
        z: systemZ,
        tilt: orbitalTilt // ✅ Store tilt for later use
    };
    
    console.log(`${systemData.name}: Y-offset=${verticalOffset.toFixed(0)}, Tilt=(${(orbitalTilt.x * 57.3).toFixed(1)}°, ${(orbitalTilt.z * 57.3).toFixed(1)}°)`);
    
    // Create star with emissive glow
const starGeometry = new THREE.SphereGeometry(systemData.starSize, 24, 24);
const starMaterial = new THREE.MeshBasicMaterial({ 
    color: systemData.starColor
});
const star = new THREE.Mesh(starGeometry, starMaterial);
star.position.set(systemOffset.x, systemOffset.y, systemOffset.z);
star.visible = true;
star.frustumCulled = false;

// ✅ ADD POINT LIGHT to make star visible and illuminate nearby planets
const starLight = new THREE.PointLight(
    systemData.starColor, // Use star's color
    3.0,  // Intensity - bright enough to see
    800,  // Distance - light reaches to planets
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

console.log(`✅ Created ${star.userData.name} orbiting local gateway with point light`);
    
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
core8GalaxyStars.frustumCulled = false;

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
    const localBlackHoleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x000000,
        transparent: true,
        opacity: 0.95
    });
    const blackHole = new THREE.Mesh(localBlackHoleGeometry, localBlackHoleMaterial);
    
    // **UPDATED: Position 1500 units ABOVE the solar system plane**
    blackHole.position.set(
        localSystemOffset.x + 2600, 
        localSystemOffset.y - 3000,  // **Changed from 0 to +1500**
        localSystemOffset.z + 2000
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
        
        // Add accretion disk
        const ringGeometry = new THREE.RingGeometry(40, 56, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x8b4513,
            transparent: false,
            opacity: 0.4,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.visible = true;
        ring.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
        
        if (blackHole && blackHole.add) {
            blackHole.add(ring);
        }
        
        console.log('✅ Local gateway black hole created');
        
    } catch (localBHError) {
        console.error('❌ Error creating local black hole:', localBHError);
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
                
                void main() {
                    // Create spherical coordinates for seamless wrapping
                    vec3 direction = normalize(vPosition);
                    float theta = atan(direction.z, direction.x);
                    float phi = acos(direction.y);
                    vec2 sphereUV = vec2(theta / (2.0 * 3.14159), phi / 3.14159);
                    
                    // Multi-scale noise for CMB-like structure
                    vec2 uv1 = sphereUV * 3.0;
                    vec2 uv2 = sphereUV * 8.0;
                    vec2 uv3 = sphereUV * 20.0;
                    
                    float pattern1 = fbm(uv1);
                    float pattern2 = fbm(uv2);
                    float pattern3 = fbm(uv3);
                    
                    // Combine patterns for complex structure
                    float combinedPattern = pattern1 * 0.5 + pattern2 * 0.3 + pattern3 * 0.2;
                    
                    // CMB color palette - BRIGHTENED for visibility test
                    vec3 coldColor = vec3(0.5, 0.2, 0.7);      // Bright purple
                    vec3 coolColor = vec3(0.3, 0.5, 1.0);      // Bright blue
                    vec3 warmColor = vec3(1.0, 0.5, 0.7);      // Bright pink
                    vec3 hotColor = vec3(1.0, 0.7, 0.3);       // Bright orange
                    
                    // Map noise to color gradient
                    vec3 color;
                    if (combinedPattern < 0.3) {
                        color = mix(coldColor, coolColor, combinedPattern / 0.3);
                    } else if (combinedPattern < 0.6) {
                        color = mix(coolColor, warmColor, (combinedPattern - 0.3) / 0.3);
                    } else {
                        color = mix(warmColor, hotColor, (combinedPattern - 0.6) / 0.4);
                    }
                    
                    // Add subtle variation
                    float variation = noise(sphereUV * 50.0) * 0.2;
                    color += vec3(variation);
                    
                    // Add faint stars/bright spots
                    float stars = pow(noise(sphereUV * 800.0), 20.0) * 0.5;
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
    // HUBBLE ULTRA DEEP FIELD SKYBOX - DISTANT GALAXIES BACKGROUND
    // =============================================================================
    
    console.log('Creating Hubble Ultra Deep Field galaxy background...');
    
    try {
        const textureLoader = new THREE.TextureLoader();
        
        // Local Hubble Ultra Deep Field image path
        const hubbleImageURL = './images/hubble_ultra_deep_field_high_rez_edit3.jpg';
        
        console.log('Loading Hubble Ultra Deep Field image from local path...');
        
        textureLoader.load(
            hubbleImageURL,
            function(texture) {
                // Create material with the Hubble texture
                const hubbleMaterial = new THREE.MeshBasicMaterial({
                    map: texture,
                    side: THREE.BackSide,
                    transparent: true,
                    opacity: 0,  // Subtle so it doesn't overpower the scene
                    depthWrite: false
                });
                
                // Create even larger sphere behind the CMB skybox
                const hubbleGeometry = new THREE.SphereGeometry(140000, 64, 64);
                const hubbleSkybox = new THREE.Mesh(hubbleGeometry, hubbleMaterial);
                hubbleSkybox.renderOrder = -2; // Render behind CMB skybox
                hubbleSkybox.visible = true;
                hubbleSkybox.frustumCulled = false;
                
                scene.add(hubbleSkybox);
                
                // Store reference
                window.hubbleSkybox = hubbleSkybox;
                if (typeof gameState !== 'undefined') {
                    gameState.hubbleSkybox = hubbleSkybox;
                }
                
                console.log('✅ Hubble Ultra Deep Field skybox loaded - distant galaxies visible');
            },
            function(progress) {
                console.log(`Loading Hubble texture: ${(progress.loaded / progress.total * 100).toFixed(0)}%`);
            },
            function(error) {
                console.warn('❌ Failed to load Hubble image from /images/, creating procedural galaxy background...');
                console.error('Error details:', error);
                createProceduralGalaxyBackground();
            }
        );
        
        function createProceduralGalaxyBackground() {
            const fallbackMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    time: { value: 0 }
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
                    varying vec3 vPosition;
                    varying vec2 vUv;
                    
                    float random(vec2 st) {
                        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
                    }
                    
                    void main() {
                        vec3 direction = normalize(vPosition);
                        float theta = atan(direction.z, direction.x);
                        float phi = acos(direction.y);
                        vec2 sphereUV = vec2(theta / (2.0 * 3.14159), phi / 3.14159);
                        
                        vec3 color = vec3(0.0);
                        
                        // Create thousands of tiny galaxy-like dots (Hubble-style)
                        for(int i = 0; i < 5000; i++) {
                            vec2 galaxyPos = vec2(random(vec2(float(i) * 0.1, float(i) * 0.2)), 
                                                  random(vec2(float(i) * 0.3, float(i) * 0.4)));
                            float dist = distance(sphereUV, galaxyPos);
                            
                            if(dist < 0.002) {
                                float brightness = (0.002 - dist) / 0.002;
                                float size = random(vec2(float(i) * 0.5));
                                
                                // Varied galaxy colors (like in Hubble deep field)
                                float colorSeed = random(vec2(float(i)));
                                vec3 galaxyColor;
                                if(colorSeed < 0.25) {
                                    galaxyColor = vec3(1.0, 0.95, 0.8); // Yellow-white (old galaxies)
                                } else if(colorSeed < 0.5) {
                                    galaxyColor = vec3(0.7, 0.85, 1.0); // Blue-white (young galaxies)
                                } else if(colorSeed < 0.75) {
                                    galaxyColor = vec3(1.0, 0.8, 0.7); // Orange (intermediate)
                                } else {
                                    galaxyColor = vec3(1.0, 0.6, 0.5); // Red-shifted (very distant)
                                }
                                
                                // Vary galaxy shapes slightly
                                float shape = 1.0 + random(vec2(float(i) * 0.7)) * 0.5;
                                color += galaxyColor * brightness * size * shape * 0.25;
                            }
                        }
                        
                        gl_FragColor = vec4(color, 0.5);
                    }
                `,
                transparent: true,
                side: THREE.BackSide,
                depthWrite: false
            });
            
            const fallbackGeometry = new THREE.SphereGeometry(140000, 64, 64);
            const fallbackSkybox = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
            fallbackSkybox.renderOrder = -2;
            fallbackSkybox.visible = true;
            fallbackSkybox.frustumCulled = false;
            
            scene.add(fallbackSkybox);
            
            window.hubbleSkybox = fallbackSkybox;
            if (typeof gameState !== 'undefined') {
                gameState.hubbleSkybox = fallbackSkybox;
            }
            
            console.log('✅ Procedural Hubble-style galaxy background created');
        }
        
    } catch (hubbleError) {
        console.error('❌ Error creating Hubble skybox:', hubbleError);
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
                // Create material with the Hubble texture
                const hubbleMaterial2 = new THREE.MeshBasicMaterial({
                    map: texture,
                    side: THREE.BackSide,
                    transparent: true,
                    opacity: 0.00,  // Starts invisible, fades in further out
                    depthWrite: false
                });
                
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
        const starsGeometry = new THREE.BufferGeometry();
        const starsMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 1.0,
            transparent: true,
            opacity: 1.0,
            sizeAttenuation: true
        });
        
        const starsVertices = [];
        
        // Background stars
        for (let i = 0; i < 2500; i++) {
            const distanceFactor = 10 + Math.random() * 30;
            const x = (Math.random() - 0.5) * 4000 * distanceFactor;
            const y = (Math.random() - 0.5) * 1600 * distanceFactor;
            const z = (Math.random() - 0.5) * 4000 * distanceFactor;
            starsVertices.push(x, y, z);
        }
        
// =============================================================================
// LOCAL GALAXY STARS - SEPARATE ROTATING OBJECT
// =============================================================================

const localGalaxyStarsGeometry = new THREE.BufferGeometry();
const localGalaxyStarsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.0,
    transparent: true,
    opacity: 1.0,
    sizeAttenuation: true
});

const localStarsVertices = [];

// Local galaxy stars (4000 stars in spiral pattern)
for (let i = 0; i < 4000; i++) {
    const armAngle = Math.random() * Math.PI * 2;
    const armDistance = Math.pow(Math.random(), 1.8) * 4000;
    const armWidth = 0.25;
    
    if (Math.random() < 0.3) {
        // Dense center bulge
        const bulgeRadius = Math.pow(Math.random(), 3) * 700;
        const bulgeAngle = Math.random() * Math.PI * 2;
        const bulgeHeight = (Math.random() - 0.5) * 300;
        const x = Math.cos(bulgeAngle) * bulgeRadius;
        const z = Math.sin(bulgeAngle) * bulgeRadius;
        const y = bulgeHeight;
        localStarsVertices.push(x, y, z);
    } else {
        // Spiral arms
        const angle = armAngle + (armDistance / 360) * Math.PI;
        const x = Math.cos(angle) * armDistance + (Math.random() - 0.5) * armWidth * armDistance;
        const z = Math.sin(angle) * armDistance + (Math.random() - 0.5) * armWidth * armDistance;
        const y = (Math.random() - 0.5) * 120;
        localStarsVertices.push(x, y, z);
    }
}

localGalaxyStarsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(localStarsVertices, 3));
const localGalaxyStars = new THREE.Points(localGalaxyStarsGeometry, localGalaxyStarsMaterial);
localGalaxyStars.visible = true;
localGalaxyStars.frustumCulled = false;

// Store as global variable so we can rotate it
window.localGalaxyStars = localGalaxyStars;

if (scene && scene.add) {
    scene.add(localGalaxyStars);
    console.log('✅ Local galaxy stars created (rotating):', localStarsVertices.length / 3, 'stars');
}
        
        // Distant bright stars
        for (let i = 0; i < 100; i++) {
            const distanceFactor = 100 + Math.random() * 100;
            const x = (Math.random() - 0.5) * 4000 * distanceFactor;
            const y = (Math.random() - 0.5) * 1600 * distanceFactor;
            const z = (Math.random() - 0.5) * 4000 * distanceFactor;
            starsVertices.push(x, y, z);
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
            const armStars = galaxyType.name === 'Quasar' ? 6000 : galaxyType.name === 'Dwarf' ? 2000 : 4000;
            
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
    transparent: true,
    opacity: 0.8,
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
            const blackHoleMaterial = new THREE.MeshBasicMaterial({ 
                color: 0x000000,
                transparent: true,
                opacity: 0.95
            });
            const galaxyBlackHole = new THREE.Mesh(blackHoleGeometry, blackHoleMaterial);
            
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
            ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
            ring.rotation.y = (Math.random() - 0.5) * 0.6;
            ring.rotation.z = (Math.random() - 0.5) * 0.4;
            
            ring.visible = true;
            ring.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
            ring.matrixAutoUpdate = true;
            ring.updateMatrix();
            galaxyBlackHole.add(ring);

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

            // Apply same rotation as smaller ring with slight variation
            largeRing.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
            largeRing.rotation.y = (Math.random() - 0.5) * 0.5;
            largeRing.rotation.z = (Math.random() - 0.5) * 0.3;

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
        
        // Finalize starfield
        console.log('Finalizing starfield with', starsVertices.length / 3, 'stars...');
        
        starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
        const stars = new THREE.Points(starsGeometry, starsMaterial);
        stars.visible = true;
        stars.frustumCulled = false;
        
        if (scene && scene.add) {
            scene.add(stars);
            console.log('✅ Starfield added to scene with', starsVertices.length / 3, 'stars');
        }
        
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
    const clusterCenters = [
        { x: 15000, y: 0, z: 12000 },
        { x: -18000, y: 500, z: -15000 },
        { x: 8000, y: -800, z: -20000 }
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
        
        // Create nebula cloud particles
        const particleCount = 1200;
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
        
        for (let j = 0; j < particleCount; j++) {
            const radius = Math.pow(Math.random(), 0.3) * nebulaSize;
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.random() - 0.5) * Math.PI * 0.6;
            
            positions[j * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[j * 3 + 1] = radius * Math.cos(phi) * (Math.random() - 0.5) * 0.4;
            positions[j * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
            
            const colorVariation = nebulaColor.clone();
            colorVariation.offsetHSL((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.2);
            
            colors[j * 3] = colorVariation.r;
            colors[j * 3 + 1] = colorVariation.g;
            colors[j * 3 + 2] = colorVariation.b;
        }
        
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const nebulaMaterial = new THREE.PointsMaterial({
            size: 2.5,
            vertexColors: true,
            transparent: true,
            opacity: 0.65,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true
        });
        
        const nebulaPoints = new THREE.Points(particleGeometry, nebulaMaterial);
        nebulaPoints.visible = true;
        nebulaPoints.frustumCulled = false;
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

    // Create 3 layers with slight timing delays for variety
    createClusteredNebulas(); // Layer 1

    setTimeout(() => {
        createClusteredNebulas(); // Layer 2
    }, 300);

    setTimeout(() => {
        createClusteredNebulas(); // Layer 3
    }, 600);

    // Create distant nebulas in the outer regions (50,000-75,000 units)
    setTimeout(() => {
        createDistantNebulas();
    }, 900);

    // Create exotic core nebulas (45,000-65,000 units)
    setTimeout(() => {
        createExoticCoreNebulas();
    }, 1200);

    console.log('Triple-layered clustered nebulas with maximum color intermingling created!');
}

// =============================================================================
// DISTANT NEBULAS - Distributed between 50,000-75,000 units from origin
// =============================================================================
function createDistantNebulas() {
    console.log('Creating distant nebulas in outer regions (50,000-75,000 units)...');

    if (typeof nebulaClouds === 'undefined') {
        window.nebulaClouds = [];
    }

    const distantNebulaCount = 6;  // Add 6 distant nebulas
    const minRadius = 50000;
    const maxRadius = 75000;

    const distantNebulaNames = [
        'Distant Nebula Alpha',
        'Distant Nebula Beta',
        'Distant Nebula Gamma',
        'Distant Nebula Delta',
        'Distant Nebula Epsilon',
        'Distant Nebula Zeta'
    ];

    for (let i = 0; i < distantNebulaCount; i++) {
        const nebulaGroup = new THREE.Group();

        // Distribute evenly around a sphere at distant radius
        const phi = (i / distantNebulaCount) * Math.PI * 2;  // Azimuthal angle
        const theta = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.5;  // Polar angle (mostly equatorial)
        const radius = minRadius + Math.random() * (maxRadius - minRadius);

        const nebulaX = radius * Math.sin(theta) * Math.cos(phi);
        const nebulaY = radius * Math.cos(theta);
        const nebulaZ = radius * Math.sin(theta) * Math.sin(phi);

        // Create nebula cloud particles
        const particleCount = 1200;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        // Varied colors for distant nebulas
        const baseHue = Math.random();  // Full color spectrum
        const nebulaColor = new THREE.Color().setHSL(baseHue, 0.7 + Math.random() * 0.3, 0.5 + Math.random() * 0.3);
        const nebulaSize = 3000 + Math.random() * 4000;  // Larger nebulas for distant regions

        for (let j = 0; j < particleCount; j++) {
            const radius = Math.pow(Math.random(), 0.3) * nebulaSize;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta) * 0.3;  // Flattened
            const z = radius * Math.cos(phi);

            positions[j * 3] = x;
            positions[j * 3 + 1] = y;
            positions[j * 3 + 2] = z;

            // Color variation
            const colorVariation = (Math.random() - 0.5) * 0.2;
            const particleColor = new THREE.Color().setHSL(
                (baseHue + colorVariation + 1) % 1,
                0.6 + Math.random() * 0.4,
                0.4 + Math.random() * 0.4
            );

            colors[j * 3] = particleColor.r;
            colors[j * 3 + 1] = particleColor.g;
            colors[j * 3 + 2] = particleColor.b;
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const particleMaterial = new THREE.PointsMaterial({
            size: 80,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true  // Keep particles visible at distance
        });

        const particles = new THREE.Points(particleGeometry, particleMaterial);
        particles.frustumCulled = false;  // CRITICAL: Don't cull at distance
        nebulaGroup.add(particles);

        nebulaGroup.position.set(nebulaX, nebulaY, nebulaZ);
        nebulaGroup.frustumCulled = false;  // CRITICAL: Don't cull at distance
        
        nebulaGroup.userData = {
            type: 'nebula',
            name: distantNebulaNames[i],
            mythicalName: distantNebulaNames[i],
            color: nebulaColor,
            discovered: false,
            size: nebulaSize,
            isDistant: true
        };

        scene.add(nebulaGroup);
        nebulaClouds.push(nebulaGroup);

        console.log(`  Created ${distantNebulaNames[i]} at distance ${radius.toFixed(0)} units`);
    }

    console.log(`✅ Created ${distantNebulaCount} distant nebulas in outer regions`);
    
    // Add orbiting asteroids to distant nebulas
    setTimeout(() => {
        createNebulaAsteroidBelts(nebulaClouds.filter(n => n.userData && n.userData.isDistant));
    }, 500);
}

// =============================================================================
// NEBULA ASTEROID BELTS - Orbiting asteroids around distant/exotic nebulas
// =============================================================================
function createNebulaAsteroidBelts(nebulas) {
    if (!nebulas || nebulas.length === 0) return;
    
    console.log(`🪨 Creating asteroid belts for ${nebulas.length} nebulas...`);
    
    nebulas.forEach((nebula, nebulaIndex) => {
        const nebulaPos = nebula.position;
        const nebulaSize = nebula.userData.size || 3000;
        const asteroidCount = 20 + Math.floor(Math.random() * 15); // 20-35 asteroids per nebula
        
        for (let i = 0; i < asteroidCount; i++) {
            // Random orbital parameters
            const orbitRadius = nebulaSize * (0.6 + Math.random() * 0.5); // 60-110% of nebula size
            const orbitAngle = Math.random() * Math.PI * 2;
            const orbitTilt = (Math.random() - 0.5) * 0.3;
            const orbitSpeed = 0.0005 + Math.random() * 0.002; // Slow orbital motion
            
            // Asteroid size
            const size = 5 + Math.random() * 15;
            
            // Create asteroid geometry
            const geometry = new THREE.IcosahedronGeometry(size, 0);
            
            // Randomize vertices for irregular shape
            const positionAttribute = geometry.attributes.position;
            for (let v = 0; v < positionAttribute.count; v++) {
                const x = positionAttribute.getX(v);
                const y = positionAttribute.getY(v);
                const z = positionAttribute.getZ(v);
                const randomFactor = 0.7 + Math.random() * 0.6;
                positionAttribute.setXYZ(v, x * randomFactor, y * randomFactor, z * randomFactor);
            }
            geometry.computeVertexNormals();
            
            // Asteroid material
            const baseColor = new THREE.Color(0.5 + Math.random() * 0.3, 0.4 + Math.random() * 0.2, 0.3 + Math.random() * 0.2);
            const material = new THREE.MeshStandardMaterial({
                color: baseColor,
                emissive: baseColor,
                emissiveIntensity: 0.3,
                roughness: 0.9,
                metalness: 0.1,
                flatShading: true
            });
            
            const asteroid = new THREE.Mesh(geometry, material);
            
            // Initial position on orbit
            asteroid.position.set(
                nebulaPos.x + Math.cos(orbitAngle) * orbitRadius,
                nebulaPos.y + Math.sin(orbitTilt) * orbitRadius * 0.3,
                nebulaPos.z + Math.sin(orbitAngle) * orbitRadius
            );
            
            // Random rotation
            asteroid.rotation.set(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            );
            
            asteroid.frustumCulled = false;
            
            // CRITICAL: Full userData for targeting, destruction, and orbital motion
            asteroid.userData = {
                type: 'asteroid',
                name: `Nebula ${nebulaIndex + 1} Asteroid ${i + 1}`,
                size: size,
                health: Math.ceil(size / 5), // 1-4 health based on size
                orbitRadius: orbitRadius,
                orbitAngle: orbitAngle,
                orbitSpeed: orbitSpeed,
                orbitTilt: orbitTilt,
                orbitCenter: nebulaPos.clone(),
                rotationSpeed: 0.005 + Math.random() * 0.01,
                nebulaId: nebulaIndex,
                inNebula: true
            };
            
            scene.add(asteroid);
            if (typeof planets !== 'undefined') {
                planets.push(asteroid);
            }
        }
        
        console.log(`  🪨 Added ${asteroidCount} orbiting asteroids to ${nebula.userData.name || 'Nebula ' + (nebulaIndex + 1)}`);
    });
}

// =============================================================================
// EXOTIC CORE NEBULAS - Distributed in exotic core systems range (45,000-65,000 units)
// =============================================================================
function createExoticCoreNebulas() {
    console.log('Creating exotic core nebulas (45,000-65,000 units)...');

    if (typeof nebulaClouds === 'undefined') {
        window.nebulaClouds = [];
    }

    const exoticNebulaCount = 8;  // Add 8 nebulas in exotic range
    const minRadius = 45000;
    const maxRadius = 65000;

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

    for (let i = 0; i < exoticNebulaCount; i++) {
        const nebulaGroup = new THREE.Group();

        // Distribute around a sphere at exotic core distance
        const phi = (i / exoticNebulaCount) * Math.PI * 2;
        const theta = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.6;
        const radius = minRadius + Math.random() * (maxRadius - minRadius);

        const nebulaX = radius * Math.sin(theta) * Math.cos(phi);
        const nebulaY = radius * Math.cos(theta);
        const nebulaZ = radius * Math.sin(theta) * Math.sin(phi);

        // Create nebula cloud particles
        const particleCount = 1500;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        // Rich, vibrant colors for exotic nebulas
        const baseHue = (i / exoticNebulaCount) + Math.random() * 0.1;
        const nebulaColor = new THREE.Color().setHSL(baseHue, 0.8 + Math.random() * 0.2, 0.5 + Math.random() * 0.3);
        const nebulaSize = 3500 + Math.random() * 3500;

        for (let j = 0; j < particleCount; j++) {
            const radius = Math.pow(Math.random(), 0.3) * nebulaSize;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta) * 0.3;
            const z = radius * Math.cos(phi);

            positions[j * 3] = x;
            positions[j * 3 + 1] = y;
            positions[j * 3 + 2] = z;

            // Color variation
            const colorVariation = (Math.random() - 0.5) * 0.2;
            const particleColor = new THREE.Color().setHSL(
                (baseHue + colorVariation + 1) % 1,
                0.7 + Math.random() * 0.3,
                0.4 + Math.random() * 0.4
            );

            colors[j * 3] = particleColor.r;
            colors[j * 3 + 1] = particleColor.g;
            colors[j * 3 + 2] = particleColor.b;
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const particleMaterial = new THREE.PointsMaterial({
            size: 150,  // Increased from 85 for better visibility at distance
            vertexColors: true,
            transparent: true,
            opacity: 0.85,  // Increased from 0.65 for better visibility
            blending: THREE.AdditiveBlending,  // Makes particles glow
            depthWrite: false,
            sizeAttenuation: true  // Size scales with distance
        });

        const particles = new THREE.Points(particleGeometry, particleMaterial);
        particles.frustumCulled = false;  // CRITICAL: Don't cull at distance
        nebulaGroup.add(particles);

        // Add glowing core to make exotic nebulas more visible from distance
        const coreGeometry = new THREE.SphereGeometry(nebulaSize * 0.15, 16, 16);
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: nebulaColor,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        core.frustumCulled = false;  // CRITICAL: Don't cull at distance
        nebulaGroup.add(core);

        // Add point light for extra glow effect
        const nebulaLight = new THREE.PointLight(nebulaColor, 8, nebulaSize * 2);
        nebulaLight.position.set(0, 0, 0);
        nebulaGroup.add(nebulaLight);

        nebulaGroup.position.set(nebulaX, nebulaY, nebulaZ);
        nebulaGroup.frustumCulled = false;  // CRITICAL: Don't cull at distance
        
        nebulaGroup.userData = {
            type: 'nebula',
            name: exoticNebulaNames[i],
            mythicalName: exoticNebulaNames[i],
            color: nebulaColor,
            discovered: false,
            size: nebulaSize,
            isExoticCore: true
        };

        scene.add(nebulaGroup);
        nebulaClouds.push(nebulaGroup);

        console.log(`  Created ${exoticNebulaNames[i]} at distance ${radius.toFixed(0)} units`);
    }

    console.log(`✅ Created ${exoticNebulaCount} exotic core nebulas in range 45,000-65,000 units`);
    console.log(`   Total nebulas in scene: ${nebulaClouds.length}`);
    
    // Add orbiting asteroids to exotic nebulas
    setTimeout(() => {
        createNebulaAsteroidBelts(nebulaClouds.filter(n => n.userData && n.userData.isExoticCore));
    }, 600);
}
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
    const clustersPerNebula = 3; // 3 star systems per nebula
    
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
            
            // Create central star - LARGER
            const starSize = 15 + Math.random() * 20; // Was 8-20, now 15-35
            const starGeometry = new THREE.SphereGeometry(starSize, 32, 32);
            const starColor = nebula.userData.color || new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
            const starMaterial = new THREE.MeshBasicMaterial({ 
                color: starColor,
                transparent: true,
                opacity: 0.9
            });
            const star = new THREE.Mesh(starGeometry, starMaterial);
            star.position.copy(clusterCenter);
            
            // Add star glow
            const glowGeometry = new THREE.SphereGeometry(starSize * 1.5, 32, 32);
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
            
            // Create 5-12 planets orbiting the star
            const planetCount = 5 + Math.floor(Math.random() * 8);
            console.log(`    🪐 Creating ${planetCount} LARGE planets for System ${c + 1}...`);
            
            for (let p = 0; p < planetCount; p++) {
                // ⭐ MUCH LARGER planet sizes
                let planetSize;
                const distanceFactor = p / planetCount;
                
                if (distanceFactor < 0.2) {
                    // Inner rocky planets - LARGER
                    planetSize = 3 + Math.random() * 5; // Was 1-3.5, now 3-8
                } else if (distanceFactor < 0.5) {
                    // Mid-range terrestrial planets - LARGER
                    planetSize = 5 + Math.random() * 8; // Was 2-6, now 5-13
                } else if (distanceFactor < 0.8) {
                    // Outer gas giants - MUCH LARGER
                    planetSize = 10 + Math.random() * 15; // Was 4-12, now 10-25
                } else {
                    // Distant ice giants - LARGER
                    planetSize = 7 + Math.random() * 10; // Was 3-9, now 7-17
                }
                
                const planetGeometry = new THREE.SphereGeometry(planetSize, 32, 32);
                
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
                
                const planetMaterial = new THREE.MeshBasicMaterial({ 
                    color: new THREE.Color().setHSL(planetHue, planetSaturation, planetLightness),
                    transparent: true,
                    opacity: 0.85
                });
                const planet = new THREE.Mesh(planetGeometry, planetMaterial);
                
                const orbitRadius = 120 + p * 110; // Increased spacing for larger planets
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
                    const ringCount = 2 + Math.floor(Math.random() * 4);
                    
                    for (let r = 0; r < ringCount; r++) {
                        const ringInner = planetSize + 8 + r * 8; // Scaled for larger planets
                        const ringOuter = ringInner + 4 + Math.random() * 6;
                        const ringGeometry = new THREE.RingGeometry(ringInner, ringOuter, 64);
                        const ringColor = new THREE.Color().setHSL(
                            planetHue + 0.08 + r * 0.04, 
                            Math.max(0.2, planetSaturation - 0.2 - r * 0.1), 
                            0.55 + r * 0.06
                        );
                        const ringMaterial = new THREE.MeshBasicMaterial({ 
                            color: ringColor,
                            transparent: true,
                            opacity: 0.5 - r * 0.08,
                            side: THREE.DoubleSide
                        });
                        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                        ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
                        ring.rotation.z = (Math.random() - 0.5) * 0.2;
                        planet.add(ring);
                    }

                    // console.log(`      💍 Added ${ringCount} rings to ${planet.userData.name}`);
                }
                
                // Add MOON SYSTEMS - LARGER MOONS
                const moonChance = planetSize > 5 ? 0.65 : 0.30; // Adjusted for larger planet sizes
                
                if (Math.random() < moonChance) {
                    const moonCount = 1 + Math.floor(Math.random() * 4);
                    
                    for (let m = 0; m < moonCount; m++) {
                        const moonSize = 1 + Math.random() * 3; // LARGER moons (was 0.4-2.2, now 1-4)
                        const moonGeometry = new THREE.SphereGeometry(moonSize, 16, 16);
                        
                        const moonHue = planetHue + (Math.random() - 0.5) * 0.2;
                        const moonMaterial = new THREE.MeshBasicMaterial({ 
                            color: new THREE.Color().setHSL(moonHue, 0.3 + Math.random() * 0.3, 0.6 + Math.random() * 0.2),
                            transparent: true,
                            opacity: 0.8
                        });
                        const moon = new THREE.Mesh(moonGeometry, moonMaterial);
                        
                        const moonOrbitRadius = planetSize + 15 + m * 12; // Scaled for larger planets
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
    });
    
    console.log(`✅ Created ${enhancedClusters.length} MASSIVELY DIVERSE enhanced planet clusters`);
    console.log(`   💫 ALL PLANETS support collision detection and gravitational slingshots`);
    console.log(`   🪐 Average planet size: 3-25 units (MUCH LARGER)`);
    console.log(`   💍 50-60% have ring systems`);
    console.log(`   🌙 65% of large planets have 1-4 moons (also larger)`);
}
// =============================================================================
// NEBULA GAS CLOUD CREATION - CLUSTERED VERSION
// Creates 3-4 overlapping gas clouds for a more realistic nebula appearance
// =============================================================================

function createNebulaGasCloud(centerPos, nebulaId, starColor) {
    const clusterSize = 3 + Math.floor(Math.random() * 2); // 3-4 clouds per cluster
    
    console.log(`    ☁️ Creating cluster of ${clusterSize} gas clouds for Nebula-${nebulaId + 1}`);
    
    // Create a group to hold all clouds in the cluster
    const cloudCluster = new THREE.Group();
    
    for (let i = 0; i < clusterSize; i++) {
        // Vary cloud sizes - smallest to largest
        const sizeMultiplier = 0.6 + (i * 0.3); // 0.6x, 0.9x, 1.2x, 1.5x
        const cloudSize = (120 + Math.random() * 180) * sizeMultiplier;
        
        const cloudGeometry = new THREE.SphereGeometry(cloudSize, 16, 16);
        
        // Vary colors slightly within the cluster
        const colorVariation = starColor.clone();
        colorVariation.offsetHSL(
            (Math.random() - 0.5) * 0.15, // Hue variation
            (Math.random() - 0.5) * 0.2,  // Saturation variation
            (Math.random() - 0.5) * 0.15  // Lightness variation
        );
        
        // Vary opacity - larger clouds are more transparent
        const baseOpacity = 0.15 - (i * 0.02); // Decreases with each cloud
        const cloudMaterial = new THREE.MeshBasicMaterial({
            color: colorVariation,
            transparent: true,
            opacity: baseOpacity,
            blending: THREE.AdditiveBlending
        });
        
        const gasCloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
        
        // Position clouds in overlapping cluster pattern
        // First cloud at center, others scattered around
        if (i === 0) {
            // Center cloud - largest
            gasCloud.position.set(0, 0, 0);
        } else {
            // Offset clouds create overlap
            const offsetDistance = cloudSize * 0.5; // 50% overlap
            const offsetAngle = (i / clusterSize) * Math.PI * 2;
            const offsetElevation = (Math.random() - 0.5) * Math.PI * 0.3;
            
            gasCloud.position.set(
                Math.cos(offsetAngle) * offsetDistance * Math.cos(offsetElevation),
                Math.sin(offsetElevation) * offsetDistance * 0.5,
                Math.sin(offsetAngle) * offsetDistance * Math.cos(offsetElevation)
            );
        }
        
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
        gasCloud.frustumCulled = false;
        
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
    
    console.log(`      ✓ Added ${clusterSize} overlapping gas clouds (sizes: ${cloudCluster.children.map(c => c.userData.size.toFixed(0)).join(', ')} units)`);
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
        
        for (let i = 0; i < enemiesPerGalaxy; i++) {
            const enemyGeometry = createEnemyGeometry(g);
            const shapeData = enemyShapes[g];
            
            // Use different placement strategies for variety
            let placementType;
            const roll = Math.random();
            
            if (roll < 0.33) {
                placementType = 'cosmic_feature';
            } else if (roll < 0.66) {
                placementType = 'black_hole';
            } else {
                placementType = 'random';
            }
            
            const enemyPosition = getEnemyPlacementPosition(g, placementType);
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
        }
    }
    
    console.log(`✅ Created ${enemies.length} enemies across all galaxies`);
    
    // Log breakdown by galaxy
    for (let g = 0; g < 8; g++) {
        const count = enemies.filter(e => e.userData && e.userData.galaxyId === g).length;
        console.log(`   Galaxy ${g} (${galaxyTypes[g].name}): ${count} enemies`);
    }
    
    // Create local galaxy enemies (Martian Pirates) - ALWAYS spawn these
    const localSystemOffset = { x: 2000, y: 0, z: 1200 };
    for (let i = 0; i < 10; i++) {
        const enemyGeometry = createEnemyGeometry(0);
        
        const distance = 1800 + Math.random() * 1200;
        const localShapeData = { color: 0xff4444 };
        const materials = createEnemyMaterial(localShapeData, 'local', distance);

        // Try to use 3D model first, fallback to geometry (use galaxy 1 model for local pirates)
        let enemy;
        let isGLBModel = false;
        if (typeof createEnemyMeshWithModel === 'function') {
            enemy = createEnemyMeshWithModel(1, enemyGeometry, materials.enemyMaterial);
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
        
        // Position around local system
        const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
        enemy.position.set(
            localSystemOffset.x + Math.cos(angle) * distance,
            localSystemOffset.y + (Math.random() - 0.5) * 200,
            localSystemOffset.z + Math.sin(angle) * distance
        );

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
            name: `Martian Pirate ${i + 1}`,
            type: 'enemy',
            health: getEnemyHealthForDifficulty(true, false, false),
            maxHealth: getEnemyHealthForDifficulty(true, false, false),
            speed: 0.6 + Math.random() * 1.0,
            aggression: 0.7 + Math.random() * 0.3,
            patrolCenter: new THREE.Vector3(
                localSystemOffset.x,
                localSystemOffset.y,
                localSystemOffset.z
            ),
            patrolRadius: distance,
            lastAttack: 0,
            isActive: false,
            visible: true,
            galaxyId: 7, // Local galaxy
            galaxyColor: 0xff4444,
            swarmTarget: null,
            circlePhase: Math.random() * Math.PI * 2,
            attackMode: 'patrol',
            detectionRange: 1200,
            firingRange: 180,
            isLocal: true,
            isBoss: false,
            isBossSupport: false,
            position3D: enemy.position.clone(),
            hitboxSize: hitboxSize // Store hitbox size for accurate collision detection
        };
        
        enemy.visible = true;
        enemy.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
        
        scene.add(enemy);
        enemies.push(enemy);
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

function loadGuardiansForGalaxy(galaxyId) {
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
    
    // ⭐ CRITICAL: Only spawn guardians AFTER boss is defeated
    if (typeof bossSystem !== 'undefined' && bossSystem.galaxyBossDefeated && !bossSystem.galaxyBossDefeated[galaxyId]) {
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
    
    // Determine number of guardians based on galaxy type
    const guardianCount = galaxyType.name === 'Quasar' ? 8 : 
                         galaxyType.name === 'Dwarf' ? 3 : 5;
    
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
    
    // Main enemy body - SEMI-TRANSPARENT!
    const enemyMaterial = new THREE.MeshBasicMaterial({
        color: shapeData.color,
        transparent: true,  // ← KEY: Make the main body transparent
        opacity: 0.6,       // ← KEY: 60% opacity makes it translucent
        blending: THREE.NormalBlending  // Normal blending for the body
    });
    
    // Glow layer - bright and additive
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: shapeData.color,
        transparent: true,
        opacity: 0.4,  // Brighter glow
        blending: THREE.AdditiveBlending
    });
    
    return {
        enemyMaterial: enemyMaterial,
        glowMaterial: glowMaterial,
        glowScale: isBoss ? 1.3 : 1.2
    };
}
    
// =============================================================================
// WORMHOLES, COMETS, AND OTHER SPACE OBJECTS
// =============================================================================

function createEnhancedWormholes() {
    const initialWormholes = 4;
    
    for (let i = 0; i < initialWormholes; i++) {
        if (Math.random() < 0.8) {
            spawnEnhancedWormhole();
        }
    }
    
    console.log(`Spawned ${wormholes.length} enhanced whirlpool wormholes`);
}

function spawnEnhancedWormhole() {
    let position;
    let attempts = 0;
    do {
        position = new THREE.Vector3(
            (Math.random() - 0.5) * 30000, // Doubled
            (Math.random() - 0.5) * 1600, // Doubled
            (Math.random() - 0.5) * 30000 // Doubled
        );
        attempts++;
    } while (attempts < 15 && isPositionTooClose(position, 300)); // Doubled
    
    // Create whirlpool wormhole
    const wormholeGroup = new THREE.Group();
    
    // Central void
    const voidGeometry = new THREE.SphereGeometry(8, 16, 16); // Size remains the same
    const voidMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.9
    });
    const voidMesh = new THREE.Mesh(voidGeometry, voidMaterial);
    
    // FIXED: Prevent frustum culling for wormhole void
    voidMesh.visible = true;
    voidMesh.frustumCulled = false;
    
    wormholeGroup.add(voidMesh);
    
    // Spiral rings
    for (let i = 0; i < 5; i++) {
        const ringRadius = 12 + i * 4; // Size remains the same
        const ringGeometry = new THREE.TorusGeometry(ringRadius, 1.5, 8, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(0.8 + i * 0.05, 0.8, 0.6),
            transparent: true,
            opacity: 0.7 - i * 0.1,
            wireframe: true
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = i * 0.3;
        
        // FIXED: Prevent frustum culling for wormhole rings
        ring.visible = true;
        ring.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
        
        wormholeGroup.add(ring);
    }
    
    // Particle effect (doubled range)
    const particleGeometry = new THREE.BufferGeometry();
    const particleVertices = [];
    for (let i = 0; i < 200; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 20 + Math.random() * 40; // Doubled
        const height = (Math.random() - 0.5) * 30; // Doubled
        particleVertices.push(
            Math.cos(angle) * radius,
            height,
            Math.sin(angle) * radius
        );
    }
    particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(particleVertices, 3));
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xaa44ff,
        size: 1.5,
        transparent: true,
        opacity: 0.6
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    
    // FIXED: Prevent frustum culling for wormhole particles
    particles.visible = true;
    particles.frustumCulled = false;
    
    wormholeGroup.add(particles);
    
    wormholeGroup.position.copy(position);
    
    // FIXED: Prevent frustum culling for wormhole group
    wormholeGroup.visible = true;
    wormholeGroup.frustumCulled = false;
    
    wormholeGroup.userData = {
        name: `Spatial Whirlpool ${wormholes.length + 1}`,
        type: 'wormhole',
        lifeTime: 120000 + Math.random() * 60000,
        age: 0,
        warpThreshold: 40, // Doubled
        isTemporary: true,
        detectionRange: 1200, // Doubled
        detected: false,
        spiralSpeed: 0.02 + Math.random() * 0.03,
        // Instability properties
        unstable: true,
        phaseTimer: 0,
        phaseInterval: 5000 + Math.random() * 10000, // 5-15 seconds per phase
        isVisible: true,
        colorHue: Math.random(), // Starting hue
        colorSpeed: 0.0001 + Math.random() * 0.0002
    };
    
    scene.add(wormholeGroup);
    wormholes.push(wormholeGroup);
}

// Update unstable wormholes - call from animate loop
function updateUnstableWormholes(deltaTime = 16.67) {
    if (typeof wormholes === 'undefined' || !wormholes) return;

    wormholes.forEach(wormhole => {
        if (!wormhole.userData.unstable) return;

        // Update phase timer
        wormhole.userData.phaseTimer += deltaTime;

        // Color shift over time
        wormhole.userData.colorHue += wormhole.userData.colorSpeed;
        if (wormhole.userData.colorHue > 1) wormhole.userData.colorHue -= 1;

        // Update ring colors
        wormhole.children.forEach((child, index) => {
            if (child.material && child.geometry && child.geometry.type === 'TorusGeometry') {
                const hue = (wormhole.userData.colorHue + index * 0.05) % 1;
                child.material.color.setHSL(hue, 0.8, 0.6);
            }
        });

        // Phase transition (appear/disappear)
        if (wormhole.userData.phaseTimer >= wormhole.userData.phaseInterval) {
            wormhole.userData.phaseTimer = 0;
            wormhole.userData.isVisible = !wormhole.userData.isVisible;
            wormhole.userData.phaseInterval = 5000 + Math.random() * 10000;

            if (wormhole.userData.isVisible) {
                // Appearing - burst of light
                createWormholeBurst(wormhole.position, true);
                wormhole.visible = true;
            } else {
                // Disappearing - burst of light
                createWormholeBurst(wormhole.position, false);
                setTimeout(() => {
                    wormhole.visible = false;
                }, 500);
            }
        }

        // Fade in/out transition
        if (wormhole.visible) {
            wormhole.children.forEach(child => {
                if (child.material && child.material.opacity !== undefined) {
                    const baseOpacity = child.userData.baseOpacity || child.material.opacity;
                    if (!child.userData.baseOpacity) child.userData.baseOpacity = baseOpacity;

                    if (wormhole.userData.isVisible) {
                        child.material.opacity = Math.min(baseOpacity, child.material.opacity + 0.02);
                    }
                }
            });
        }
    });
}

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
        const cometGeometry = new THREE.SphereGeometry(0.8 + Math.random() * 1.5, 8, 8); // Size remains the same
        const cometMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(0.6 + Math.random() * 0.2, 0.8, 0.7),
            transparent: true,
            opacity: 0.9
        });
        
        const comet = new THREE.Mesh(cometGeometry, cometMaterial);
        
        // FIXED: Prevent frustum culling for comets
        comet.visible = true;
        comet.frustumCulled = false;
        
        // Doubled scale for positioning
        comet.position.set(
            (Math.random() - 0.5) * 36000, // Doubled
            (Math.random() - 0.5) * 2400, // Doubled
            (Math.random() - 0.5) * 36000 // Doubled
        );
        
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 6, // Doubled
            (Math.random() - 0.5) * 1.6, // Doubled
            (Math.random() - 0.5) * 6 // Doubled
        );
        
        // Enhanced comet tail (doubled scale)
        const tailGeometry = new THREE.BufferGeometry();
        const tailVertices = [];
        for (let j = 0; j < 50; j++) {
            const offset = j * 1.0; // Doubled
            tailVertices.push(
                -velocity.x * offset + (Math.random() - 0.5) * 4, // Doubled
                -velocity.y * offset + (Math.random() - 0.5) * 4, // Doubled
                -velocity.z * offset + (Math.random() - 0.5) * 4 // Doubled
            );
        }
        tailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tailVertices, 3));
        const tailMaterial = new THREE.PointsMaterial({
    color: 0xaaccff,
    size: 1.2,
    transparent: true,
    opacity: 0.6, // Increased from 0.4
    vertexColors: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
        });
        const tail = new THREE.Points(tailGeometry, tailMaterial);
        
        // FIXED: Prevent frustum culling for comet tail
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
        
        // Create particles with realistic galaxy-like distribution
        const particleCount = 4000 + Math.floor(Math.random() * 2000);
        const nebulaGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        
        const nebulaSize = 1200 + Math.random() * 800;
        const hue = Math.random();
        const nebulaColor = new THREE.Color().setHSL(hue, 0.7, 0.6);
        
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
            
            // Color variation for realism
            let colorVar = nebulaColor.clone();
            
            // Quasar jets get blue tint
            if (nebulaType.shape === 'quasar' && Math.abs(y) > nebulaSize * 0.5) {
                colorVar = new THREE.Color(0xaaddff);
            } else {
                colorVar.offsetHSL((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.3);
            }
            
            colors[i3] = colorVar.r;
            colors[i3 + 1] = colorVar.g;
            colors[i3 + 2] = colorVar.b;
        }
        
        nebulaGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        nebulaGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const nebulaMaterial = new THREE.PointsMaterial({
            size: 2.5,
            vertexColors: true,
            transparent: true,
            opacity: 0.65,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true
        });
        
        const nebulaPoints = new THREE.Points(nebulaGeometry, nebulaMaterial);
        nebulaPoints.visible = true;
        nebulaPoints.frustumCulled = false;
        
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
        
        const galaxyCenter = blackHole.position.clone();
        
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
            const asteroidCount = 100 + Math.random() * 50;
            
            // CLOSER: 800-2000 units from black hole
        	const beltRadius = 1600 + Math.random() * 1000;
            const beltWidth = 400 + Math.random() * 800;
            
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

// FIXED: Enhanced lighting for better asteroid visibility
const beltLight = new THREE.PointLight(0xffffff, 5.0, 4000); // FIXED: intensity 3.0→5.0, range 3000→4000
beltLight.position.copy(galaxyCenter);
scene.add(beltLight);
beltGroup.userData.light = beltLight; // Store reference for cleanup

            asteroidBelts.push(beltGroup);
        }
    });
    
    console.log(`✅ Created ${asteroidBelts.length} OPTIMIZED asteroid belts around actual black holes`);
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
    const galaxyCenter = blackHole.position.clone();
    
    console.log(`Creating asteroid belt for galaxy ${galaxyId} (${galaxyType.name})`);
    
    const beltCount = Math.random() > 0.5 ? 2 : 1;
    
    for (let b = 0; b < beltCount; b++) {
        const beltGroup = new THREE.Group();
        const asteroidCount = 50 + Math.random() * 100;
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
        
        const beltLight = new THREE.PointLight(0xffffff, 3.0, 3000);
        beltLight.position.copy(galaxyCenter);
        scene.add(beltLight);
        beltGroup.userData.light = beltLight;
        
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
    window.createAsteroidBelts = createAsteroidBelts;
    window.isPositionTooClose = isPositionTooClose;
    
    // Utility functions
    window.generatePlanetName = generatePlanetName;
    window.createEnemyGeometry = createEnemyGeometry;
    window.spawnEnhancedWormhole = spawnEnhancedWormhole;
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
    window.createNebulaAsteroidBelts = createNebulaAsteroidBelts;
	window.updateCMBOpacity = updateCMBOpacity;
    window.updateHubbleSkyboxOpacity = updateHubbleSkyboxOpacity;
	window.updateHubbleSkybox2Opacity = updateHubbleSkybox2Opacity;
    
    console.log('Enhanced game objects with planet clusters loaded');
}
// CMB OPACITY HELPER FUNCTION
// =============================================================================
function setCMBOpacity(value) {
    if (window.cosmicSkybox && window.cosmicSkybox.material && window.cosmicSkybox.material.uniforms) {
        window.cosmicSkybox.material.uniforms.opacity.value = value;
        console.log('✅ CMB opacity set to:', value);
    } else {
        console.log('❌ CMB not found');
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
    const sagittariusAPosition = new THREE.Vector3(0, 0, 0);
    const distanceFromSgrA = camera.position.distanceTo(sagittariusAPosition);
    
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
    
    // Update the CMB shader uniform
    window.cosmicSkybox.material.uniforms.opacity.value = finalOpacity;
}

// =============================================================================
// HUBBLE SKYBOX OPACITY CONTROL - FADES IN AS PLAYER TRAVELS
// =============================================================================
function updateHubbleSkyboxOpacity() {
    if (!window.hubbleSkybox || !window.hubbleSkybox.material) {
        return;
    }
    
    if (typeof camera === 'undefined' || typeof gameState === 'undefined') {
        return;
    }
    
    // Calculate total distance traveled from origin
    const distanceFromStart = camera.position.length();
    
    // Define fade-in range (adjust these values to control the fade speed)
    const fadeStartDistance = 5000;        // Start fading at origin
    const fadeEndDistance = 75000;      // Reach max opacity at 50,000 units
    
    // Calculate opacity based on distance (0.01 to 0.6)
    let targetOpacity;
    if (distanceFromStart < fadeStartDistance) {
        targetOpacity = 0.00;
    } else if (distanceFromStart > fadeEndDistance) {
        targetOpacity = 0.02;
    } else {
        // Linear interpolation between 0.01 and 0.6
        const progress = (distanceFromStart - fadeStartDistance) / (fadeEndDistance - fadeStartDistance);
        targetOpacity = 0.00 + (progress * 0.02); // 0.59 = 0.6 - 0.01
    }
    
    // Smoothly transition to target opacity
    const currentOpacity = window.hubbleSkybox.material.opacity;
    const lerpSpeed = 0.02; // Smooth transition speed
    window.hubbleSkybox.material.opacity = currentOpacity + (targetOpacity - currentOpacity) * lerpSpeed;
}
// =============================================================================
// HUBBLE SKYBOX 2 OPACITY CONTROL - FADES IN AS PLAYER TRAVELS DEEPER
// =============================================================================
function updateHubbleSkybox2Opacity() {
    if (!window.hubbleSkybox2 || !window.hubbleSkybox2.material) {
        return;
    }
    
    if (typeof camera === 'undefined' || typeof gameState === 'undefined') {
        return;
    }
    
    // Calculate total distance traveled from origin
    const distanceFromStart = camera.position.length();
    
    // Define fade-in range (starts later, for deeper exploration)
    const fadeStartDistance = 1000;        // Start fading at 5,000 units
    const fadeEndDistance = 30000;        // Reach max opacity at 100,000 units
    
    // Calculate opacity based on distance (0.00 to 0.02)
    let targetOpacity;
    if (distanceFromStart < fadeStartDistance) {
        targetOpacity = 0.00;
    } else if (distanceFromStart > fadeEndDistance) {
        targetOpacity = .6;
    } else {
        // Linear interpolation between 0.00 and 0.02
        const progress = (distanceFromStart - fadeStartDistance) / (fadeEndDistance - fadeStartDistance);
        targetOpacity = 0.00 + (progress * .6); // 0.02 = 0.02 - 0.00
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

function createBossBattleSkybox() {
    console.log("Creating boss battle skybox...");

    const geometry = new THREE.SphereGeometry(90000, 64, 64);
    const material = new THREE.MeshBasicMaterial({
        color: 0x8b0000,  // Deep blood red
        side: THREE.BackSide,
        transparent: true,
        opacity: 0,
        fog: false,
        depthWrite: false
    });

    bossSkybox = new THREE.Mesh(geometry, material);
    bossSkybox.name = "BossBattleSkybox";
    bossSkybox.frustumCulled = false;
    bossSkybox.renderOrder = -1;

    scene.add(bossSkybox);

    console.log("✅ Boss battle skybox created (initially transparent)");
}

// Update boss skybox opacity with heartbeat effect
function updateBossSkyboxHeartbeat() {
    if (!bossSkybox || typeof bossSystem === "undefined") return;

    const hasBoss = bossSystem.activeBoss !== null;

    if (hasBoss) {
        // Heartbeat pulsing effect
        bossHeartbeatPhase += 0.08;  // Speed of heartbeat

        // Double-beat pattern like a real heartbeat: lub-dub, pause, lub-dub
        const beat1 = Math.sin(bossHeartbeatPhase * 2) * 0.5 + 0.5;  // Fast beat
        const beat2 = Math.sin((bossHeartbeatPhase - 0.3) * 2) * 0.5 + 0.5;  // Second beat slightly delayed
        const pause = Math.sin(bossHeartbeatPhase) * 0.5 + 0.5;  // Slower pulse for pause

        // Combine beats for realistic heartbeat pattern
        const heartbeat = Math.max(beat1 * 0.6, beat2 * 0.4) * pause;

        // Target opacity with heartbeat
        const targetOpacity = 0.1 + (heartbeat * 0.6);  // Range: 0.3 to 0.7

        // Smooth transition to target
        bossSkyboxOpacity += (targetOpacity - bossSkyboxOpacity) * 0.1;

    } else {
        // Fade out when no boss
        bossSkyboxOpacity -= bossSkyboxOpacity * 0.05;
        if (bossSkyboxOpacity < 0.01) bossSkyboxOpacity = 0;
    }

    // Apply opacity
    bossSkybox.material.opacity = bossSkyboxOpacity;
}

// Export functions
window.createBossBattleSkybox = createBossBattleSkybox;
window.updateBossSkyboxHeartbeat = updateBossSkyboxHeartbeat;
window.bossSkybox = bossSkybox;

