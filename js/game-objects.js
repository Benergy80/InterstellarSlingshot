// Game Objects - Creation of planets, stars, enemies, and other space objects
// DOUBLED WORLD SIZE: All distances and masses doubled while keeping player/enemy size the same
// ENHANCED: Progressive difficulty system with dynamic enemy health and advanced combat mechanics
// UPDATED: Complete integration of progressive difficulty and enhanced enemy management
// FIXED: Boss spawning system and asteroid destruction
// FIXED: Background galaxy visibility and frustum culling issues
// FIXED: Mouse controls and navigation system compatibility

// Enhanced Galaxy definitions with factions (doubled size and mass)
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

// Fixed map positions that correspond to numbered locations (1-8)
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

// Planet name generators
const starTrekPlanets = ['Vulcan', 'Andoria', 'Tellar Prime', 'Bajor', 'Cardassia Prime', 'Kronos', 'Romulus', 'Risa', 'Betazed', 'Trill'];
const starWarsPlanets = ['Tatooine', 'Coruscant', 'Naboo', 'Endor', 'Hoth', 'Dagobah', 'Kamino', 'Geonosis', 'Mustafar', 'Alderaan'];

// Enhanced enemy shapes for different galaxies (enemy size remains the same)
const enemyShapes = {
    0: { geometry: 'cone', color: 0x4488ff },      // Federation - cone
    1: { geometry: 'octahedron', color: 0xff8844 }, // Klingon - octahedron
    2: { geometry: 'tetrahedron', color: 0x88ff44 }, // Rebel - tetrahedron
    3: { geometry: 'cylinder', color: 0xff4488 },   // Romulan - cylinder
    4: { geometry: 'sphere', color: 0x44ffff },     // Imperial - sphere
    5: { geometry: 'box', color: 0xff44ff },        // Cardassian - box
    6: { geometry: 'diamond', color: 0xff8888 },    // Sith - diamond
    7: { geometry: 'torus', color: 0xffaa88 }       // Vulcan - torus
};

// Enhanced enemy spawning limits per galaxy
const galaxyEnemyLimits = {
    0: 12, 1: 15, 2: 10, 3: 13, 4: 8, 5: 14, 6: 18, 7: 16
};

// FIXED: Boss system initialization - SINGLE DECLARATION
const bossSystem = {
    galaxyBossSpawned: [false, false, false, false, false, false, false, false],
    galaxyBossDefeated: [false, false, false, false, false, false, false, false],
    activeBoss: null,
    bossThreshold: 3 // Spawn boss when 3 or fewer enemies remain
};

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
        localDetectionRange: 2000 + (galaxiesCleared * 200), // Larger detection as difficulty increases
        localFiringRange: 200 + (galaxiesCleared * 25),
        localAttackCooldown: Math.max(1000, 2000 - (galaxiesCleared * 100)), // Faster attacks as difficulty increases
        
        // Distant galaxy settings (always challenging) - MAX 3 HITS
        maxDistantAttackers: Math.min(5 + galaxiesCleared, 10),
        distantSpeedMultiplier: 0.8 + (galaxiesCleared * 0.05),
        distantHealthMultiplier: Math.min(2 + galaxiesCleared * 0.125, 3), // MAX 3 hits
        distantDetectionRange: 3000 + (galaxiesCleared * 150),
        distantFiringRange: 300 + (galaxiesCleared * 20),
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

// FIXED: Boss spawning system
function checkAndSpawnBoss(galaxyId) {
    if (typeof enemies === 'undefined' || typeof scene === 'undefined') return;
    
    // Check if boss should be spawned for this galaxy
    if (bossSystem.galaxyBossSpawned[galaxyId] || bossSystem.galaxyBossDefeated[galaxyId]) {
        return; // Boss already spawned or defeated
    }
    
    // Count remaining enemies in this galaxy
    const galaxyEnemies = enemies.filter(enemy => 
        enemy.userData && 
        enemy.userData.health > 0 && 
        enemy.userData.galaxyId === galaxyId &&
        !enemy.userData.isBoss &&
        !enemy.userData.isBossSupport
    );
    
    if (galaxyEnemies.length <= bossSystem.bossThreshold) {
        spawnBossForGalaxy(galaxyId);
    }
}

function spawnBossForGalaxy(galaxyId) {
    if (bossSystem.galaxyBossSpawned[galaxyId]) return;
    
    const galaxyType = galaxyTypes[galaxyId];
    const mapPos = galaxyMapPositions[galaxyId];
    const universeRadius = 40000;
    
    const galaxyX = (mapPos.x - 0.5) * universeRadius * 2;
    const galaxyZ = (mapPos.y - 0.5) * universeRadius * 2;
    const galaxyY = (Math.random() - 0.5) * 3000;
    
    // Create boss flagship (larger than regular enemies)
    const bossGeometry = new THREE.OctahedronGeometry(8); // Larger than regular enemies
    const shapeData = enemyShapes[galaxyId];
    
    const bossMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(shapeData.color).multiplyScalar(1.2),
        roughness: 0.3,
        metalness: 0.7,
        emissive: new THREE.Color(shapeData.color).multiplyScalar(0.3),
        emissiveIntensity: 0.8
    });
    
    const boss = new THREE.Mesh(bossGeometry, bossMaterial);
    
    // Enhanced boss glow
    const bossGlowGeometry = new THREE.OctahedronGeometry(10);
    const bossGlowMaterial = new THREE.MeshBasicMaterial({
        color: shapeData.color,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending
    });
    const bossGlow = new THREE.Mesh(bossGlowGeometry, bossGlowMaterial);
    boss.add(bossGlow);
    
    // Position boss at galaxy center
    boss.position.set(galaxyX, galaxyY, galaxyZ);
    
    boss.userData = {
        name: `${galaxyType.faction} Flagship`,
        type: 'enemy',
        health: 3, // Bosses have 3 health
        maxHealth: 3,
        speed: 1.0,
        aggression: 1.0,
        patrolCenter: new THREE.Vector3(galaxyX, galaxyY, galaxyZ),
        patrolRadius: 500,
        lastAttack: 0,
        isActive: true,
        visible: true,
        galaxyId: galaxyId,
        galaxyColor: shapeData.color,
        swarmTarget: null,
        circlePhase: Math.random() * Math.PI * 2,
        attackMode: 'boss_engage',
        detectionRange: 4000,
        firingRange: 400,
        isLocal: false,
        isBoss: true,
        isBossSupport: false
    };
    
    boss.visible = true;
    boss.frustumCulled = false;
    
    scene.add(boss);
    enemies.push(boss);
    
    bossSystem.galaxyBossSpawned[galaxyId] = true;
    bossSystem.activeBoss = boss;
    
    // Spawn 2-3 support ships
    for (let i = 0; i < 3; i++) {
        spawnBossSupport(galaxyId, galaxyX, galaxyY, galaxyZ, i);
    }
    
    // Show boss warning
    if (typeof showBossWarning === 'function') {
        showBossWarning(boss.userData.name);
    } else {
        console.log(`BOSS SPAWNED: ${boss.userData.name} in ${galaxyType.name} Galaxy!`);
    }
    
    // Play boss sound
    if (typeof playSound === 'function') {
        playSound('boss');
    }
    
    console.log(`Boss spawned: ${boss.userData.name} in ${galaxyType.name} Galaxy`);
}

