// Outer Interstellar Systems - Two distinct sets of deep space systems
// HYBRID — Ben, 2026-10-10: "outer systems planets and asteroids ... are
// jumping". Every motion step here was per FRAME; Sol's planets are dt-scaled
// (gameState.dtFrames), so under uneven frame times only these hopped.
function _osDt() { return (typeof gameState !== 'undefined' && gameState.dtFrames > 0) ? gameState.dtFrames : 1; }
// SET 1: 16 Exotic Core Systems (60,000-75,000 units - Middle Zone) - Supernova/Plasma/Solar Storm cores - ALWAYS VISIBLE
// SET 2: 12 BORG Patrol Systems (75,000-90,000 units - Outer Zone) - Bright stars with BORG drone patrols

// Prevent re-declaration errors from browser cache/hot-reload
if (!window.outerInterstellarSystems) {
    window.outerInterstellarSystems = [];
}

if (!window.outerSystemNames) {
    window.outerSystemNames = [
        "Void's Edge Nexus",
        "Deep Space Terminus",
        "Stellar Graveyard Alpha",
        "The Far Reaches",
        "Beyond the Veil",
        "Outer Darkness Station",
        "Edge of Creation",
        "The Last Light",
        "Stellar Wasteland",
        "Deep Void Cluster",
        "The Forgotten Reaches",
        "Boundary's End",
        "Final Frontier Node",
        "The Great Empty",
        "Deep Space Refuge",
        "The Outer Limits"
    ];
}

if (!window.borgSystemNames) {
    window.borgSystemNames = [
        "Frontier's Edge",
        "Void Sentinel",
        "Dark Boundary",
        "Outer Reach",
        "Silent Watch",
        "Deep Patrol Zone",
        "Rim Guardian",
        "Far Watch Station",
        "Edge Warden",
        "Outer Perimeter",
        "Last Light",
        "Final Watch"
    ];
}

// Local references for code convenience
const outerInterstellarSystems = window.outerInterstellarSystems;
const outerSystemNames = window.outerSystemNames;
const borgSystemNames = window.borgSystemNames;

// =============================================================================
// MAIN CREATION FUNCTION - Creates BOTH system sets
// =============================================================================

// HYBRID (solScale:big): outer systems join the size ladder (HY_LADDER in
// game-objects.js): stars, planets and orbits x HY_LADDER.OUTER_K, then placed
// by the HY_SCALE spacing rule. 1 under ?hy=solScale:overhaul.
function _hyOuterK() {
    return (typeof _hyScaleOn === 'function' && _hyScaleOn() && window.HY_LADDER) ? window.HY_LADDER.OUTER_K : 1;
}

// package N (scale2): the universe factor (HY_SCALE.UNIVERSE_K, game-objects.js) —
// the outer shells move out with everything else; 1 under ?hy=solScale:overhaul.
function _hyOuterU() {
    return (typeof window !== 'undefined' && typeof window._hyU === 'function') ? window._hyU() : 1;
}

function createOuterInterstellarSystems() {
    console.log('🌌 Creating outer interstellar systems in deep space...');

    // package V (outer): under solScale:big the outer systems are rebuilt as
    // the FRONTIER — 28 themed systems on a shell beyond every galaxy and
    // nebula (HY_OUTER below). ?hy=solScale:overhaul keeps the classic sets.
    if (_osFrontierOn()) {
        if (outerInterstellarSystems.length) { console.warn('outer systems already built'); return; }
        _osBuildFrontier();
        return;
    }

    // SET 1: Create 16 exotic core systems (40,000-100,000 units)
    console.log('  Creating SET 1: 16 exotic core systems (Supernova/Plasma/Solar)...');
    createExoticCoreSystems();

    // SET 2: Create 12 BORG patrol systems (75,000-85,000 units)
    console.log('  Creating SET 2: 12 BORG patrol systems (Bright stars + BORG)...');
    createBorgPatrolSystems();

    console.log(`✅ Created ${outerInterstellarSystems.length} total outer interstellar systems`);
    if (typeof window._hyPlaceOuterSystems === 'function') {
        try { window._hyPlaceOuterSystems(); } catch (e) { console.warn('HYBRID scale (outer systems):', e); }
    }
}

// =============================================================================
// SET 1: EXOTIC CORE SYSTEMS (16 systems, 60k-75k units - Middle Zone)
// =============================================================================

function createExoticCoreSystems() {
    const innerBoundary = 45000 * _hyOuterU();
    const outerBoundary = 75000 * _hyOuterU();
    const targetRadius = (innerBoundary + outerBoundary) / 2; // ~67,500
    const radiusVariation = 12500 * _hyOuterU();

    // Randomly select half the systems to be 2x size
    const indices = Array.from({length: 16}, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const largeSet = new Set(indices.slice(0, 8));

    for (let i = 0; i < 16; i++) {
        // Spherical distribution
        const phi = (i / 16) * Math.PI * 2;
        const theta = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.3;
        const radius = targetRadius + (Math.random() - 0.5) * radiusVariation;

        const x = radius * Math.sin(theta) * Math.cos(phi);
        const y = radius * Math.cos(theta);
        const z = radius * Math.sin(theta) * Math.sin(phi);

        const systemCenter = new THREE.Vector3(x, y, z);
        const centerTypes = ['supernova', 'plasma_storm', 'solar_storm'];
        const centerType = centerTypes[Math.floor(Math.random() * centerTypes.length)];

        const scale = (largeSet.has(i) ? 2 : 1) * _hyOuterK();
        createExoticSystem(systemCenter, outerSystemNames[i], centerType, i, scale);
    }
}

function createExoticSystem(center, name, centerType, systemId, scale) {
    const s = scale || 1;
    const systemGroup = new THREE.Group();
    systemGroup.position.copy(center);

    // Generate random tilt for THIS SYSTEM
    const systemTiltX = (Math.random() - 0.5) * Math.PI * 0.4;
    const systemTiltZ = (Math.random() - 0.5) * Math.PI * 0.4;

    // CMB color for this system
    const cmbColors = [0xff6b35, 0xff9933, 0xffd700, 0xffffff, 0xffaa88];
    const systemColor = cmbColors[Math.floor(Math.random() * cmbColors.length)];

    systemGroup.userData = {
        name: name,
        type: 'outer_interstellar_system',
        systemType: 'exotic_core',
        systemId: systemId,
        location: 'Unexplored Interstellar Space',
        centerType: centerType,
        orbiters: [],
        discovered: false,
        tiltX: systemTiltX,
        tiltZ: systemTiltZ,
        systemColor: systemColor,
        scale: s
    };

    // Create center object
    if (centerType === 'supernova') {
        createSystemSupernova(center, systemGroup);
    } else if (centerType === 'plasma_storm') {
        createSystemPlasmaStorm(center, systemGroup);
    } else {
        createSystemSolarStorm(center, systemGroup);
    }

    // Orbiting brown dwarfs (2-4)
    const brownDwarfCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < brownDwarfCount; i++) {
        const orbitRadius = (800 + Math.random() * 1200) * s;
        createOrbitingBrownDwarf(center, orbitRadius, i, systemGroup);
        createSystemOrbitLine(center, orbitRadius, systemGroup);
    }

    // Orbiting pulsars (1-3)
    const pulsarCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pulsarCount; i++) {
        const orbitRadius = (1500 + Math.random() * 1500) * s;
        createOrbitingPulsar(center, orbitRadius, i, systemGroup);
        createSystemOrbitLine(center, orbitRadius, systemGroup);
    }

    // Asteroid field
    const asteroidOrbitRadius = (600 + Math.random() * 800) * s;
    const asteroidCount = 20 + Math.floor(Math.random() * 30);
    for (let i = 0; i < asteroidCount; i++) {
        createOrbitingAsteroid(center, asteroidOrbitRadius, i, systemGroup);
    }

    createSystemOrbitLine(center, asteroidOrbitRadius, systemGroup);

    // CREATE STARFIELD FOR THIS SYSTEM
    const maxOrbitRadius = (1500 + 1500) * s;
    const starfieldRadius = maxOrbitRadius * 0.5;
    createSystemStarfield(starfieldRadius, systemGroup);
    systemGroup.userData._hyEdge = maxOrbitRadius + 60 * s;   // HYBRID: placement edge
    systemGroup.userData._hyR = 80 * s;

    // CREATE 1 COSMIC FEATURE in orbit (for gravitational slingshots and map visibility)
    createCosmicFeature(systemGroup, maxOrbitRadius);

    scene.add(systemGroup);
    outerInterstellarSystems.push(systemGroup);

    const sizeLabel = s > 1 ? ' (2x)' : '';
    console.log(`    🌟 ${name}: ${centerType}${sizeLabel} at ${center.length().toFixed(0)} units`);
}

// =============================================================================
// SET 2: BORG PATROL SYSTEMS (12 systems, 75k-90k units - Outer Zone)
// =============================================================================

function createBorgPatrolSystems() {
    const minDistance = 65000 * _hyOuterU();
    const maxDistance = 90000 * _hyOuterU();

    for (let i = 0; i < 12; i++) {
        // Random spherical distribution (not along any single axis plane)
        const phi = Math.random() * Math.PI * 2;
        const theta = Math.acos(2 * Math.random() - 1);
        const radius = minDistance + Math.random() * (maxDistance - minDistance);

        // Convert spherical to cartesian coordinates
        const x = radius * Math.sin(theta) * Math.cos(phi);
        const y = radius * Math.sin(theta) * Math.sin(phi);
        const z = radius * Math.cos(theta);

        const systemCenter = new THREE.Vector3(x, y, z);

        createBorgSystem(systemCenter, i);
    }
}

function createBorgSystem(center, systemId) {
    const systemGroup = new THREE.Group();
    systemGroup.frustumCulled = false;  // Prevent system from being culled
    systemGroup.position.copy(center);

    // Generate random tilt for THIS SYSTEM
    const systemTiltX = (Math.random() - 0.5) * Math.PI * 0.6;
    const systemTiltZ = (Math.random() - 0.5) * Math.PI * 0.6;

    // Bright star colors
    const starColors = [
        { color: 0xFFFFFF, emissive: 0xFFFFFF, name: 'White' },
        { color: 0xFFFF99, emissive: 0xFFFF99, name: 'Yellow-White' },
        { color: 0xFFDD88, emissive: 0xFFDD88, name: 'Yellow' },
        { color: 0xFFAAAA, emissive: 0xFFAAAA, name: 'Orange' },
        { color: 0xAACCFF, emissive: 0xAACCFF, name: 'Blue-White' }
    ];

    const starType = starColors[Math.floor(Math.random() * starColors.length)];

    systemGroup.userData = {
        name: borgSystemNames[systemId],
        type: 'outer_interstellar_system',
        systemType: 'borg_patrol',
        systemId: 16 + systemId, // Start at 16 to avoid ID conflicts
        location: 'Unexplored Interstellar Space',
        starType: starType.name,
        orbiters: [],
        drones: [],
        cosmicFeature: null,
        discovered: false,
        tiltX: systemTiltX,
        tiltZ: systemTiltZ,
        systemColor: starType.color,
        hasBorg: true
    };

    // Create bright star at center
    createBrightStar(systemGroup, starType);

    // Create 2-5 planets orbiting the star
    const planetCount = 2 + Math.floor(Math.random() * 4);
    let maxOrbitRadius = 0;

    for (let i = 0; i < planetCount; i++) {
        // Original orbit radii
        // package N (scale2): the planets joined HY_LADDER.FIELD (240-620),
        // so the orbits widen (OUTER_ORBIT_K) and the jitter shrinks — two
        // 620 worlds need >= ORBIT_K x 1,240 between orbits, never 200 x K.
        const orbitRadius = _hyOuterK() > 1
            ? (800 + (i * 600) + Math.random() * 150) * window.HY_LADDER.OUTER_ORBIT_K
            : (800 + (i * 600) + Math.random() * 400) * _hyOuterK();
        maxOrbitRadius = Math.max(maxOrbitRadius, orbitRadius);
        createOrbitingPlanet(systemGroup, orbitRadius, i);
        createSystemOrbitLine(center, orbitRadius, systemGroup);
    }

    // Create rotating starfield
    const starfieldRadius = maxOrbitRadius * 0.5;
    createSystemStarfield(starfieldRadius, systemGroup);

    // Create 1 BORG Cube (100HP boss) patrolling the system
    systemGroup.userData._hyEdge = maxOrbitRadius + (_hyOuterK() > 1 ? window.HY_LADDER.FIELD[1] : 60);   // HYBRID: placement edge
    createBorgCubeForSystem(systemGroup, maxOrbitRadius);

    // Create 1 cosmic feature in orbit
    createCosmicFeature(systemGroup, maxOrbitRadius);

    scene.add(systemGroup);
    outerInterstellarSystems.push(systemGroup);

    console.log(`    🟩 Unknown System #${systemId + 1}: ${starType.name} star with ${planetCount} planets and 1 BORG cube at ${center.length().toFixed(0)} units`);
}

