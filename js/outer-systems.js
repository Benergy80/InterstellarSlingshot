// Outer Interstellar Systems - Deep space systems beyond known galaxies
// Located between 40000 units and skybox boundary
// Features: Supernova/Plasma Storm/Solar Storm cores with orbiting Brown Dwarfs, Pulsars, and asteroids

const outerInterstellarSystems = [];

const outerSystemNames = [
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

// =============================================================================
// MAIN CREATION FUNCTION
// =============================================================================

function createOuterInterstellarSystems() {
    console.log('🌌 Creating 16 outer interstellar systems in deep space...');
    
    const innerBoundary = 40000; // Furthest galaxy
    const outerBoundary = 85000; // Near skybox (universe radius ~100000)
    const targetRadius = (innerBoundary + outerBoundary) / 2; // ~62500
    const radiusVariation = 8000;
    
    for (let i = 0; i < 16; i++) {
        // Spherical distribution
        const phi = (i / 16) * Math.PI * 2; // Around equator
        const theta = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.3;
        const radius = targetRadius + (Math.random() - 0.5) * radiusVariation;
        
        const x = radius * Math.sin(theta) * Math.cos(phi);
        const y = radius * Math.cos(theta);
        const z = radius * Math.sin(theta) * Math.sin(phi);
        
        const systemCenter = new THREE.Vector3(x, y, z);
        const centerTypes = ['supernova', 'plasma_storm', 'solar_storm'];
        const centerType = centerTypes[Math.floor(Math.random() * centerTypes.length)];
        
        createOuterSystem(systemCenter, outerSystemNames[i], centerType, i);
    }
    
    console.log(`✅ Created ${outerInterstellarSystems.length} outer interstellar systems`);
}

function createOuterSystem(center, name, centerType, systemId) {
    const systemGroup = new THREE.Group();
    systemGroup.position.copy(center);
    systemGroup.userData = {
        name: name,
        type: 'outer_interstellar_system',
        systemId: systemId,
        location: 'Unexplored Interstellar Space',
        centerType: centerType,
        orbiters: [],
        discovered: false // Track discovery
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
        createSystemOrbitLine(center, orbitRadius, 0x8b4513, systemGroup);
    }
    
    // Orbiting pulsars (1-3)
    const pulsarCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pulsarCount; i++) {
        const orbitRadius = 1500 + Math.random() * 1500;
        createOrbitingPulsar(center, orbitRadius, i, systemGroup);
        createSystemOrbitLine(center, orbitRadius, 0x44eeff, systemGroup);
    }
    
    // Asteroid field
    const asteroidOrbitRadius = 600 + Math.random() * 800;
    const asteroidCount = 20 + Math.floor(Math.random() * 30);
    for (let i = 0; i < asteroidCount; i++) {
        createOrbitingAsteroid(center, asteroidOrbitRadius, i, systemGroup);
    }
    createSystemOrbitLine(center, asteroidOrbitRadius, 0x666666, systemGroup);
    
    scene.add(systemGroup);
    outerInterstellarSystems.push(systemGroup);
    
    console.log(`  🌟 ${name}: ${centerType} at ${center.length().toFixed(0)} units`);
}

// =============================================================================
// CENTER OBJECT CREATION
// =============================================================================

function createSystemSupernova(center, systemGroup) {
    // Core - using MeshStandardMaterial for emissive support
    const coreGeo = new THREE.SphereGeometry(80, 32, 32);
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff6600,
        emissiveIntensity: 2,
        roughness: 0.2,
        metalness: 0.5
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.copy(center);
    
    core.userData = {
        type: 'supernova',
        name: `${systemGroup.userData.name} Core`,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: 80,
        mass: 3.0,
        slingshotMultiplier: 3.0
    };

    scene.add(core);

    // ADD TO PLANETS ARRAY
    if (typeof planets !== 'undefined') {
        planets.push(core);
    }

    systemGroup.userData.centerObject = core;
    
    // Glow layers - MeshBasicMaterial is fine here
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
        glow.userData.baseOpacity = opacity; // ADD THIS
        glow.position.copy(center);
        systemGroup.add(glow);
    }
    
    // Light
    const light = new THREE.PointLight(0xff6600, 15, 5000);
    light.position.copy(center);
    systemGroup.add(light);
    systemGroup.add(core);
}

