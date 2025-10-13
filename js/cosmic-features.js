// Enhanced Cosmic Features - Special Universe Objects
// Adds pulsars, supernovas, brown dwarfs, dark matter, megastructures, and more
// Integrates with existing game systems for combat, navigation, and energy management
// ENHANCED: Full 3D integration with fallback compatibility

// =============================================================================
// COSMIC PHENOMENON DEFINITIONS
// =============================================================================

const cosmicFeatures = {
    pulsars: [],
    supernovas: [],
    brownDwarfs: [],
    darkMatterNodes: [],
    dysonSpheres: [],
    ringworlds: [],
    solarStorms: [],
    roguePlanets: [],
    spaceWhales: [],
    crystalFormations: [],
    plasmaStorms: []
};

// Special effects timing
let pulsarBeamTime = 0;
let supernovaExpansionTime = 0;
let plasmaStormTime = 0;

// =============================================================================
// ENHANCED 3D UTILITY FUNCTIONS WITH FALLBACK COMPATIBILITY
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
    
    // ENHANCED: Use 3D positioning if available (preferred method)
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
    const universeRadius = 40000; // Match the doubled scale system
    
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
// NEBULA-AWARE POSITIONING SYSTEM
// =============================================================================

function getCosmicFeaturePosition(galaxyId) {
    // 50% chance to spawn in a nebula if nebulas exist
    if (Math.random() < 0.75 && typeof nebulaClouds !== 'undefined' && nebulaClouds.length > 0) {
        // Filter nebulas by galaxy if possible
        let availableNebulas = nebulaClouds;
        
        // Try to match galaxy (nebulas might not have galaxyId)
        const galaxyNebulas = nebulaClouds.filter(n => n.userData && n.userData.galaxyId === galaxyId);
        if (galaxyNebulas.length > 0) {
            availableNebulas = galaxyNebulas;
        }
        
        // Pick random nebula
        const nebula = availableNebulas[Math.floor(Math.random() * availableNebulas.length)];
        
        // Position within nebula (offset from center)
        const nebulaRadius = 2000; // Typical nebula size
        const offset = new THREE.Vector3(
            (Math.random() - 0.5) * nebulaRadius,
            (Math.random() - 0.5) * nebulaRadius * 0.5,
            (Math.random() - 0.5) * nebulaRadius
        );
        
        const position = nebula.position.clone().add(offset);
        
        console.log(`🌫️ Cosmic feature spawned in nebula at galaxy ${galaxyId}`);
        return position;
    }
    
    // 50% chance: normal random position in galaxy
    return getRandomGalaxyPosition(galaxyId);
}

// =============================================================================
// PULSARS - RAPIDLY ROTATING NEUTRON STARS
// =============================================================================

function createPulsars() {
    console.log('Creating rare pulsars in distant galaxies...');
    
    if (typeof galaxyTypes === 'undefined') {
        console.warn('galaxyTypes not available, skipping pulsar creation');
        return;
    }
    
    galaxyTypes.forEach((galaxyType, galaxyId) => {
        // RARE: Only 15% chance per galaxy, skip local galaxy
        if (Math.random() > 0.15 || galaxyId === 7) return; // Galaxy 7 is often local/Sol
        
        const position = getCosmicFeaturePosition(galaxyId);
        if (!position) return; // Skip if position generation failed
        
        // Pulsar core - ultra-dense neutron star
const pulsarGeometry = new THREE.SphereGeometry(8, 16, 16);
const pulsarMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    emissive: 0x004444,
    emissiveIntensity: 1.0,
    roughness: 0.3,
    metalness: 0.8
});
        const pulsar = new THREE.Mesh(pulsarGeometry, pulsarMaterial);
        pulsar.position.copy(position);
        
        // Rotating magnetic field visualization
        const magneticFieldGeometry = new THREE.TorusGeometry(25, 3, 8, 16);
        const magneticFieldMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0080,
            transparent: true,
            opacity: 0.6,
            wireframe: true
        });
        const magneticField = new THREE.Mesh(magneticFieldGeometry, magneticFieldMaterial);
        magneticField.rotation.x = Math.PI / 2;
        pulsar.add(magneticField);
        
        // Pulsar beam indicators
        for (let beam = 0; beam < 2; beam++) {
            const beamGeometry = new THREE.ConeGeometry(2, 150, 8);
            const beamMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.3,
                blending: THREE.AdditiveBlending
            });
            const beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);
            beamMesh.position.y = beam === 0 ? 75 : -75;
            beamMesh.rotation.x = beam === 0 ? 0 : Math.PI;
            pulsar.add(beamMesh);
        }
        
        pulsar.userData = {
            name: `Pulsar-${galaxyId}-${cosmicFeatures.pulsars.length}`,
            type: 'pulsar',
            galaxyId: galaxyId,
            rotationSpeed: 0.5 + Math.random() * 2.0,
            pulseFrequency: 0.1 + Math.random() * 0.4,
            magneticFieldStrength: 50 + Math.random() * 100,
            energyOutput: 30 + Math.random() * 50,
            navigationJamming: true,
            lastPulse: 0
        };
        
        pulsar.visible = true;
        pulsar.frustumCulled = false;
        
        cosmicFeatures.pulsars.push(pulsar);
        if (typeof scene !== 'undefined') {
            scene.add(pulsar);
        }
    });
    
    console.log(`Created ${cosmicFeatures.pulsars.length} rare pulsars in distant galaxies`);
}

// =============================================================================
// SUPERNOVAS - EXPLODING STARS WITH EXPANDING SHOCKWAVES
// =============================================================================

function createSupernovas() {
    console.log('Creating rare supernovas in distant galaxies...');
    
    if (typeof galaxyTypes === 'undefined') {
        console.warn('galaxyTypes not available, skipping supernova creation');
        return;
    }
    
    galaxyTypes.forEach((galaxyType, galaxyId) => {
        // RARE: Only 25% chance per galaxy, skip local galaxy
        if (Math.random() > 0.25 || galaxyId === 7) return;
        
        const position = getCosmicFeaturePosition(galaxyId);
        if (!position) return;
        
        // Supernova remnant core
        const coreGeometry = new THREE.SphereGeometry(15, 16, 16);
const coreMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffaa00,
    emissiveIntensity: 2.0,
    roughness: 0.2,
    metalness: 0.5
});
        const supernovaCore = new THREE.Mesh(coreGeometry, coreMaterial);
        supernovaCore.position.copy(position);
        
        // Expanding shockwave shells
        const shockwaveShells = [];
        for (let shell = 0; shell < 3; shell++) {
            const shellRadius = 80 + (shell * 40);
            const shellGeometry = new THREE.SphereGeometry(shellRadius, 16, 16);
            const shellMaterial = new THREE.MeshBasicMaterial({
                color: shell === 0 ? 0xff4400 : shell === 1 ? 0xff6600 : 0xff8800,
                transparent: true,
                opacity: 0.4 - (shell * 0.1),
                wireframe: true
            });
            const shellMesh = new THREE.Mesh(shellGeometry, shellMaterial);
            shellMesh.userData = {
                baseRadius: shellRadius,
                expansionSpeed: 0.5 + shell * 0.2
            };
            supernovaCore.add(shellMesh);
            shockwaveShells.push(shellMesh);
        }
        
        // Debris field
        const debrisGeometry = new THREE.BufferGeometry();
        const debrisVertices = [];
        const debrisCount = 200;
        
        for (let i = 0; i < debrisCount; i++) {
            const radius = 100 + Math.random() * 200;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            
            debrisVertices.push(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.cos(phi),
                radius * Math.sin(phi) * Math.sin(theta)
            );
        }
        
        debrisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(debrisVertices, 3));
        const debrisMaterial = new THREE.PointsMaterial({
            color: 0xffaa44,
            size: 3,
            transparent: true,
            opacity: 0.8
        });
        const debrisField = new THREE.Points(debrisGeometry, debrisMaterial);
        supernovaCore.add(debrisField);
        
        supernovaCore.userData = {
            name: `Supernova-${galaxyId}-${cosmicFeatures.supernovas.length}`,
            type: 'supernova',
            galaxyId: galaxyId,
            expansionRate: 0.5 + Math.random() * 0.3,
            energyOutput: 100 + Math.random() * 150,
            radiationLevel: 80 + Math.random() * 40,
            shockwaveShells: shockwaveShells,
            debrisField: debrisField
        };
        
        supernovaCore.visible = true;
        supernovaCore.frustumCulled = false;
        
        cosmicFeatures.supernovas.push(supernovaCore);
        if (typeof scene !== 'undefined') {
            scene.add(supernovaCore);
        }
    });
    
    console.log(`Created ${cosmicFeatures.supernovas.length} rare supernovas in distant galaxies`);
}