// =============================================================================
// EXOTIC CORE CENTER OBJECTS (Supernova, Plasma Storm, Solar Storm)
// =============================================================================

function createSystemSupernova(center, systemGroup) {
    const s = systemGroup.userData.scale || 1;
    const coreGeo = new THREE.SphereGeometry(80 * s, 32, 32);
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff6600,
        emissiveIntensity: 2,
        roughness: 0.2,
        metalness: 0.5
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(0, 0, 0);

    core.userData = {
        type: 'supernova',
        name: `${systemGroup.userData.name} Core`,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: 80 * s,
        mass: 3.0,
        slingshotMultiplier: 3.0,
        isOuterSystem: true
    };

    systemGroup.add(core);
    systemGroup.userData.centerObject = core;

    // Glow layers
    for (let i = 0; i < 3; i++) {
        const size = (60 + i * 30) * s;
        const opacity = 0.4 - i * 0.1;
        const glowGeo = new THREE.SphereGeometry(size, 24, 24);
        const glowMat = new THREE.MeshBasicMaterial({
            color: i === 0 ? 0xff8800 : 0xff4400,
            transparent: true,
            opacity: opacity,
            blending: THREE.AdditiveBlending
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.userData.baseOpacity = opacity;
        glow.position.set(0, 0, 0);
        systemGroup.add(glow);
    }

    const light = new THREE.PointLight(0xff6600, 15, 5000);
    light.position.set(0, 0, 0);
    systemGroup.add(light);
}

function createSystemPlasmaStorm(center, systemGroup) {
    const s = systemGroup.userData.scale || 1;
    const coreGeo = new THREE.SphereGeometry(60 * s, 32, 32);
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0xaa44ff,
        emissive: 0xaa44ff,
        emissiveIntensity: 2,
        roughness: 0.2,
        metalness: 0.4
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(0, 0, 0);

    core.userData = {
        type: 'plasma_storm',
        name: `${systemGroup.userData.name} Core`,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: 60 * s,
        mass: 2.5,
        slingshotMultiplier: 2.8,
        isOuterSystem: true
    };

    systemGroup.add(core);
    systemGroup.userData.centerObject = core;

    // Plasma clouds
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const cloudGeo = new THREE.SphereGeometry(20 * s, 16, 16);
        const cloudMat = new THREE.MeshBasicMaterial({
            color: 0x8844ff,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        const cloud = new THREE.Mesh(cloudGeo, cloudMat);
        cloud.userData.baseOpacity = 0.6;
        cloud.position.set(
            Math.cos(angle) * 50 * s,
            0,
            Math.sin(angle) * 50 * s
        );
        systemGroup.add(cloud);
    }

    const light = new THREE.PointLight(0xaa44ff, 12, 5000);
    light.position.set(0, 0, 0);
    systemGroup.add(light);
}

function createSystemSolarStorm(center, systemGroup) {
    const s = systemGroup.userData.scale || 1;
    const coreGeo = new THREE.SphereGeometry(70 * s, 32, 32);
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 2,
        roughness: 0.3,
        metalness: 0.6
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(0, 0, 0);

    core.userData = {
        type: 'solar_storm',
        name: `${systemGroup.userData.name} Core`,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: 70 * s,
        mass: 2.0,
        slingshotMultiplier: 2.2,
        isOuterSystem: true
    };

    systemGroup.add(core);
    systemGroup.userData.centerObject = core;

    // Flares
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const flareGeo = new THREE.ConeGeometry(10 * s, 75 * s, 8);
        const flareMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending
        });
        const flare = new THREE.Mesh(flareGeo, flareMat);
        flare.position.set(
            Math.cos(angle) * 45 * s,
            0,
            Math.sin(angle) * 45 * s
        );
        flare.lookAt(new THREE.Vector3(
            Math.cos(angle) * 100 * s,
            0,
            Math.sin(angle) * 100 * s
        ));
        systemGroup.add(flare);
        flare.userData.baseOpacity = 0.7;
    }

    const light = new THREE.PointLight(0xffff00, 18, 5000);
    light.position.set(0, 0, 0);
    systemGroup.add(light);
}

// =============================================================================
// EXOTIC SYSTEM ORBITERS (Brown Dwarfs, Pulsars, Asteroids)
// =============================================================================

function createOrbitingBrownDwarf(center, orbitRadius, index, systemGroup) {
    const s = systemGroup.userData.scale || 1;
    const geo = new THREE.SphereGeometry(35 * s, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x8b4513,
        metalness: 0.3,
        roughness: 0.7
    });
    const dwarf = new THREE.Mesh(geo, mat);

    const angle = (index / 4) * Math.PI * 2;
    dwarf.position.set(
        Math.cos(angle) * orbitRadius,
        0,
        Math.sin(angle) * orbitRadius
    );

    dwarf.userData = {
        type: 'brown_dwarf',
        name: `${systemGroup.userData.name} Brown Dwarf ${index + 1}`,
        orbitCenter: new THREE.Vector3(0, 0, 0),
        orbitRadius: orbitRadius,
        orbitSpeed: 0.0003 + Math.random() * 0.0004,
        orbitAngle: angle,
        systemId: systemGroup.userData.systemId,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: 35 * s,
        mass: 0.08,
        slingshotMultiplier: 1.3,
        isOuterSystem: true
    };

    systemGroup.userData.orbiters.push(dwarf);
    systemGroup.add(dwarf);

    return dwarf;
}

function createOrbitingPulsar(center, orbitRadius, index, systemGroup) {
    const s = systemGroup.userData.scale || 1;
    const coreGeo = new THREE.SphereGeometry(20 * s, 16, 16);
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0x44eeff,
        emissive: 0x44eeff,
        emissiveIntensity: 3,
        roughness: 0.1,
        metalness: 0.8
    });
    const pulsar = new THREE.Mesh(coreGeo, coreMat);

    const angle = (index / 3) * Math.PI * 2;
    pulsar.position.set(
        Math.cos(angle) * orbitRadius,
        0,
        Math.sin(angle) * orbitRadius
    );

    const ringGeo = new THREE.TorusGeometry(40 * s, 3 * s, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x88ffff,
        transparent: true,
        opacity: 0.5
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    pulsar.add(ring);

    pulsar.userData = {
        type: 'pulsar',
        name: `${systemGroup.userData.name} Pulsar ${index + 1}`,
        orbitCenter: new THREE.Vector3(0, 0, 0),
        orbitRadius: orbitRadius,
        orbitSpeed: 0.0002 + Math.random() * 0.0003,
        orbitAngle: angle,
        rotationSpeed: 0.02 + Math.random() * 0.03,
        systemId: systemGroup.userData.systemId,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: 20 * s,
        mass: 1.4,
        slingshotMultiplier: 2.5,
        isOuterSystem: true
    };

    systemGroup.userData.orbiters.push(pulsar);
    systemGroup.add(pulsar);

    return pulsar;
}

function createOrbitingAsteroid(center, orbitRadius, index, systemGroup) {
    const size = 5 + Math.random() * 10;
    const geo = new THREE.DodecahedronGeometry(size, 0);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 0.4,
        roughness: 0.9
    });
    const asteroid = new THREE.Mesh(geo, mat);

    const angle = (index / 50) * Math.PI * 2;
    const radiusVar = orbitRadius + (Math.random() - 0.5) * 100;

    asteroid.position.set(
        Math.cos(angle) * radiusVar,
        (Math.random() - 0.5) * 50,
        Math.sin(angle) * radiusVar
    );

    asteroid.userData = {
        type: 'outer_asteroid',
        name: 'Asteroid',
        health: Math.ceil(size / 5),
        orbitCenter: new THREE.Vector3(0, 0, 0),
        orbitRadius: radiusVar,
        orbitSpeed: 0.0007 + Math.random() * 0.0008,
        orbitAngle: angle,
        systemId: systemGroup.userData.systemId,
        rotationSpeedX: (Math.random() - 0.5) * 0.02,
        rotationSpeedY: (Math.random() - 0.5) * 0.02,
        rotationSpeedZ: (Math.random() - 0.5) * 0.02
    };

    // HYBRID (asteroids: original): SIZE_K bigger, drawn like ORIGINAL's
    // (health stays ORIGINAL's). See HY_ASTEROIDS in game-objects.js.
    if (typeof _hyAstOn === 'function' && _hyAstOn()) {
        asteroid.scale.setScalar(_hyAstK());
        _hyAstDrawn(asteroid);
    }

    systemGroup.userData.orbiters.push(asteroid);
    systemGroup.add(asteroid);
    return asteroid;
}

// =============================================================================
// BORG SYSTEM CENTER STAR
// =============================================================================