function spawnBossSupport(galaxyId, bossX, bossY, bossZ, supportIndex) {
    const galaxyType = galaxyTypes[galaxyId];
    const shapeData = enemyShapes[galaxyId];
    
    const supportGeometry = createEnemyGeometry(galaxyId);
    const supportMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(shapeData.color).multiplyScalar(1.1),
        roughness: 0.4,
        metalness: 0.6,
        emissive: new THREE.Color(shapeData.color).multiplyScalar(0.2),
        emissiveIntensity: 0.5
    });
    
    const support = new THREE.Mesh(supportGeometry, supportMaterial);
    
    // Position around boss
    const angle = (supportIndex / 3) * Math.PI * 2;
    const distance = 150 + Math.random() * 100;
    support.position.set(
        bossX + Math.cos(angle) * distance,
        bossY + (Math.random() - 0.5) * 100,
        bossZ + Math.sin(angle) * distance
    );
    
    support.userData = {
        name: `${galaxyType.faction} Support ${supportIndex + 1}`,
        type: 'enemy',
        health: getEnemyHealthForDifficulty(false, false, true),
        maxHealth: getEnemyHealthForDifficulty(false, false, true),
        speed: 1.2,
        aggression: 0.9,
        patrolCenter: new THREE.Vector3(bossX, bossY, bossZ),
        patrolRadius: distance,
        lastAttack: 0,
        isActive: true,
        visible: true,
        galaxyId: galaxyId,
        galaxyColor: shapeData.color,
        swarmTarget: null,
        circlePhase: Math.random() * Math.PI * 2,
        attackMode: 'support',
        detectionRange: 3500,
        firingRange: 350,
        isLocal: false,
        isBoss: false,
        isBossSupport: true
    };
    
    support.visible = true;
    support.frustumCulled = false;
    
    scene.add(support);
    enemies.push(support);
}