// =============================================================================
// BROWN DWARFS - FAILED STARS
// =============================================================================

function createBrownDwarfs() {
    console.log('Creating brown dwarfs across the universe...');
    
    if (typeof galaxyTypes === 'undefined') {
        console.warn('galaxyTypes not available, skipping brown dwarf creation');
        return;
    }
    
    galaxyTypes.forEach((galaxyType, galaxyId) => {
        const brownDwarfCount = Math.floor(Math.random() * 3) + 1;
        
        for (let i = 0; i < brownDwarfCount; i++) {
            const position = getCosmicFeaturePosition(galaxyId);
            if (!position) continue;
            
            // Brown dwarf main body
         const brownDwarfGeometry = new THREE.SphereGeometry(20, 16, 16);
const brownDwarfMaterial = new THREE.MeshStandardMaterial({
    color: 0x4d2600,
    emissive: 0x331100,
    emissiveIntensity: 0.8,
    roughness: 0.7,
    metalness: 0.2
});
            const brownDwarf = new THREE.Mesh(brownDwarfGeometry, brownDwarfMaterial);
            brownDwarf.position.copy(position);
            
            // Dim atmospheric glow
            const glowGeometry = new THREE.SphereGeometry(25, 16, 16);
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: 0x663300,
                transparent: true,
                opacity: 0.2,
                blending: THREE.AdditiveBlending
            });
            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            brownDwarf.add(glow);
            
            brownDwarf.userData = {
                name: `Brown-Dwarf-${galaxyId}-${i}`,
                type: 'brown_dwarf',
                galaxyId: galaxyId,
                mass: 10 + Math.random() * 20, // Weak gravity
                temperature: 800 + Math.random() * 1200, // Cool temperature
                detectionDifficulty: 0.8, // Hard to detect
                gravityAssist: 15 + Math.random() * 10
            };
            
            brownDwarf.visible = true;
            brownDwarf.frustumCulled = false;
            
            cosmicFeatures.brownDwarfs.push(brownDwarf);
            if (typeof scene !== 'undefined') {
                scene.add(brownDwarf);
            }
        }
    });
    
    console.log(`Created ${cosmicFeatures.brownDwarfs.length} brown dwarfs`);
}

// =============================================================================
// DARK MATTER CONCENTRATIONS - INVISIBLE GRAVITATIONAL ANOMALIES
// =============================================================================

function createDarkMatterNodes() {
    console.log('Creating dark matter concentrations...');
    
    if (typeof galaxyTypes === 'undefined') {
        console.warn('galaxyTypes not available, skipping dark matter node creation');
        return;
    }
    
    galaxyTypes.forEach((galaxyType, galaxyId) => {
        const nodeCount = Math.floor(Math.random() * 2) + 1;
        
        for (let i = 0; i < nodeCount; i++) {
            const position = getCosmicFeaturePosition(galaxyId);
            if (!position) continue;
            
            // Dark matter visualization (barely visible)
            const nodeGeometry = new THREE.SphereGeometry(50, 16, 16);
            const nodeMaterial = new THREE.MeshBasicMaterial({
                color: 0x440044,
                transparent: true,
                opacity: 0.1,
                wireframe: true
            });
            const darkMatterNode = new THREE.Mesh(nodeGeometry, nodeMaterial);
            darkMatterNode.position.copy(position);
            
            // Gravitational lensing effect indicators
            const ringCount = 3;
            for (let ring = 0; ring < ringCount; ring++) {
                const ringRadius = 60 + (ring * 20);
                const ringGeometry = new THREE.RingGeometry(ringRadius - 2, ringRadius + 2, 16);
                const ringMaterial = new THREE.MeshBasicMaterial({
                    color: 0x880088,
                    transparent: true,
                    opacity: 0.15 - (ring * 0.03),
                    side: THREE.DoubleSide
                });
                const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
                ringMesh.rotation.x = Math.random() * Math.PI;
                ringMesh.rotation.y = Math.random() * Math.PI;
                ringMesh.rotation.z = Math.random() * Math.PI;
                darkMatterNode.add(ringMesh);
            }
            
            darkMatterNode.userData = {
                name: `Dark-Matter-${galaxyId}-${i}`,
                type: 'dark_matter',
                galaxyId: galaxyId,
                gravitationalStrength: 100 + Math.random() * 200,
                slingshotMultiplier: 1.5 + Math.random() * 1.0,
                detectionRange: 300, // Only detected when very close
                invisible: true // Special handling for detection
            };
            
            darkMatterNode.visible = true;
            darkMatterNode.frustumCulled = false;
            
            cosmicFeatures.darkMatterNodes.push(darkMatterNode);
            if (typeof scene !== 'undefined') {
                scene.add(darkMatterNode);
            }
        }
    });
    
    console.log(`Created ${cosmicFeatures.darkMatterNodes.length} dark matter nodes`);
}

// =============================================================================
// DYSON SPHERES - ANCIENT MEGASTRUCTURES
// =============================================================================

