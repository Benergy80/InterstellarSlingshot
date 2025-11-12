// Outer Interstellar Systems - Deep space systems beyond known galaxies
// Located between 40000 units and skybox boundary
// Features: Supernova/Plasma Storm/Solar Storm cores with orbiting Brown Dwarfs, Pulsars, and asteroids

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

// Local references for code convenience
const outerInterstellarSystems = window.outerInterstellarSystems;
const outerSystemNames = window.outerSystemNames;

// =============================================================================
// MAIN CREATION FUNCTION
// =============================================================================

function createOuterInterstellarSystems() {
    console.log('🌌 Creating 16 outer interstellar systems in deep space...');
    
    const innerBoundary = 40000; // Furthest galaxy
    const outerBoundary = 100000; // Near skybox (universe radius ~100000)
    const targetRadius = (innerBoundary + outerBoundary) / 2; // ~62500
    const radiusVariation = 10000;
    
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
    
    // Generate random tilt for THIS SYSTEM (all orbits share this plane)
    const systemTiltX = (Math.random() - 0.5) * Math.PI * 0.4;
    const systemTiltZ = (Math.random() - 0.5) * Math.PI * 0.4;
    
    // CMB color for this system
    const cmbColors = [0xff6b35, 0xff9933, 0xffd700, 0xffffff, 0xffaa88];
    const systemColor = cmbColors[Math.floor(Math.random() * cmbColors.length)];
    
    systemGroup.userData = {
        name: name,
        type: 'outer_interstellar_system',
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
        createSystemOrbitLine(center, orbitRadius, systemGroup); // REMOVED COLOR PARAM
    }
    
    // Orbiting pulsars (1-3)
    const pulsarCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pulsarCount; i++) {
        const orbitRadius = 1500 + Math.random() * 1500;
        createOrbitingPulsar(center, orbitRadius, i, systemGroup);
        createSystemOrbitLine(center, orbitRadius, systemGroup); // REMOVED COLOR PARAM
    }
    
    // Asteroid field
    const asteroidOrbitRadius = 600 + Math.random() * 800;
    const asteroidCount = 20 + Math.floor(Math.random() * 30);
    for (let i = 0; i < asteroidCount; i++) {
        createOrbitingAsteroid(center, asteroidOrbitRadius, i, systemGroup);
    }
    
    createSystemOrbitLine(center, asteroidOrbitRadius, systemGroup);
    
    // CREATE ONE LARGE STARFIELD FOR THIS ENTIRE SYSTEM
    // Calculate max orbit radius from pulsars (which have the largest orbits)
    const maxOrbitRadius = 1500 + 1500; // Max pulsar orbit
    const starfieldRadius = maxOrbitRadius * 0.5; // Half the system radius
    createSystemStarfield(starfieldRadius, systemGroup);
    
    scene.add(systemGroup);
    outerInterstellarSystems.push(systemGroup);
    
    console.log(`  🌟 ${name}: ${centerType} at ${center.length().toFixed(0)} units`);
}

