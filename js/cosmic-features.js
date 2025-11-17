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
        pulsar.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
        
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
        
        // ⭐ ADD POWERFUL POINT LIGHT for supernova illumination
        const supernovaLight = new THREE.PointLight(
            0xffaa00,      // Orange-yellow supernova color
            15.0,          // Very bright intensity
            3000,          // Illumination range (3000 units)
            1.5            // Light decay (higher = more dramatic falloff)
        );
        supernovaLight.position.copy(position);
        supernovaLight.castShadow = false; // Performance optimization
        scene.add(supernovaLight);
        
        console.log(`  💡 Added intense point light to supernova at`, position);
        
        // Expanding shockwave shells
        const shockwaveShells = [];
        for (let shell = 0; shell < 3; shell++) {
            const shellRadius = 80 + (shell * 40);
            const shellGeometry = new THREE.SphereGeometry(shellRadius, 16, 16);
            const shellMaterial = new THREE.MeshBasicMaterial({
                color: shell === 0 ? 0xff4400 : shell === 1 ? 0xff6622 : 0xff8844,
                transparent: true,
                opacity: 0.3 - (shell * 0.08),
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending
            });
            const shellMesh = new THREE.Mesh(shellGeometry, shellMaterial);
            shellMesh.userData = {
                baseRadius: shellRadius,
                expansionSpeed: 0.5 + (shell * 0.2),
                waveIndex: shell
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
            const phi = Math.acos(2 * Math.random() - 1);
            
            debrisVertices.push(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.cos(phi),
                radius * Math.sin(phi) * Math.sin(theta)
            );
        }
        
        debrisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(debrisVertices, 3));
        
        const debrisMaterial = new THREE.PointsMaterial({
            color: 0xffcc66,
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
            age: Math.random() * 1000,
            expansionSpeed: 1.0 + Math.random() * 2.0,
            radiationLevel: 80 + Math.random() * 40,
            energyOutput: 100 + Math.random() * 100,
            shockwaveShells: shockwaveShells,
            debrisField: debrisField,
            pointLight: supernovaLight  // ⭐ Store reference to the light
        };
        
        supernovaCore.visible = true;
        supernovaCore.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
        
        cosmicFeatures.supernovas.push(supernovaCore);
        if (typeof scene !== 'undefined') {
            scene.add(supernovaCore);
        }
    });
    
    console.log(`Created ${cosmicFeatures.supernovas.length} rare supernovas with dynamic lighting`);
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
            brownDwarf.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
            
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
            darkMatterNode.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
            
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
        centralStar.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
        
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
    
    // GUARANTEED: Create 2-4 solar storms across distant galaxies
    const targetStormCount = 2 + Math.floor(Math.random() * 3); // 2-4 storms guaranteed
    let stormsCreated = 0;
    const availableGalaxies = [];
    
    // Build list of available galaxies (excluding local galaxy ID 7)
    galaxyTypes.forEach((galaxyType, galaxyId) => {
        if (galaxyId !== 7) {
            availableGalaxies.push(galaxyId);
        }
    });
    
    // Shuffle available galaxies
    for (let i = availableGalaxies.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableGalaxies[i], availableGalaxies[j]] = [availableGalaxies[j], availableGalaxies[i]];
    }
    
    // Create storms in the first N galaxies
    for (let i = 0; i < Math.min(targetStormCount, availableGalaxies.length); i++) {
        const galaxyId = availableGalaxies[i];
        const position = getCosmicFeaturePosition(galaxyId);
        
        if (!position) {
            console.warn(`Could not get position for solar storm in galaxy ${galaxyId}`);
            continue;
        }
        
        console.log(`⛈️ Creating solar storm in galaxy ${galaxyId} at position`, position);
        
        // Storm core
        const stormGeometry = new THREE.SphereGeometry(25, 16, 16);
        const stormMaterial = new THREE.MeshBasicMaterial({
            color: 0xff3300,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        const stormCore = new THREE.Mesh(stormGeometry, stormMaterial);
        stormCore.position.copy(position);
        
        // ⭐ ADD PULSING POINT LIGHT for solar storm illumination
        const stormLight = new THREE.PointLight(
            0xff3300,      // Red-orange storm color
            12.0,          // Bright intensity
            2500,          // Illumination range (2500 units)
            1.8            // Light decay
        );
        stormLight.position.copy(position);
        stormLight.castShadow = false;
        
        if (typeof scene !== 'undefined') {
            scene.add(stormLight);
            console.log(`  💡 Added pulsing point light to solar storm in galaxy ${galaxyId}`);
        }
        
        // Electromagnetic waves
        const waveGroup = new THREE.Group();
        for (let wave = 0; wave < 5; wave++) {
            const waveRadius = 50 + (wave * 30);
            const waveGeometry = new THREE.SphereGeometry(waveRadius, 16, 16);
            const waveMaterial = new THREE.MeshBasicMaterial({
                color: 0xff6600,
                transparent: true,
                opacity: 0.2 - (wave * 0.03),
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending
            });
            const waveMesh = new THREE.Mesh(waveGeometry, waveMaterial);
            waveMesh.userData = {
                expansionSpeed: 1.5 + (wave * 0.3),
                waveIndex: wave
            };
            waveGroup.add(waveMesh);
        }
        stormCore.add(waveGroup);
        
        stormCore.userData = {
            name: `Solar-Storm-${galaxyId}-${stormsCreated}`,
            type: 'solar_storm',
            galaxyId: galaxyId,
            intensity: 0.7 + Math.random() * 0.3,
            stormCycle: Math.random() * Math.PI * 2,
            radiationDamage: 5 + Math.random() * 10,
            shieldDrain: 0.5 + Math.random() * 0.5,
            weaponBoost: 1.5 + Math.random() * 0.5,
            waves: waveGroup,
            pointLight: stormLight,  // ⭐ Store reference to the light
            baseLightIntensity: 12.0 // ⭐ Store base intensity for pulsing
        };
        
        stormCore.visible = true;
        stormCore.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
        
        cosmicFeatures.solarStorms.push(stormCore);
        if (typeof scene !== 'undefined') {
            scene.add(stormCore);
        }
        
        stormsCreated++;
        console.log(`✅ Solar storm ${stormsCreated} created in galaxy ${galaxyId}`);
    }
    
    console.log(`⛈️ Created ${cosmicFeatures.solarStorms.length} solar storms with dynamic lighting (target was ${targetStormCount})`);
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
        roguePlanet.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
        
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
            dustCloud.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
            
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
        whaleBody.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
        
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
            crystalGroup.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
            
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
    
    // GUARANTEED: Create 1-3 plasma storms across distant galaxies (same as solar storms)
    const targetStormCount = 0.5 + Math.floor(Math.random() * 2); // 1-3 storms 
    let stormsCreated = 0;
    const availableGalaxies = [];
    
    // Build list of available galaxies (excluding local galaxy ID 7)
    galaxyTypes.forEach((galaxyType, galaxyId) => {
        if (galaxyId !== 7) {
            availableGalaxies.push(galaxyId);
        }
    });
    
    // Shuffle available galaxies
    for (let i = availableGalaxies.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableGalaxies[i], availableGalaxies[j]] = [availableGalaxies[j], availableGalaxies[i]];
    }
    
    // Create storms in the first N galaxies
    for (let i = 0; i < Math.min(targetStormCount, availableGalaxies.length); i++) {
        const galaxyId = availableGalaxies[i];
        const position = getCosmicFeaturePosition(galaxyId);
        
        if (!position) {
            console.warn(`Could not get position for plasma storm in galaxy ${galaxyId}`);
            continue;
        }
        
        console.log(`⚡ Creating plasma storm in galaxy ${galaxyId} at position`, position);
        
        // **OPTIMIZED: Reduced geometry for better FPS**
        const stormCloudGroup = new THREE.Group();
        const cloudSpheres = [];
        const sphereCount = 4 + Math.floor(Math.random() * 3); // OPTIMIZED: 4-6 spheres (was 8-14)

        // Create outer cloud spheres
        for (let sphere = 0; sphere < sphereCount; sphere++) {
            const sphereRadius = 80 + Math.random() * 70; // OPTIMIZED: 80-150 radius (was 150-400)
            const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 8, 8); // OPTIMIZED: 8x8 segments (was 16x16)
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

        // ⭐ OPTIMIZED: Central energy core - reduced poly count for better FPS (tendrils removed for performance)
        const coreGeometry = new THREE.SphereGeometry(180, 12, 12); // OPTIMIZED: Smaller, 12x12 segments (was 250, 32x32)
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0x6644ff,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending
        });
        const energyCore = new THREE.Mesh(coreGeometry, coreMaterial);

        // Add outer glow layer
        const glowGeometry = new THREE.SphereGeometry(210, 12, 12); // OPTIMIZED: Smaller, 12x12 segments (was 280, 32x32)
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x8866ff,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending
        });
        const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);
        energyCore.add(glowSphere);

        // Add inner bright core
        const innerCoreGeometry = new THREE.SphereGeometry(140, 12, 12); // OPTIMIZED: Smaller, 12x12 segments (was 180, 32x32)
        const innerCoreMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        const innerCore = new THREE.Mesh(innerCoreGeometry, innerCoreMaterial);
        energyCore.add(innerCore);
        
        stormCloudGroup.add(energyCore);
        
        // ⭐ ADD POINT LIGHT for flickering lightning effect
        const plasmaLight = new THREE.PointLight(
            0x8866ff,      // Purple-blue plasma color
            20.0,          // High intensity for dramatic effect
            3000,          // Large range
            2.0            // Decay
        );
        plasmaLight.position.copy(position);
        plasmaLight.castShadow = false;
        scene.add(plasmaLight);
        
        console.log(`  💡 Added flickering plasma light to storm at`, position);
        
        // ⭐ OPTIMIZED: Store components in userData (tendrils removed for performance)
        stormCloudGroup.userData = {
            name: `Plasma-Storm-${galaxyId}-${cosmicFeatures.plasmaStorms.length}`,
            type: 'plasma_storm',
            galaxyId: galaxyId,
            intensity: 0.7 + Math.random() * 0.3,
            movementSpeed: 0.2 + Math.random() * 0.3,
            energyOutput: 50 + Math.random() * 100,
            spheres: cloudSpheres,
            energyCore: energyCore,           // ⭐ Store glowing core
            glowSphere: glowSphere,            // ⭐ Store glow layer
            innerCore: innerCore,              // ⭐ Store inner core
            plasmaLight: plasmaLight,          // ⭐ Store point light
            baseLightIntensity: 20.0,          // ⭐ Base intensity for flickering
            lightningFlickerTime: 0,           // ⭐ Timer for lightning flicker
            direction: new THREE.Vector3(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.5
            ).normalize()
        };
        
        stormCloudGroup.visible = true;
        stormCloudGroup.frustumCulled = true;  // OPTIMIZATION: Enable frustum culling
        
        cosmicFeatures.plasmaStorms.push(stormCloudGroup);
        if (typeof scene !== 'undefined') {
            scene.add(stormCloudGroup);
        }
        
        stormsCreated++;
        console.log(`✅ Plasma storm ${stormsCreated} created in galaxy ${galaxyId}`);
    }
    
    console.log(`⚡ OPTIMIZED: Created ${cosmicFeatures.plasmaStorms.length} plasma storms with reduced geometry for better FPS (target was ${targetStormCount})`);
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
    
    // ⭐ ANIMATE SUPERNOVA LIGHT - Pulsing effect
    if (supernova.userData.pointLight) {
        const pulseFactor = Math.sin(time * 2) * 0.3 + 1.0; // 0.7 to 1.3
        supernova.userData.pointLight.intensity = 15.0 * pulseFactor;
        
        // Subtle color shift
        const hueShift = Math.sin(time * 0.5) * 0.05;
        supernova.userData.pointLight.color.setHSL(0.08 + hueShift, 1.0, 0.5);
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
    
    // ⭐ ANIMATE SOLAR STORM LIGHT - Dramatic pulsing
    if (storm.userData.pointLight && storm.userData.baseLightIntensity) {
        const intensePulse = Math.abs(Math.sin(time * 3)) * 0.6 + 0.6; // 0.6 to 1.2
        storm.userData.pointLight.intensity = storm.userData.baseLightIntensity * intensePulse;
        
        // Color flicker effect
        const flickerHue = Math.sin(time * 5) * 0.03;
        storm.userData.pointLight.color.setHSL(0.02 + flickerHue, 1.0, 0.5);
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
    
    // Update plasma storms (movement and lightning animation) - OPTIMIZED
cosmicFeatures.plasmaStorms.forEach((storm, stormIndex) => {
    if (!storm.userData) return;

    // Move storm (always update position)
    if (storm.userData.direction) {
        storm.position.add(storm.userData.direction.clone().multiplyScalar(storm.userData.movementSpeed));
    }

    // ⚡ PERFORMANCE OPTIMIZED: Only animate visual effects every 5 frames (~12fps animation, imperceptible)
    if (typeof gameState !== 'undefined' && gameState.frameCount % 5 !== stormIndex % 5) return;
    
    // Pre-calculate shared values to avoid redundant sin() calls
    const corePulse = Math.sin(time * 2) * 0.15 + 1.0;
    const glowPulse = Math.sin(time * 2.5 + Math.PI) * 0.12 + 1.0;
    const innerPulse = Math.sin(time * 4) * 0.2 + 1.0;
    
    // ⚡ ANIMATE CORES - Batched animations
    if (storm.userData.energyCore) {
        storm.userData.energyCore.scale.setScalar(corePulse);
        if (storm.userData.energyCore.material) {
            storm.userData.energyCore.material.opacity = 0.3 + Math.sin(time * 3) * 0.15;
        }
    }
    
    if (storm.userData.glowSphere) {
        storm.userData.glowSphere.scale.setScalar(glowPulse);
    }
    
    if (storm.userData.innerCore) {
        storm.userData.innerCore.scale.setScalar(innerPulse);
        if (storm.userData.innerCore.material) {
            storm.userData.innerCore.material.opacity = 0.4 + Math.sin(time * 5) * 0.3;
        }
    }
    
    // ⚡ FLICKERING LIGHTNING EFFECT - Optimized frequency
    if (storm.userData.plasmaLight && storm.userData.baseLightIntensity) {
        // Check for flicker every 8 frames for dramatic effect
        if (typeof gameState !== 'undefined' && gameState.frameCount % 8 === stormIndex % 8 && Math.random() < 0.4) {
            // Lightning flash!
            storm.userData.plasmaLight.intensity = storm.userData.baseLightIntensity * (3.0 + Math.random() * 2.0);
            storm.userData.plasmaLight.color.setHex(0xffffff);
            storm.userData.lightningActive = true;
            
            // Schedule color return (avoid creating too many timeouts)
            if (!storm.userData.lightningTimeout) {
                storm.userData.lightningTimeout = setTimeout(() => {
                    if (storm.userData.plasmaLight) {
                        storm.userData.plasmaLight.color.setHex(0x8866ff);
                    }
                    storm.userData.lightningTimeout = null;
                    storm.userData.lightningActive = false;
                }, 50);
            }
        } else if (!storm.userData.lightningActive) {
            // Normal pulsing
            const lightPulse = Math.sin(time * 3) * 0.4 + 0.8;
            storm.userData.plasmaLight.intensity = storm.userData.baseLightIntensity * lightPulse;
            
            // Color shift (less frequent calculation)
            const hueShift = Math.sin(time * 0.8) * 0.05;
            storm.userData.plasmaLight.color.setHSL(0.7 + hueShift, 0.8, 0.5);
        }
    }
    
    // Animate cloud spheres - OPTIMIZED (all spheres with single calculation)
    if (storm.userData.spheres && storm.userData.spheres.length > 0) {
        const wobble = Math.sin(time * 2) * 0.1 + 1.0;
        // Update all spheres at once (reduced from 8-14 to 4-6 spheres)
        storm.userData.spheres.forEach(sphere => {
            sphere.scale.setScalar(wobble);
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
    if (typeof camera === 'undefined' || typeof gameState === 'undefined') return;
    
    const playerPos = camera.position;
    
    // Check pulsars
    cosmicFeatures.pulsars.forEach(pulsar => {
        const distance = playerPos.distanceTo(pulsar.position);
        
        if (distance < 800) {
            // Navigation jamming
            if (typeof gameState.navigationJammed === 'undefined') {
                gameState.navigationJammed = false;
            }
            
            if (!gameState.navigationJammed) {
                gameState.navigationJammed = true;
                if (typeof showAchievement === 'function') {
                    showAchievement('Pulsar Detected', 'Strong magnetic interference detected');
                }
            }
        } else if (gameState.navigationJammed) {
            gameState.navigationJammed = false;
        }
    });
    
    // ⭐ ENHANCED: Check solar storms - MASSIVE ENERGY BOOST
    cosmicFeatures.solarStorms.forEach(storm => {
        const distance = playerPos.distanceTo(storm.position);
        
        // Outer warning zone (500-800 units)
        if (distance < 800 && distance > 500) {
            if (!storm.userData.warningShown) {
                storm.userData.warningShown = true;
                if (typeof showAchievement === 'function') {
                    showAchievement('Solar Storm Approaching', 'Prepare for electromagnetic surge!');
                }
            }
        } else if (distance > 800) {
            storm.userData.warningShown = false;
            storm.userData.insideStorm = false;
        }
        
        // ⭐ INSIDE SOLAR STORM (within 500 units) - POWER BOOST!
        if (distance < 500) {
            // First time entering the storm
            if (!storm.userData.insideStorm) {
                storm.userData.insideStorm = true;
                storm.userData.boostActivatedTime = Date.now();
                storm.userData.stormEntryPosition = playerPos.clone();
                
                // ⭐ SUPERCHARGE ENERGY TO 300%
                gameState.energy = 300;
                gameState.maxEnergy = 300;
                gameState.solarStormBoostActive = true;
                gameState.solarStormBoostEndTime = Date.now() + 60000; // 1 minute
                
                // ⭐ REFILL ALL EMERGENCY WARPS
                if (gameState.emergencyWarp) {
                    gameState.emergencyWarp.available = 5;
                }
                
                // Visual and audio feedback
                if (typeof showAchievement === 'function') {
                    showAchievement('⚡ SOLAR STORM SURGE! ⚡', 'Energy supercharged to 300%! Emergency warps refilled! (60 seconds)');
                }
                
                if (typeof playSound === 'function') {
                    playSound('powerup');
                }
                
                // Create visual effect
                createSolarStormChargeEffect();
                
                console.log('⚡ SOLAR STORM BOOST ACTIVATED!');
                console.log('  Energy: 100% → 300%');
                console.log('  Emergency Warps: Refilled to 5/5');
                console.log('  Duration: 60 seconds');
            }
            
            // While inside storm - maintain 300% energy
            if (gameState.solarStormBoostActive) {
                // Maintain max energy at 300
                if (gameState.energy < 300) {
                    gameState.energy = Math.min(300, gameState.energy + 5); // Rapid recharge
                }
            }
            
            // Weapon power boost
            if (typeof gameState.weaponPowerBoost !== 'undefined') {
                gameState.weaponPowerBoost = storm.userData.weaponBoost || 2.0;
            }
            
            // Add storm particles effect
            if (Math.random() < 0.1) {
                createStormParticle(playerPos);
            }
        }
    });
    
    // ⭐ CHECK FOR SOLAR STORM BOOST EXPIRATION
    if (gameState.solarStormBoostActive) {
        const timeRemaining = gameState.solarStormBoostEndTime - Date.now();
        
        // Show countdown warnings
        if (timeRemaining <= 10000 && timeRemaining > 9000 && !gameState.tenSecondWarningShown) {
            gameState.tenSecondWarningShown = true;
            if (typeof showAchievement === 'function') {
                showAchievement('⚡ Boost Ending Soon', 'Solar storm boost expires in 10 seconds!');
            }
        }
        
        // Boost expired
        if (timeRemaining <= 0) {
            gameState.solarStormBoostActive = false;
            gameState.maxEnergy = 100; // Reset to normal max
            gameState.energy = Math.min(100, gameState.energy); // Cap at 100%
            gameState.tenSecondWarningShown = false;
            
            if (typeof showAchievement === 'function') {
                showAchievement('Solar Storm Boost Ended', 'Energy systems returned to normal');
            }
            
            console.log('⚡ Solar storm boost expired - energy reset to normal (max 100%)');
        }
    }
    
    // ⭐ NEW: Check plasma storms - SAME MASSIVE ENERGY BOOST AS SOLAR STORMS
cosmicFeatures.plasmaStorms.forEach(storm => {
    const distance = playerPos.distanceTo(storm.position);
    
    // Outer warning zone (600-1000 units)
    if (distance < 1000 && distance > 600) {
        if (!storm.userData.warningShown) {
            storm.userData.warningShown = true;
            if (typeof showAchievement === 'function') {
                showAchievement('Plasma Storm Detected', 'Massive energy field approaching!');
            }
        }
    } else if (distance > 1000) {
        storm.userData.warningShown = false;
        storm.userData.insideStorm = false;
    }
    
    // ⭐ INSIDE PLASMA STORM (within 600 units) - POWER BOOST!
    if (distance < 600) {
        // First time entering the storm
        if (!storm.userData.insideStorm) {
            storm.userData.insideStorm = true;
            storm.userData.boostActivatedTime = Date.now();
            storm.userData.stormEntryPosition = playerPos.clone();
            
            // ⭐ SUPERCHARGE ENERGY TO 300%
            gameState.energy = 300;
            gameState.maxEnergy = 300;
            gameState.plasmaStormBoostActive = true;
            gameState.plasmaStormBoostEndTime = Date.now() + 60000; // 1 minute
            
            // ⭐ REFILL ALL EMERGENCY WARPS
            if (gameState.emergencyWarp) {
                gameState.emergencyWarp.available = 5;
            }
            
            // Visual and audio feedback
            if (typeof showAchievement === 'function') {
                showAchievement('⚡ PLASMA STORM SURGE! ⚡', 'Energy supercharged to 300%! Emergency warps refilled! (60 seconds)');
            }
            
            if (typeof playSound === 'function') {
                playSound('powerup');
            }
            
            // Create visual effect (purple version)
            createPlasmaStormChargeEffect();
            
            console.log('⚡ PLASMA STORM BOOST ACTIVATED!');
            console.log('  Energy: 100% → 300%');
            console.log('  Emergency Warps: Refilled to 5/5');
            console.log('  Duration: 60 seconds');
        }
        
        // While inside storm - maintain 300% energy
        if (gameState.plasmaStormBoostActive) {
            // Maintain max energy at 300
            if (gameState.energy < 300) {
                gameState.energy = Math.min(300, gameState.energy + 5); // Rapid recharge
            }
        }
        
        // Add plasma particles effect
        if (Math.random() < 0.1) {
            createPlasmaParticle(playerPos);
        }
    }
});

// ⭐ CHECK FOR PLASMA STORM BOOST EXPIRATION
if (gameState.plasmaStormBoostActive) {
    const timeRemaining = gameState.plasmaStormBoostEndTime - Date.now();
    
    // Show countdown warnings
    if (timeRemaining <= 10000 && timeRemaining > 9000 && !gameState.plasmaTenSecondWarningShown) {
        gameState.plasmaTenSecondWarningShown = true;
        if (typeof showAchievement === 'function') {
            showAchievement('⚡ Boost Ending Soon', 'Plasma storm boost expires in 10 seconds!');
        }
    }
    
    // Boost expired
    if (timeRemaining <= 0) {
        gameState.plasmaStormBoostActive = false;
        gameState.maxEnergy = 100; // Reset to normal max
        gameState.energy = Math.min(100, gameState.energy); // Cap at 100%
        gameState.plasmaTenSecondWarningShown = false;
        
        if (typeof showAchievement === 'function') {
            showAchievement('Plasma Storm Boost Ended', 'Energy systems returned to normal');
        }
        
        console.log('⚡ Plasma storm boost expired - energy reset to normal (max 100%)');
    }
}

// ⭐ COMBINED BOOST CHECK (if both active, they don't stack but maintain 300%)
if (gameState.solarStormBoostActive || gameState.plasmaStormBoostActive) {
    gameState.maxEnergy = 300;
}
    
    // Check supernovas
    cosmicFeatures.supernovas.forEach(supernova => {
        const distance = playerPos.distanceTo(supernova.position);
        
        if (distance < 600) {
            // Radiation damage
            if (typeof gameState.hull !== 'undefined') {
                const damage = (600 - distance) / 600 * 0.5;
                gameState.hull = Math.max(0, gameState.hull - damage);
                
                if (Math.random() < 0.01) {
                    if (typeof showAchievement === 'function') {
                        showAchievement('Supernova Radiation', 'Hull taking radiation damage!');
                    }
                }
            }
        }
    });
    
    // Check space whales
    cosmicFeatures.spaceWhales.forEach(whale => {
        // Use world position for outer system whales (nested in system groups)
        let whaleWorldPos;
        if (whale.userData.isOuterSystem && whale.parent) {
            whaleWorldPos = new THREE.Vector3();
            whale.getWorldPosition(whaleWorldPos);
        } else {
            whaleWorldPos = whale.position;
        }

        const distance = playerPos.distanceTo(whaleWorldPos);

        if (distance < 300 && !whale.userData.encountered) {
            whale.userData.encountered = true;

            if (typeof showAchievement === 'function') {
                showAchievement('Space Whale Encounter', 'Legendary cosmic creature detected!');
            }

            // Peaceful energy gift
            gameState.energy = Math.min(gameState.maxEnergy || 100, gameState.energy + 50);
        } else if (distance > 500) {
            whale.userData.encountered = false;
        }
    });
    
    // Check crystal formations
    cosmicFeatures.crystalFormations.forEach(formation => {
        // Use world position for outer system crystals (nested in system groups)
        let formationWorldPos;
        if (formation.userData.isOuterSystem && formation.parent) {
            formationWorldPos = new THREE.Vector3();
            formation.getWorldPosition(formationWorldPos);
        } else {
            formationWorldPos = formation.position;
        }

        const distance = playerPos.distanceTo(formationWorldPos);

        if (distance < 400) {
            // Energy field effect
            if (typeof gameState.shieldBonus === 'undefined') {
                gameState.shieldBonus = 0;
            }
            gameState.shieldBonus = formation.userData.energyField * 0.01;
        }
    });
}

// =============================================================================
// SOLAR STORM VISUAL EFFECTS
// =============================================================================

function createSolarStormChargeEffect() {
    // Create pulsing screen effect
    const chargeOverlay = document.createElement('div');
    chargeOverlay.className = 'absolute inset-0 pointer-events-none';
    chargeOverlay.style.zIndex = '30';
    chargeOverlay.style.background = 'radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%)';
    chargeOverlay.style.animation = 'solarChargePulse 2s ease-out';
    document.body.appendChild(chargeOverlay);
    
    // Remove after animation
    setTimeout(() => chargeOverlay.remove(), 2000);
    
    // Create particle burst around player
    if (typeof camera !== 'undefined' && typeof scene !== 'undefined') {
        const burstGeometry = new THREE.BufferGeometry();
        const burstVertices = [];
        const burstColors = [];
        
        for (let i = 0; i < 100; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = 20 + Math.random() * 30;
            
            burstVertices.push(
                camera.position.x + radius * Math.sin(phi) * Math.cos(theta),
                camera.position.y + radius * Math.cos(phi),
                camera.position.z + radius * Math.sin(phi) * Math.sin(theta)
            );
            
            // Electric yellow color
            burstColors.push(1.0, 0.9 + Math.random() * 0.1, 0.0);
        }
        
        burstGeometry.setAttribute('position', new THREE.Float32BufferAttribute(burstVertices, 3));
        burstGeometry.setAttribute('color', new THREE.Float32BufferAttribute(burstColors, 3));
        
        const burstMaterial = new THREE.PointsMaterial({
            size: 4,
            vertexColors: true,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });
        
        const burstParticles = new THREE.Points(burstGeometry, burstMaterial);
        scene.add(burstParticles);
        
        // Animate and remove
        let burstOpacity = 1.0;
        const burstInterval = setInterval(() => {
            burstOpacity -= 0.05;
            burstMaterial.opacity = burstOpacity;
            
            if (burstOpacity <= 0) {
                clearInterval(burstInterval);
                scene.remove(burstParticles);
                burstGeometry.dispose();
                burstMaterial.dispose();
            }
        }, 50);
    }
}

function createStormParticle(position) {
    if (typeof scene === 'undefined') return;
    
    const particleGeometry = new THREE.SphereGeometry(2, 8, 8);
    const particleMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    
    const particle = new THREE.Mesh(particleGeometry, particleMaterial);
    particle.position.set(
        position.x + (Math.random() - 0.5) * 100,
        position.y + (Math.random() - 0.5) * 100,
        position.z + (Math.random() - 0.5) * 100
    );
    
    scene.add(particle);
    
    // Fade out and remove
    let opacity = 0.8;
    const fadeInterval = setInterval(() => {
        opacity -= 0.05;
        particleMaterial.opacity = opacity;
        
        if (opacity <= 0) {
            clearInterval(fadeInterval);
            scene.remove(particle);
            particleGeometry.dispose();
            particleMaterial.dispose();
        }
    }, 50);
}

// Add CSS animation for charge effect
if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes solarChargePulse {
            0% { opacity: 0; transform: scale(0.5); }
            50% { opacity: 1; transform: scale(1.2); }
            100% { opacity: 0; transform: scale(1.5); }
        }
    `;
    document.head.appendChild(style);
}

// =============================================================================
// PLASMA STORM VISUAL EFFECTS
// =============================================================================

function createPlasmaStormChargeEffect() {
    // Create pulsing screen effect (purple version)
    const chargeOverlay = document.createElement('div');
    chargeOverlay.className = 'absolute inset-0 pointer-events-none';
    chargeOverlay.style.zIndex = '30';
    chargeOverlay.style.background = 'radial-gradient(circle, rgba(136, 102, 255, 0.4) 0%, transparent 70%)';
    chargeOverlay.style.animation = 'plasmaChargePulse 2s ease-out';
    document.body.appendChild(chargeOverlay);
    
    // Remove after animation
    setTimeout(() => chargeOverlay.remove(), 2000);
    
    // Create particle burst around player (purple/blue)
    if (typeof camera !== 'undefined' && typeof scene !== 'undefined') {
        const burstGeometry = new THREE.BufferGeometry();
        const burstVertices = [];
        const burstColors = [];
        
        for (let i = 0; i < 150; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = 20 + Math.random() * 40;
            
            burstVertices.push(
                camera.position.x + radius * Math.sin(phi) * Math.cos(theta),
                camera.position.y + radius * Math.cos(phi),
                camera.position.z + radius * Math.sin(phi) * Math.sin(theta)
            );
            
            // Purple-blue plasma colors
            const colorChoice = Math.random();
            if (colorChoice < 0.5) {
                burstColors.push(0.53, 0.27, 1.0); // Purple
            } else {
                burstColors.push(0.27, 0.4, 1.0);  // Blue
            }
        }
        
        burstGeometry.setAttribute('position', new THREE.Float32BufferAttribute(burstVertices, 3));
        burstGeometry.setAttribute('color', new THREE.Float32BufferAttribute(burstColors, 3));
        
        const burstMaterial = new THREE.PointsMaterial({
            size: 5,
            vertexColors: true,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });
        
        const burstParticles = new THREE.Points(burstGeometry, burstMaterial);
        scene.add(burstParticles);
        
        // Animate and remove
        let burstOpacity = 1.0;
        const burstInterval = setInterval(() => {
            burstOpacity -= 0.05;
            burstMaterial.opacity = burstOpacity;
            
            if (burstOpacity <= 0) {
                clearInterval(burstInterval);
                scene.remove(burstParticles);
                burstGeometry.dispose();
                burstMaterial.dispose();
            }
        }, 50);
    }
}

function createPlasmaParticle(position) {
    if (typeof scene === 'undefined') return;
    
    const particleGeometry = new THREE.SphereGeometry(2.5, 8, 8);
    const particleMaterial = new THREE.MeshBasicMaterial({
        color: Math.random() > 0.5 ? 0x8866ff : 0x6644ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
    });
    
    const particle = new THREE.Mesh(particleGeometry, particleMaterial);
    particle.position.set(
        position.x + (Math.random() - 0.5) * 150,
        position.y + (Math.random() - 0.5) * 150,
        position.z + (Math.random() - 0.5) * 150
    );
    
    scene.add(particle);
    
    // Fade out and remove
    let opacity = 0.9;
    const fadeInterval = setInterval(() => {
        opacity -= 0.06;
        particleMaterial.opacity = opacity;
        
        // Grow slightly as it fades
        particle.scale.multiplyScalar(1.05);
        
        if (opacity <= 0) {
            clearInterval(fadeInterval);
            scene.remove(particle);
            particleGeometry.dispose();
            particleMaterial.dispose();
        }
    }, 50);
}

// Add CSS animation for plasma charge effect
if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes plasmaChargePulse {
            0% { opacity: 0; transform: scale(0.5); }
            50% { opacity: 1; transform: scale(1.2); }
            100% { opacity: 0; transform: scale(1.5); }
        }
    `;
    document.head.appendChild(style);
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