// FIXED: Check if galaxy is cleared and boss defeated
function checkBossVictory(defeatedEnemy) {
    if (!defeatedEnemy.userData.isBoss) return false;
    
    const galaxyId = defeatedEnemy.userData.galaxyId;
    bossSystem.galaxyBossDefeated[galaxyId] = true;
    
    if (bossSystem.activeBoss === defeatedEnemy) {
        bossSystem.activeBoss = null;
    }
    
    // Remove all support ships for this galaxy
    const supportShips = enemies.filter(enemy => 
        enemy.userData.isBossSupport && 
        enemy.userData.galaxyId === galaxyId
    );
    
    supportShips.forEach(support => {
        if (typeof createExplosionEffect === 'function') {
            createExplosionEffect(support);
        }
        scene.remove(support);
        const index = enemies.indexOf(support);
        if (index > -1) enemies.splice(index, 1);
    });
    
    return true;
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

function createEnhancedStarfield() {
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.2,              // Reduced from 1.5
        transparent: false,      // Disable transparency for performance
        opacity: 1.0,
        sizeAttenuation: false   // Disable size attenuation for performance
    });
    
    const starsVertices = [];
    
    // Create background stars first (DRASTICALLY REDUCED)
    for (let i = 0; i < 800; i++) {  // Reduced from 3000
        const distanceFactor = 10 + Math.random() * 30;
        const x = (Math.random() - 0.5) * 4000 * distanceFactor;
        const y = (Math.random() - 0.5) * 1600 * distanceFactor;
        const z = (Math.random() - 0.5) * 4000 * distanceFactor;
        starsVertices.push(x, y, z);
    }
    
    // Enhanced local galaxy (DRASTICALLY REDUCED)
    for (let i = 0; i < 2000; i++) {  // Reduced from 8000
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
            starsVertices.push(x, y, z);
        } else {
            // Spiral arms
            const angle = armAngle + (armDistance / 360) * Math.PI;
            const x = Math.cos(angle) * armDistance + (Math.random() - 0.5) * armWidth * armDistance;
            const z = Math.sin(angle) * armDistance + (Math.random() - 0.5) * armWidth * armDistance;
            const y = (Math.random() - 0.5) * 120;
            starsVertices.push(x, y, z);
        }
    }
    
    // Add distant bright stars (REDUCED)
    for (let i = 0; i < 30; i++) {  // Reduced from 100
        const distanceFactor = 100 + Math.random() * 100;
        const x = (Math.random() - 0.5) * 4000 * distanceFactor;
        const y = (Math.random() - 0.5) * 1600 * distanceFactor;
        const z = (Math.random() - 0.5) * 4000 * distanceFactor;
        starsVertices.push(x, y, z);
    }
    
    // Create 8 distant galaxies with doubled positions and scale
    galaxyTypes.forEach((galaxyType, g) => {
        const universeRadius = 40000; // Doubled
        const mapPos = galaxyMapPositions[g];
        
        const galaxyX = (mapPos.x - 0.5) * universeRadius * 2;
        const galaxyZ = (mapPos.y - 0.5) * universeRadius * 2;
        const galaxyY = (Math.random() - 0.5) * 3000; // Doubled
        
        const galaxySize = galaxyType.size;
        const armStars = galaxyType.name === 'Quasar' ? 6000 : galaxyType.name === 'Dwarf' ? 2000 : 4000;
        
        // Galaxy creation with doubled scale
        for (let i = 0; i < armStars; i++) {
            let x, y, z;
            
            if (Math.random() < 0.4) {
                // Center bulge (doubled)
                const bulgeRadius = Math.pow(Math.random(), 2.5) * (galaxySize * 0.6); // Doubled
                const bulgeAngle = Math.random() * Math.PI * 2;
                const bulgePhi = (Math.random() - 0.5) * Math.PI;
                x = galaxyX + bulgeRadius * Math.cos(bulgeAngle) * Math.cos(bulgePhi);
                z = galaxyZ + bulgeRadius * Math.sin(bulgeAngle) * Math.cos(bulgePhi);
                y = galaxyY + bulgeRadius * Math.sin(bulgePhi) * 1.6; // Doubled
            } else {
                // Spiral arms (doubled)
                if (galaxyType.arms > 0) {
                    const arm = Math.floor(i / (armStars/galaxyType.arms)) % galaxyType.arms;
                    const armAngle = (i / (armStars/galaxyType.arms)) * Math.PI * 2;
                    const armDistance = Math.pow(Math.random(), 1.8) * galaxySize;
                    const armWidth = galaxyType.name === 'Ring' ? 0.03 : 0.12;
                    
                    let angle = armAngle + (armDistance / galaxySize) * Math.PI * 2;
                    if (galaxyType.name === 'Ring' && armDistance < galaxySize * 0.4) continue;
                    
                    x = galaxyX + Math.cos(angle + arm * (Math.PI*2/galaxyType.arms)) * armDistance + 
                                          (Math.random() - 0.5) * armWidth * armDistance;
                    z = galaxyZ + Math.sin(angle + arm * (Math.PI*2/galaxyType.arms)) * armDistance + 
                                          (Math.random() - 0.5) * armWidth * armDistance;
                    y = galaxyY + (Math.random() - 0.5) * (galaxyType.name === 'Elliptical' ? 240 : 60); // Doubled
                } else {
                    // Elliptical galaxies (doubled)
                    const distance = Math.pow(Math.random(), 1.3) * galaxySize;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = (Math.random() - 0.5) * (galaxyType.name === 'Lenticular' ? 0.3 : Math.PI * 0.6);
                    
                    x = galaxyX + distance * Math.sin(phi) * Math.cos(theta);
                    z = galaxyZ + distance * Math.sin(phi) * Math.sin(theta);
                    y = galaxyY + distance * Math.cos(phi) * (galaxyType.name === 'Lenticular' ? 0.2 : 1.0); // Doubled
                }
            }
            
            starsVertices.push(x, y, z);
        }
        
        // Create galactic core black hole (doubled mass and size)
        const blackHoleSize = galaxyType.name === 'Quasar' ? 60 : galaxyType.name === 'Dwarf' ? 20 : 36; // Doubled
        const blackHoleGeometry = new THREE.SphereGeometry(blackHoleSize, 16, 16);
        const blackHoleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x000000,
            transparent: true,
            opacity: 0.95
        });
        const galaxyBlackHole = new THREE.Mesh(blackHoleGeometry, blackHoleMaterial);
        galaxyBlackHole.position.set(galaxyX, galaxyY, galaxyZ);
        
        // FIXED: Prevent frustum culling for background galaxy objects
        galaxyBlackHole.visible = true;
        galaxyBlackHole.frustumCulled = false;
        galaxyBlackHole.matrixAutoUpdate = false;
        galaxyBlackHole.updateMatrix();
        
        galaxyBlackHole.userData = {
            name: `${galaxyType.name} Galaxy Core (${galaxyType.faction})`,
            type: 'blackhole',
            mass: galaxyType.mass, // Doubled mass
            gravity: galaxyType.name === 'Quasar' ? 300.0 : galaxyType.name === 'Dwarf' ? 100.0 : 200.0, // Doubled
            warpThreshold: 160, // Doubled
            isGalacticCore: true,
            galaxyType: galaxyType,
            galaxyId: g,
            mapPosition: mapPos,
            faction: galaxyType.faction,
            species: galaxyType.species
        };
        scene.add(galaxyBlackHole);
        planets.push(galaxyBlackHole);
        
        // FIXED: Initialize enemy count for this galaxy safely
        if (typeof gameState !== 'undefined') {
            if (!gameState.currentGalaxyEnemies) {
                gameState.currentGalaxyEnemies = {};
            }
            gameState.currentGalaxyEnemies[g] = 0;
        }
        
        // Enhanced accretion disk (doubled size)
        const ringSize = galaxyType.name === 'Quasar' ? 80 : blackHoleSize + 12; // Doubled
        const ringGeometry = new THREE.RingGeometry(ringSize - 8, ringSize + 20, 32); // Doubled
        const ringMaterial = new THREE.MeshBasicMaterial({ 
            color: galaxyType.color,
            transparent: true,
            opacity: galaxyType.name === 'Quasar' ? 0.8 : 0.4,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
        
        // FIXED: Prevent frustum culling for ring
        ring.visible = true;
        ring.frustumCulled = false;
        ring.matrixAutoUpdate = false;
        ring.updateMatrix();
        galaxyBlackHole.add(ring);
        
        // Add star particle clusters around galactic cores (doubled scale)
        const clusterCount = galaxyType.name === 'Quasar' ? 3000 : 1500;
        const clusterGeometry = new THREE.BufferGeometry();
        const clusterPositions = new Float32Array(clusterCount * 3);
        const clusterColors = new Float32Array(clusterCount * 3);
        
        for (let i = 0; i < clusterCount; i++) {
            const clusterRadius = blackHoleSize + 100 + Math.random() * 400; // Doubled
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.random() - 0.5) * Math.PI * 0.3;
            
            clusterPositions[i * 3] = clusterRadius * Math.sin(phi) * Math.cos(theta);
            clusterPositions[i * 3 + 1] = clusterRadius * Math.cos(phi) * (Math.random() - 0.5) * 1.0; // Doubled
            clusterPositions[i * 3 + 2] = clusterRadius * Math.sin(phi) * Math.sin(theta);
            
            const starColor = new THREE.Color(galaxyType.color).offsetHSL(Math.random() * 0.2 - 0.1, 0, Math.random() * 0.3);
            clusterColors[i * 3] = starColor.r;
            clusterColors[i * 3 + 1] = starColor.g;
            clusterColors[i * 3 + 2] = starColor.b;
        }
        
        clusterGeometry.setAttribute('position', new THREE.BufferAttribute(clusterPositions, 3));
        clusterGeometry.setAttribute('color', new THREE.BufferAttribute(clusterColors, 3));
        
        const clusterMaterial = new THREE.PointsMaterial({
            size: 1.5,
            transparent: true,
            opacity: 0.8,
            vertexColors: true,
            blending: THREE.AdditiveBlending
        });
        
        const starCluster = new THREE.Points(clusterGeometry, clusterMaterial);
        
        // COMPREHENSIVE: Prevent frustum culling for star cluster points
        starCluster.visible = true;
        starCluster.frustumCulled = false;
        starCluster.matrixAutoUpdate = false;
        starCluster.updateMatrix();
        starCluster.geometry.computeBoundingSphere();
        if (starCluster.geometry.boundingSphere) {
            starCluster.geometry.boundingSphere.radius = Infinity; // Prevent distance culling
        }
        
        galaxyBlackHole.add(starCluster);
        
        // Create star systems in galaxy (doubled scale)
        const systemCount = galaxyType.name === 'Quasar' ? 8 : galaxyType.name === 'Dwarf' ? 3 : 5;
        for (let s = 0; s < systemCount; s++) {
            const systemDistance = (galaxyType.name === 'Dwarf' ? 240 : 500) + Math.random() * (galaxySize - 300); // Doubled
            const systemAngle = Math.random() * Math.PI * 2;
            const systemX = galaxyX + Math.cos(systemAngle) * systemDistance;
            const systemZ = galaxyZ + Math.sin(systemAngle) * systemDistance;
            const systemY = galaxyY + (Math.random() - 0.5) * (galaxyType.name === 'Elliptical' ? 300 : 120); // Doubled
            
            // System star (SOLID) - doubled mass but same size
            const starSize = 5 + Math.random() * 8; // Size remains the same
            const starGeometry = new THREE.SphereGeometry(starSize, 16, 16);
            const starMaterial = new THREE.MeshBasicMaterial({ 
                color: new THREE.Color(galaxyType.color).offsetHSL(Math.random() * 0.3 - 0.15, 0, 0.2)
            });
            const star = new THREE.Mesh(starGeometry, starMaterial);
            star.position.set(systemX, systemY, systemZ);

            // COMPREHENSIVE: Prevent frustum culling for distant stars and all components
            star.visible = true;
            star.frustumCulled = false;
            star.matrixAutoUpdate = false; // Prevent matrix updates for distant objects
            star.updateMatrix(); // Update once

            // Enhanced star lighting (doubled range)
            const lightRange = 1000; // Doubled range
            const starLight = new THREE.PointLight(
                new THREE.Color(galaxyType.color).offsetHSL(Math.random() * 0.1 - 0.05, 0, 0.1),
                1.2, lightRange, 1.2 // Reduced from 3.5 to 1.2, increased decay
            );
            starLight.position.copy(star.position);
            starLight.castShadow = false;
            scene.add(starLight);
            
            const systemAmbientLight = new THREE.AmbientLight(
                new THREE.Color(galaxyType.color).multiplyScalar(0.3), 
                0.1 // Reduced from 0.4 to 0.1
            );
            scene.add(systemAmbientLight);
            
            star.userData = {
                name: `${galaxyType.faction} System ${s+1}`,
                type: 'star',
                isDistant: true,
                mass: starSize * 4, // Doubled mass
                gravity: 6.0, // Doubled
                galaxyId: g,
                galaxyType: galaxyType.name,
                systemCenter: {x: systemX, y: systemY, z: systemZ},
                faction: galaxyType.faction
            };
            planets.push(star);
            scene.add(star);
            
            // Add reduced plasma tendrils to distant stars
            if (Math.random() < 0.15) {
                createSunSpikes(star);
            }
            
            // Planets in system (doubled distances and masses)
            const planetCount = 2 + Math.floor(Math.random() * 3);
            for (let p = 0; p < planetCount; p++) {
                const planetSize = 1.2 + Math.random() * 4; // Size remains the same
                const planetGeometry = new THREE.SphereGeometry(planetSize, 12, 12);
                const planetHue = (g / 8) + Math.random() * 0.4;
                const planetMaterial = new THREE.MeshLambertMaterial({ 
                    color: new THREE.Color().setHSL(planetHue, 0.7, 0.5),
                    emissive: new THREE.Color().setHSL(planetHue, 0.3, 0.1)
                });
                const planet = new THREE.Mesh(planetGeometry, planetMaterial);
                
                // COMPREHENSIVE: Prevent frustum culling for distant planets and all children
                planet.visible = true;
                planet.frustumCulled = false;
                planet.matrixAutoUpdate = false;
                planet.updateMatrix();
                
                // Also disable frustum culling for any child objects (rings, atmospheres, crystals)
                planet.children.forEach(child => {
                    child.visible = true;
                    child.frustumCulled = false;
                });
                
                const orbitRadius = 100 + p * 80; // Doubled
                const orbitSpeed = 0.002 + Math.random() * 0.005;
                const orbitPhase = Math.random() * Math.PI * 2;
                
                planet.position.set(
                    systemX + Math.cos(orbitPhase) * orbitRadius,
                    systemY + (Math.random() - 0.5) * 30, // Doubled
                    systemZ + Math.sin(orbitPhase) * orbitRadius
                );
                
                // Enhanced features for distant planets
                const strangeness = Math.random();
                
                // Add rings to some distant planets (doubled sizes)
                if (Math.random() < 0.4) {
                    const ringCount = 1 + Math.floor(Math.random() * 4);
                    for (let r = 0; r < ringCount; r++) {
                        const ringInner = planetSize + 3 + r * 4; // Doubled
                        const ringOuter = ringInner + 2 + Math.random() * 4; // Doubled
                        const ringGeometry = new THREE.RingGeometry(ringInner, ringOuter, 32);
                        
                        let ringColor;
                        if (strangeness > 0.8) {
                            ringColor = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
                        } else {
                            ringColor = new THREE.Color().setHSL(planetHue + 0.1, 0.5, 0.7);
                        }
                        
                        const ringMaterial = new THREE.MeshBasicMaterial({ 
                            color: ringColor,
                            transparent: true,
                            opacity: 0.6 - r * 0.1,
                            side: THREE.DoubleSide
                        });
                        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                        ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
                        ring.rotation.z = Math.random() * Math.PI * 2;
                        
                        // FIXED: Prevent frustum culling for planet rings
                        ring.visible = true;
                        ring.frustumCulled = false;
                        
                        planet.add(ring);
                    }
                }
                
                // Strange atmospheric effects for very distant planets
                if (strangeness > 0.7) {
                    const atmosphereGeometry = new THREE.SphereGeometry(planetSize + 1, 16, 16); // Doubled
                    const atmosphereMaterial = new THREE.MeshBasicMaterial({
                        color: new THREE.Color().setHSL(Math.random(), 0.8, 0.5),
                        transparent: true,
                        opacity: 0.3,
                        blending: THREE.AdditiveBlending
                    });
                    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
                    
                    // FIXED: Prevent frustum culling for atmospheres
                    atmosphere.visible = true;
                    atmosphere.frustumCulled = false;
                    
                    planet.add(atmosphere);
                }
                
                // Crystal formations for ultra-strange planets
                if (strangeness > 0.9) {
                    for (let c = 0; c < 3; c++) {
                        const crystalGeometry = new THREE.ConeGeometry(0.6, 3, 6); // Doubled
                        const crystalMaterial = new THREE.MeshBasicMaterial({
                            color: new THREE.Color().setHSL(Math.random(), 1.0, 0.8),
                            transparent: true,
                            opacity: 0.8
                        });
                        const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
                        const crystalAngle = (c / 3) * Math.PI * 2;
                        crystal.position.set(
                            Math.cos(crystalAngle) * (planetSize + 0.4), // Doubled
                            (Math.random() - 0.5) * planetSize,
                            Math.sin(crystalAngle) * (planetSize + 0.4) // Doubled
                        );
                        crystal.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                        
                        // FIXED: Prevent frustum culling for crystals
                        crystal.visible = true;
                        crystal.frustumCulled = false;
                        
                        planet.add(crystal);
                    }
                }
                
                planet.userData = {
                    name: generatePlanetName(g),
                    type: 'planet',
                    isDistant: true,
                    orbitRadius: orbitRadius,
                    orbitSpeed: orbitSpeed,
                    orbitPhase: orbitPhase,
                    systemCenter: {x: systemX, y: systemY, z: systemZ},
                    mass: planetSize * 3.6, // Doubled mass
                    gravity: 1.6 + Math.random() * 2.4, // Doubled
                    galaxyId: g,
                    galaxyType: galaxyType.name,
                    faction: galaxyType.faction,
                    strangeness: strangeness
                };
                planets.push(planet);
                scene.add(planet);
            }
        }
    });
    
    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    stars = new THREE.Points(starsGeometry, starsMaterial);
    
    // FIXED: Prevent frustum culling for main starfield
    stars.visible = true;
    stars.frustumCulled = false;
    
    scene.add(stars);
    
    // Create enhanced wormholes
    createEnhancedWormholes();
    
    // Create nebulas and asteroid belts
    createNebulas();
    createAsteroidBelts();
    
    console.log('Created enhanced universe (DOUBLED SCALE) with', starsVertices.length/3, 'stars and', planets.length, 'celestial objects');
}

