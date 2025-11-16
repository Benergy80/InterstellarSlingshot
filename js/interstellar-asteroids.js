// =============================================================================
// INTERSTELLAR ASTEROID FIELDS
// Large roaming asteroids in empty space between galaxies
// =============================================================================

// Global array for interstellar asteroids
if (typeof window.interstellarAsteroids === 'undefined') {
    window.interstellarAsteroids = [];
}

// Configuration for interstellar asteroid fields
const INTERSTELLAR_ASTEROID_CONFIG = {
    fieldCount: 8,  // Number of asteroid fields
    asteroidsPerField: 15,  // Asteroids per field
    minDistance: 25000,  // Min distance from galactic center
    maxDistance: 55000,  // Max distance from galactic center (reduced from 80000 to bring closer)
    baseSize: 50,  // 10x bigger than normal asteroids (base ~5)
    sizeVariation: 0.7,  // Size can vary ±70%
    maxSpeed: 0.3,  // Maximum asteroid velocity
    minSpeed: 0.05,  // Minimum asteroid velocity
    breakupMinSize: 10,  // Minimum size before asteroid can't break further
    breakupPieces: 3,  // Number of pieces when breaking
};

// Create interstellar asteroid fields between galaxies
function createInterstellarAsteroidFields() {
    console.log('🌌 Creating interstellar asteroid fields...');

    if (typeof THREE === 'undefined' || typeof scene === 'undefined') {
        console.error('❌ THREE.js or scene not available');
        return;
    }

    const fieldPositions = generateAsteroidFieldPositions(INTERSTELLAR_ASTEROID_CONFIG.fieldCount);

    fieldPositions.forEach((fieldPos, fieldIndex) => {
        createAsteroidField(fieldPos, fieldIndex);
    });

    console.log(`✅ Created ${INTERSTELLAR_ASTEROID_CONFIG.fieldCount} interstellar asteroid fields with ${interstellarAsteroids.length} total asteroids`);
}

// Generate positions for asteroid fields (between galaxies)
function generateAsteroidFieldPositions(count) {
    const positions = [];
    const { minDistance, maxDistance } = INTERSTELLAR_ASTEROID_CONFIG;

    for (let i = 0; i < count; i++) {
        // Distribute around sphere in interstellar space
        const radius = minDistance + Math.random() * (maxDistance - minDistance);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(1 - 2 * Math.random());

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);

        positions.push({ x, y, z, radius });
    }

    return positions;
}

// Create a single asteroid field
function createAsteroidField(centerPosition, fieldIndex) {
    const { asteroidsPerField, baseSize, sizeVariation, minSpeed, maxSpeed } = INTERSTELLAR_ASTEROID_CONFIG;
    const fieldSpread = 3000;  // How spread out the asteroids are

    for (let i = 0; i < asteroidsPerField; i++) {
        // Random offset from field center
        const offsetX = (Math.random() - 0.5) * fieldSpread;
        const offsetY = (Math.random() - 0.5) * fieldSpread;
        const offsetZ = (Math.random() - 0.5) * fieldSpread;

        const asteroidPos = {
            x: centerPosition.x + offsetX,
            y: centerPosition.y + offsetY,
            z: centerPosition.z + offsetZ
        };

        // Random size with variation
        const sizeMultiplier = 1 + (Math.random() - 0.5) * sizeVariation;
        const size = baseSize * sizeMultiplier;

        // Random velocity for roaming movement
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * maxSpeed,
            (Math.random() - 0.5) * maxSpeed,
            (Math.random() - 0.5) * maxSpeed
        );

        // Ensure minimum speed
        if (velocity.length() < minSpeed) {
            velocity.normalize().multiplyScalar(minSpeed);
        }

        createInterstellarAsteroid(asteroidPos, size, velocity, fieldIndex, i);
    }
}

