// Outer Interstellar Systems - Two distinct sets of deep space systems
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

function createOuterInterstellarSystems() {
    console.log('🌌 Creating outer interstellar systems in deep space...');

    // SET 1: Create 16 exotic core systems (40,000-100,000 units)
    console.log('  Creating SET 1: 16 exotic core systems (Supernova/Plasma/Solar)...');
    createExoticCoreSystems();

    // SET 2: Create 12 BORG patrol systems (75,000-85,000 units)
    console.log('  Creating SET 2: 12 BORG patrol systems (Bright stars + BORG)...');
    createBorgPatrolSystems();

    console.log(`✅ Created ${outerInterstellarSystems.length} total outer interstellar systems`);
}

// =============================================================================
// SET 1: EXOTIC CORE SYSTEMS (16 systems, 60k-75k units - Middle Zone)
// =============================================================================

function createExoticCoreSystems() {
    const innerBoundary = 60000;
    const outerBoundary = 75000;
    const targetRadius = (innerBoundary + outerBoundary) / 2; // ~67,500
    const radiusVariation = 7500;

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

        createExoticSystem(systemCenter, outerSystemNames[i], centerType, i);
    }
}

function createExoticSystem(center, name, centerType, systemId) {
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
        systemColor: systemColor
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
        const orbitRadius = 800 + Math.random() * 1200;
        createOrbitingBrownDwarf(center, orbitRadius, i, systemGroup);
        createSystemOrbitLine(center, orbitRadius, systemGroup);
    }

    // Orbiting pulsars (1-3)
    const pulsarCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pulsarCount; i++) {
        const orbitRadius = 1500 + Math.random() * 1500;
        createOrbitingPulsar(center, orbitRadius, i, systemGroup);
        createSystemOrbitLine(center, orbitRadius, systemGroup);
    }

    // Asteroid field
    const asteroidOrbitRadius = 600 + Math.random() * 800;
    const asteroidCount = 20 + Math.floor(Math.random() * 30);
    for (let i = 0; i < asteroidCount; i++) {
        createOrbitingAsteroid(center, asteroidOrbitRadius, i, systemGroup);
    }

    createSystemOrbitLine(center, asteroidOrbitRadius, systemGroup);

    // CREATE STARFIELD FOR THIS SYSTEM
    const maxOrbitRadius = 1500 + 1500; // Max pulsar orbit
    const starfieldRadius = maxOrbitRadius * 0.5;
    createSystemStarfield(starfieldRadius, systemGroup);

    scene.add(systemGroup);
    outerInterstellarSystems.push(systemGroup);

    console.log(`    🌟 ${name}: ${centerType} at ${center.length().toFixed(0)} units`);
}

// =============================================================================
// SET 2: BORG PATROL SYSTEMS (12 systems, 75k-90k units - Outer Zone)
// =============================================================================

function createBorgPatrolSystems() {
    const minDistance = 75000;
    const maxDistance = 90000;

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
        const orbitRadius = 800 + (i * 600) + Math.random() * 400;
        maxOrbitRadius = Math.max(maxOrbitRadius, orbitRadius);
        createOrbitingPlanet(systemGroup, orbitRadius, i);
        createSystemOrbitLine(center, orbitRadius, systemGroup);
    }

    // Create rotating starfield
    const starfieldRadius = maxOrbitRadius * 0.5;
    createSystemStarfield(starfieldRadius, systemGroup);

    // Create 2-3 BORG drones patrolling the system
    const droneCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < droneCount; i++) {
        createBorgDrone(systemGroup, maxOrbitRadius, i);
    }

    // Create 1 cosmic feature in orbit
    createCosmicFeature(systemGroup, maxOrbitRadius);

    scene.add(systemGroup);
    outerInterstellarSystems.push(systemGroup);

    console.log(`    🟩 Unknown System #${systemId + 1}: ${starType.name} star with ${planetCount} planets and ${droneCount} BORG drones at ${center.length().toFixed(0)} units`);
}

// =============================================================================
// EXOTIC CORE CENTER OBJECTS (Supernova, Plasma Storm, Solar Storm)
// =============================================================================