function createBrightStar(systemGroup, starType) {
    // Central star — original size.
    // (stars get their own factor: the 2.5x glow shell below must stay under
    // the self-test's 900 u bubble limit)
    // package N (scale2): onto the star class (HY_LADDER.star, 650-880).
    const _rawStar = 100 + Math.random() * 50;
    const starRadius = _hyOuterK() > 1
        ? window.HY_LADDER.star[0] + (_rawStar - 100) / 50 * (window.HY_LADDER.star[1] - window.HY_LADDER.star[0])
        : _rawStar;
    systemGroup.userData._hyR = starRadius;

    const starGeo = new THREE.SphereGeometry(starRadius, 32, 32);
    const starMat = new THREE.MeshStandardMaterial({
        color: starType.color,
        emissive: starType.emissive,
        emissiveIntensity: 2.5,
        roughness: 0.1,
        metalness: 0.3
    });
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.set(0, 0, 0);

    star.userData = {
        type: 'star',
        name: `${systemGroup.userData.name} Star`,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: starRadius,
        mass: 5.0,
        slingshotMultiplier: 4.0,
        starType: starType.name,
        isOuterSystem: true
    };

    systemGroup.add(star);
    systemGroup.userData.centerObject = star;

    // Add bright glow layers
    for (let i = 0; i < 3; i++) {
        const glowSize = starRadius * (1.5 + i * 0.5);
        const opacity = 0.5 - i * 0.15;
        const glowGeo = new THREE.SphereGeometry(glowSize, 24, 24);
        const glowMat = new THREE.MeshBasicMaterial({
            color: starType.color,
            transparent: true,
            opacity: opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.userData.baseOpacity = opacity;
        glow.position.set(0, 0, 0);
        systemGroup.add(glow);
    }

    // Add bright point light
    const light = new THREE.PointLight(starType.color, 20, 8000);
    light.position.set(0, 0, 0);
    systemGroup.add(light);
}

// =============================================================================
// BORG SYSTEM ORBITERS (Planets)
// =============================================================================

function createOrbitingPlanet(systemGroup, orbitRadius, index) {
    // package N (scale2): onto the planet band (HY_LADDER.FIELD, 240-620).
    const _rawPlanet = 20 + Math.random() * 40;
    const planetRadius = _hyOuterK() > 1
        ? window.HY_LADDER.FIELD[0] + (_rawPlanet - 20) / 40 * (window.HY_LADDER.FIELD[1] - window.HY_LADDER.FIELD[0])
        : _rawPlanet;

    const planetColors = [
        0x8B7355, 0x4A90E2, 0xE86A17, 0x9B59B6,
        0x2ECC71, 0xE74C3C, 0x95A5A6
    ];

    const planetColor = planetColors[Math.floor(Math.random() * planetColors.length)];

    const geo = new THREE.SphereGeometry(planetRadius, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
        color: planetColor,
        metalness: 0.2,
        roughness: 0.8
    });
    const planet = new THREE.Mesh(geo, mat);

    const angle = (index / 5) * Math.PI * 2;
    planet.position.set(
        Math.cos(angle) * orbitRadius,
        0,
        Math.sin(angle) * orbitRadius
    );

    planet.userData = {
        type: 'outer_planet',
        name: `${systemGroup.userData.name} Planet ${String.fromCharCode(65 + index)}`,
        orbitCenter: new THREE.Vector3(0, 0, 0),
        orbitRadius: orbitRadius,
        orbitSpeed: 0.0002 + Math.random() * 0.0003,
        orbitAngle: angle,
        systemId: systemGroup.userData.systemId,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: planetRadius,
        mass: (_hyOuterK() > 1 ? _rawPlanet * _hyOuterK() : planetRadius) / 40,   // mass as before package N (gravity tuning)
        slingshotMultiplier: 1.5,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        isOuterSystem: true
    };

    systemGroup.userData.orbiters.push(planet);
    systemGroup.add(planet);

    return planet;
}

// =============================================================================
// BORG DRONES (Only in BORG patrol systems)
// =============================================================================

function createBorgCubeForSystem(systemGroup, maxOrbitRadius, patrolR) {
    const cubeGroup = new THREE.Group();
    cubeGroup.frustumCulled = false;

    // Large BORG cube — 50 units, visible at great distance
    const cubeSize = 50;
    const cubeGeo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const cubeMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.9,
        roughness: 0.2,
        emissive: 0x00ff00,
        emissiveIntensity: 0.3
    });
    const cube = new THREE.Mesh(cubeGeo, cubeMat);
    cube.frustumCulled = false;
    cubeGroup.add(cube);

    // Green wireframe glow layer
    const glowGeo = new THREE.BoxGeometry(cubeSize * 1.2, cubeSize * 1.2, cubeSize * 1.2);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.3,
        wireframe: true
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.frustumCulled = false;
    cubeGroup.add(glow);

    // Green glowing edges
    const edgeGeo = new THREE.EdgesGeometry(cubeGeo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    edges.frustumCulled = false;
    cubeGroup.add(edges);

    // Glowing core sphere
    const coreGeo = new THREE.SphereGeometry(15, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.frustumCulled = false;
    cubeGroup.add(core);

    // Invisible hitbox sphere (300u radius) so the raycaster reliably finds
    // the cube even at long encounter distances. The 50u box is far too small
    // to hit at 5000-15000u typical engagement range without near-perfect aim.
    const hitboxGeo = new THREE.SphereGeometry(300, 12, 8);
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
    hitbox.frustumCulled = false;
    hitbox.userData.isHitbox = true;
    cubeGroup.add(hitbox);

    // Patrol orbit
    // package V: a frontier system passes its own patrol ring (inside its edge)
    const patrolRadius = patrolR || (10000 + Math.random() * 5000);
    const angle = Math.random() * Math.PI * 2;
    cubeGroup.position.set(
        Math.cos(angle) * patrolRadius,
        (Math.random() - 0.5) * 1000,
        Math.sin(angle) * patrolRadius
    );

    cubeGroup.userData = {
        type: 'borg_cube',
        name: `BORG Cube [${systemGroup.userData.name}]`,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        orbitRadius: patrolRadius,
        orbitSpeed: 0.0001 + Math.random() * 0.0002,
        orbitAngle: angle,
        orbitCenter: new THREE.Vector3(0, 0, 0),
        rotationSpeed: 0.007,
        health: 100,
        maxHealth: 100,
        hostile: true,
        cubeSize: cubeSize,
        isBorgCube: true,
        speed: 2.0,
        damage: 5,
        detectionRange: 10000,
        firingRange: 500,
        lastAttack: 0,
        pursuing: false,
        droneCount: 0,
        maxDrones: 16,
        drones: [],
        lastDroneSpawn: 0,
        warningShown: false,
        communicationCooldown: 15000,
        lastCommunication: 0
    };

    systemGroup.userData.orbiters.push(cubeGroup);
    systemGroup.userData.drones.push(cubeGroup);
    systemGroup.add(cubeGroup);

    return cubeGroup;
}

function spawnBorgSystemDrone(borgCube, systemGroup) {
    if (!borgCube || borgCube.userData.droneCount >= borgCube.userData.maxDrones) return;

    const droneGeo = new THREE.ConeGeometry(2, 4, 4);
    const droneMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const drone = new THREE.Mesh(droneGeo, droneMat);
    drone.frustumCulled = false;

    // Spawn near cube with random offset
    drone.position.copy(borgCube.position);
    drone.position.x += (Math.random() - 0.5) * 100;
    drone.position.y += (Math.random() - 0.5) * 100;
    drone.position.z += (Math.random() - 0.5) * 100;

    drone.userData = {
        type: 'borg_drone',
        name: `BORG Drone`,
        health: 2,
        maxHealth: 2,
        hostile: true,
        speed: 3.0,
        damage: 2,
        firingRange: 300,
        lastAttack: 0,
        circlePhase: Math.random() * Math.PI * 2,
        parentCube: borgCube,
        cubeSize: 4
    };

    borgCube.userData.drones.push(drone);
    borgCube.userData.droneCount++;
    systemGroup.userData.orbiters.push(drone);
    systemGroup.add(drone);
    return drone;
}

// =============================================================================
// COSMIC FEATURES (Only in BORG patrol systems)
// =============================================================================

function createCosmicFeature(systemGroup, maxOrbitRadius) {
    const features = ['crystal_structure', 'dyson_sphere', 'space_whale'];
    const featureType = features[Math.floor(Math.random() * features.length)];

    const orbitRadius = maxOrbitRadius * 0.8;

    let feature;

    if (featureType === 'crystal_structure') {
        feature = createCrystalStructure();
    } else if (featureType === 'dyson_sphere') {
        feature = createDysonSphere();
    } else {
        feature = createSpaceWhale();
    }

    const angle = Math.random() * Math.PI * 2;
    feature.position.set(
        Math.cos(angle) * orbitRadius,
        (Math.random() - 0.5) * 100,
        Math.sin(angle) * orbitRadius
    );

    feature.userData.orbitRadius = orbitRadius;
    feature.userData.orbitSpeed = 0.00015;
    feature.userData.orbitAngle = angle;
    feature.userData.orbitCenter = new THREE.Vector3(0, 0, 0);
    feature.userData.systemName = systemGroup.userData.name;
    feature.userData.location = 'Unexplored Interstellar Space';
    feature.userData.isOuterSystem = true;

    // Add gravitational properties based on feature type (same as cosmic-features.js)
    if (featureType === 'dyson_sphere') {
        feature.userData.mass = 3.0;
        feature.userData.slingshotMultiplier = 2.8;
        feature.userData.radius = 150;
    } else if (featureType === 'crystal_structure') {
        feature.userData.mass = 1.5;
        feature.userData.slingshotMultiplier = 2.0;
        feature.userData.radius = 80;
    } else if (featureType === 'space_whale') {
        feature.userData.mass = 0.5;
        feature.userData.slingshotMultiplier = 1.2;
        feature.userData.radius = 120;
    }

    systemGroup.userData.orbiters.push(feature);
    systemGroup.userData.cosmicFeature = feature;
    systemGroup.add(feature);

    // ADD TO GLOBAL COSMIC FEATURES ARRAYS for map visibility and physics
    // This ensures they appear as dots on the galactic map and participate in gravitational slingshots
    if (typeof cosmicFeatures !== 'undefined') {
        if (featureType === 'dyson_sphere' && cosmicFeatures.dysonSpheres) {
            cosmicFeatures.dysonSpheres.push(feature);
        } else if (featureType === 'crystal_structure' && cosmicFeatures.crystalFormations) {
            cosmicFeatures.crystalFormations.push(feature);
        } else if (featureType === 'space_whale' && cosmicFeatures.spaceWhales) {
            cosmicFeatures.spaceWhales.push(feature);
        }
    }

    return feature;
}

function createCrystalStructure() {
    const group = new THREE.Group();

    const crystalGeo = new THREE.OctahedronGeometry(80, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
        color: 0x88CCFF,
        metalness: 0.8,
        roughness: 0.1,
        emissive: 0x4488FF,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.9
    });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    group.add(crystal);

    for (let i = 0; i < 5; i++) {
        const smallGeo = new THREE.OctahedronGeometry(20, 0);
        const smallCrystal = new THREE.Mesh(smallGeo, crystalMat);
        const angle = (i / 5) * Math.PI * 2;
        smallCrystal.position.set(
            Math.cos(angle) * 120,
            Math.sin(angle * 2) * 40,
            Math.sin(angle) * 120
        );
        group.add(smallCrystal);
    }

    group.userData = {
        type: 'crystal_structure',
        name: 'Ancient Crystal Formation',
        rotationSpeed: 0.005
    };

    return group;
}