// Create a single interstellar asteroid
function createInterstellarAsteroid(position, size, velocity, fieldIndex, asteroidIndex) {
    // Create irregular asteroid geometry
    const geometry = new THREE.IcosahedronGeometry(size, 1);

    // Randomize vertices for irregular shape
    const positionAttribute = geometry.attributes.position;
    for (let i = 0; i < positionAttribute.count; i++) {
        const x = positionAttribute.getX(i);
        const y = positionAttribute.getY(i);
        const z = positionAttribute.getZ(i);

        const randomFactor = 0.7 + Math.random() * 0.6;  // 70-130% of original
        positionAttribute.setXYZ(
            i,
            x * randomFactor,
            y * randomFactor,
            z * randomFactor
        );
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();

    // Material - dark gray/brown rocky appearance with slight emissive for visibility in deep space
    const baseColor = new THREE.Color(0.3 + Math.random() * 0.2, 0.25 + Math.random() * 0.15, 0.2 + Math.random() * 0.1);
    const material = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: baseColor,
        emissiveIntensity: 0.15,  // Slight self-illumination for visibility in dark space
        roughness: 0.9,
        metalness: 0.1,
        flatShading: true
    });

    const asteroid = new THREE.Mesh(geometry, material);
    asteroid.position.set(position.x, position.y, position.z);

    // Random rotation for variety
    asteroid.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
    );

    // Store asteroid data
    asteroid.userData = {
        type: 'interstellar_asteroid',
        name: `Interstellar Asteroid ${fieldIndex}-${asteroidIndex}`,
        size: size,
        velocity: velocity.clone(),
        fieldIndex: fieldIndex,
        health: Math.ceil(size / 10),  // Larger asteroids take more hits
        rotationSpeed: new THREE.Vector3(
            (Math.random() - 0.5) * 0.01,
            (Math.random() - 0.5) * 0.01,
            (Math.random() - 0.5) * 0.01
        ),
        generation: 0,  // Track how many times it's been broken
    };

    scene.add(asteroid);
    interstellarAsteroids.push(asteroid);

    console.log(`  Created ${asteroid.userData.name} at (${position.x.toFixed(0)}, ${position.y.toFixed(0)}, ${position.z.toFixed(0)}) - size: ${size.toFixed(1)}, health: ${asteroid.userData.health}`);
}

// Update interstellar asteroids (movement and rotation)
function updateInterstellarAsteroids() {
    if (typeof interstellarAsteroids === 'undefined' || interstellarAsteroids.length === 0) return;

    interstellarAsteroids.forEach(asteroid => {
        if (!asteroid || !asteroid.userData) return;

        // Apply velocity for roaming movement
        asteroid.position.add(asteroid.userData.velocity);

        // Apply rotation
        asteroid.rotation.x += asteroid.userData.rotationSpeed.x;
        asteroid.rotation.y += asteroid.userData.rotationSpeed.y;
        asteroid.rotation.z += asteroid.userData.rotationSpeed.z;
    });
}

// Break asteroid into smaller pieces when shot
function breakInterstellarAsteroid(asteroid, hitPosition, hitNormal) {
    const { breakupMinSize, breakupPieces } = INTERSTELLAR_ASTEROID_CONFIG;

    // Check if asteroid is too small to break further
    if (asteroid.userData.size < breakupMinSize) {
        // Just destroy it
        destroyInterstellarAsteroid(asteroid);
        return;
    }

    // Create debris effect at hit position
    if (typeof createAsteroidExplosion === 'function') {
        createAsteroidExplosion(hitPosition, asteroid.userData.size * 0.3);
    }

    // Calculate new size for fragments
    const fragmentSize = asteroid.userData.size / 2;

    // Create smaller asteroid fragments
    for (let i = 0; i < breakupPieces; i++) {
        // Random offset from hit position
        const spreadAngle = (Math.PI * 2 / breakupPieces) * i + Math.random() * 0.5;
        const spreadDistance = asteroid.userData.size * 0.5;

        const offsetX = Math.cos(spreadAngle) * spreadDistance;
        const offsetY = (Math.random() - 0.5) * spreadDistance;
        const offsetZ = Math.sin(spreadAngle) * spreadDistance;

        const fragmentPos = {
            x: asteroid.position.x + offsetX,
            y: asteroid.position.y + offsetY,
            z: asteroid.position.z + offsetZ
        };

        // New velocity - inherit parent velocity and add explosive force
        const explosiveForce = new THREE.Vector3(
            offsetX,
            offsetY,
            offsetZ
        ).normalize().multiplyScalar(0.5 + Math.random() * 0.5);

        const fragmentVelocity = asteroid.userData.velocity.clone().add(explosiveForce);

        createInterstellarAsteroid(
            fragmentPos,
            fragmentSize,
            fragmentVelocity,
            asteroid.userData.fieldIndex,
            interstellarAsteroids.length
        );

        // Update generation counter
        const lastAsteroid = interstellarAsteroids[interstellarAsteroids.length - 1];
        if (lastAsteroid) {
            lastAsteroid.userData.generation = asteroid.userData.generation + 1;
        }
    }

    // Destroy original asteroid
    destroyInterstellarAsteroid(asteroid);

    console.log(`💥 Asteroid broke into ${breakupPieces} fragments (size: ${fragmentSize.toFixed(1)})`);
}

// Destroy an interstellar asteroid
function destroyInterstellarAsteroid(asteroid) {
    scene.remove(asteroid);

    const index = interstellarAsteroids.indexOf(asteroid);
    if (index > -1) {
        interstellarAsteroids.splice(index, 1);
    }

    if (asteroid.geometry) asteroid.geometry.dispose();
    if (asteroid.material) asteroid.material.dispose();
}