function createDysonSpheres() {
    console.log('Creating extremely rare Dyson spheres...');
    
    if (typeof galaxyTypes === 'undefined') {
        console.warn('galaxyTypes not available, skipping Dyson sphere creation');
        return;
    }
    
    // EXTREMELY RARE: Only create 1-2 Dyson spheres total in distant galaxies
    const totalDysonSpheres = Math.floor(Math.random() * 1) + 1; // 1-2 max
    const usedGalaxies = [];
    
    for (let i = 0; i < totalDysonSpheres; i++) {
        let galaxyId;
        do {
            galaxyId = Math.floor(Math.random() * (galaxyTypes.length - 1)); // Exclude last galaxy (often local)
        } while (usedGalaxies.includes(galaxyId) || galaxyId === 7); // Skip local and used galaxies
        usedGalaxies.push(galaxyId);
        
        const position = getCosmicFeaturePosition(galaxyId);
        if (!position) continue;
        
        // Central star
        const starGeometry = new THREE.SphereGeometry(30, 16, 16);
const starMaterial = new THREE.MeshStandardMaterial({
    color: 0xffff00,
    emissive: 0xffaa00,
    emissiveIntensity: 2.0,
    roughness: 0.2,
    metalness: 0.3
});
        const centralStar = new THREE.Mesh(starGeometry, starMaterial);
        centralStar.position.copy(position);
        
        // Dyson sphere structure
        const sphereRadius = 120;
        const sphereSegments = 8;
        const dysonStructure = new THREE.Group();
        
        // Create hexagonal panels
        for (let lat = 0; lat < sphereSegments; lat++) {
            for (let lon = 0; lon < sphereSegments * 2; lon++) {
                if (Math.random() > 0.3) continue; // Only partial construction
                
                const panelGeometry = new THREE.RingGeometry(8, 12, 6);
                const panelMaterial = new THREE.MeshBasicMaterial({
                    color: 0x888888,
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide
                });
                const panel = new THREE.Mesh(panelGeometry, panelMaterial);
                
                const phi = (lat / sphereSegments) * Math.PI;
                const theta = (lon / (sphereSegments * 2)) * Math.PI * 2;
                
                panel.position.set(
                    sphereRadius * Math.sin(phi) * Math.cos(theta),
                    sphereRadius * Math.cos(phi),
                    sphereRadius * Math.sin(phi) * Math.sin(theta)
                );
                panel.lookAt(centralStar.position);
                
                dysonStructure.add(panel);
            }
        }
        centralStar.add(dysonStructure);
        
        // Energy collection beams
        const beamGroup = new THREE.Group();
        for (let beam = 0; beam < 6; beam++) {
            const beamGeometry = new THREE.CylinderGeometry(1, 3, 80);
            const beamMaterial = new THREE.MeshBasicMaterial({
                color: 0xffff00,
                transparent: true,
                opacity: 0.4,
                blending: THREE.AdditiveBlending
            });
            const beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);
            
            const angle = (beam / 6) * Math.PI * 2;
            beamMesh.position.set(
                Math.cos(angle) * sphereRadius * 0.8,
                (Math.random() - 0.5) * 60,
                Math.sin(angle) * sphereRadius * 0.8
            );
            beamMesh.lookAt(centralStar.position);
            
            beamGroup.add(beamMesh);
        }
        centralStar.add(beamGroup);
        
        centralStar.userData = {
            name: `Dyson-Sphere-${galaxyId}`,
            type: 'dyson_sphere',
            galaxyId: galaxyId,
            energyOutput: 1000 + Math.random() * 2000,
            constructionLevel: 0.3 + Math.random() * 0.4,
            civilization: 'Ancient',
            technology: 'Stellar Engineering',
            status: Math.random() > 0.5 ? 'Active' : 'Dormant',
            structure: dysonStructure,
            beams: beamGroup
        };
        
        centralStar.visible = true;
        centralStar.frustumCulled = false;
        
        cosmicFeatures.dysonSpheres.push(centralStar);
        if (typeof scene !== 'undefined') {
            scene.add(centralStar);
        }
    }
    
    console.log(`Created ${cosmicFeatures.dysonSpheres.length} extremely rare Dyson spheres`);
}

// =============================================================================
// RINGWORLDS - MASSIVE ARTIFICIAL HABITATS
// =============================================================================

function createRingworlds() {
    console.log('Creating extremely rare ringworlds...');
    
    if (typeof galaxyTypes === 'undefined') {
        console.warn('galaxyTypes not available, skipping ringworld creation');
        return;
    }
    
    // EXTREMELY RARE: Only create 0-1 ringworld total in distant galaxies
    if (Math.random() < 0.7) { // 30% chance of any ringworld existing
        console.log('No ringworlds generated in this universe iteration');
        return;
    }
    
    let galaxyId;
    do {
        galaxyId = Math.floor(Math.random() * (galaxyTypes.length - 1));
    } while (galaxyId === 7); // Skip local galaxy
    
    const position = getCosmicFeaturePosition(galaxyId);
    if (!position) return;
    
    // Central star
    const starGeometry = new THREE.SphereGeometry(25, 16, 16);
const starMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xffaa00,
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0.4
});
    const centralStar = new THREE.Mesh(starGeometry, starMaterial);
    centralStar.position.copy(position);
    
    // Ring structure
    const ringRadius = 200;
    const ringWidth = 15;
    
    // Main ring habitat
    const ringGeometry = new THREE.RingGeometry(ringRadius - ringWidth/2, ringRadius + ringWidth/2, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x666666,
        side: THREE.DoubleSide
    });
    const ringStructure = new THREE.Mesh(ringGeometry, ringMaterial);
    ringStructure.rotation.x = Math.PI / 2;
    centralStar.add(ringStructure);
    
    // Habitat sections
    const habitatGroup = new THREE.Group();
    for (let section = 0; section < 32; section++) {
        const habitatGeometry = new THREE.BoxGeometry(15, 8, ringWidth);
        const habitatMaterial = new THREE.MeshBasicMaterial({
            color: Math.random() > 0.5 ? 0x888888 : 0xaaaaaa
        });
        const habitat = new THREE.Mesh(habitatGeometry, habitatMaterial);
        
        const angle = (section / 32) * Math.PI * 2;
        habitat.position.set(
            Math.cos(angle) * ringRadius,
            0,
            Math.sin(angle) * ringRadius
        );
        habitat.rotation.y = angle;
        
        habitatGroup.add(habitat);
    }
    centralStar.add(habitatGroup);
    
    // Support spokes
    const spokeGroup = new THREE.Group();
    for (let spoke = 0; spoke < 8; spoke++) {
        const spokeGeometry = new THREE.CylinderGeometry(2, 2, ringRadius);
        const spokeMaterial = new THREE.MeshBasicMaterial({
            color: 0x444444
        });
        const spokeMesh = new THREE.Mesh(spokeGeometry, spokeMaterial);
        
        const angle = (spoke / 8) * Math.PI * 2;
        spokeMesh.position.set(
            Math.cos(angle) * ringRadius / 2,
            0,
            Math.sin(angle) * ringRadius / 2
        );
        spokeMesh.rotation.z = angle + Math.PI / 2;
        
        spokeGroup.add(spokeMesh);
    }
    centralStar.add(spokeGroup);
    
    centralStar.userData = {
        name: `Ringworld-${galaxyId}`,
        type: 'ringworld',
        galaxyId: galaxyId,
        diameter: ringRadius * 2,
        population: Math.floor(Math.random() * 1000000) + 500000,
        rotationSpeed: 0.01,
        habitabilityIndex: 0.8 + Math.random() * 0.2,
        species: ['Humanoid', 'Silicon-based', 'Energy beings'][Math.floor(Math.random() * 3)],
        ring: ringStructure,
        habitats: habitatGroup,
        spokes: spokeGroup
    };
    
    centralStar.visible = true;
    centralStar.frustumCulled = false;
    
    cosmicFeatures.ringworlds.push(centralStar);
    if (typeof scene !== 'undefined') {
        scene.add(centralStar);
    }
    
    console.log(`Created ${cosmicFeatures.ringworlds.length} extremely rare ringworld`);
}