function createDysonSphere() {
    const group = new THREE.Group();

    const sphereGeo = new THREE.SphereGeometry(150, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({
        color: 0xFFAA00,
        wireframe: true,
        transparent: true,
        opacity: 0.6
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    group.add(sphere);

    for (let i = 0; i < 8; i++) {
        const panelGeo = new THREE.BoxGeometry(80, 80, 5);
        const panelMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            metalness: 0.9,
            roughness: 0.1,
            emissive: 0xFFAA00,
            emissiveIntensity: 0.5
        });
        const panel = new THREE.Mesh(panelGeo, panelMat);

        const angle = (i / 8) * Math.PI * 2;
        panel.position.set(
            Math.cos(angle) * 150,
            Math.sin(angle * 2) * 50,
            Math.sin(angle) * 150
        );
        panel.lookAt(0, 0, 0);

        group.add(panel);
    }

    group.userData = {
        type: 'dyson_sphere',
        name: 'Dyson Sphere Remnant',
        rotationSpeed: 0.002
    };

    return group;
}

function createSpaceWhale() {
    const group = new THREE.Group();

    const bodyGeo = new THREE.SphereGeometry(60, 24, 24);
    bodyGeo.scale(2, 1, 1);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x4A5F7F,
        metalness: 0.3,
        roughness: 0.7,
        emissive: 0x2A3F5F,
        emissiveIntensity: 0.3
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    for (let i = 0; i < 2; i++) {
        const finGeo = new THREE.ConeGeometry(40, 80, 8);
        const finMat = new THREE.MeshStandardMaterial({
            color: 0x3A4F6F,
            metalness: 0.2,
            roughness: 0.8
        });
        const fin = new THREE.Mesh(finGeo, finMat);
        fin.rotation.z = Math.PI / 2;
        fin.position.set(-80, i === 0 ? 30 : -30, 0);
        group.add(fin);
    }

    for (let i = 0; i < 2; i++) {
        const eyeGeo = new THREE.SphereGeometry(8, 16, 16);
        const eyeMat = new THREE.MeshBasicMaterial({
            color: 0x00FFFF,
            transparent: true,
            opacity: 0.9
        });
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(100, i === 0 ? 20 : -20, 30);
        group.add(eye);
    }

    group.userData = {
        type: 'space_whale',
        name: 'Cosmic Leviathan',
        rotationSpeed: 0.003,
        swimSpeed: 0.5
    };

    return group;
}

// =============================================================================
// ORBIT LINES (Used by both system types)
// =============================================================================

function createSystemOrbitLine(center, radius, systemGroup) {
    const segments = 128;
    const points = [];

    const tiltX = systemGroup.userData.tiltX;
    const tiltZ = systemGroup.userData.tiltZ;
    const orbitColor = systemGroup.userData.systemColor;

    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        let x = Math.cos(angle) * radius;
        let y = 0;
        let z = Math.sin(angle) * radius;

        const rotatedX = x;
        const rotatedY = y * Math.cos(tiltX) - z * Math.sin(tiltX);
        const rotatedZ = y * Math.sin(tiltX) + z * Math.cos(tiltX);

        const finalX = rotatedX * Math.cos(tiltZ) - rotatedY * Math.sin(tiltZ);
        const finalY = rotatedX * Math.sin(tiltZ) + rotatedY * Math.cos(tiltZ);
        const finalZ = rotatedZ;

        points.push(new THREE.Vector3(finalX, finalY, finalZ));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
        color: orbitColor,
        transparent: true,
        opacity: 0.3
    });
    const line = new THREE.Line(geo, mat);
    line.userData = { type: 'orbit_line', orbitColor: orbitColor };

    systemGroup.add(line);
}

// =============================================================================
// ROTATING STARFIELD (Used by both system types)
// =============================================================================

function createSystemStarfield(maxRadius, systemGroup) {
    const starCount = 300 + Math.floor(Math.random() * 200);
    const starfieldRadius = maxRadius;

    const positions = [];
    const colors = [];
    const sizes = [];

    const starColors = [
        new THREE.Color(0xffffff),
        new THREE.Color(0xffffee),
        new THREE.Color(0xffeeaa),
        new THREE.Color(0xaaccff),
    ];

    for (let i = 0; i < starCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = Math.random() * starfieldRadius;

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        positions.push(x, y, z);

        const starColor = starColors[Math.floor(Math.random() * starColors.length)];
        colors.push(starColor.r, starColor.g, starColor.b);
        sizes.push(1 + Math.random() * 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
        size: 4,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true
    });

    const starfield = new THREE.Points(geometry, material);
    starfield.userData = {
        type: 'system_starfield',
        rotationSpeed: 0.008 + Math.random() * 0.012
    };
    systemGroup.add(starfield);
}

// =============================================================================
// THE FRONTIER (package V, Ben 2026-10-10): "Outer Systems need a makeover and
// should be much further away" and "outer systems planets and asteroids are
// broken ... jumping ... could use a complete recreate and stars should emit
// light". Under solScale:big the 28 outer systems are rebuilt here:
//  - PLACED on a shell beyond every galaxy, nebula and procedural galaxy
//    (SHELL from Sgr A*, CLEAR of every other place's reach), near the plane.
//  - THEMED: each a distinct place in the vector style — a dominant colour, a
//    signature structure (exotic core / Borg cube lattice / crystal garden /
//    dead star husk), planets on package N's ladder, flat-lit vector chrome.
//  - LIT by its own star: one PointLight reaching the system's edge with
//    linear falloff (the light budget in game-objects.js gates it by range),
//    an emissive, toneMapped=false core + corona.
//  - SMOOTH: every motion is dt-scaled every frame from the live host group,
//    initial positions come from the same step (no first-frame snap), nothing
//    is draw-budget-hidden (__dbTris), no whirling starfield, the Borg cube
//    glides back to its patrol ring instead of teleporting, and each system
//    fades between its far beacon dot and its meshes instead of popping.
// Data shape is the classic one (systemType exotic_core / borg_patrol,
// orbiters, centerObject, drones, cosmicFeature) so every reader keeps working.
// Ben: tune the numbers here.
// =============================================================================
const HY_OUTER = {
    SHELL: [310000, 360000],  // system centre distance from Sgr A* (true origin); galaxies reach ~285k, nebulae ~170k, procedural galaxies ~256k
    LAT: 0.36,                // |sin(latitude)| cap: within ~21 deg of the galactic plane
    CLEAR: 25000,             // empty space between a frontier system's edge and any other place's reach (and between two frontier systems)
    TRIES: 600,               // candidate sites per system
    SHOW: 170000,             // a system's meshes draw inside this range (+8% hysteresis); beyond it, only its beacon
    FX_RANGE: 60000,          // signature animations (shells, flares, beams) run inside this range
    BEACON_NEAR: 16000,       // the beacon dot fades out from BEACON_FAR to BEACON_NEAR as the real star takes over
    BEACON_FAR: 45000,
    BEACON_PX: 5,
    LIGHT_I: 2.6,             // star PointLight intensity at the star (linear falloff to the cutoff)
    LIGHT_REACH_K: 1.3,       // cutoff = system edge x this
    CORONA_K: 3.6,            // corona sprite diameter = star radius x 2 x this
    CORONA_FADE_R: [1.4, 3.5],// corona fades out as the camera comes inside these star radii (no screen wash)
    ORBIT_GAP: [900, 1600],   // extra space between two planet orbits (on top of HY_SCALE.ORBIT_K x the two radii)
    PLANETS: { borg: [3, 5], exotic: [1, 2], crystal_garden: [2, 3], dead_star: [2, 4] },
    ROCKS: [26, 38],          // asteroids in an exotic system's ring
    KEEPOUT_K: 1.8,           // an enemy found inside a frontier body's KEEPOUT_K x radius on first sight is moved out
    KEEPOUT_LIVE_K: 1.15,     // ...and any enemy found inside the body itself at any time
    DISCOVER_K: 0.55,         // a system is "discovered" inside this fraction of its edge (min DISCOVER_MIN)
    DISCOVER_MIN: 6000,
    MAP_RIM: 47,              // Universal View: systems past the map radius sit on this rim (% of the map from centre)
};
if (typeof window !== 'undefined') window.HY_OUTER = HY_OUTER;

// Each theme: dominant colour, star colour, planet palette, light colour.
const _OS_THEMES = {
    supernova:      { color: 0xff5a1f, star: 0xffb070, light: 0xff9a50, planets: [0x7a3a22, 0x9a5a3a, 0x5a4a44], label: 'Supernova Remnant' },
    plasma_storm:   { color: 0xb455ff, star: 0xe2b0ff, light: 0xc890ff, planets: [0x4a3a6a, 0x6a4a8a, 0x3a3a5a], label: 'Plasma Storm' },
    solar_storm:    { color: 0xffcc22, star: 0xfff2b0, light: 0xffe08a, planets: [0x8a6a2a, 0xaa7a3a, 0x6a5a3a], label: 'Solar Storm' },
    crystal_garden: { color: 0x33e6ff, star: 0xd8f6ff, light: 0xbfefff, planets: [0x6aaacc, 0x8acce0, 0x4a8aaa], label: 'Crystal Garden' },
    dead_star:      { color: 0x8aa4d0, star: 0xcfdcff, light: 0x9fb4e0, planets: [0x3a3a40, 0x4a4648, 0x2e3238], label: 'Dead Star' },
    borg:           { color: 0x33ff66, star: 0xffffff, light: 0xeaffee, planets: [0x8B7355, 0x4A90E2, 0xE86A17, 0x9B59B6, 0x2ECC71, 0xE74C3C, 0x95A5A6], label: 'Borg Patrol Zone' },
};
const _OS_EXOTIC_ORDER = ['supernova', 'plasma_storm', 'solar_storm', 'crystal_garden', 'dead_star'];

function _osFrontierOn() { return typeof _hyScaleOn === 'function' && _hyScaleOn() && !!window.HY_LADDER; }
function _osRand(a, b) { return a + Math.random() * (b - a); }
function _osPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Orbit step — the ONE place an orbiter's position is written (creation and
// every frame), in the system's tilted plane, from its live angle.
function _osOrbitWrite(o, tiltX, tiltZ) {
    const u = o.userData;
    const x = Math.cos(u.orbitAngle) * u.orbitRadius;
    const y = u.orbitY || 0;
    const z = Math.sin(u.orbitAngle) * u.orbitRadius;
    const ry = y * Math.cos(tiltX) - z * Math.sin(tiltX);
    const rz = y * Math.sin(tiltX) + z * Math.cos(tiltX);
    const fx = x * Math.cos(tiltZ) - ry * Math.sin(tiltZ);
    const fy = x * Math.sin(tiltZ) + ry * Math.cos(tiltZ);
    const c = u.orbitCenter;
    o.position.set(c.x + fx, c.y + fy, c.z + rz);
}

let _osGlowTex = null;
function _osGlowTexture() {
    if (_osGlowTex) return _osGlowTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    gr.addColorStop(0.42, 'rgba(255,255,255,0.22)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    _osGlowTex = new THREE.CanvasTexture(cv);
    return _osGlowTex;
}
function _osFlat(color, opacity, extra) {
    return new THREE.MeshBasicMaterial(Object.assign({ color: color, transparent: true, opacity: opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }, extra || {}));
}
function _osLineMat(color, opacity) {
    return new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false, toneMapped: false });
}
// A vector equator band on a body (retro chrome), scaled with it.
function _osEquator(body, R, color, opacity) {
    const pts = [];
    for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * R * 1.02, 0, Math.sin(a) * R * 1.02)); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), _osLineMat(color, opacity));
    l.userData.baseOpacity = opacity;
    body.add(l);
    return l;
}