function createSystemSupernova(center, systemGroup) {
    const coreGeo = new THREE.SphereGeometry(80, 32, 32);
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
        radius: 80,
        mass: 3.0,
        slingshotMultiplier: 3.0,
        isOuterSystem: true
    };

    systemGroup.add(core);
    systemGroup.userData.centerObject = core;

    // Glow layers
    for (let i = 0; i < 3; i++) {
        const size = 120 + i * 60;
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
    const coreGeo = new THREE.SphereGeometry(60, 32, 32);
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
        radius: 60,
        mass: 2.5,
        slingshotMultiplier: 2.8,
        isOuterSystem: true
    };

    systemGroup.add(core);
    systemGroup.userData.centerObject = core;

    // Plasma clouds
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const cloudGeo = new THREE.SphereGeometry(40, 16, 16);
        const cloudMat = new THREE.MeshBasicMaterial({
            color: 0x8844ff,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        const cloud = new THREE.Mesh(cloudGeo, cloudMat);
        cloud.userData.baseOpacity = 0.6;
        cloud.position.set(
            Math.cos(angle) * 100,
            0,
            Math.sin(angle) * 100
        );
        systemGroup.add(cloud);
    }

    const light = new THREE.PointLight(0xaa44ff, 12, 5000);
    light.position.set(0, 0, 0);
    systemGroup.add(light);
}

function createSystemSolarStorm(center, systemGroup) {
    const coreGeo = new THREE.SphereGeometry(70, 32, 32);
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
        radius: 70,
        mass: 2.0,
        slingshotMultiplier: 2.2,
        isOuterSystem: true
    };

    systemGroup.add(core);
    systemGroup.userData.centerObject = core;

    // Flares
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const flareGeo = new THREE.ConeGeometry(20, 150, 8);
        const flareMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending
        });
        const flare = new THREE.Mesh(flareGeo, flareMat);
        flare.position.set(
            Math.cos(angle) * 90,
            0,
            Math.sin(angle) * 90
        );
        flare.lookAt(new THREE.Vector3(
            Math.cos(angle) * 200,
            0,
            Math.sin(angle) * 200
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
    const geo = new THREE.SphereGeometry(35, 24, 24);
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
        radius: 35,
        mass: 0.08,
        slingshotMultiplier: 1.3,
        isOuterSystem: true
    };

    systemGroup.userData.orbiters.push(dwarf);
    systemGroup.add(dwarf);

    return dwarf;
}

function createOrbitingPulsar(center, orbitRadius, index, systemGroup) {
    const coreGeo = new THREE.SphereGeometry(20, 16, 16);
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

    const ringGeo = new THREE.TorusGeometry(40, 3, 8, 32);
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
        radius: 20,
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
        orbitCenter: new THREE.Vector3(0, 0, 0),
        orbitRadius: radiusVar,
        orbitSpeed: 0.0007 + Math.random() * 0.0008,
        orbitAngle: angle,
        systemId: systemGroup.userData.systemId,
        rotationSpeedX: (Math.random() - 0.5) * 0.02,
        rotationSpeedY: (Math.random() - 0.5) * 0.02,
        rotationSpeedZ: (Math.random() - 0.5) * 0.02
    };

    systemGroup.userData.orbiters.push(asteroid);
    systemGroup.add(asteroid);
    return asteroid;
}

// =============================================================================
// BORG SYSTEM CENTER STAR
// =============================================================================