function createSystemPlasmaStorm(center, systemGroup) {
    // Core - using MeshStandardMaterial for emissive support
    const coreGeo = new THREE.SphereGeometry(60, 32, 32);
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0xaa44ff,
        emissive: 0xaa44ff,
        emissiveIntensity: 2,
        roughness: 0.2,
        metalness: 0.4
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.copy(center);
    
    core.userData = {
        type: 'plasma_storm',
        name: `${systemGroup.userData.name} Core`,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: 60,
        mass: 2.5,
        slingshotMultiplier: 2.8
    };

    scene.add(core);

    // ADD TO PLANETS ARRAY
    if (typeof planets !== 'undefined') {
        planets.push(core);
    }

    systemGroup.userData.centerObject = core;
    
    // Plasma clouds - MeshBasicMaterial is fine here
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
        cloud.position.set(
            center.x + Math.cos(angle) * 100,
            center.y + (Math.random() - 0.5) * 50,
            center.z + Math.sin(angle) * 100
        );
        systemGroup.add(cloud);
        cloud.userData.baseOpacity = 0.6; // ADD THIS LINE
    }
    
    const light = new THREE.PointLight(0xaa44ff, 12, 4000);
    light.position.copy(center);
    systemGroup.add(light);
    systemGroup.add(core);
}

function createSystemSolarStorm(center, systemGroup) {
    // Core - using MeshStandardMaterial for emissive support
    const coreGeo = new THREE.SphereGeometry(70, 32, 32);
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 2,
        roughness: 0.2,
        metalness: 0.3
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.copy(center);
    
    core.userData = {
        type: 'solar_storm',
        name: `${systemGroup.userData.name} Core`,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: 70,
        mass: 2.8,
        slingshotMultiplier: 3.2
    };

    scene.add(core);

    // ADD TO PLANETS ARRAY
    if (typeof planets !== 'undefined') {
        planets.push(core);
    }

    systemGroup.userData.centerObject = core;
    
    // Flares - MeshBasicMaterial is fine here
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
            center.x + Math.cos(angle) * 90,
            center.y,
            center.z + Math.sin(angle) * 90
        );
        flare.lookAt(new THREE.Vector3(
            center.x + Math.cos(angle) * 200,
            center.y,
            center.z + Math.sin(angle) * 200
        ));
        systemGroup.add(flare);
        flare.userData.baseOpacity = 0.7; // ADD THIS LINE
    }
    
    const light = new THREE.PointLight(0xffff00, 18, 5000);
    light.position.copy(center);
    systemGroup.add(light);
    systemGroup.add(core);
}

// =============================================================================
// ORBITING OBJECTS
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
        center.x + Math.cos(angle) * orbitRadius,
        center.y,
        center.z + Math.sin(angle) * orbitRadius
    );
    
    dwarf.userData = {
        type: 'brown_dwarf',
        name: `${systemGroup.userData.name} Brown Dwarf ${index + 1}`,
        orbitCenter: center.clone(),
        orbitRadius: orbitRadius,
        orbitSpeed: 0.0001 + Math.random() * 0.0002,
        orbitAngle: angle,
        systemId: systemGroup.userData.systemId,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        // Slingshot properties
        radius: 35,
        mass: 0.08,
        slingshotMultiplier: 1.3
    };
    
    systemGroup.userData.orbiters.push(dwarf);
    scene.add(dwarf); // NEW
    
    // ADD TO PLANETS ARRAY FOR PHYSICS - NEW
    if (typeof planets !== 'undefined') {
        planets.push(dwarf);
    }
    
    return dwarf;
}

function createOrbitingPulsar(center, orbitRadius, index, systemGroup) {
    // Core - use MeshStandardMaterial for proper emissive glow
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
        center.x + Math.cos(angle) * orbitRadius,
        center.y,
        center.z + Math.sin(angle) * orbitRadius
    );
    
    // Magnetic field visualization
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
        orbitCenter: center.clone(),
        orbitRadius: orbitRadius,
        orbitSpeed: 0.00008 + Math.random() * 0.00015,
        orbitAngle: angle,
        rotationSpeed: 0.05,
        systemId: systemGroup.userData.systemId,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        // Slingshot properties
        radius: 20,
        mass: 1.4,
        slingshotMultiplier: 2.5
    };
    
    systemGroup.userData.orbiters.push(pulsar);
    scene.add(pulsar);
    
    // ADD TO PLANETS ARRAY FOR PHYSICS
    if (typeof planets !== 'undefined') {
        planets.push(pulsar);
    }
    
    return pulsar;
}
function createOrbitingAsteroid(center, orbitRadius, index, systemGroup) {
    const size = 3 + Math.random() * 5;
    const geo = new THREE.DodecahedronGeometry(size);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x666666,
        metalness: 0.2,
        roughness: 0.9
    });
    const asteroid = new THREE.Mesh(geo, mat);
    
    const angle = (index / 50) * Math.PI * 2;
    const radiusVar = orbitRadius + (Math.random() - 0.5) * 100;
    
    asteroid.position.set(
        center.x + Math.cos(angle) * radiusVar,
        center.y + (Math.random() - 0.5) * 50,
        center.z + Math.sin(angle) * radiusVar
    );
    
    asteroid.userData = {
        type: 'outer_asteroid',
        orbitCenter: center.clone(),
        orbitRadius: radiusVar,
        orbitSpeed: 0.0002 + Math.random() * 0.0003,
        orbitAngle: angle,
        systemId: systemGroup.userData.systemId
    };
    
    systemGroup.userData.orbiters.push(asteroid);
    return asteroid;
}