// ── the star (or exotic core): emissive body + vector shell + corona + light
function _osStar(g, theme, R, type) {
    const t = _OS_THEMES[theme];
    const ud = g.userData;
    const body = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32),
        new THREE.MeshBasicMaterial({ color: t.star, toneMapped: false }));
    body.userData = {
        type: type, name: ud.name + (type === 'star' ? ' Star' : ' Core'), systemName: ud.name,
        location: 'Unexplored Interstellar Space', radius: R,
        mass: type === 'star' ? 5.0 : 3.0, slingshotMultiplier: type === 'star' ? 4.0 : 3.0,
        isOuterSystem: true, isFrontierStar: true, theme: theme
    };
    g.add(body);
    ud.centerObject = body;
    ud._hyR = R;
    // vector shell: a wire icosahedron just above the surface, slowly turning
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 1.12, 2), _osFlat(t.color, 0.22, { wireframe: true }));
    shell.userData = { baseOpacity: 0.22, _osSpin: 0.0006 };
    g.add(shell);
    // two glow shells (front faces only — invisible from inside, no wash)
    [[1.35, 0.30], [1.8, 0.13]].forEach(function (s) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(R * s[0], 32, 24), _osFlat(t.color, s[1]));
        m.userData.baseOpacity = s[1];
        g.add(m);
    });
    // corona
    const cor = new THREE.Sprite(new THREE.SpriteMaterial({ map: _osGlowTexture(), color: t.star, transparent: true,
        opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    cor.scale.setScalar(R * 2 * HY_OUTER.CORONA_K);
    cor.userData = { baseOpacity: 0.85, _osCorona: true };
    g.add(cor);
    ud._osCorona = cor;
    return body;
}

function _osLight(g, theme, edge) {
    const t = _OS_THEMES[theme];
    const l = new THREE.PointLight(t.light, HY_OUTER.LIGHT_I, edge * HY_OUTER.LIGHT_REACH_K, 1);
    l.position.set(0, 0, 0);
    l.userData.isFrontierLight = true;
    g.add(l);
    g.userData._osLight = l;
    return l;
}

// ── orbiters ────────────────────────────────────────────────────────────────
function _osOrbiter(g, mesh, ud, orbitR, angle, speed) {
    mesh.userData = Object.assign({
        orbitCenter: new THREE.Vector3(0, 0, 0), orbitRadius: orbitR, orbitSpeed: speed, orbitAngle: angle,
        systemId: g.userData.systemId, systemName: g.userData.name, location: 'Unexplored Interstellar Space',
        isOuterSystem: true
    }, ud);
    g.userData.orbiters.push(mesh);
    g.add(mesh);
    return mesh;
}
// angular speed so a body keeps a calm along-orbit pace (u/frame) on any ring
function _osSpeed(orbitR, pace) { return (pace || _osRand(1.2, 2.4)) / Math.max(500, orbitR); }

function _osPlanet(g, theme, orbitR, idx, R) {
    const t = _OS_THEMES[theme];
    const col = theme === 'borg' ? _osPick(t.planets) : t.planets[idx % t.planets.length];
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, metalness: 0.08 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), mat);
    _osOrbiter(g, m, {
        type: 'outer_planet', name: g.userData.name + ' ' + String.fromCharCode(65 + idx),
        radius: R, mass: R / 120, slingshotMultiplier: 1.5, rotationSpeed: (Math.random() - 0.5) * 0.004
    }, orbitR, Math.random() * Math.PI * 2, _osSpeed(orbitR));
    m.rotation.z = (Math.random() - 0.5) * 0.5;
    _osEquator(m, R, t.color, 0.45);
    if (theme === 'borg' && Math.random() < 0.5) {
        // an assimilated world: a green wire lattice over the surface
        const w = new THREE.Mesh(new THREE.SphereGeometry(R * 1.015, 18, 12), _osFlat(0x33ff66, 0.16, { wireframe: true }));
        w.userData.baseOpacity = 0.16;
        m.add(w);
        m.userData.assimilated = true;
    }
    return m;
}

function _osBrownDwarf(g, orbitR, idx) {
    const R = _osRand(450, 620);
    const m = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28),
        new THREE.MeshStandardMaterial({ color: 0x6a3420, emissive: 0x3a0e04, emissiveIntensity: 0.9, roughness: 0.75, metalness: 0.05 }));
    _osOrbiter(g, m, {
        type: 'brown_dwarf', name: g.userData.name + ' Brown Dwarf ' + (idx + 1),
        radius: R, mass: 0.08 * 3.5, slingshotMultiplier: 1.3
    }, orbitR, Math.random() * Math.PI * 2, _osSpeed(orbitR, _osRand(1.0, 1.8)));
    _osEquator(m, R, 0xff6a33, 0.35);
    return m;
}

function _osPulsar(g, orbitR, idx) {
    const R = _osRand(110, 150);
    const m = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), new THREE.MeshBasicMaterial({ color: 0xbff8ff, toneMapped: false }));
    _osOrbiter(g, m, {
        type: 'pulsar', name: g.userData.name + ' Pulsar ' + (idx + 1),
        radius: R, mass: 1.4, slingshotMultiplier: 2.5, rotationSpeed: _osRand(0.03, 0.05)
    }, orbitR, Math.random() * Math.PI * 2, _osSpeed(orbitR, _osRand(1.4, 2.2)));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 2.2, R * 0.12, 6, 48), _osFlat(0x66eeff, 0.55));
    ring.rotation.x = Math.PI / 2; ring.userData.baseOpacity = 0.55;
    m.add(ring);
    // the lighthouse: two beams off the spin axis, sweeping as it turns
    const beamGeo = new THREE.CylinderGeometry(R * 0.08, R * 0.6, R * 16, 10, 1, true);
    beamGeo.translate(0, R * 8.5, 0);
    [1, -1].forEach(function (s) {
        const b = new THREE.Mesh(beamGeo, _osFlat(0x88f4ff, 0.22, { side: THREE.DoubleSide }));
        b.rotation.z = s > 0 ? 0.42 : Math.PI + 0.42;
        b.userData.baseOpacity = 0.22;
        m.add(b);
    });
    return m;
}

function _osRockRing(g, orbitR, count, width) {
    for (let i = 0; i < count; i++) {
        const a = createOrbitingAsteroid(null, orbitR, i, g);   // classic rock (shootable, ORIGINAL look)
        const u = a.userData;
        u.orbitAngle = (i / count) * Math.PI * 2 + Math.random() * 0.12;
        u.orbitRadius = orbitR + (Math.random() - 0.5) * width;
        u.orbitY = (Math.random() - 0.5) * width * 0.25;
        u.orbitSpeed = _osSpeed(u.orbitRadius, _osRand(2.0, 2.8));
        u.isOuterSystem = true;
    }
}

// ── signature structures (static children of the system, slowly animated) ──
function _osSignature(g, theme, R) {
    const t = _OS_THEMES[theme];
    const sig = new THREE.Group();
    sig.userData = { type: 'frontier_signature', theme: theme, _osSig: true };
    if (theme === 'supernova') {
        // remnant filaments: short glowing arcs in a ragged shell 2.4-5 R
        const pos = [], col = [];
        const c1 = new THREE.Color(t.color), c2 = new THREE.Color(0xff2a10);
        for (let i = 0; i < 160; i++) {
            const d = new THREE.Vector3().randomDirection ? new THREE.Vector3().randomDirection() : new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            let r = R * _osRand(2.4, 5.0);
            let p = d.clone().multiplyScalar(r);
            const tan = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0.3)).normalize();
            for (let k = 0; k < 4; k++) {
                const q = p.clone().addScaledVector(tan, R * 0.35).addScaledVector(d, R * (Math.random() - 0.5) * 0.3);
                pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
                const c = Math.random() < 0.5 ? c1 : c2;
                col.push(c.r, c.g, c.b, c.r, c.g, c.b);
                p = q;
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
        ls.userData.baseOpacity = 0.7;
        sig.add(ls);
        const shock = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 3.2, 3), _osFlat(t.color, 0.12, { wireframe: true }));
        shock.userData = { baseOpacity: 0.12, _osPulse: 0.05 };
        sig.add(shock);
        sig.userData._osSpin = 0.00025;
    } else if (theme === 'plasma_storm') {
        // three tilted plasma rings + six plasma blobs riding them
        for (let i = 0; i < 3; i++) {
            const rr = R * (1.7 + i * 0.45);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, R * 0.03, 4, 96), _osFlat(t.color, 0.5));
            ring.rotation.set(Math.PI / 2 + (i - 1) * 0.55, i * 0.7, 0);
            ring.userData = { baseOpacity: 0.5, _osSpin: 0.002 * (i % 2 ? -1 : 1) };
            sig.add(ring);
        }
        for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2;
            const b = new THREE.Mesh(new THREE.SphereGeometry(R * 0.22, 16, 12), _osFlat(0xd28cff, 0.55));
            b.position.set(Math.cos(a) * R * 2.0, Math.sin(a * 2) * R * 0.3, Math.sin(a) * R * 2.0);
            b.userData.baseOpacity = 0.55;
            sig.add(b);
        }
        sig.userData._osSpin = 0.0012;
    } else if (theme === 'solar_storm') {
        // twelve flare spikes round the limb, breathing in and out
        for (let i = 0; i < 12; i++) {
            const a = i / 12 * Math.PI * 2;
            const len = R * _osRand(0.9, 1.7);
            const geo = new THREE.ConeGeometry(R * 0.12, len, 6, 1, true);
            geo.translate(0, len / 2, 0);
            const f = new THREE.Mesh(geo, _osFlat(0xffaa22, 0.6));
            f.position.set(Math.cos(a) * R * 0.95, 0, Math.sin(a) * R * 0.95);
            f.lookAt(Math.cos(a) * R * 3, (Math.random() - 0.5) * R, Math.sin(a) * R * 3);
            f.rotateX(Math.PI / 2);
            f.userData = { baseOpacity: 0.6, _osFlare: Math.random() * 6.28 };
            sig.add(f);
        }
        const halo = new THREE.Mesh(new THREE.TorusGeometry(R * 2.6, R * 0.025, 4, 120), _osFlat(t.color, 0.45));
        halo.rotation.x = Math.PI / 2; halo.userData.baseOpacity = 0.45;
        sig.add(halo);
        sig.userData._osSpin = 0.0008;
    } else if (theme === 'crystal_garden') {
        // a garden of outlined crystal shards on a ring round the star
        const shardMat = new THREE.MeshStandardMaterial({ color: 0x88ddff, emissive: 0x1a6a8a, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.6, flatShading: true });
        const edgeMat = _osLineMat(t.color, 0.85);
        for (let i = 0; i < 18; i++) {
            const a = i / 18 * Math.PI * 2 + Math.random() * 0.2;
            const s = R * _osRand(0.12, 0.34);
            const geo = new THREE.OctahedronGeometry(s, 0);
            geo.scale(0.6, 1.8, 0.6);
            const c = new THREE.Mesh(geo, shardMat);
            const rr = R * _osRand(3.0, 3.8);
            c.position.set(Math.cos(a) * rr, (Math.random() - 0.5) * R * 0.8, Math.sin(a) * rr);
            c.rotation.set(Math.random(), Math.random() * 6, Math.random() * 0.6);
            c.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
            sig.add(c);
        }
        sig.userData._osSpin = 0.0004;
    } else if (theme === 'dead_star') {
        // the husk of the old envelope + a cold debris disc
        const husk = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 4.6, 2), _osFlat(t.color, 0.1, { wireframe: true }));
        husk.userData = { baseOpacity: 0.1, _osSpin: -0.0002 };
        sig.add(husk);
        const n = 900, pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, rr = R * _osRand(5.5, 9.0);
            pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = (Math.random() - 0.5) * R * 0.35; pos[i * 3 + 2] = Math.sin(a) * rr;
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9aa8c0, size: 2.5, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
        pts.userData.baseOpacity = 0.8;
        sig.add(pts);
        sig.userData._osSpin = 0.00015;
    }
    g.add(sig);
    g.userData._osSig = sig;
    return sig;
}

// The Borg's signature: a construction lattice of wire cubes, as an orbiter.
function _osBorgLattice(g, orbitR) {
    const cell = 300, nx = 5, ny = 2, nz = 5;
    const pos = [];
    const P = function (x, y, z) { return [(x - nx / 2) * cell, (y - ny / 2) * cell, (z - nz / 2) * cell]; };
    const seg = function (a, b) { pos.push(a[0], a[1], a[2], b[0], b[1], b[2]); };
    for (let x = 0; x <= nx; x++) for (let y = 0; y <= ny; y++) for (let z = 0; z <= nz; z++) {
        if (x < nx) seg(P(x, y, z), P(x + 1, y, z));
        if (y < ny) seg(P(x, y, z), P(x, y + 1, z));
        if (z < nz) seg(P(x, y, z), P(x, y, z + 1));
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const lat = new THREE.LineSegments(geo, _osLineMat(0x33ff66, 0.6));
    lat.userData.baseOpacity = 0.6;
    const grp = new THREE.Group();
    grp.add(lat);
    // a few solid "modules" hung in the frame
    const modMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0x00ff44, emissiveIntensity: 0.25, metalness: 0.9, roughness: 0.3 });
    for (let i = 0; i < 6; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(cell * 0.9, cell * 0.9, cell * 0.9), modMat);
        const p = P(Math.floor(Math.random() * nx) + 0.5, Math.floor(Math.random() * ny) + 0.5, Math.floor(Math.random() * nz) + 0.5);
        b.position.set(p[0], p[1], p[2]);
        grp.add(b);
    }
    _osOrbiter(g, grp, { type: 'borg_lattice', name: 'Borg Construct [' + g.userData.name + ']', radius: cell * nx * 0.7, mass: 0.01,
        slingshotMultiplier: 1.0, rotationSpeed: 0.0007 }, orbitR, Math.random() * Math.PI * 2, _osSpeed(orbitR, 0.8));
    return grp;
}