// =============================================================================
// SOLAR STORMS - ELECTROMAGNETIC DISTURBANCES
// =============================================================================

function createSolarStorms() {
    console.log('Creating rare solar storms in distant galaxies...');
    
    if (typeof galaxyTypes === 'undefined') {
        console.warn('galaxyTypes not available, skipping solar storm creation');
        return;
    }
    
    galaxyTypes.forEach((galaxyType, galaxyId) => {
        // RARE: Only 35% chance per galaxy, skip local galaxy
        if (Math.random() > 0.35 || galaxyId === 7) return;
        
        const position = getCosmicFeaturePosition(galaxyId);
        if (!position) return;
        
        // Storm source (active star)
        const stormSourceGeometry = new THREE.SphereGeometry(35, 16, 16);
const stormSourceMaterial = new THREE.MeshStandardMaterial({
    color: 0xff4400,
    emissive: 0xff2200,
    emissiveIntensity: 1.5,
    roughness: 0.3,
    metalness: 0.5
});

        const stormSource = new THREE.Mesh(stormSourceGeometry, stormSourceMaterial);
        stormSource.position.copy(position);
        
        // Storm wave visualization
        const waveGroup = new THREE.Group();
        for (let wave = 0; wave < 5; wave++) {
            const waveRadius = 80 + (wave * 40);
            const waveGeometry = new THREE.SphereGeometry(waveRadius, 16, 8);
            const waveMaterial = new THREE.MeshBasicMaterial({
                color: wave % 2 === 0 ? 0xff6600 : 0xff4400,
                transparent: true,
                opacity: 0.3 - (wave * 0.05),
                wireframe: true
            });
            const waveMesh = new THREE.Mesh(waveGeometry, waveMaterial);
            waveMesh.userData = {
                expansionSpeed: 0.3 + wave * 0.1,
                waveIndex: wave
            };
            waveGroup.add(waveMesh);
        }
        stormSource.add(waveGroup);
        
        // Plasma jets
        const jetGroup = new THREE.Group();
        for (let jet = 0; jet < 4; jet++) {
            const jetGeometry = new THREE.ConeGeometry(8, 120, 8);
            const jetMaterial = new THREE.MeshBasicMaterial({
                color: 0xff8800,
                transparent: true,
                opacity: 0.6,
                blending: THREE.AdditiveBlending
            });
            const jetMesh = new THREE.Mesh(jetGeometry, jetMaterial);
            
            const angle = (jet / 4) * Math.PI * 2;
            jetMesh.position.set(
                Math.cos(angle) * 50,
                (jet % 2 === 0 ? 1 : -1) * 80,
                Math.sin(angle) * 50
            );
            jetMesh.rotation.x = jet % 2 === 0 ? 0 : Math.PI;
            
            jetGroup.add(jetMesh);
        }
        stormSource.add(jetGroup);
        
        stormSource.userData = {
            name: `Solar-Storm-${galaxyId}-${cosmicFeatures.solarStorms.length}`,
            type: 'solar_storm',
            galaxyId: galaxyId,
            intensity: 0.5 + Math.random() * 0.5,
            systemDamage: 20 + Math.random() * 30,
            weaponBoost: 1.3 + Math.random() * 0.7,
            effectRadius: 400 + Math.random() * 200,
            waves: waveGroup,
            jets: jetGroup,
            stormCycle: Math.random() * Math.PI * 2
        };
        
        stormSource.visible = true;
        stormSource.frustumCulled = false;
        
        cosmicFeatures.solarStorms.push(stormSource);
        if (typeof scene !== 'undefined') {
            scene.add(stormSource);
        }
    });
    
    console.log(`Created ${cosmicFeatures.solarStorms.length} rare solar storms in distant galaxies`);
}

// =============================================================================
// ROGUE PLANETS - EJECTED FROM THEIR SYSTEMS
// =============================================================================

function createRoguePlanets() {
    console.log('Creating rare rogue planets in distant galaxies...');
    
    if (typeof galaxyTypes === 'undefined') {
        console.warn('galaxyTypes not available, skipping rogue planet creation');
        return;
    }
    
    galaxyTypes.forEach((galaxyType, galaxyId) => {
        // RARE: Only 25% chance per galaxy, skip local galaxy  
        if (Math.random() > 0.25 || galaxyId === 7) return;
        
        const position = getCosmicFeaturePosition(galaxyId);
        if (!position) return;
        
        // Rogue planet body
        const planetSize = 15 + Math.random() * 25;
        const planetGeometry = new THREE.SphereGeometry(planetSize, 16, 16);
        
        // Cold, dark planet colors
        const darkColors = [0x1a1a2e, 0x16213e, 0x0f3460, 0x533483];
        const planetMaterial = new THREE.MeshBasicMaterial({
            color: darkColors[Math.floor(Math.random() * darkColors.length)]
        });
        const roguePlanet = new THREE.Mesh(planetGeometry, planetMaterial);
        roguePlanet.position.copy(position);
        
        // Random velocity for wandering
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.5
        );
        
        // Possible frozen atmosphere
        if (Math.random() > 0.6) {
            const atmosphereGeometry = new THREE.SphereGeometry(planetSize + 2, 16, 16);
            const atmosphereMaterial = new THREE.MeshBasicMaterial({
                color: 0x666699,
                transparent: true,
                opacity: 0.3
            });
            const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
            roguePlanet.add(atmosphere);
        }
        
        roguePlanet.userData = {
            name: `Rogue-Planet-${galaxyId}-${cosmicFeatures.roguePlanets.length}`,
            type: 'rogue_planet',
            galaxyId: galaxyId,
            mass: planetSize * 2,
            velocity: velocity,
            temperature: -200 + Math.random() * 50, // Very cold
            composition: Math.random() > 0.7 ? 'ice' : 'rock',
            resources: Math.random() > 0.8 ? 'rare_minerals' : null
        };
        
        roguePlanet.visible = true;
        roguePlanet.frustumCulled = false;
        
        cosmicFeatures.roguePlanets.push(roguePlanet);
        if (typeof scene !== 'undefined') {
            scene.add(roguePlanet);
        }
    });
    
    console.log(`Created ${cosmicFeatures.roguePlanets.length} rare rogue planets in distant galaxies`);
}

// =============================================================================
// COSMIC DUST CLOUDS - VISIBILITY REDUCERS
// =============================================================================