// =============================================================================
// ORBIT LINES
// =============================================================================

function createSystemOrbitLine(center, radius, color, systemGroup) {
    const segments = 128;
    const points = [];
    
    // Random tilt for each orbit
    const tiltX = (Math.random() - 0.5) * Math.PI * 0.4;
    const tiltZ = (Math.random() - 0.5) * Math.PI * 0.4;
    
    // CMB color variations
    const cmbColors = [0xff6b35, 0xff9933, 0xffd700, 0xffffff, 0xffaa88];
    const orbitColor = cmbColors[Math.floor(Math.random() * cmbColors.length)];
    
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        let x = Math.cos(angle) * radius;
        let y = 0;
        let z = Math.sin(angle) * radius;
        
        // Apply tilt
        const rotatedX = x;
        const rotatedY = y * Math.cos(tiltX) - z * Math.sin(tiltX);
        const rotatedZ = y * Math.sin(tiltX) + z * Math.cos(tiltX);
        
        const finalX = rotatedX * Math.cos(tiltZ) - rotatedY * Math.sin(tiltZ);
        const finalY = rotatedX * Math.sin(tiltZ) + rotatedY * Math.cos(tiltZ);
        const finalZ = rotatedZ;
        
        points.push(new THREE.Vector3(
            center.x + finalX,
            center.y + finalY,
            center.z + finalZ
        ));
    }
    
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
        color: orbitColor,
        transparent: true,
        opacity: 0.4
    });
    const line = new THREE.Line(geo, mat);
    line.userData = { type: 'orbit_line', orbitColor: orbitColor };
    
    systemGroup.add(line);
    
    // Create star-field around this system with matching color
    createSystemStarfield(center, radius, orbitColor, systemGroup);
}

function createSystemStarfield(center, maxRadius, color, systemGroup) {
    const starCount = 200 + Math.floor(Math.random() * 300);
    const starfieldRadius = maxRadius * 0.5;
    
    const positions = [];
    const colors = [];
    const sizes = [];
    
    const baseColor = new THREE.Color(color);
    
    for (let i = 0; i < starCount; i++) {
        // Spherical distribution
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = Math.random() * starfieldRadius;
        
        const x = center.x + r * Math.sin(phi) * Math.cos(theta);
        const y = center.y + r * Math.sin(phi) * Math.sin(theta);
        const z = center.z + r * Math.cos(phi);
        
        positions.push(x, y, z);
        
        // Vary color slightly
        const colorVariation = new THREE.Color(
            baseColor.r * (0.8 + Math.random() * 0.4),
            baseColor.g * (0.8 + Math.random() * 0.4),
            baseColor.b * (0.8 + Math.random() * 0.4)
        );
        colors.push(colorVariation.r, colorVariation.g, colorVariation.b);
        sizes.push(1 + Math.random() * 2);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    
    const material = new THREE.PointsMaterial({
        size: 2,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        sizeAttenuation: true
    });
    
    const starfield = new THREE.Points(geometry, material);
    starfield.userData = { type: 'system_starfield' };
    systemGroup.add(starfield);
}

// =============================================================================
// ANIMATION
// =============================================================================

function updateOuterSystems() {
    const playerPos = camera.position;
    
    outerInterstellarSystems.forEach(system => {
        if (!system.userData.orbiters) return;
        
        // Distance blurring
        const systemDist = system.position.distanceTo(playerPos);
        const blurStart = 30000;
        const blurMax = 60000;
        
        let opacity = 1.0;
        if (systemDist > blurStart) {
            opacity = 1.0 - Math.min(1, (systemDist - blurStart) / (blurMax - blurStart));
        }
        
        // Apply opacity to all system objects
        system.traverse((child) => {
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => {
                        if (mat.transparent !== false) {
                            mat.transparent = true;
                            mat.opacity = Math.min(mat.opacity, opacity);
                        }
                    });
                } else {
                    if (child.material.transparent !== false) {
                        child.material.transparent = true;
                        const baseMaterialOpacity = child.userData.baseOpacity || 1.0;
                        child.material.opacity = baseMaterialOpacity * opacity;
                    }
                }
            }
        });
        
        system.userData.orbiters.forEach(orbiter => {
            if (!orbiter.userData.orbitAngle) return;
            
            orbiter.userData.orbitAngle += orbiter.userData.orbitSpeed;
            
            const x = orbiter.userData.orbitCenter.x + 
                     Math.cos(orbiter.userData.orbitAngle) * orbiter.userData.orbitRadius;
            const z = orbiter.userData.orbitCenter.z + 
                     Math.sin(orbiter.userData.orbitAngle) * orbiter.userData.orbitRadius;
            
            orbiter.position.x = x;
            orbiter.position.z = z;
            
            if (orbiter.userData.type === 'pulsar') {
                orbiter.rotation.y += orbiter.userData.rotationSpeed;
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