// Calm theme-coloured dust instead of the classic whirling starfield.
function _osDust(g, theme, edge) {
    const t = _OS_THEMES[theme];
    const n = 420, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, rr = edge * Math.sqrt(Math.random()) * 1.05;
        pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = (Math.random() - 0.5) * edge * 0.18; pos[i * 3 + 2] = Math.sin(a) * rr;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: t.color, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    pts.userData = { type: 'system_dust', baseOpacity: 0.45, _osSpin: 0.00005 };
    pts.rotation.set(g.userData.tiltX, 0, g.userData.tiltZ);
    g.add(pts);
}

// ── one system ──────────────────────────────────────────────────────────────
function _osBuildSystem(spec) {
    const theme = spec.theme, t = _OS_THEMES[theme], isBorg = theme === 'borg';
    const g = new THREE.Group();
    g.userData = {
        name: spec.name, type: 'outer_interstellar_system',
        systemType: isBorg ? 'borg_patrol' : 'exotic_core', systemId: spec.id,
        location: 'Unexplored Interstellar Space',
        centerType: theme, theme: theme, themeLabel: t.label,
        orbiters: [], discovered: false, systemColor: t.color, scale: 1,
        tiltX: (Math.random() - 0.5) * 0.5, tiltZ: (Math.random() - 0.5) * 0.5,
        _frontier: true
    };
    if (isBorg) {
        g.userData.drones = []; g.userData.cosmicFeature = null; g.userData.hasBorg = true;
        g.userData.starType = 'White';
    }
    const L = window.HY_LADDER;
    const R = _osRand(L.star[0], L.star[1]) * (theme === 'dead_star' ? 0.85 : 1);
    const coreType = (theme === 'supernova' || theme === 'plasma_storm' || theme === 'solar_storm') ? theme : 'star';
    _osStar(g, theme, R, coreType);
    _osSignature(g, theme, R);

    // orbits, innermost first: rule 3 of HY_SCALE (STAR_CLEAR, ORBIT_K) + ORBIT_GAP air
    const K = (window.HY_SCALE && window.HY_SCALE.ORBIT_K) || 1.2, SC = (window.HY_SCALE && window.HY_SCALE.STAR_CLEAR) || 2.6;
    let prevO = R * Math.max(SC, theme === 'dead_star' ? 9.5 : theme === 'supernova' ? 5.2 : 4.0), prevR = 0;
    const next = function (r) { const o = prevO + K * (prevR + r) + _osRand(HY_OUTER.ORBIT_GAP[0], HY_OUTER.ORBIT_GAP[1]); prevO = o; prevR = r; return o; };
    const plan = [];
    if (!isBorg) {
        // a rock ring first, then the classic exotic company and a few worlds
        plan.push({ k: 'rocks', r: 600 });
        if (theme !== 'crystal_garden' && theme !== 'dead_star') for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) plan.push({ k: 'dwarf', r: 620 });
        for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) plan.push({ k: 'pulsar', r: 150 * 2.2 });
    }
    const pc = HY_OUTER.PLANETS[isBorg ? 'borg' : (HY_OUTER.PLANETS[theme] ? theme : 'exotic')];
    const nPl = pc[0] + Math.floor(Math.random() * (pc[1] - pc[0] + 1));
    for (let i = 0; i < nPl; i++) plan.push({ k: 'planet', r: _osRand(L.FIELD[0], L.FIELD[1]) });
    if (isBorg) plan.splice(1 + Math.floor(Math.random() * Math.max(1, plan.length - 1)), 0, { k: 'lattice', r: 1100 });
    // shuffle everything after the first slot so systems differ
    for (let i = plan.length - 1; i > 1; i--) { const j = 1 + Math.floor(Math.random() * i); const tmp = plan[i]; plan[i] = plan[j]; plan[j] = tmp; }
    let iPl = 0, iDw = 0, iPu = 0;
    plan.forEach(function (p) {
        const o = next(p.r);
        if (p.k === 'rocks') { _osRockRing(g, o, Math.round(_osRand(HY_OUTER.ROCKS[0], HY_OUTER.ROCKS[1])), 700); }
        else if (p.k === 'dwarf') _osBrownDwarf(g, o, iDw++);
        else if (p.k === 'pulsar') _osPulsar(g, o, iPu++);
        else if (p.k === 'lattice') _osBorgLattice(g, o);
        else _osPlanet(g, theme, o, iPl++, p.r);
        createSystemOrbitLine(null, o, g);
    });
    // cosmic feature (classic builder) on its own orbit past the worlds,
    // enlarged by GEOMETRY so cosmic-features' per-frame scale write cannot
    // shrink it back
    const _os4 = function (f) {
        f.traverse(function (n) {
            if (n.geometry && !n.geometry.userData._osK) { n.geometry.scale(4, 4, 4); n.geometry.userData._osK = 4; }
            if (n !== f && n.position) n.position.multiplyScalar(4);
        });
    };
    if (!isBorg || Math.random() < 0.7) {
        const f = createCosmicFeature(g, prevO);
        if (f) {
            _os4(f);
            f.userData.radius = (f.userData.radius || 100) * 4;
            f.userData.orbitRadius = next(f.userData.radius);
            f.userData.orbitSpeed = _osSpeed(f.userData.orbitRadius, 0.9);
        }
    }
    if (theme === 'crystal_garden' && !(g.userData.cosmicFeature && g.userData.cosmicFeature.userData.type === 'crystal_structure')) {
        // the garden always has its ancient formation
        const f = createCrystalStructure();
        _os4(f);
        Object.assign(f.userData, { orbitCenter: new THREE.Vector3(), systemName: g.userData.name, location: 'Unexplored Interstellar Space',
            isOuterSystem: true, mass: 1.5, slingshotMultiplier: 2.0, radius: 320 });
        f.userData.orbitRadius = next(320);
        f.userData.orbitSpeed = _osSpeed(f.userData.orbitRadius, 0.9);
        f.userData.orbitAngle = Math.random() * Math.PI * 2;
        g.userData.orbiters.push(f); g.add(f);
        if (typeof cosmicFeatures !== 'undefined' && cosmicFeatures.crystalFormations) cosmicFeatures.crystalFormations.push(f);
    }
    const edge = prevO + prevR + 2000;
    g.userData._hyEdge = Math.round(edge);
    g.userData.maxOrbitRadius = prevO;
    if (isBorg) createBorgCubeForSystem(g, prevO, edge * _osRand(0.72, 0.92));

    _osDust(g, theme, edge);
    _osLight(g, theme, edge);

    // first placement from the same step the frame loop uses
    g.userData.orbiters.forEach(function (o) {
        if (o.userData.orbitAngle !== undefined) _osOrbitWrite(o, g.userData.tiltX, g.userData.tiltZ);
    });
    // drawn like the rest of the vector world: never a draw-budget candidate
    g.traverse(function (n) {
        if (n.isMesh || n.isSprite || n.isLine || n.isPoints) n.userData.__dbTris = Infinity;
        if (n.isLine && n.material && n.material.toneMapped !== false) n.material.toneMapped = false;   // vector lines stay saturated
    });
    g.userData._shown = true;
    return g;
}

// ── where they go ───────────────────────────────────────────────────────────
function _osObstacles() {
    const out = [];
    const off = window.worldOriginOffset || { x: 0, y: 0, z: 0 };
    const T = function (p) { return new THREE.Vector3(p.x + off.x, p.y + off.y, p.z + off.z); };
    if (typeof planets !== 'undefined' && planets) planets.forEach(function (p) {
        const u = p && p.userData;
        if (!u) return;
        if (u.type === 'blackhole') out.push({ c: T(p.position), reach: u._hyGalaxyReach || ((u.radius || 900) * 8) });
        else if (u.heartWorld) out.push({ c: T(p.position), reach: 6000 });
    });
    if (typeof nebulaClouds !== 'undefined' && nebulaClouds) nebulaClouds.forEach(function (n) {
        if (n && n.position) out.push({ c: T(n.position), reach: (window.HY_SCALE && window.HY_SCALE.NEBULA_REACH) || 16500 });
    });
    (window.procGalaxySystems || []).forEach(function (s) {
        const c = s && (s.center || (s.group && s.group.position));
        if (c) out.push({ c: T(c), reach: 30000 });
    });
    const sol = window.localSystemOffset;
    if (sol) out.push({ c: new THREE.Vector3(sol.x, sol.y, sol.z), reach: 30000 });
    return out;
}

function _osSite(edge, slot, nSlots, obstacles, placed) {
    let best = null, bestGap = -Infinity;
    for (let t = 0; t < HY_OUTER.TRIES; t++) {
        const phi = (slot + 0.5 + (Math.random() - 0.5) * 0.8) / nSlots * Math.PI * 2;
        const sl = (Math.random() * 2 - 1) * HY_OUTER.LAT, cl = Math.sqrt(1 - sl * sl);
        const r = _osRand(HY_OUTER.SHELL[0], HY_OUTER.SHELL[1]);
        const c = new THREE.Vector3(Math.cos(phi) * cl * r, sl * r, Math.sin(phi) * cl * r);
        let gap = Infinity;
        for (let i = 0; i < obstacles.length; i++) gap = Math.min(gap, c.distanceTo(obstacles[i].c) - obstacles[i].reach - edge);
        for (let i = 0; i < placed.length; i++) gap = Math.min(gap, c.distanceTo(placed[i].c) - placed[i].edge - edge);
        if (gap >= HY_OUTER.CLEAR) return c;
        if (gap > bestGap) { bestGap = gap; best = c; }
    }
    console.warn('HYBRID frontier: no fully clear site for slot ' + slot + ' (best gap ' + Math.round(bestGap) + ')');
    return best;
}

function _osBuildFrontier() {
    // 16 exotic places (5 themes in turn) + 12 Borg zones, interleaved round the shell
    const specs = [];
    for (let i = 0; i < 16; i++) specs.push({ theme: _OS_EXOTIC_ORDER[i % _OS_EXOTIC_ORDER.length], name: outerSystemNames[i], id: i });
    for (let i = 0; i < 12; i++) specs.push({ theme: 'borg', name: borgSystemNames[i], id: 16 + i });
    const order = [];
    let e = 0, b = 0;
    while (order.length < specs.length) {
        if (e < 16) order.push(specs[e++]);
        if (b < 12 && (order.length % 7 === 2 || order.length % 7 === 4 || order.length % 7 === 6)) order.push(specs[16 + b++]);
        if (e >= 16 && b < 12) order.push(specs[16 + b++]);
    }
    const obstacles = _osObstacles();
    const off = window.worldOriginOffset || { x: 0, y: 0, z: 0 };
    const placed = [];
    order.forEach(function (spec, slot) {
        const g = _osBuildSystem(spec);
        const c = _osSite(g.userData._hyEdge, slot, order.length, obstacles, placed);
        placed.push({ c: c, edge: g.userData._hyEdge });
        g.position.set(c.x - off.x, c.y - off.y, c.z - off.z);
        g.userData._hyPlaced = true;
        g.updateMatrixWorld(true);
        scene.add(g);
        outerInterstellarSystems.push(g);
        console.log('    ' + (spec.theme === 'borg' ? '🟩' : '🌟') + ' ' + spec.name + ': ' + _OS_THEMES[spec.theme].label +
            ' at ' + Math.round(c.length()) + ' u from Sgr A* (edge ' + g.userData._hyEdge + ')');
    });
    // keep the classic order (exotic 0-15 then Borg) for readers that index by it
    outerInterstellarSystems.sort(function (a, b) { return a.userData.systemId - b.userData.systemId; });
    _osBuildBeacons();
    console.log('✅ Frontier: ' + outerInterstellarSystems.length + ' outer systems on a ' + HY_OUTER.SHELL.join('-') + ' u shell');
}