// Check for collisions between interstellar asteroids
function checkInterstellarAsteroidCollisions() {
    if (typeof interstellarAsteroids === 'undefined' || interstellarAsteroids.length < 2) return;

    // Only check every few frames for performance
    if (typeof window.asteroidCollisionFrameCounter === 'undefined') {
        window.asteroidCollisionFrameCounter = 0;
    }
    window.asteroidCollisionFrameCounter++;

    if (window.asteroidCollisionFrameCounter % 5 !== 0) return;  // Check every 5 frames

    for (let i = 0; i < interstellarAsteroids.length; i++) {
        const asteroidA = interstellarAsteroids[i];
        if (!asteroidA || !asteroidA.userData) continue;

        for (let j = i + 1; j < interstellarAsteroids.length; j++) {
            const asteroidB = interstellarAsteroids[j];
            if (!asteroidB || !asteroidB.userData) continue;

            // Calculate distance
            const distance = asteroidA.position.distanceTo(asteroidB.position);
            const collisionDistance = asteroidA.userData.size + asteroidB.userData.size;

            if (distance < collisionDistance) {
                // Collision detected!
                handleAsteroidCollision(asteroidA, asteroidB);
                break;  // Only handle one collision per asteroid per frame
            }
        }
    }
}

// Handle collision between two asteroids
function handleAsteroidCollision(asteroidA, asteroidB) {
    console.log(`💥 Asteroid collision: ${asteroidA.userData.name} vs ${asteroidB.userData.name}`);

    // Calculate collision point (midpoint between centers)
    const collisionPoint = new THREE.Vector3().addVectors(
        asteroidA.position,
        asteroidB.position
    ).multiplyScalar(0.5);

    // Calculate collision normal (from A to B)
    const collisionNormal = new THREE.Vector3().subVectors(
        asteroidB.position,
        asteroidA.position
    ).normalize();

    // Both asteroids break apart
    breakInterstellarAsteroid(asteroidA, collisionPoint, collisionNormal);
    breakInterstellarAsteroid(asteroidB, collisionPoint, collisionNormal.negate());
}

// Console command to find asteroid field locations
function findAsteroidFields() {
    if (typeof interstellarAsteroids === 'undefined' || interstellarAsteroids.length === 0) {
        console.log('❌ No interstellar asteroid fields found. They may not be created yet.');
        return;
    }

    console.log('🌌 INTERSTELLAR ASTEROID FIELD LOCATIONS:');
    console.log(`Total asteroids: ${interstellarAsteroids.length}`);
    console.log('');

    // Group asteroids by field
    const fields = {};
    interstellarAsteroids.forEach(asteroid => {
        const fieldIndex = asteroid.userData.fieldIndex;
        if (!fields[fieldIndex]) {
            fields[fieldIndex] = [];
        }
        fields[fieldIndex].push(asteroid);
    });

    // Display each field's center position
    Object.keys(fields).sort((a, b) => a - b).forEach(fieldIndex => {
        const asteroids = fields[fieldIndex];

        // Calculate field center (average position)
        let centerX = 0, centerY = 0, centerZ = 0;
        asteroids.forEach(a => {
            centerX += a.position.x;
            centerY += a.position.y;
            centerZ += a.position.z;
        });
        centerX /= asteroids.length;
        centerY /= asteroids.length;
        centerZ /= asteroids.length;

        const distanceFromCenter = Math.sqrt(centerX * centerX + centerY * centerY + centerZ * centerZ);
        const distanceFromPlayer = typeof camera !== 'undefined'
            ? Math.sqrt(
                Math.pow(centerX - camera.position.x, 2) +
                Math.pow(centerY - camera.position.y, 2) +
                Math.pow(centerZ - camera.position.z, 2)
              )
            : 'N/A';

        console.log(`Field ${fieldIndex}:`);
        console.log(`  Center: (${centerX.toFixed(0)}, ${centerY.toFixed(0)}, ${centerZ.toFixed(0)})`);
        console.log(`  Distance from Sagittarius A*: ${distanceFromCenter.toFixed(0)} units`);
        if (distanceFromPlayer !== 'N/A') {
            console.log(`  Distance from you: ${distanceFromPlayer.toFixed(0)} units`);
        }
        console.log(`  Asteroids in field: ${asteroids.length}`);
        console.log('');
    });

    console.log('💡 Tip: Use autopilot to navigate to these coordinates!');
}

// Export functions
window.createInterstellarAsteroidFields = createInterstellarAsteroidFields;
window.updateInterstellarAsteroids = updateInterstellarAsteroids;
window.breakInterstellarAsteroid = breakInterstellarAsteroid;
window.destroyInterstellarAsteroid = destroyInterstellarAsteroid;
window.checkInterstellarAsteroidCollisions = checkInterstellarAsteroidCollisions;
window.findAsteroidFields = findAsteroidFields;

console.log('🌌 Interstellar Asteroid Fields system loaded');