function createDustClouds() {
    console.log('Creating cosmic dust clouds...');
    
    if (typeof galaxyTypes === 'undefined') {
        console.warn('galaxyTypes not available, skipping dust cloud creation');
        return;
    }
    
    galaxyTypes.forEach((galaxyType, galaxyId) => {
        const dustCloudCount = Math.floor(Math.random() * 3) + 2;
        
        for (let i = 0; i < dustCloudCount; i++) {
            const position = getCosmicFeaturePosition(galaxyId);
            if (!position) continue;
            
            // Create particle system for dust cloud
            const particleCount = 500;
            const dustGeometry = new THREE.BufferGeometry();
            const dustVertices = [];
            
            // Create dust particle positions
            for (let p = 0; p < particleCount; p++) {
                const radius = Math.random() * 200;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;
                
                dustVertices.push(
                    position.x + radius * Math.sin(phi) * Math.cos(theta),
                    position.y + radius * Math.cos(phi),
                    position.z + radius * Math.sin(phi) * Math.sin(theta)
                );
            }
            
            dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustVertices, 3));
            
            const dustMaterial = new THREE.PointsMaterial({
                color: 0x8b4513,
                size: .8,
                transparent: true,
                opacity: 0.6,
                blending: THREE.AdditiveBlending
            });
            
            const dustCloud = new THREE.Points(dustGeometry, dustMaterial);
            dustCloud.position.copy(position);
            
            // Add some larger dust chunks
            const chunkGroup = new THREE.Group();
            for (let chunk = 0; chunk < 10; chunk++) {
                const chunkSize = 3 + Math.random() * 5;
                const chunkGeometry = new THREE.BoxGeometry(chunkSize, chunkSize, chunkSize);
                const chunkMaterial = new THREE.MeshBasicMaterial({
                    color: 0x654321,
                    transparent: true,
                    opacity: 0.7
                });
                const chunkMesh = new THREE.Mesh(chunkGeometry, chunkMaterial);
                
                const chunkRadius = Math.random() * 500;
                const chunkAngle = Math.random() * Math.PI * 2;
                const chunkElevation = (Math.random() - 0.5) * Math.PI;
                
                chunkMesh.position.set(
                    chunkRadius * Math.cos(chunkAngle) * Math.cos(chunkElevation),
                    chunkRadius * Math.sin(chunkElevation),
                    chunkRadius * Math.sin(chunkAngle) * Math.cos(chunkElevation)
                );
                
                chunkGroup.add(chunkMesh);
            }
            dustCloud.add(chunkGroup);
            
            dustCloud.userData = {
                name: `Dust-Cloud-${galaxyId}-${i}`,
                type: 'dust_cloud',
                galaxyId: galaxyId,
                visibilityReduction: 0.3 + Math.random() * 0.4,
                coverRadius: 1000 + Math.random() * 100,
                particleCount: particleCount,
                chunks: chunkGroup
            };
            
            dustCloud.visible = true;
            dustCloud.frustumCulled = false;
            
            cosmicFeatures.dustClouds.push(dustCloud);
            if (typeof scene !== 'undefined') {
                scene.add(dustCloud);
            }
        }
    });
    
    console.log(`Created ${cosmicFeatures.dustClouds.length} dust clouds`);
}

// =============================================================================
// SPACE WHALES - MASSIVE MIGRATING CREATURES
// =============================================================================

function createSpaceWhales() {
    console.log('Creating extremely rare space whales...');
    
    if (typeof galaxyTypes === 'undefined') {
        console.warn('galaxyTypes not available, skipping space whale creation');
        return;
    }
    
    // EXTREMELY RARE: Only 1-2 space whales in the entire universe, in distant galaxies only
    const totalWhales = Math.floor(Math.random() * 1) + 1; // 1-2 max
    
    for (let i = 0; i < totalWhales; i++) {
        let galaxyId;
        do {
            galaxyId = Math.floor(Math.random() * (galaxyTypes.length - 1));
        } while (galaxyId === 7); // Skip local galaxy
        
        const position = getCosmicFeaturePosition(galaxyId);
        if (!position) continue;
        
        // Space whale body - using CylinderGeometry for compatibility
        const whaleLength = 300 + Math.random() * 200;
        const whaleBodyGeometry = new THREE.CylinderGeometry(40, 60, whaleLength, 16);
        const whaleBodyMaterial = new THREE.MeshBasicMaterial({
            color: 0x2c4f70,
            transparent: true,
            opacity: 0.9
        });
        const whaleBody = new THREE.Mesh(whaleBodyGeometry, whaleBodyMaterial);
        whaleBody.position.copy(position);
        whaleBody.rotation.z = Math.PI / 2; // Orient horizontally
        
        // Bioluminescent patterns
        const patternGroup = new THREE.Group();
        for (let pattern = 0; pattern < 20; pattern++) {
            const patternGeometry = new THREE.SphereGeometry(3 + Math.random() * 5, 8, 8);
            const patternMaterial = new THREE.MeshStandardMaterial({
    color: Math.random() > 0.5 ? 0x00ffff : 0x44ff88,
    emissive: Math.random() > 0.5 ? 0x004444 : 0x002200,
    emissiveIntensity: 1.2,
    roughness: 0.3,
    metalness: 0.5,
    transparent: true,
    opacity: 0.8
});
            const patternMesh = new THREE.Mesh(patternGeometry, patternMaterial);
            
            const patternAngle = Math.random() * Math.PI * 2;
            const patternDistance = 20 + Math.random() * 30;
            const patternY = (Math.random() - 0.5) * whaleLength * 0.8;
            
            patternMesh.position.set(
                Math.cos(patternAngle) * patternDistance,
                patternY,
                Math.sin(patternAngle) * patternDistance
            );
            
            patternGroup.add(patternMesh);
        }
        whaleBody.add(patternGroup);
        
        // Fins
        const finGroup = new THREE.Group();
        for (let fin = 0; fin < 4; fin++) {
            const finGeometry = new THREE.ConeGeometry(25, 60, 8);
            const finMaterial = new THREE.MeshBasicMaterial({
                color: 0x1e4080,
                transparent: true,
                opacity: 0.8
            });
            const finMesh = new THREE.Mesh(finGeometry, finMaterial);
            
            const finAngle = (fin / 4) * Math.PI * 2;
            finMesh.position.set(
                Math.cos(finAngle) * 50,
                whaleLength * 0.3,
                Math.sin(finAngle) * 50
            );
            finMesh.rotation.z = finAngle;
            finMesh.rotation.x = Math.PI / 2;
            
            finGroup.add(finMesh);
        }
        whaleBody.add(finGroup);
        
        // Energy wake
        const wakeGeometry = new THREE.PlaneGeometry(80, whaleLength * 1.5);
        const wakeMaterial = new THREE.MeshBasicMaterial({
            color: 0x0066cc,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending
        });
        const wake = new THREE.Mesh(wakeGeometry, wakeMaterial);
        wake.position.y = -whaleLength * 0.7;
        whaleBody.add(wake);
        
        whaleBody.userData = {
            name: `Space-Whale-${i}`,
            type: 'space_whale',
            galaxyId: galaxyId,
            length: whaleLength,
            migrationSpeed: 0.5 + Math.random() * 1.0,
            bioEnergy: 150 + Math.random() * 100,
            patterns: patternGroup,
            fins: finGroup,
            wake: wake,
            migrationTarget: getRandomGalaxyPosition(Math.floor(Math.random() * (galaxyTypes.length - 1))),
            peaceful: true
        };
        
        whaleBody.visible = true;
        whaleBody.frustumCulled = false;
        
        cosmicFeatures.spaceWhales.push(whaleBody);
        if (typeof scene !== 'undefined') {
            scene.add(whaleBody);
        }
    }
    
    console.log(`Created ${cosmicFeatures.spaceWhales.length} extremely rare space whales`);
}