// ── beacons: one shared point cloud, one dot per system ─────────────────────
let _osBeacons = null;
function _osBuildBeacons() {
    const n = outerInterstellarSystems.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    outerInterstellarSystems.forEach(function (s, i) { pos[i * 3] = s.position.x; pos[i * 3 + 1] = s.position.y; pos[i * 3 + 2] = s.position.z; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: HY_OUTER.BEACON_PX, sizeAttenuation: false, vertexColors: true,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    pts.frustumCulled = false;
    pts.name = 'frontierBeacons';
    pts.userData = { type: 'frontier_beacons', __dbTris: Infinity };
    scene.add(pts);
    _osBeacons = pts;
}
function _osUpdateBeacons(cp) {
    if (!_osBeacons) return;
    const pa = _osBeacons.geometry.attributes.position, ca = _osBeacons.geometry.attributes.color;
    const c = new THREE.Color();
    for (let i = 0; i < outerInterstellarSystems.length; i++) {
        const s = outerInterstellarSystems[i];
        // positions are written relative to the cloud (a floating-origin rebase moves both)
        pa.setXYZ(i, s.position.x - _osBeacons.position.x, s.position.y - _osBeacons.position.y, s.position.z - _osBeacons.position.z);
        const d = s.userData._camD || s.position.distanceTo(cp);
        const k = Math.max(0, Math.min(1, (d - HY_OUTER.BEACON_NEAR) / (HY_OUTER.BEACON_FAR - HY_OUTER.BEACON_NEAR)));
        const f = k * k * (3 - 2 * k);
        c.setHex(s.userData.systemColor || 0xffffff).lerp(new THREE.Color(0xffffff), 0.35).multiplyScalar(f);
        ca.setXYZ(i, c.r, c.g, c.b);
    }
    pa.needsUpdate = true; ca.needsUpdate = true;
}

// ── frontier keep-out: enemies placed by other code (UFOs, warlords, mission
// hosts) at a system's centre are moved out of its bodies ───────────────────
const _osKO = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
function _osKeepOut() {
    const lists = [typeof enemies !== 'undefined' ? enemies : null, window.ufoEnemies];
    for (let s = 0; s < outerInterstellarSystems.length; s++) {
        const g = outerInterstellarSystems[s], ud = g.userData;
        if (!ud._frontier) continue;
        const reach2 = Math.pow(ud._hyEdge * 1.2, 2);
        for (let l = 0; l < lists.length; l++) {
            const arr = lists[l];
            if (!arr) continue;
            for (let i = 0; i < arr.length; i++) {
                const e = arr[i];
                if (!e || !e.position || !e.userData || e.userData.health <= 0 || e.parent === g) continue;
                if (e.position.distanceToSquared(g.position) > reach2) continue;
                const first = !e.userData._osKept;
                e.userData._osKept = true;
                const bodies = [ud.centerObject].concat(ud.orbiters);
                for (let b = 0; b < bodies.length; b++) {
                    const o = bodies[b], ou = o && o.userData;
                    if (!ou || !ou.radius || ou.type === 'outer_asteroid' || ou.type === 'borg_cube' || ou.type === 'borg_drone') continue;
                    o.getWorldPosition(_osKO);
                    const keep = ou.radius * (first ? HY_OUTER.KEEPOUT_K : HY_OUTER.KEEPOUT_LIVE_K) + 150;
                    const d = e.position.distanceTo(_osKO);
                    if (d >= keep) continue;
                    const dir = d > 1 ? e.position.clone().sub(_osKO).normalize() : new THREE.Vector3(1, 0.2, 0).normalize();
                    const np = _osKO.clone().addScaledVector(dir, ou.radius * HY_OUTER.KEEPOUT_K + 300);
                    const delta = np.clone().sub(e.position);
                    e.position.copy(np);
                    if (e.userData.patrolCenter && e.userData.patrolCenter.add) e.userData.patrolCenter.add(delta);
                }
            }
        }
    }
}

// ── discovery (the classic check in game-core spoke through the retired
// showAchievement; this one speaks on the comms channel) ────────────────────
function _osDiscover(g, d) {
    const ud = g.userData;
    if (ud.discovered) return;
    if (d > Math.max(HY_OUTER.DISCOVER_MIN, ud._hyEdge * HY_OUTER.DISCOVER_K)) return;
    ud.discovered = true;
    const say = window.showIncomingTransmission;
    if (typeof say === 'function') {
        try { say('Long Range Survey - ' + ud.name, 'Frontier system charted: ' + (ud.themeLabel || 'Unknown') + '. ' +
            (ud.hasBorg ? 'Borg signatures on scope - expect a cube on patrol.' : 'Exotic readings across the system.'), 'ship'); } catch (e) {}
    }
    console.log('🌌 Discovered frontier system: ' + ud.name);
}

// ── Universal View markers (called from updateGalaxyMap's universal branch) ─
let _osMapDots = null, _osMapAt = 0;
function drawOuterSystemsOnMap(galaxyMap, universeRadius) {
    if (!galaxyMap || !outerInterstellarSystems.length || !_osFrontierOn()) return;
    if (!_osMapDots) _osMapDots = [];
    const off = window.worldOriginOffset || { x: 0, y: 0, z: 0 };
    _osMapAt = performance.now();
    outerInterstellarSystems.forEach(function (s, i) {
        let el = _osMapDots[i];
        if (!el || !el.parentNode) {
            el = document.createElement('div');
            el.className = 'frontier-map-dot';
            el.style.cssText = 'position:absolute;width:7px;height:7px;transform:translate(-50%,-50%) rotate(45deg);pointer-events:none;z-index:7;';
            galaxyMap.appendChild(el);
            _osMapDots[i] = el;
        }
        const ud = s.userData;
        const x = s.position.x + off.x, z = s.position.z + off.z;
        let mx = (x / universeRadius) * 50, my = (z / universeRadius) * 50;
        const rr = Math.sqrt(mx * mx + my * my);
        const rim = rr > HY_OUTER.MAP_RIM;
        if (rim) { mx *= HY_OUTER.MAP_RIM / rr; my *= HY_OUTER.MAP_RIM / rr; }
        const col = '#' + ('000000' + (ud.systemColor || 0xffffff).toString(16)).slice(-6);
        el.style.left = (50 + mx) + '%';
        el.style.top = (50 + my) + '%';
        el.style.background = ud.discovered ? col : 'transparent';
        el.style.border = '1px solid ' + col;
        el.style.boxShadow = '0 0 6px ' + col;
        el.style.opacity = rim ? '0.85' : '1';
        el.title = ud.name + ' — ' + (ud.themeLabel || 'Outer System') + (rim ? ' (frontier, off-map)' : '');
        el.style.display = 'block';
    });
}
function _osHideMapDots() {
    if (!_osMapDots || performance.now() - _osMapAt < 1500) return;
    for (let i = 0; i < _osMapDots.length; i++) if (_osMapDots[i] && _osMapDots[i].style.display !== 'none') _osMapDots[i].style.display = 'none';
}
if (typeof window !== 'undefined') window.drawOuterSystemsOnMap = drawOuterSystemsOnMap;

// The nearest frontier systems as nav destinations (their star / core).
function outerSystemDestinations(n) {
    if (!outerInterstellarSystems.length || typeof camera === 'undefined') return [];
    const cp = camera.position;
    return outerInterstellarSystems.slice().sort(function (a, b) { return a.position.distanceTo(cp) - b.position.distanceTo(cp); })
        .slice(0, n || 2).map(function (s) { return s.userData.centerObject; }).filter(Boolean);
}
if (typeof window !== 'undefined') window.outerSystemDestinations = outerSystemDestinations;

// ── per-frame frontier update for one system ────────────────────────────────
const _osWP = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
function _osUpdateFrontier(system, cp, dtF, tSec) {
    const ud = system.userData;
    const d = system.position.distanceTo(cp);
    ud._camD = d;
    const show = ud._shown ? d < HY_OUTER.SHOW * 1.08 : d < HY_OUTER.SHOW;
    if (show !== ud._shown) { system.visible = show; ud._shown = show; }
    if (show) _osDiscover(system, d);
    if (!show) return;
    const near = d < ud._hyEdge + HY_OUTER.FX_RANGE;
    // corona never washes the screen: fade it as the camera nears the star
    const cor = ud._osCorona, R = ud._hyR || 700;
    if (cor) {
        const a = HY_OUTER.CORONA_FADE_R;
        const k = Math.max(0, Math.min(1, (d / R - a[0]) / (a[1] - a[0])));
        cor.material.opacity = cor.userData.baseOpacity * k;
        cor.visible = k > 0.01;
    }
    if (!near) return;
    // signature + chrome animation, dt-scaled
    for (let i = 0; i < system.children.length; i++) {
        const c = system.children[i], cu = c.userData;
        if (!cu) continue;
        if (cu._osSpin) { c.rotation.y += cu._osSpin * dtF; }
        if (cu._osSig) {
            for (let k = 0; k < c.children.length; k++) {
                const s = c.children[k], su = s.userData;
                if (su._osSpin) s.rotation.z += su._osSpin * dtF;
                if (su._osPulse) s.scale.setScalar(1 + su._osPulse * Math.sin(tSec * 0.6));
                if (su._osFlare !== undefined) s.scale.set(1, 0.75 + 0.35 * Math.sin(tSec * 1.7 + su._osFlare), 1);
            }
        }
    }
}

// =============================================================================
// ANIMATION (Updates both system types)
// =============================================================================

function updateOuterSystems() {
    if (!camera || !camera.position) return;

    const playerPos = camera.position;
    const dtF = _osDt();
    const fc = (typeof gameState !== 'undefined' && gameState.frameCount) || 0;
    const tSec = performance.now() * 0.001;

    outerInterstellarSystems.forEach(system => {
        if (!system.userData || !system.userData.orbiters) return;

        const tiltX = system.userData.tiltX || 0;
        const tiltZ = system.userData.tiltZ || 0;

        if (system.userData._frontier) {
            // package V: range, corona, discovery and signature animation
            _osUpdateFrontier(system, playerPos, dtF, tSec);
        } else {
        // Distance-based opacity - different for each set
        const systemDist = system.position.distanceTo(playerPos);

        let opacity = 1.0;

        if (system.userData.systemType === 'exotic_core') {
            // SET 1: Exotic Core Systems — original fade range.
            const fadeStart = 65000;
            const fadeComplete = 5000;

            if (systemDist > fadeStart) {
                opacity = 0;
            } else if (systemDist > fadeComplete) {
                opacity = 1.0 - (systemDist - fadeComplete) / (fadeStart - fadeComplete);
            } else {
                opacity = 1.0;
            }
        } else if (system.userData.systemType === 'borg_patrol') {
            // SET 2: BORG Patrol Systems — original fade range.
            const fadeStart = 45000;
            const fadeComplete = 5000;

            if (systemDist > fadeStart) {
                opacity = 0;
            } else if (systemDist > fadeComplete) {
                opacity = 1.0 - (systemDist - fadeComplete) / (fadeStart - fadeComplete);
            } else {
                opacity = 1.0;
            }
        }

        // Update all children
        system.children.forEach(child => {
            // ROTATE STARFIELD
            if (child.userData && child.userData.type === 'system_starfield') {
                child.rotation.y += child.userData.rotationSpeed * dtF;
                child.rotation.x += child.userData.rotationSpeed * 0.5 * dtF;
                if (child.material) {
                    child.material.opacity = opacity * 0.9;
                }
            }

            // Apply opacity to materials
            if (child.material && child.userData.type !== 'system_starfield') {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => {
                        if (mat.transparent !== false) {
                            mat.transparent = true;
                            const baseOpacity = child.userData.baseOpacity || 1.0;
                            mat.opacity = baseOpacity * opacity;
                        }
                    });
                } else {
                    if (child.material.transparent !== false) {
                        child.material.transparent = true;
                        const baseOpacity = child.userData.baseOpacity || 1.0;
                        child.material.opacity = baseOpacity * opacity;
                    }
                }
            }
        });
        }

        // Update orbiters (planets, drones, cosmic features, brown dwarfs, pulsars, asteroids).
        // Every orbiter advances every frame, dt-scaled, shown or not, so nothing
        // snaps when it comes back into view; the position is written by the one
        // orbit step the builders also used (_osOrbitWrite).
        system.userData.orbiters.forEach(orbiter => {
            const u = orbiter.userData;
            // BUGFIX: was `if (!orbiter.userData.orbitAngle !== undefined)` — operator
            // precedence made this always truthy, freezing ALL outer system orbiters.
            if (u.orbitAngle === undefined) return;

            u.orbitAngle += u.orbitSpeed * dtF;

            if (u._rejoin) {
                // package V: a Borg cube back from a chase glides onto its patrol
                // ring over REJOIN frames instead of teleporting there
                _osOrbitWrite(orbiter, tiltX, tiltZ);
                const rj = u._rejoin;
                rj.t = Math.min(1, rj.t + dtF / 360);
                const k = rj.t * rj.t * (3 - 2 * rj.t);
                orbiter.position.lerpVectors(rj.from, orbiter.position, k);
                if (rj.t >= 1) delete u._rejoin;
            } else {
                _osOrbitWrite(orbiter, tiltX, tiltZ);
            }

            const type = u.type;
            if ((type === 'outer_planet' || type === 'pulsar' || type === 'borg_lattice') && u.rotationSpeed) {
                orbiter.rotation.y += u.rotationSpeed * dtF;
            } else if (type === 'outer_asteroid') {
                orbiter.rotation.x += u.rotationSpeedX * dtF;
                orbiter.rotation.y += u.rotationSpeedY * dtF;
                orbiter.rotation.z += u.rotationSpeedZ * dtF;
            } else if ((type === 'borg_cube' || type === 'borg_drone') && u.rotationSpeed) {
                orbiter.rotation.x += u.rotationSpeed * dtF;
                orbiter.rotation.y += u.rotationSpeed * 0.7 * dtF;
            } else if (u.rotationSpeed &&
                (type === 'crystal_structure' || type === 'dyson_sphere' || type === 'space_whale')) {
                orbiter.rotation.y += u.rotationSpeed * dtF;
                // Space whale swimming motion
                if (type === 'space_whale' && u.swimSpeed) {
                    orbiter.rotation.z = Math.sin(tSec * u.swimSpeed) * 0.2;
                    orbiter.rotation.x = Math.sin(tSec * u.swimSpeed * 1.3) * 0.15;
                }
            }
        });
    });

    if (_osFrontierOn()) {
        if (fc % 6 === 0) _osUpdateBeacons(playerPos);
        if (fc % 30 === 0) { _osKeepOut(); _osHideMapDots(); }
    }
}

