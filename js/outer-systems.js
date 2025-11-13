// Outer Interstellar Systems - Far-off star systems beyond known galaxies
// Located between 75,000 and 85,000 units from center
// Features: Bright star centers with orbiting planets, BORG drones, and cosmic features

// Prevent re-declaration errors from browser cache/hot-reload
if (!window.outerInterstellarSystems) {
    window.outerInterstellarSystems = [];
}

// Local references for code convenience
const outerInterstellarSystems = window.outerInterstellarSystems;

// =============================================================================
// MAIN CREATION FUNCTION
// =============================================================================

function createOuterInterstellarSystems() {
    console.log('🌌 Creating 12 outer interstellar systems in deep space (75,000-85,000 units)...');

    const minDistance = 75000;
    const maxDistance = 85000;

    for (let i = 0; i < 12; i++) {
        // Random spherical distribution (not along any single axis plane)
        const phi = Math.random() * Math.PI * 2; // Full 360 degree rotation
        const theta = Math.acos(2 * Math.random() - 1); // Full sphere distribution
        const radius = minDistance + Math.random() * (maxDistance - minDistance);

        // Convert spherical to cartesian coordinates
        const x = radius * Math.sin(theta) * Math.cos(phi);
        const y = radius * Math.sin(theta) * Math.sin(phi);
        const z = radius * Math.cos(theta);

        const systemCenter = new THREE.Vector3(x, y, z);

        console.log(`  Creating system ${i + 1}/12 at distance ${radius.toFixed(0)} units`);
        createOuterSystem(systemCenter, i);
    }

    console.log(`✅ Created ${outerInterstellarSystems.length} outer interstellar systems`);
}

function createOuterSystem(center, systemId) {
    const systemGroup = new THREE.Group();
    systemGroup.position.copy(center);

    // Generate random tilt for THIS SYSTEM (all orbits share this plane)
    const systemTiltX = (Math.random() - 0.5) * Math.PI * 0.6; // Random tilt
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
        name: 'Unknown System',
        type: 'outer_interstellar_system',
        systemId: systemId,
        location: 'Unexplored Interstellar Space',
        starType: starType.name,
        orbiters: [],
        drones: [],
        cosmicFeature: null,
        discovered: false,
        tiltX: systemTiltX,
        tiltZ: systemTiltZ,
        systemColor: starType.color
    };

    // Create bright star at center
    createBrightStar(systemGroup, starType);

    // Create 2-5 planets orbiting the star
    const planetCount = 2 + Math.floor(Math.random() * 4); // 2-5 planets
    let maxOrbitRadius = 0;

    for (let i = 0; i < planetCount; i++) {
        const orbitRadius = 800 + (i * 600) + Math.random() * 400;
        maxOrbitRadius = Math.max(maxOrbitRadius, orbitRadius);
        createOrbitingPlanet(systemGroup, orbitRadius, i);
        createSystemOrbitLine(systemGroup, orbitRadius);
    }

    // Create rotating starfield (radius = 0.5x the largest orbit radius)
    const starfieldRadius = maxOrbitRadius * 0.5;
    createSystemStarfield(starfieldRadius, systemGroup);

    // Create 2-3 BORG drones patrolling the system
    const droneCount = 2 + Math.floor(Math.random() * 2); // 2-3 drones
    for (let i = 0; i < droneCount; i++) {
        createBorgDrone(systemGroup, maxOrbitRadius, i);
    }

    // Create 1 cosmic feature in orbit
    createCosmicFeature(systemGroup, maxOrbitRadius);

    scene.add(systemGroup);
    outerInterstellarSystems.push(systemGroup);

    console.log(`  🌟 Unknown System created: ${starType.name} star with ${planetCount} planets at ${center.length().toFixed(0)} units`);
}