// =============================================================================
// CRYSTAL FORMATIONS - SELF-ORGANIZING STRUCTURES
// =============================================================================

function createCrystalFormations() {
    console.log('Creating crystal formations...');
    
    if (typeof galaxyTypes === 'undefined') {
        console.warn('galaxyTypes not available, skipping crystal formation creation');
        return;
    }
    
    galaxyTypes.forEach((galaxyType, galaxyId) => {
        if (Math.random() < 0.6) { // 60% chance per galaxy
            const position = getCosmicFeaturePosition(galaxyId);
            if (!position) return;
            
            // Central crystal cluster
            const crystalGroup = new THREE.Group();
            const crystalCount = 5 + Math.floor(Math.random() * 8);
            const crystals = [];
            
            for (let c = 0; c < crystalCount; c++) {
                const crystalSize = 20 + Math.random() * 30;
                const crystalGeometry = new THREE.ConeGeometry(crystalSize * 0.3, crystalSize, 8);
                const crystalMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6),
    transparent: true,
    opacity: 0.8,
    emissive: new THREE.Color().setHSL(Math.random(), 0.5, 0.2),
    emissiveIntensity: 1.0,
    roughness: 0.2,
    metalness: 0.7
});
                const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
                
                const angle = (c / crystalCount) * Math.PI * 2;
                const distance = 50 + Math.random() * 100;
                const height = (Math.random() - 0.5) * 80;
                
                crystal.position.set(
                    Math.cos(angle) * distance,
                    height,
                    Math.sin(angle) * distance
                );
                crystal.rotation.set(
                    Math.random() * Math.PI,
                    Math.random() * Math.PI,
                    Math.random() * Math.PI
                );
                
                crystalGroup.add(crystal);
                crystals.push(crystal);
            }
            
            crystalGroup.position.copy(position);
            
            // Energy connections between crystals
            const connectionGroup = new THREE.Group();
            for (let i = 0; i < crystals.length; i++) {
                for (let j = i + 1; j < crystals.length; j++) {
                    if (Math.random() > 0.7) continue; // Only some connections
                    
                    const crystal1 = crystals[i];
                    const crystal2 = crystals[j];
                    const distance = crystal1.position.distanceTo(crystal2.position);
                    
                    const connectionGeometry = new THREE.CylinderGeometry(0.5, 0.5, distance);
                    const connectionMaterial = new THREE.MeshBasicMaterial({
                        color: 0x88ffff,
                        transparent: true,
                        opacity: 0.3,
                        blending: THREE.AdditiveBlending
                    });
                    const connection = new THREE.Mesh(connectionGeometry, connectionMaterial);
                    
                    connection.position.lerpVectors(crystal1.position, crystal2.position, 0.5);
                    connection.lookAt(crystal2.position);
                    connection.rotateX(Math.PI / 2);
                    
                    connectionGroup.add(connection);
                }
            }
            crystalGroup.add(connectionGroup);
            
            crystalGroup.userData = {
                name: `Crystal-Formation-${galaxyId}`,
                type: 'crystal_formation',
                galaxyId: galaxyId,
                crystalCount: crystalCount,
                growthRate: 0.01 + Math.random() * 0.02,
                resonanceFrequency: Math.random(),
                energyField: 80 + Math.random() * 40,
                gravitationalEffect: 30 + Math.random() * 20,
                connections: connectionGroup,
                age: Math.random() * 10000 // Formation age
            };
            
            crystalGroup.visible = true;
            crystalGroup.frustumCulled = false;
            
            cosmicFeatures.crystalFormations.push(crystalGroup);
            if (typeof scene !== 'undefined') {
                scene.add(crystalGroup);
            }
        }
    });
    
    console.log(`Created ${cosmicFeatures.crystalFormations.length} crystal formations`);
}

// =============================================================================
// PLASMA STORMS - MOVING ENERGY PHENOMENA
// =============================================================================

function createPlasmaStorms() {
    console.log('Creating rare plasma storms in distant galaxies...');
    
    if (typeof galaxyTypes === 'undefined') {
        console.warn('galaxyTypes not available, skipping plasma storm creation');
        return;
    }
    
    galaxyTypes.forEach((galaxyType, galaxyId) => {
        if (Math.random() > 0.2 || galaxyId === 7) return;
        
        const position = getCosmicFeaturePosition(galaxyId);
        if (!position) return;
        
        // **UPDATED: Storm cloud 10x larger**
        const stormCloudGroup = new THREE.Group();
        const cloudSpheres = [];
        const sphereCount = 8 + Math.floor(Math.random() * 6);
        
        for (let sphere = 0; sphere < sphereCount; sphere++) {
            const sphereRadius = 150 + Math.random() * 250; // **10x larger (was 15-40)**
            const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 16, 16);
            const sphereMaterial = new THREE.MeshStandardMaterial({
                color: Math.random() > 0.5 ? 0x6644ff : 0x4466ff,
                emissive: Math.random() > 0.5 ? 0x2200ff : 0x0044ff,
                emissiveIntensity: 1.5,
                roughness: 0.4,
                metalness: 0.3,
                transparent: true,
                opacity: 0.6
            });
            const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
            
            const cloudRadius = 600; // **10x larger (was 60)**
            const cloudAngle = Math.random() * Math.PI * 2;
            const cloudElevation = (Math.random() - 0.5) * Math.PI * 0.5;
            
            sphereMesh.position.set(
                cloudRadius * Math.cos(cloudAngle) * Math.cos(cloudElevation),
                cloudRadius * Math.sin(cloudElevation),
                cloudRadius * Math.sin(cloudAngle) * Math.cos(cloudElevation)
            );
            
            stormCloudGroup.add(sphereMesh);
            cloudSpheres.push(sphereMesh);
        }
        
        stormCloudGroup.position.copy(position);
        
        // **UPDATED: Lightning tendrils 10x larger with animation data**
        const tendrilGroup = new THREE.Group();
        for (let tendril = 0; tendril < 12; tendril++) {
            const tendrilGeometry = new THREE.CylinderGeometry(10, 2, 800, 6); // **10x larger (was 1, 0.2, 80)**
            const tendrilMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                emissive: 0x8888ff,
                emissiveIntensity: 2.0,
                roughness: 0.2,
                metalness: 0.6,
                transparent: true,
                opacity: 0.8
            });
            const tendrilMesh = new THREE.Mesh(tendrilGeometry, tendrilMaterial);
            
            const tendrilAngle = Math.random() * Math.PI * 2;
            const tendrilDistance = 400 + Math.random() * 400; // **10x larger (was 40-80)**
            
            tendrilMesh.position.set(
                Math.cos(tendrilAngle) * tendrilDistance,
                (Math.random() - 0.5) * 600, // **10x larger (was 60)**
                Math.sin(tendrilAngle) * tendrilDistance
            );
            tendrilMesh.rotation.z = Math.random() * Math.PI * 2;
            tendrilMesh.userData = {
                baseAngle: tendrilMesh.rotation.z,
                waveSpeed: 0.5 + Math.random() * 0.5,
                baseOpacity: 0.8,
                flickerSpeed: 2.0 + Math.random() * 3.0
            };
            
            tendrilGroup.add(tendrilMesh);
        }
        stormCloudGroup.add(tendrilGroup);
        
        // **UPDATED: Central discharge 10x larger**
        const dischargeGeometry = new THREE.SphereGeometry(250, 16, 16); // **10x larger (was 25)**
        const dischargeMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.1,
            wireframe: true
        });
        const discharge = new THREE.Mesh(dischargeGeometry, dischargeMaterial);
        stormCloudGroup.add(discharge);
        
        stormCloudGroup.userData = {
            name: `Plasma-Storm-${galaxyId}-${cosmicFeatures.plasmaStorms.length}`,
            type: 'plasma_storm',
            galaxyId: galaxyId,
            intensity: 0.7 + Math.random() * 0.3,
            movementSpeed: 0.2 + Math.random() * 0.3,
            energyOutput: 50 + Math.random() * 100,
            spheres: cloudSpheres,
            tendrils: tendrilGroup,
            discharge: discharge,
            direction: new THREE.Vector3(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.5
            ).normalize()
        };
        
        stormCloudGroup.visible = true;
        stormCloudGroup.frustumCulled = false;
        
        cosmicFeatures.plasmaStorms.push(stormCloudGroup);
        if (typeof scene !== 'undefined') {
            scene.add(stormCloudGroup);
        }
    });
    
    console.log(`Created ${cosmicFeatures.plasmaStorms.length} rare plasma storms (10x scale) in distant galaxies`);
}