// =============================================================================
// BORG PATROL DRONE COMBAT BEHAVIOR
// =============================================================================

const _borgWorldPos = new THREE.Vector3();
const _borgDir = new THREE.Vector3();
const _borgDroneTarget = new THREE.Vector3();

function updateBorgPatrolCombat() {
    if (typeof camera === 'undefined' || typeof outerInterstellarSystems === 'undefined') return;
    if (!gameState || !gameState.gameStarted || gameState.gameOver) return;

    const playerPos = camera.position;
    const now = Date.now();
    const dtF = _osDt();   // package V: every Borg motion dt-scaled
    const say = function (title, msg) {   // showAchievement is retired: Borg comms go out on the ship channel
        if (typeof window.showIncomingTransmission === 'function') { try { window.showIncomingTransmission(title, msg, 'ship'); return; } catch (e) {} }
        if (typeof showAchievement === 'function') showAchievement(title, msg, true);
    };

    outerInterstellarSystems.forEach(system => {
        if (!system.userData || !system.userData.hasBorg || !system.userData.drones) return;

        system.userData.drones.forEach(entity => {
            if (!entity || !entity.userData || entity.userData.health <= 0) return;

            entity.getWorldPosition(_borgWorldPos);
            const distance = playerPos.distanceTo(_borgWorldPos);

            // --- BORG CUBE behavior (100HP boss) ---
            if (entity.userData.isBorgCube) {
                const ud = entity.userData;

                // Borg alarm system
                if (distance < 15000 && typeof startBorgAlarm === 'function') {
                    startBorgAlarm();
                } else if (distance >= 15000 && typeof stopBorgAlarm === 'function') {
                    stopBorgAlarm();
                }

                // Borg warning message — fires when cube enters typical
                // visual range so the player gets immediate feedback that
                // they've encountered a BORG threat.
                if (distance < 10000 && !ud.warningShown) {
                    ud.warningShown = true;
                    say('⚠️ CRITICAL ALERT', 'Massive BORG vessel detected! Extreme threat level!');
                    if (typeof playSound === 'function') playSound('boss');
                }

                // Borg communications — extended to 10000u so transmissions
                // start arriving as soon as the cube is detected, not only
                // once you're nearly on top of it.
                if (distance < 10000 && now - ud.lastCommunication > ud.communicationCooldown) {
                    ud.lastCommunication = now;
                    const msgs = [
                        'We are the Borg. Resistance is futile.',
                        'Your biological distinctiveness will be added to our own.',
                        'You will be assimilated.',
                        'Strength is irrelevant. Resistance is futile.',
                        'Freedom is irrelevant. Self-determination is irrelevant.'
                    ];
                    const msg = msgs[Math.floor(Math.random() * msgs.length)];
                    const threat = distance < 2000 ? 'IMMINENT THREAT' : 'INCOMING THREAT';
                    say(`⚠️ BORG TRANSMISSION [${threat}]`, msg);
                }

                // Pursuit: when player within detection range, break orbit and pursue
                if (distance < ud.detectionRange) {
                    ud.pursuing = true;
                    // Remove orbit angle so normal orbit code skips this entity
                    if (ud.orbitAngle !== undefined) {
                        ud._savedOrbitAngle = ud.orbitAngle;
                        delete ud.orbitAngle;
                    }

                    _borgDir.subVectors(playerPos, _borgWorldPos).normalize();
                    const localDir = system.worldToLocal(_borgDir.add(_borgWorldPos)).sub(entity.position).normalize();
                    entity.position.add(localDir.multiplyScalar(ud.speed * _osDt()));

                    // Rotate menacingly
                    entity.rotation.x += 0.002 * dtF;
                    entity.rotation.y += 0.003 * dtF;
                    entity.rotation.z += 0.001 * dtF;

                    // Spawn drones when player is close
                    if (distance < 5000 && ud.droneCount < ud.maxDrones && now - ud.lastDroneSpawn > 2000) {
                        ud.lastDroneSpawn = now;
                        spawnBorgSystemDrone(entity, system);
                    }

                    // Fire at player
                    if (distance < ud.firingRange && now - ud.lastAttack > 1500) {
                        ud.lastAttack = now;
                        if (typeof fireEnemyWeapon === 'function') fireEnemyWeapon(entity);
                    }
                } else if (ud.pursuing) {
                    // Return to patrol
                    ud.pursuing = false;
                    ud.warningShown = false;
                    if (ud._savedOrbitAngle !== undefined) {
                        ud.orbitAngle = ud._savedOrbitAngle;
                        // package V: glide back onto the patrol ring (updateOuterSystems)
                        // instead of snapping there from wherever the chase ended
                        ud._rejoin = { from: entity.position.clone(), t: 0 };
                        delete ud._savedOrbitAngle;
                    }
                }

                // Update cube's drones
                for (let i = ud.drones.length - 1; i >= 0; i--) {
                    const drone = ud.drones[i];
                    if (!drone || drone.userData.health <= 0) {
                        ud.droneCount--;
                        ud.drones.splice(i, 1);
                        continue;
                    }

                    drone.getWorldPosition(_borgDroneTarget);
                    const droneDist = playerPos.distanceTo(_borgDroneTarget);

                    if (droneDist < 3500) {
                        // Swarm attack
                        const idx = i;
                        const swarmAngle = now * 0.001 + (idx * Math.PI * 2 / 8);
                        const spiralR = 80 + Math.sin(now * 0.0003) * 30;
                        _borgDir.set(
                            playerPos.x + Math.cos(swarmAngle) * spiralR,
                            playerPos.y + Math.sin(swarmAngle * 0.5) * 20,
                            playerPos.z + Math.sin(swarmAngle) * spiralR
                        );
                        const localTarget = system.worldToLocal(_borgDir.clone());
                        const dir = localTarget.sub(drone.position).normalize();
                        drone.position.add(dir.multiplyScalar(drone.userData.speed * dtF));
                    } else {
                        // Orbit cube
                        entity.getWorldPosition(_borgDir);
                        const orbitAngle = now * 0.001 + (i * Math.PI * 2 / 8);
                        _borgDir.x += Math.cos(orbitAngle) * 80;
                        _borgDir.z += Math.sin(orbitAngle) * 80;
                        _borgDir.y += Math.sin(orbitAngle * 0.5) * 30;
                        const localOrbit = system.worldToLocal(_borgDir.clone());
                        const oDir = localOrbit.sub(drone.position).normalize();
                        drone.position.add(oDir.multiplyScalar(drone.userData.speed * 0.5 * dtF));
                    }

                    // Drone fires at player
                    if (droneDist < 300 && now - (drone.userData.lastAttack || 0) > 1500) {
                        drone.userData.lastAttack = now;
                        if (typeof fireEnemyWeapon === 'function') fireEnemyWeapon(drone);
                    }
                }

                return; // Skip generic drone behavior below
            }

            // --- Small BORG drone fallback (shouldn't normally exist standalone) ---
            if (distance < 3500) {
                _borgDir.subVectors(playerPos, _borgWorldPos).normalize();
                const localDir = system.worldToLocal(_borgDir.add(_borgWorldPos)).sub(entity.position).normalize();
                entity.position.add(localDir.multiplyScalar((entity.userData.speed || 3.0) * dtF));

                if (distance < 300 && now - (entity.userData.lastAttack || 0) > 1500) {
                    entity.userData.lastAttack = now;
                    if (typeof fireEnemyWeapon === 'function') fireEnemyWeapon(entity);
                }
            }
        });
    });
}

// =============================================================================
// EXPORTS
// =============================================================================

if (typeof window !== 'undefined') {
    window.createOuterInterstellarSystems = createOuterInterstellarSystems;
    window.updateOuterSystems = updateOuterSystems;
    window.updateBorgPatrolCombat = updateBorgPatrolCombat;
    window.outerInterstellarSystems = outerInterstellarSystems;
}