function createBrightStar(systemGroup, starType) {
    const starRadius = 100 + Math.random() * 50;

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
    const planetRadius = 20 + Math.random() * 40;

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
        mass: planetRadius / 40,
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

function createBorgDrone(systemGroup, maxOrbitRadius, index) {
    const droneGroup = new THREE.Group();

    // BORG cube design
    const cubeSize = 30;
    const cubeGeo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const cubeMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.9,
        roughness: 0.2,
        emissive: 0x00ff00,
        emissiveIntensity: 0.3
    });
    const cube = new THREE.Mesh(cubeGeo, cubeMat);
    droneGroup.add(cube);

    // Add green glowing edges
    const edgeGeo = new THREE.EdgesGeometry(cubeGeo);
    const edgeMat = new THREE.LineBasicMaterial({
        color: 0x00ff00,
        linewidth: 2
    });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    droneGroup.add(edges);

    // Add glowing sphere in center
    const coreGeo = new THREE.SphereGeometry(10, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    droneGroup.add(core);

    // Position drone in MUCH larger patrol orbit (released from far distance)
    const patrolRadius = 10000 + Math.random() * 5000; // 10,000-15,000 units from system center
    const angle = (index / 3) * Math.PI * 2;
    droneGroup.position.set(
        Math.cos(angle) * patrolRadius,
        (Math.random() - 0.5) * 1000, // Higher vertical variance
        Math.sin(angle) * patrolRadius
    );

    droneGroup.userData = {
        type: 'borg_drone',
        name: `BORG Drone ${systemGroup.userData.systemId}-${index + 1}`,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        orbitRadius: patrolRadius,
        orbitSpeed: 0.0001 + Math.random() * 0.0002,
        orbitAngle: angle,
        orbitCenter: new THREE.Vector3(0, 0, 0),
        rotationSpeed: 0.01,
        health: 100,
        hostile: true
    };

    systemGroup.userData.orbiters.push(droneGroup);
    systemGroup.userData.drones.push(droneGroup);
    systemGroup.add(droneGroup);

    return droneGroup;
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

    // Add gravitational properties based on feature type
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
// ANIMATION (Updates both system types)
// =============================================================================

function updateOuterSystems() {
    if (!camera || !camera.position) return;

    const playerPos = camera.position;

    outerInterstellarSystems.forEach(system => {

        if (system.userData.systemType === 'exotic_core') {
            // SET 1: Exotic Core Systems - Original visibility settings
            // Start fading at 5,000 units from player
            const blurStart = 10000;
            const blurMax = 100000;
            if (systemDist > blurStart) {
                opacity = 1.0 - Math.min(1, (systemDist - blurStart) / (blurMax - blurStart));
            }
        } else if (system.userData.systemType === 'borg_patrol') {
            // SET 2: BORG Patrol Systems - Normal visibility
            // Start fading when player is 10,000 units away
            const blurStart = 30000;
            const blurMax = 120000;
            if (systemDist > blurStart) {
                opacity = 1.0 - Math.min(1, (systemDist - blurStart) / (blurMax - blurStart));
            }
        }

        const tiltX = system.userData.tiltX || 0;
        const tiltZ = system.userData.tiltZ || 0;

        // Update all children
        system.children.forEach(child => {
            // ROTATE STARFIELD
            if (child.userData && child.userData.type === 'system_starfield') {
                child.rotation.y += child.userData.rotationSpeed;
                child.rotation.x += child.userData.rotationSpeed * 0.5;
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

        // Update orbiters (planets, drones, cosmic features, brown dwarfs, pulsars, asteroids)
        system.userData.orbiters.forEach(orbiter => {
            if (!orbiter.userData.orbitAngle !== undefined) return;

            orbiter.userData.orbitAngle += orbiter.userData.orbitSpeed;

            let x = Math.cos(orbiter.userData.orbitAngle) * orbiter.userData.orbitRadius;
            let y = 0;
            let z = Math.sin(orbiter.userData.orbitAngle) * orbiter.userData.orbitRadius;

            // Apply system tilt
            const rotatedX = x;
            const rotatedY = y * Math.cos(tiltX) - z * Math.sin(tiltX);
            const rotatedZ = y * Math.sin(tiltX) + z * Math.cos(tiltX);

            const finalX = rotatedX * Math.cos(tiltZ) - rotatedY * Math.sin(tiltZ);
            const finalY = rotatedX * Math.sin(tiltZ) + rotatedY * Math.cos(tiltZ);
            const finalZ = rotatedZ;

            orbiter.position.set(
                orbiter.userData.orbitCenter.x + finalX,
                orbiter.userData.orbitCenter.y + finalY,
                orbiter.userData.orbitCenter.z + finalZ
            );

            // Rotate planets
            if (orbiter.userData.type === 'outer_planet' && orbiter.userData.rotationSpeed) {
                orbiter.rotation.y += orbiter.userData.rotationSpeed;
            }

            // Rotate pulsars
            if (orbiter.userData.type === 'pulsar' && orbiter.userData.rotationSpeed) {
                orbiter.rotation.y += orbiter.userData.rotationSpeed;
            }

            // Rotate asteroids
            if (orbiter.userData.type === 'outer_asteroid') {
                orbiter.rotation.x += orbiter.userData.rotationSpeedX;
                orbiter.rotation.y += orbiter.userData.rotationSpeedY;
                orbiter.rotation.z += orbiter.userData.rotationSpeedZ;
            }

            // Rotate BORG drones
            if (orbiter.userData.type === 'borg_drone' && orbiter.userData.rotationSpeed) {
                orbiter.rotation.x += orbiter.userData.rotationSpeed;
                orbiter.rotation.y += orbiter.userData.rotationSpeed * 0.7;
            }

            // Rotate cosmic features
            if (orbiter.userData.rotationSpeed &&
                (orbiter.userData.type === 'crystal_structure' ||
                 orbiter.userData.type === 'dyson_sphere' ||
                 orbiter.userData.type === 'space_whale')) {
                orbiter.rotation.y += orbiter.userData.rotationSpeed;

                // Space whale swimming motion
                if (orbiter.userData.type === 'space_whale' && orbiter.userData.swimSpeed) {
                    const swimTime = Date.now() * 0.001;
                    orbiter.rotation.z = Math.sin(swimTime * orbiter.userData.swimSpeed) * 0.2;
                    orbiter.rotation.x = Math.sin(swimTime * orbiter.userData.swimSpeed * 1.3) * 0.15;
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
    window.outerInterstellarSystems = outerInterstellarSystems;
}