// =============================================================================
// ANIMATION AND UPDATE FUNCTIONS
// =============================================================================

function updateCosmicFeatures() {
    const time = Date.now() * 0.001;
    
    // Update pulsars
    cosmicFeatures.pulsars.forEach(pulsar => {
        if (!pulsar.userData) return;
        
        // Rotate pulsar and magnetic field
        pulsar.rotation.y += pulsar.userData.rotationSpeed * 0.1;
        
        // Pulse effect
        const pulseTime = time * pulsar.userData.pulseFrequency;
        const pulse = Math.sin(pulseTime * Math.PI * 2);
        
        if (pulse > 0.8 && time - pulsar.userData.lastPulse > 2) {
            pulsar.userData.lastPulse = time;
            // Trigger navigation jamming near pulsar
            if (typeof checkPulsarInterference === 'function') {
                checkPulsarInterference(pulsar);
            }
        }
        
        // Update beam intensity
        pulsar.children.forEach(child => {
            if (child.material && child.material.opacity !== undefined) {
                child.material.opacity = 0.3 + Math.abs(pulse) * 0.4;
            }
        });
    });
    
    // Update supernovas
    cosmicFeatures.supernovas.forEach(supernova => {
        if (!supernova.userData || !supernova.userData.shockwaveShells) return;
        
        // Animate expanding shockwaves
        supernova.userData.shockwaveShells.forEach(shell => {
            const expansion = Math.sin(time * shell.userData.expansionSpeed) * 0.2;
            const newRadius = shell.userData.baseRadius + expansion * 20;
            shell.scale.setScalar(newRadius / shell.userData.baseRadius);
        });
        
        // Rotate debris field
        if (supernova.userData.debrisField) {
            supernova.userData.debrisField.rotation.y += 0.01;
        }
    });
    
    // Update solar storms
    cosmicFeatures.solarStorms.forEach(storm => {
        if (!storm.userData) return;
        
        storm.userData.stormCycle += 0.02;
        const stormPulse = Math.sin(storm.userData.stormCycle);
        
        // Animate storm waves
        if (storm.userData.waves) {
            storm.userData.waves.children.forEach(wave => {
                const expansion = Math.sin(time * wave.userData.expansionSpeed + wave.userData.waveIndex) * 0.3;
                wave.scale.setScalar(1 + expansion);
            });
        }
        
        // Animate plasma jets
        if (storm.userData.jets) {
            storm.userData.jets.children.forEach((jet, index) => {
                jet.scale.y = 0.8 + Math.sin(time * 2 + index) * 0.4;
            });
        }
    });
    
    // Update rogue planets (movement)
    cosmicFeatures.roguePlanets.forEach(rogue => {
        if (!rogue.userData || !rogue.userData.velocity) return;
        
        rogue.position.x += rogue.userData.velocity.x * 0.1;
        rogue.position.y += rogue.userData.velocity.y * 0.1;
        rogue.position.z += rogue.userData.velocity.z * 0.1;
    });
    
    // Update space whales (migration)
    cosmicFeatures.spaceWhales.forEach(whale => {
        if (!whale.userData || !whale.userData.migrationTarget) return;
        
        const target = whale.userData.migrationTarget;
        if (!target) return;
        
        const direction = new THREE.Vector3().subVectors(target, whale.position).normalize();
        
        whale.position.add(direction.multiplyScalar(whale.userData.migrationSpeed * 0.1));
        whale.lookAt(target);
        
        // Update bioluminescent patterns
        if (whale.userData.patterns) {
            whale.userData.patterns.children.forEach((pattern, index) => {
                pattern.material.opacity = 0.5 + Math.sin(time * 2 + index) * 0.3;
            });
        }
        
        // Check if reached target (change target)
        if (whale.position.distanceTo(target) < 500) {
            whale.userData.migrationTarget = getRandomGalaxyPosition(Math.floor(Math.random() * galaxyTypes.length));
        }
    });
    
    // Update crystal formations (growth)
    cosmicFeatures.crystalFormations.forEach(formation => {
        if (!formation.userData) return;
        
        formation.rotation.y += 0.005;
        
        // Pulse energy connections
        if (formation.userData.connections) {
            formation.userData.connections.children.forEach((connection, index) => {
                connection.material.opacity = 0.2 + Math.sin(time * 3 + index) * 0.3;
            });
        }
        
        // Gradual growth
        const growthFactor = 1 + formation.userData.growthRate * Math.sin(time * 0.1);
        formation.scale.setScalar(growthFactor);
    });
    
    // Update plasma storms (movement and lightning animation)
cosmicFeatures.plasmaStorms.forEach(storm => {
    if (!storm.userData) return;
    
    // Move storm
    if (storm.userData.direction) {
        storm.position.add(storm.userData.direction.clone().multiplyScalar(storm.userData.movementSpeed));
    }
    
    // **ENHANCED: Animate lightning tendrils with flickering**
    if (storm.userData.tendrils) {
        storm.userData.tendrils.children.forEach((tendril, index) => {
            if (!tendril.userData) return;
            
            // Wiggle animation
            const wiggle = Math.sin(time * tendril.userData.waveSpeed + index) * 0.3;
            tendril.rotation.z = tendril.userData.baseAngle + wiggle;
            
            // **NEW: Flickering lightning effect**
            const flicker = Math.sin(time * tendril.userData.flickerSpeed + index * 0.5);
            tendril.material.opacity = tendril.userData.baseOpacity * (0.5 + Math.abs(flicker) * 0.5);
            tendril.material.emissiveIntensity = 2.0 + flicker * 1.5;
            
            // **NEW: Random intense flashes**
            if (Math.random() < 0.01) {
                tendril.material.opacity = 1.0;
                tendril.material.emissiveIntensity = 4.0;
            }
        });
    }
});
    
    // Update Dyson spheres and Ringworlds rotation
    cosmicFeatures.dysonSpheres.forEach(dyson => {
        if (dyson.userData.structure) {
            dyson.userData.structure.rotation.y += 0.002;
        }
        if (dyson.userData.beams) {
            dyson.userData.beams.rotation.y += 0.005;
        }
    });
    
    cosmicFeatures.ringworlds.forEach(ringworld => {
        if (ringworld.userData.ring) {
            ringworld.userData.ring.rotation.z += ringworld.userData.rotationSpeed;
        }
        if (ringworld.userData.habitats) {
            ringworld.userData.habitats.rotation.y += ringworld.userData.rotationSpeed;
        }
    });
}