// =============================================================================
// CENTER OBJECT CREATION
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
    core.position.set(0, 0, 0); // LOCAL - systemGroup is already at center
    
    core.userData = {
        type: 'supernova',
        name: `${systemGroup.userData.name} Core`,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: 80,
        mass: 3.0,
        slingshotMultiplier: 3.0
    };

    systemGroup.add(core); // Add to systemGroup only
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
        glow.position.set(0, 0, 0); // LOCAL
        systemGroup.add(glow);
    }
    
    // Light
    const light = new THREE.PointLight(0xff6600, 15, 5000);
    light.position.set(0, 0, 0); // LOCAL
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
    core.position.set(0, 0, 0); // LOCAL
    
    core.userData = {
        type: 'plasma_storm',
        name: `${systemGroup.userData.name} Core`,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: 60,
        mass: 2.5,
        slingshotMultiplier: 2.8
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
            Math.cos(angle) * 100, // LOCAL
            0,
            Math.sin(angle) * 100
        );
        systemGroup.add(cloud);
    }
    
    const light = new THREE.PointLight(0xaa44ff, 12, 5000);
    light.position.set(0, 0, 0); // LOCAL
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
    core.position.set(0, 0, 0); // LOCAL
    
    core.userData = {
        type: 'solar_storm',
        name: `${systemGroup.userData.name} Core`,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: 70,
        mass: 2.0,
        slingshotMultiplier: 2.2
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
            Math.cos(angle) * 90, // LOCAL
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
    light.position.set(0, 0, 0); // LOCAL
    systemGroup.add(light);
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
        Math.cos(angle) * orbitRadius, // LOCAL
        0,
        Math.sin(angle) * orbitRadius
    );
    
    dwarf.userData = {
        type: 'brown_dwarf',
        name: `${systemGroup.userData.name} Brown Dwarf ${index + 1}`,
        orbitCenter: new THREE.Vector3(0, 0, 0),
        orbitRadius: orbitRadius,
        orbitSpeed: 0.0003 + Math.random() * 0.0004, // INCREASED from 0.0001
        orbitAngle: angle,
        systemId: systemGroup.userData.systemId,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: 35,
        mass: 0.08,
        slingshotMultiplier: 1.3
    };
    
    systemGroup.userData.orbiters.push(dwarf);
    systemGroup.add(dwarf); // Add to systemGroup
    
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
        Math.cos(angle) * orbitRadius, // LOCAL
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
        orbitSpeed: 0.0002 + Math.random() * 0.0003, // INCREASED from 0.00005
        orbitAngle: angle,
        rotationSpeed: 0.02 + Math.random() * 0.03,
        systemId: systemGroup.userData.systemId,
        systemName: systemGroup.userData.name,
        location: 'Unexplored Interstellar Space',
        radius: 20,
        mass: 1.4,
        slingshotMultiplier: 2.5
    };
    
    systemGroup.userData.orbiters.push(pulsar);
    systemGroup.add(pulsar); // Add to systemGroup
    
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
// ORBIT LINES
// =============================================================================

function createSystemOrbitLine(center, radius, systemGroup) {
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
        opacity: 0.2
    });
    const line = new THREE.Line(geo, mat);
    line.userData = { type: 'orbit_line', orbitColor: orbitColor };
    
    systemGroup.add(line);
}

function createSystemStarfield(maxRadius, systemGroup) {
    const starCount = 200 + Math.floor(Math.random() * 300);
    const starfieldRadius = maxRadius;
    
    const positions = [];
    const colors = [];
    const sizes = [];
    
    // White/yellow colors only
    const starColors = [
        new THREE.Color(0xffffff), // White
        new THREE.Color(0xffffee), // Warm white
        new THREE.Color(0xffeeaa), // Light yellow
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
        sizes.push(1 + Math.random() * 2);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    
    const material = new THREE.PointsMaterial({
        size: 3,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true
    });
    
    const starfield = new THREE.Points(geometry, material);
    starfield.userData = { 
        type: 'system_starfield',
        rotationSpeed: 0.005 + Math.random() * 0.01
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
        
        const systemDist = system.position.distanceTo(playerPos);
        const blurStart = 45000;
        const blurMax = 65000;
        
        let opacity = 1.0;
        if (systemDist > blurStart) {
            opacity = 1.0 - Math.min(1, (systemDist - blurStart) / (blurMax - blurStart));
        }
        
        const tiltX = system.userData.tiltX || 0;
        const tiltZ = system.userData.tiltZ || 0;
        
        // Update all children
        system.children.forEach(child => {
            // ROTATE STARFIELD FAST
            if (child.userData && child.userData.type === 'system_starfield') {
                child.rotation.y += child.userData.rotationSpeed;
                child.rotation.x += child.userData.rotationSpeed * 0.5;
                if (child.material) {
                    child.material.opacity = opacity;
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
        
        // Update orbiters
        system.userData.orbiters.forEach(orbiter => {
            if (!orbiter.userData.orbitAngle) return;
            
            orbiter.userData.orbitAngle += orbiter.userData.orbitSpeed;
            
            let x = Math.cos(orbiter.userData.orbitAngle) * orbiter.userData.orbitRadius;
            let y = 0;
            let z = Math.sin(orbiter.userData.orbitAngle) * orbiter.userData.orbitRadius;
            
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
            
             if (orbiter.userData.type === 'pulsar') {
                orbiter.rotation.y += orbiter.userData.rotationSpeed;
            }
            
            // Add asteroid tumbling
            if (orbiter.userData.type === 'outer_asteroid') {
                orbiter.rotation.x += orbiter.userData.rotationSpeedX;
                orbiter.rotation.y += orbiter.userData.rotationSpeedY;
                orbiter.rotation.z += orbiter.userData.rotationSpeedZ;
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