function createOptimizedPlanets() {
    const localSystemOffset = { x: 2000, y: 0, z: 1200 }; // Doubled
    
    // Create our Sun with spiky glow effect (doubled mass but same size)
    const sunGeometry = new THREE.SphereGeometry(8, 24, 24); // Size remains the same
    const sunMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffff44
    });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.position.set(localSystemOffset.x, localSystemOffset.y, localSystemOffset.z);

    // FIXED: Prevent frustum culling for local sun
    sun.visible = true;
    sun.frustumCulled = false;

    // Enhanced sun lighting (doubled range)
    const sunLight = new THREE.PointLight(
        0xffff88, 1.5, 4000, 0.8 // Reduced from 4.0 to 1.5, increased decay
    );
    sunLight.position.copy(sun.position);
    sunLight.castShadow = false;
    scene.add(sunLight);

    const localAmbientLight = new THREE.AmbientLight(0x404040, 0.2); // Reduced from 0.5 to 0.2
    scene.add(localAmbientLight);

    sun.userData = { 
        name: 'Sol', 
        type: 'star', 
        isLocalStar: true,
        orbitRadius: 0,
        orbitSpeed: 0.005,
        mass: 40, // Doubled mass
        gravity: 10.0, // Doubled
        isLocal: true
    };
    planets.push(sun);
    scene.add(sun);

    // Simple sun glow sphere
    const glowGeometry = new THREE.SphereGeometry(12, 16, 16); // Size remains the same
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffdd44,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending
    });
    const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);
    
    // FIXED: Prevent frustum culling for sun glow
    glowSphere.visible = true;
    glowSphere.frustumCulled = false;
    
    sun.add(glowSphere);
    sun.userData.glowSphere = glowSphere;
    
    // Create local planets (doubled distances and masses, same sizes)
    const localPlanets = [
        { name: 'Earth', distance: 160, size: 5, color: 0x2233ff, moons: [{ name: 'Luna', distance: 30, size: 1.5, color: 0xdddddd }] }, // Doubled distance
        { name: 'Venus', distance: 120, size: 4.8, color: 0xffc649, moons: [] }, // Doubled distance
        { name: 'Mars', distance: 240, size: 3, color: 0xff4422, moons: [ // Doubled distance
            { name: 'Phobos', distance: 16, size: 0.8, color: 0x8b4513 }, // Doubled distance
            { name: 'Deimos', distance: 24, size: 0.6, color: 0x696969 } // Doubled distance
        ]},
        { name: 'Jupiter', distance: 500, size: 15, color: 0xffaa22, moons: [ // Doubled distance
            { name: 'Io', distance: 50, size: 1.8, color: 0xffff99 }, // Doubled distance
            { name: 'Europa', distance: 64, size: 1.6, color: 0x99ccff }, // Doubled distance
            { name: 'Ganymede', distance: 84, size: 2.2, color: 0xcc9966 }, // Doubled distance
            { name: 'Callisto', distance: 110, size: 2.0, color: 0x666666 } // Doubled distance
        ]},
        { name: 'Saturn', distance: 800, size: 12, color: 0xffdd88, rings: true, moons: [ // Doubled distance
            { name: 'Titan', distance: 130, size: 2.5, color: 0xff9933 }, // Doubled distance
            { name: 'Enceladus', distance: 90, size: 1.0, color: 0xffffff } // Doubled distance
        ]},
        { name: 'Uranus', distance: 1100, size: 8, color: 0x4fccff, moons: [ // Doubled distance
            { name: 'Titania', distance: 84, size: 1.4, color: 0x888888 } // Doubled distance
        ]},
        { name: 'Neptune', distance: 1400, size: 7, color: 0x4169e1, moons: [ // Doubled distance
            { name: 'Triton', distance: 44, size: 1.3, color: 0x99ccff } // Doubled distance
        ]}
    ];
    
    localPlanets.forEach((planetData, index) => {
    const planetGeometry = new THREE.SphereGeometry(planetData.size, 20, 20); // Size remains the same
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
    
    // FIXED: Prevent frustum culling for local planets
    planet.visible = true;
    planet.frustumCulled = false;
    
    planet.userData = { 
        name: planetData.name,
        type: 'planet',
        isStart: planetData.name === 'Earth',
        orbitRadius: planetData.distance,
        orbitSpeed: 0.015 - index * 0.002,
        orbitPhase: index * Math.PI * 0.3,
        systemCenter: localSystemOffset,
        mass: planetData.size * 2, // Doubled mass
        gravity: planetData.size * 0.8, // Doubled
        isLocal: true
    };
    planets.push(planet);
    scene.add(planet);
    
    // Add rings for Saturn (doubled sizes)
    if (planetData.rings) {
        for (let r = 0; r < 3; r++) {
            const ringInner = planetData.size + 6 + r * 6; // Doubled
            const ringOuter = ringInner + 4; // Doubled
            const ringGeometry = new THREE.RingGeometry(ringInner, ringOuter, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({ 
                color: 0xdddddd,
                transparent: true,
                opacity: 0.5 - r * 0.1,
                side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.rotation.x = Math.PI / 2;
            
            // FIXED: Prevent frustum culling for planet rings
            ring.visible = true;
            ring.frustumCulled = false;
            
            planet.add(ring);
        }
    }
    
    // MOVED: Add moons INSIDE the localPlanets.forEach loop where planetData is defined
    planetData.moons.forEach((moonData, moonIndex) => {
        const moonGeometry = new THREE.SphereGeometry(moonData.size, 12, 12); // Size remains the same
        const moonMaterial = new THREE.MeshLambertMaterial({ 
            color: moonData.color,
            emissive: new THREE.Color(moonData.color).multiplyScalar(0.02)
        });
        const moon = new THREE.Mesh(moonGeometry, moonMaterial);
        moon.position.set(moonData.distance, 0, 0);
        
        // RESTORED: Ensure moons are always visible like older version
        moon.visible = true;
        moon.frustumCulled = false;
        moon.material.transparent = false; // Ensure solid visibility
        
        moon.userData = { 
            name: moonData.name,
            type: 'moon',
            orbitRadius: moonData.distance,
            orbitSpeed: 0.1 + moonIndex * 0.02,
            orbitPhase: moonIndex * Math.PI * 0.5,
            parentPlanet: planet,
            mass: moonData.size * 2, // Doubled mass
            gravity: moonData.size * 0.6, // Doubled
            isLocal: true
        };
        planets.push(moon);
        scene.add(moon);  // This makes moon position absolute world coordinates
        
        // ADDED: Console log to confirm moon creation
        console.log(`✅ Created moon: ${moonData.name} for ${planetData.name}`);
    });
    
}); // End of localPlanets.forEach loop
    
    // Add Sagittarius A* at position 8 (doubled mass and size)
    const centralBlackHoleGeometry = new THREE.SphereGeometry(70, 24, 24); // Doubled size
    const centralBlackHoleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x000000,
        transparent: true,
        opacity: 0.95
    });
    const centralBlackHole = new THREE.Mesh(centralBlackHoleGeometry, centralBlackHoleMaterial);
    centralBlackHole.position.set(0, 0, 0);
    
    // FIXED: Prevent frustum culling for central black hole
    centralBlackHole.visible = true;
    centralBlackHole.frustumCulled = false;
    
    centralBlackHole.userData = {
        name: 'Sagittarius A* (Galactic Center)',
        type: 'blackhole',
        mass: 8000, // Doubled mass
        gravity: 400.0, // Doubled
        warpThreshold: 160, // Doubled
        isGalacticCenter: true,
        targetGalaxy: Math.floor(Math.random() * 8),
        mapPosition: { x: 0.5, y: 0.5 },
        galaxyId: 7
    };
    scene.add(centralBlackHole);
    planets.push(centralBlackHole);
    
    // Add accretion disk (doubled size)
    const centralRingGeometry = new THREE.RingGeometry(60, 90, 48); // Doubled
    const centralRingMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff4500,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });
    const centralRing = new THREE.Mesh(centralRingGeometry, centralRingMaterial);
    centralRing.rotation.x = Math.PI / 2;
    
    // FIXED: Prevent frustum culling for central ring
    centralRing.visible = true;
    centralRing.frustumCulled = false;
    
    centralBlackHole.add(centralRing);
    
    // Local black hole gateway (doubled mass and size)
    const localBlackHoleGeometry = new THREE.SphereGeometry(44, 20, 20); // Doubled size
    const localBlackHoleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x000000,
        transparent: true,
        opacity: 0.95
    });
    const blackHole = new THREE.Mesh(localBlackHoleGeometry, localBlackHoleMaterial);
    blackHole.position.set(localSystemOffset.x + 2600, localSystemOffset.y, localSystemOffset.z); // Doubled distance
    
    // FIXED: Prevent frustum culling for local black hole
    blackHole.visible = true;
    blackHole.frustumCulled = false;
    
    blackHole.userData = { 
        name: 'Local Galactic Gateway', 
        type: 'blackhole',
        mass: 280, // Doubled mass
        gravity: 140.0, // Doubled
        warpThreshold: 100, // Doubled
        isLocalGateway: true,
        isLocal: true
    };
    planets.push(blackHole);
    scene.add(blackHole);
    
    // Add accretion disk (doubled size)
    const ringGeometry = new THREE.RingGeometry(40, 56, 32); // Doubled
    const ringMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x8b4513,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    
    // FIXED: Prevent frustum culling for local ring
    ring.visible = true;
    ring.frustumCulled = false;
    
    blackHole.add(ring);
    
    // FIXED: Position camera 40 units above Earth's horizon (doubled distance) - SAFE INITIALIZATION
    if (typeof camera !== 'undefined') {
        const earthInitialPosition = new THREE.Vector3(localSystemOffset.x + 160, localSystemOffset.y + 40, localSystemOffset.z); // Doubled
        camera.position.copy(earthInitialPosition);
        
        // Face towards Sagittarius A*
        camera.lookAt(new THREE.Vector3(0, 0, 0));
        if (typeof cameraRotation !== 'undefined') {
            cameraRotation = { 
                x: camera.rotation.x,
                y: camera.rotation.y,
                z: camera.rotation.z 
            };
        }
        
        // FIXED: Set initial velocity (orbital direction) - SAFE INITIALIZATION
        if (typeof gameState !== 'undefined' && gameState.velocityVector) {
            const sunPosition = new THREE.Vector3(localSystemOffset.x, localSystemOffset.y, localSystemOffset.z);
            const earthToSun = new THREE.Vector3().subVectors(sunPosition, earthInitialPosition).normalize();
            const orbitalDirection = new THREE.Vector3(-earthToSun.z, 0, earthToSun.x).normalize();
            gameState.velocityVector = orbitalDirection.multiplyScalar(gameState.minVelocity || 0.2);
        }
    }
    
    console.log('Enhanced local solar system created (DOUBLED SCALE)');
}