// =============================================================================
// BRIGHT STAR CREATION
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
    star.position.set(0, 0, 0); // LOCAL - systemGroup is already at center

    star.userData = {
        type: 'star',
        name: `${systemGroup.userData.name} Star`,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: starRadius,
        mass: 5.0,
        slingshotMultiplier: 4.0,
        starType: starType.name
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
// ORBITING PLANETS
// =============================================================================

function createOrbitingPlanet(systemGroup, orbitRadius, index) {
    // Varied planet sizes
    const planetRadius = 20 + Math.random() * 40;

    // Varied planet colors
    const planetColors = [
        0x8B7355, // Brown/rocky
        0x4A90E2, // Blue/water
        0xE86A17, // Orange/gas
        0x9B59B6, // Purple/exotic
        0x2ECC71, // Green/habitable
        0xE74C3C, // Red/desert
        0x95A5A6  // Gray/barren
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
        name: `${systemGroup.userData.name} Planet ${String.fromCharCode(65 + index)}`, // A, B, C...
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
        rotationSpeed: (Math.random() - 0.5) * 0.02
    };

    systemGroup.userData.orbiters.push(planet);
    systemGroup.add(planet);

    return planet;
}

// =============================================================================
// BORG DRONES
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

    // Position drone in patrol orbit
    const patrolRadius = maxOrbitRadius * 1.3;
    const angle = (index / 3) * Math.PI * 2;
    droneGroup.position.set(
        Math.cos(angle) * patrolRadius,
        (Math.random() - 0.5) * 200,
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
// COSMIC FEATURES
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

    // Position in orbit
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

    systemGroup.userData.orbiters.push(feature);
    systemGroup.userData.cosmicFeature = feature;
    systemGroup.add(feature);

    return feature;
}

function createCrystalStructure() {
    const group = new THREE.Group();

    // Large central crystal
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

    // Smaller orbiting crystals
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

    // Sphere framework
    const sphereGeo = new THREE.SphereGeometry(150, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({
        color: 0xFFAA00,
        wireframe: true,
        transparent: true,
        opacity: 0.6
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    group.add(sphere);

    // Energy collectors (panels)
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

    // Body
    const bodyGeo = new THREE.SphereGeometry(60, 24, 24);
    bodyGeo.scale(2, 1, 1); // Elongate
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x4A5F7F,
        metalness: 0.3,
        roughness: 0.7,
        emissive: 0x2A3F5F,
        emissiveIntensity: 0.3
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // Tail fins
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

    // Glowing eyes
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
// ORBIT LINES
// =============================================================================

function createSystemOrbitLine(systemGroup, radius) {
    const segments = 128;
    const points = [];

    // Use the system's shared tilt
    const tiltX = systemGroup.userData.tiltX;
    const tiltZ = systemGroup.userData.tiltZ;
    const orbitColor = systemGroup.userData.systemColor;

    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        let x = Math.cos(angle) * radius;
        let y = 0;
        let z = Math.sin(angle) * radius;

        // Apply system tilt
        const rotatedX = x;
        const rotatedY = y * Math.cos(tiltX) - z * Math.sin(tiltX);
        const rotatedZ = y * Math.sin(tiltX) + z * Math.cos(tiltX);

        const finalX = rotatedX * Math.cos(tiltZ) - rotatedY * Math.sin(tiltZ);
        const finalY = rotatedX * Math.sin(tiltZ) + rotatedY * Math.cos(tiltZ);
        const finalZ = rotatedZ;

        // LOCAL COORDINATES - no center offset
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
// ROTATING STARFIELD
// =============================================================================

function createSystemStarfield(maxRadius, systemGroup) {
    const starCount = 300 + Math.floor(Math.random() * 200);
    const starfieldRadius = maxRadius;

    const positions = [];
    const colors = [];
    const sizes = [];

    // White/yellow/blue star colors
    const starColors = [
        new THREE.Color(0xffffff), // White
        new THREE.Color(0xffffee), // Warm white
        new THREE.Color(0xffeeaa), // Light yellow
        new THREE.Color(0xaaccff), // Light blue
    ];

    for (let i = 0; i < starCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = Math.random() * starfieldRadius;

        // LOCAL coordinates since we're adding to systemGroup
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
// ANIMATION
// =============================================================================

function updateOuterSystems() {
    if (!camera || !camera.position) return;

    const playerPos = camera.position;

    outerInterstellarSystems.forEach(system => {
        if (!system.userData || !system.userData.orbiters) return;

        // Distance-based opacity for far systems
        const systemDist = system.position.distanceTo(playerPos);
        const blurStart = 50000;
        const blurMax = 80000;

        let opacity = 1.0;
        if (systemDist > blurStart) {
            opacity = 1.0 - Math.min(1, (systemDist - blurStart) / (blurMax - blurStart));
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

        // Update orbiters (planets, drones, cosmic features)
        system.userData.orbiters.forEach(orbiter => {
            if (!orbiter.userData.orbitAngle) return;

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