// =============================================================================
// INTERACTION FUNCTIONS
// =============================================================================

function checkCosmicFeatureInteractions(playerPosition, gameState) {
    if (!playerPosition || !gameState) return;
    
    const checkDistance = 400;
    
    // Check pulsar interference
    cosmicFeatures.pulsars.forEach(pulsar => {
        const distance = playerPosition.distanceTo(pulsar.position);
        if (distance < checkDistance) {
            const interference = Math.max(0, 1 - distance / checkDistance);
            if (interference > 0.5 && typeof gameState.navigationJammed !== 'undefined') {
                gameState.navigationJammed = true;
                if (typeof showAchievement === 'function') {
                    showAchievement('Pulsar Interference!', 'Navigation systems disrupted');
                }
            }
        }
    });
    
    // Check supernova radiation
    cosmicFeatures.supernovas.forEach(supernova => {
        const distance = playerPosition.distanceTo(supernova.position);
        if (distance < supernova.userData.radiationLevel * 10) {
            const radiation = Math.max(0, 1 - distance / (supernova.userData.radiationLevel * 10));
            if (radiation > 0.3 && typeof gameState.hull !== 'undefined') {
                gameState.hull -= radiation * 0.5;
                if (typeof showAchievement === 'function') {
                    showAchievement('Radiation Exposure', 'Hull damage from supernova');
                }
            }
        }
    });
    
    // Check dark matter gravitational effects
    cosmicFeatures.darkMatterNodes.forEach(node => {
        const distance = playerPosition.distanceTo(node.position);
        if (distance < 200) {
            const gravityEffect = Math.max(0, 1 - distance / 200);
            if (typeof gameState.velocityVector !== 'undefined' && gravityEffect > 0.2) {
                const pullDirection = new THREE.Vector3().subVectors(node.position, playerPosition).normalize();
                gameState.velocityVector.add(pullDirection.multiplyScalar(gravityEffect * 0.01));
            }
        }
    });
    
    // Check solar storm effects
    cosmicFeatures.solarStorms.forEach(storm => {
        const distance = playerPosition.distanceTo(storm.position);
        if (distance < storm.userData.effectRadius) {
            const intensity = Math.max(0, 1 - distance / storm.userData.effectRadius);
            
            // System damage
            if (intensity > 0.4 && typeof gameState.hull !== 'undefined') {
                gameState.hull -= storm.userData.systemDamage * intensity * 0.01;
                if (typeof showAchievement === 'function') {
                    showAchievement('Solar Storm!', 'Hull integrity compromised');
                }
            }
            
            // Weapon power boost
            if (typeof gameState.weaponPowerBoost !== 'undefined') {
                gameState.weaponPowerBoost = storm.userData.weaponBoost;
            }
        }
    });
}

// =============================================================================
// INITIALIZATION FUNCTION
// =============================================================================

function initializeCosmicFeatures() {
    console.log('Initializing rare cosmic features in distant galaxies...');
    
    // Clear existing features first
    Object.keys(cosmicFeatures).forEach(key => {
        cosmicFeatures[key] = [];
    });
    
    // Create all cosmic features (now rare and distributed in 3D space)
    try {
        createPulsars();
        createSupernovas();
        createBrownDwarfs();
        createDarkMatterNodes();
        createDysonSpheres();
        createRingworlds();
        createSolarStorms();
        createRoguePlanets();
        createSpaceWhales();
        createCrystalFormations();
        createPlasmaStorms();
    } catch (error) {
        console.error('Error during cosmic feature initialization:', error);
    }
    
    console.log('Rare cosmic features initialized successfully!');
    
    // Log summary with rarity emphasis
    console.log('🌌 RARE COSMIC PHENOMENA DISTRIBUTION:');
    console.log(`✨ Pulsars: ${cosmicFeatures.pulsars.length} (extremely rare neutron stars)`);
    console.log(`💥 Supernovas: ${cosmicFeatures.supernovas.length} (rare stellar explosions)`);
    console.log(`🟤 Brown Dwarfs: ${cosmicFeatures.brownDwarfs.length} (rare failed stars)`);
    console.log(`🌌 Dark Matter Nodes: ${cosmicFeatures.darkMatterNodes.length} (invisible anomalies)`);
    console.log(`🔆 Dyson Spheres: ${cosmicFeatures.dysonSpheres.length} (legendary megastructures)`);
    console.log(`🏙️ Ringworlds: ${cosmicFeatures.ringworlds.length} (mythical habitats)`);
    console.log(`⛈️ Solar Storms: ${cosmicFeatures.solarStorms.length} (rare electromagnetic storms)`);
    console.log(`🪐 Rogue Planets: ${cosmicFeatures.roguePlanets.length} (wandering worlds)`);
    console.log(`🐋 Space Whales: ${cosmicFeatures.spaceWhales.length} (legendary creatures)`);
    console.log(`💎 Crystal Formations: ${cosmicFeatures.crystalFormations.length} (rare mineral structures)`);
    console.log(`⚡ Plasma Storms: ${cosmicFeatures.plasmaStorms.length} (rare energy phenomena)`);
    console.log('🎯 All features are distributed in 3D spherical space across distant galaxies');
    console.log('🔒 Local galaxy remains free of cosmic anomalies for safe exploration');
}

// =============================================================================
// EXPORTS
// =============================================================================

if (typeof window !== 'undefined') {
    window.cosmicFeatures = cosmicFeatures;
    window.initializeCosmicFeatures = initializeCosmicFeatures;
    window.updateCosmicFeatures = updateCosmicFeatures;
    window.checkCosmicFeatureInteractions = checkCosmicFeatureInteractions;
    window.getRandomGalaxyPosition = getRandomGalaxyPosition;
    
    // Individual creation functions for testing
    window.createPulsars = createPulsars;
    window.createSupernovas = createSupernovas;
    window.createBrownDwarfs = createBrownDwarfs;
    window.createDarkMatterNodes = createDarkMatterNodes;
    window.createDysonSpheres = createDysonSpheres;
    window.createRingworlds = createRingworlds;
    window.createSolarStorms = createSolarStorms;
    window.createRoguePlanets = createRoguePlanets;
    window.createDustClouds = createDustClouds;
    window.createSpaceWhales = createSpaceWhales;
    window.createCrystalFormations = createCrystalFormations;
    window.createPlasmaStorms = createPlasmaStorms;
    
    console.log('Enhanced cosmic features loaded with full 3D integration - All special universe objects available!');
}