// =============================================================================
// ENHANCED ENEMY CREATION WITH PROGRESSIVE DIFFICULTY
// =============================================================================

function createEnemies() {
    // Enhanced enemy creation with galaxy limits and improved visibility
    
    // FIXED: Initialize currentGalaxyEnemies safely
    if (typeof gameState !== 'undefined') {
        if (!gameState.currentGalaxyEnemies) {
            gameState.currentGalaxyEnemies = {};
        }
    }
    
    // Create enemies for each galaxy (limited numbers)
    for (let g = 0; g < 8; g++) {
        const galaxyType = galaxyTypes[g];
        const mapPos = galaxyMapPositions[g];
        const universeRadius = 40000; // Doubled
        
        const galaxyX = (mapPos.x - 0.5) * universeRadius * 2;
        const galaxyZ = (mapPos.y - 0.5) * universeRadius * 2;
        const galaxyY = (Math.random() - 0.5) * 3000; // Doubled
        
        const enemiesPerGalaxy = galaxyEnemyLimits[g]; // Limited numbers
        if (typeof gameState !== 'undefined' && gameState.currentGalaxyEnemies) {
            gameState.currentGalaxyEnemies[g] = enemiesPerGalaxy;
        }
        
        for (let i = 0; i < enemiesPerGalaxy; i++) {
            const enemyGeometry = createEnemyGeometry(g);
            const shapeData = enemyShapes[g];
            
            // IMPROVED ENEMY VISIBILITY: More saturated colors, reduced glow
            const enemyMaterial = new THREE.MeshStandardMaterial({
                color: new THREE.Color(shapeData.color).multiplyScalar(0.9), // Slightly darker for saturation
                roughness: 0.6,
                metalness: 0.4,
                emissive: new THREE.Color(shapeData.color).multiplyScalar(0.1), // Reduced emissive
                emissiveIntensity: 0.3 // Reduced intensity
            });
            
            const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
            
            // MUCH REDUCED glow effect to prevent color washing
            const glowGeometry = enemyGeometry.clone();
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: shapeData.color,
                transparent: true,
                opacity: 0.08, // Very reduced from 0.15
                blending: THREE.AdditiveBlending
            });
            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            glow.scale.multiplyScalar(1.1); // Reduced scale
            
            // FIXED: Prevent frustum culling for enemy glow
            glow.visible = true;
            glow.frustumCulled = false;
            
            enemy.add(glow);
            
            // Position randomly within galaxy (doubled scale)
            const angle = Math.random() * Math.PI * 2;
            const distance = 400 + Math.random() * (galaxyType.size - 200); // Doubled
            enemy.position.set(
                galaxyX + Math.cos(angle) * distance,
                galaxyY + (Math.random() - 0.5) * 400, // Doubled
                galaxyZ + Math.sin(angle) * distance
            );
            
            // ENHANCED: Use dynamic health based on difficulty
            enemy.userData = {
                name: `${galaxyType.faction} Hostile ${i + 1}`,
                type: 'enemy',
                health: getEnemyHealthForDifficulty(false, false, false), // DYNAMIC HEALTH
                maxHealth: getEnemyHealthForDifficulty(false, false, false), // DYNAMIC HEALTH
                speed: 0.8 + Math.random() * 1.5,
                aggression: Math.random(),
                patrolCenter: new THREE.Vector3(galaxyX, galaxyY, galaxyZ),
                patrolRadius: distance,
                lastAttack: 0,
                isActive: false,
                visible: true, // ENSURE ENEMIES ARE VISIBLE
                galaxyId: g,
                galaxyColor: shapeData.color,
                swarmTarget: null,
                circlePhase: Math.random() * Math.PI * 2,
                attackMode: 'patrol',
                detectionRange: 1600, // Doubled
                firingRange: 240, // Doubled
                isLocal: false, // Mark as distant galaxy enemy
                isBoss: false,
                isBossSupport: false
            };
            
            // FIXED: ENSURE THREE.JS VISIBILITY AND PREVENT FRUSTUM CULLING
            enemy.visible = true;
            enemy.frustumCulled = false; // Prevent frustum culling issues
            
            scene.add(enemy);
            enemies.push(enemy);
        }
    }
    
    // Create local galaxy enemies (Martian Pirates) - doubled scale with dynamic health
    const localSystemOffset = { x: 2000, y: 0, z: 1200 }; // Doubled
    for (let i = 0; i < 10; i++) {
        const enemyGeometry = createEnemyGeometry(0);
        
        // IMPROVED LOCAL ENEMY VISIBILITY
        const enemyMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0xff4444).multiplyScalar(0.9), // More saturated red
            roughness: 0.6,
            metalness: 0.4,
            emissive: new THREE.Color(0xff4444).multiplyScalar(0.1), // Reduced glow
            emissiveIntensity: 0.3
        });
        
        const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
        
        // Reduced glow effect
        const glowGeometry = enemyGeometry.clone();
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.08, // Very reduced
            blending: THREE.AdditiveBlending
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.scale.multiplyScalar(1.1);
        
        // FIXED: Prevent frustum culling for local enemy glow
        glow.visible = true;
        glow.frustumCulled = false;
        
        enemy.add(glow);
        
        // Position around local system (doubled scale)
        const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
        const distance = 1800 + Math.random() * 1200; // CHANGED: 1800-3000 instead of 600-2200 for safe start
        enemy.position.set(
            localSystemOffset.x + Math.cos(angle) * distance,
            localSystemOffset.y + (Math.random() - 0.5) * 200, // Doubled
            localSystemOffset.z + Math.sin(angle) * distance
        );
        
        // ENHANCED: Use dynamic health for local enemies
        enemy.userData = {
            name: `Martian Pirate ${i + 1}`,
            type: 'enemy',
            health: getEnemyHealthForDifficulty(true, false, false), // DYNAMIC HEALTH
            maxHealth: getEnemyHealthForDifficulty(true, false, false), // DYNAMIC HEALTH
            speed: 1.2 + Math.random() * 1.0,
            aggression: Math.random(),
            patrolCenter: new THREE.Vector3(localSystemOffset.x, localSystemOffset.y, localSystemOffset.z),
            patrolRadius: distance,
            lastAttack: 0,
            isActive: false,
            visible: true, // ENSURE VISIBILITY
            galaxyId: -1,
            galaxyColor: 0xff4444,
            swarmTarget: null,
            circlePhase: Math.random() * Math.PI * 2,
            attackMode: 'patrol',
            isLocal: true, // Mark as local galaxy enemy
            detectionRange: 1600, // Doubled
            firingRange: 240, // Doubled
            isBoss: false,
            isBossSupport: false
        };
        
        // FIXED: ENSURE THREE.JS VISIBILITY AND PREVENT FRUSTUM CULLING
        enemy.visible = true;
        enemy.frustumCulled = false; // Prevent frustum culling issues
        
        scene.add(enemy);
        enemies.push(enemy);
    }
    
    console.log(`Created ${enemies.length} enemy ships with enhanced visibility and progressive difficulty (DOUBLED SCALE)`);
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
        ring.frustumCulled = false;
        
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
        spiralSpeed: 0.02 + Math.random() * 0.03
    };
    
    scene.add(wormholeGroup);
    wormholes.push(wormholeGroup);
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
            opacity: 0.4
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
    const nebulaCount = 8;
    
    for (let i = 0; i < nebulaCount; i++) {
        const nebulaGroup = new THREE.Group();
        
        // Position in galaxy regions (doubled scale)
        const universeRadius = 30000; // Doubled
        const angle = (i / nebulaCount) * Math.PI * 2;
        const distance = 16000 + Math.random() * universeRadius; // Doubled
        
        const nebulaX = Math.cos(angle) * distance;
        const nebulaZ = Math.sin(angle) * distance;
        const nebulaY = (Math.random() - 0.5) * 4000; // Doubled
        
        // Create nebula cloud particles
        const particleCount = 1000;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        
        const nebulaColor = new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
        const nebulaSize = 1600 + Math.random() * 2400; // Doubled
        
        for (let j = 0; j < particleCount; j++) {
            const radius = Math.pow(Math.random(), 0.5) * nebulaSize;
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.random() - 0.5) * Math.PI * 0.5;
            
            positions[j * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[j * 3 + 1] = radius * Math.cos(phi) * (Math.random() - 0.5) * 0.6; // Doubled
            positions[j * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
            
            const colorVariation = nebulaColor.clone();
            colorVariation.offsetHSL((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.3);
            
            colors[j * 3] = colorVariation.r;
            colors[j * 3 + 1] = colorVariation.g;
            colors[j * 3 + 2] = colorVariation.b;
        }
        
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const nebulaMaterial = new THREE.PointsMaterial({
            size: 6, // Doubled
            transparent: true,
            opacity: 0.6,
            vertexColors: true,
            blending: THREE.AdditiveBlending
        });
        
        const nebulaPoints = new THREE.Points(particleGeometry, nebulaMaterial);
        
        // FIXED: Prevent frustum culling for nebula points
        nebulaPoints.visible = true;
        nebulaPoints.frustumCulled = false;
        
        nebulaGroup.add(nebulaPoints);
        
        nebulaGroup.position.set(nebulaX, nebulaY, nebulaZ);
        
        // FIXED: Prevent frustum culling for nebula group
        nebulaGroup.visible = true;
        nebulaGroup.frustumCulled = false;
        
        nebulaGroup.userData = {
            name: `${['Orion', 'Eagle', 'Crab', 'Rosette', 'Horsehead', 'Flame', 'Lagoon', 'Helix'][i]} Nebula`,
            type: 'nebula',
            size: nebulaSize,
            color: nebulaColor,
            rotationSpeed: (Math.random() - 0.5) * 0.001
        };
        
        scene.add(nebulaGroup);
        nebulaClouds.push(nebulaGroup);
    }
    
    console.log(`Created ${nebulaClouds.length} enhanced nebula clouds (DOUBLED SCALE)`);
}

function createAsteroidBelts() {
    // Create 1-2 asteroid belts per galaxy, orbiting black holes (doubled scale)
    galaxyTypes.forEach((galaxyType, galaxyIndex) => {
        const universeRadius = 40000; // Doubled
        const mapPos = galaxyMapPositions[galaxyIndex];
        
        const galaxyX = (mapPos.x - 0.5) * universeRadius * 2;
        const galaxyZ = (mapPos.y - 0.5) * universeRadius * 2;
        const galaxyY = (Math.random() - 0.5) * 3000; // Doubled
        
        const beltCount = Math.random() > 0.5 ? 2 : 1;
        
        for (let b = 0; b < beltCount; b++) {
            const beltGroup = new THREE.Group();
            
            const centerPosition = new THREE.Vector3(galaxyX, galaxyY, galaxyZ);
            
            // Large asteroid belt orbiting the black hole (doubled scale)
            const asteroidCount = 300 + Math.random() * 500;
            const beltRadius = 1600 + Math.random() * 2400; // Doubled
            const beltWidth = 400 + Math.random() * 800; // Doubled
            
            for (let j = 0; j < asteroidCount; j++) {
                // FIXED: Asteroids now destructible with health
                const asteroidGeometry = new THREE.DodecahedronGeometry(2 + Math.random() * 4, 0);
                
                const hue = 0.08 + Math.random() * 0.1;
                const saturation = 0.2 + Math.random() * 0.3;
                const lightness = 0.15 + Math.random() * 0.25;
                
                const asteroidMaterial = new THREE.MeshLambertMaterial({
                    color: new THREE.Color().setHSL(hue, saturation, lightness),
                    emissive: new THREE.Color().setHSL(hue, saturation * 0.3, lightness * 0.1)
                });
                
                const asteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);
                
                // FIXED: Prevent frustum culling for asteroids
                asteroid.visible = true;
                asteroid.frustumCulled = false;
                
                // Position in huge ring formation around black hole (doubled scale)
                const ringAngle = (j / asteroidCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
                const ringDistance = beltRadius + (Math.random() - 0.5) * beltWidth;
                const ringHeight = (Math.random() - 0.5) * 200; // Doubled
                
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
                
                // FIXED: Make asteroids destructible with proper health system
                asteroid.userData = {
                    name: `${galaxyType.name} Asteroid ${j + 1}`,
                    type: 'asteroid',
                    health: 2, // Doubled health - requires 2 hits to destroy
                    maxHealth: 2,
                    orbitSpeed: 0.0005 + Math.random() * 0.001,
                    rotationSpeed: (Math.random() - 0.5) * 0.015,
                    beltCenter: centerPosition,
                    orbitRadius: ringDistance,
                    orbitPhase: ringAngle,
                    galaxyId: galaxyIndex,
                    isTargetable: true,
                    visible: true,
                    isDestructible: true, // FIXED: Mark as destructible
                    beltGroup: beltGroup // Reference to parent belt group
                };
                
                beltGroup.add(asteroid);
                planets.push(asteroid);
            }
            
            beltGroup.position.copy(centerPosition);
            
            // FIXED: Prevent frustum culling for belt group
            beltGroup.visible = true;
            beltGroup.frustumCulled = false;
            
            beltGroup.userData = {
                name: `${galaxyType.name} Galaxy Asteroid Belt ${b + 1}`,
                type: 'asteroidBelt',
                center: centerPosition,
                radius: beltRadius,
                asteroidCount: asteroidCount,
                galaxyId: galaxyIndex
            };
            
            scene.add(beltGroup);
            asteroidBelts.push(beltGroup);
        }
    });
    
    console.log(`Created ${asteroidBelts.length} massive asteroid belts (DOUBLED SCALE)`);
}

function isPositionTooClose(position, minDistance) {
    for (let planet of planets) {
        if (position.distanceTo(planet.position) < minDistance) {
            return true;
        }
    }
    return false;
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
    
    // FIXED: Boss system exports
    window.bossSystem = bossSystem;
    window.checkAndSpawnBoss = checkAndSpawnBoss;
    window.spawnBossForGalaxy = spawnBossForGalaxy;
    window.spawnBossSupport = spawnBossSupport;
    window.checkBossVictory = checkBossVictory;
    
    // Core creation functions
    window.createEnhancedStarfield = createEnhancedStarfield;
    window.createOptimizedPlanets = createOptimizedPlanets;
    window.createEnemies = createEnemies;
    window.createEnhancedComets = createEnhancedComets;
    window.createEnhancedWormholes = createEnhancedWormholes;
    window.createNebulas = createNebulas;
    window.createAsteroidBelts = createAsteroidBelts;
    
    // Utility functions
    window.generatePlanetName = generatePlanetName;
    window.createEnemyGeometry = createEnemyGeometry;
    window.spawnEnhancedWormhole = spawnEnhancedWormhole;
    window.createSunSpikes = createSunSpikes;
    window.createPlasmaTendril = createPlasmaTendril;
    window.isPositionTooClose = isPositionTooClose;
    
    // Data exports
    window.galaxyTypes = galaxyTypes;
    window.galaxyMapPositions = galaxyMapPositions;
    window.enemyShapes = enemyShapes;
    window.galaxyEnemyLimits = galaxyEnemyLimits;
    
    console.log('Enhanced game objects with fixed boss system and asteroid destruction loaded - All functions exported');
}