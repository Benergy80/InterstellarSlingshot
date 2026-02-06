/**
 * Nebula Type Definitions & Location Constants
 * ==============================================
 * Centralizes all nebula classifications, shapes, placement parameters,
 * and naming systems used throughout the Interstellar Slingshot game.
 *
 * Nebula Categories:
 *   1. Clustered Nebulas  - Near-field clusters (12,000-20,000 units)
 *   2. Galaxy-Formation Nebulas - Mid-field with distinct shapes (15,000-31,000 units)
 *   3. Distant Nebulas    - Outer region landmarks (50,000-75,000 units)
 *   4. Exotic Core Nebulas - Deep space with glowing cores (45,000-65,000 units)
 */

// =============================================================================
// NEBULA SHAPE TYPES
// =============================================================================

/**
 * All possible nebula shapes and their particle distribution characteristics.
 *
 * @readonly
 * @enum {string}
 */
const NEBULA_SHAPES = {
    /** Rotating arms around a central bulge. 40% center bulge, 60% spiral arms. */
    SPIRAL: 'spiral',

    /** Flattened spheroid with uniform distribution. 50% Y-axis flattening. */
    ELLIPTICAL: 'elliptical',

    /** Hollow toroid - spiral distribution that skips the center (< 40% radius). */
    RING: 'ring',

    /** Asymmetric dual-arm spiral with uneven arm widths (0.15 vs 0.20). */
    IRREGULAR: 'irregular',

    /** 70% central bulge + 30% narrow vertical polar jets with blue tint. */
    QUASAR: 'quasar',

    /** Very flat disk with bright center. Height range only +/-20 units. */
    LENTICULAR: 'lenticular',

    /** Small irregular cluster with 60% Y-axis flattening. Used for dwarf types. */
    ANCIENT: 'ancient'
};

// =============================================================================
// NAMED NEBULA TYPES (Galaxy-Formation Nebulas)
// =============================================================================

/**
 * The 8 named nebula types used in `createNebulas()`. Each maps to a mythological
 * name, a particle shape, and a signature color. These mirror the 8 galaxy types.
 *
 * @type {Array<{name: string, shape: string, color: number, arms?: number, description: string}>}
 */
const NEBULA_TYPES = [
    {
        name: 'Olympus',
        shape: NEBULA_SHAPES.SPIRAL,
        arms: 3,
        color: 0x4488ff,
        description: 'Home of the gods - 3-armed blue spiral'
    },
    {
        name: 'Titan',
        shape: NEBULA_SHAPES.ELLIPTICAL,
        color: 0xff8844,
        description: 'Primordial giants - orange flattened spheroid'
    },
    {
        name: 'Atlantis',
        shape: NEBULA_SHAPES.RING,
        arms: 1,
        color: 0x88ff44,
        description: 'Lost city of the heavens - green ring nebula'
    },
    {
        name: 'Prometheus',
        shape: NEBULA_SHAPES.IRREGULAR,
        color: 0xff4488,
        description: 'Bringer of fire - magenta asymmetric spiral'
    },
    {
        name: 'Elysium',
        shape: NEBULA_SHAPES.QUASAR,
        color: 0xff44ff,
        description: 'Paradise realm - purple quasar with polar jets'
    },
    {
        name: 'Tartarus',
        shape: NEBULA_SHAPES.LENTICULAR,
        color: 0x44ffff,
        description: 'Deepest abyss - cyan flat disk'
    },
    {
        name: 'Hyperion',
        shape: NEBULA_SHAPES.ANCIENT,
        color: 0xffaa88,
        description: 'Titan of light - peach irregular cluster'
    },
    {
        name: 'Chronos',
        shape: NEBULA_SHAPES.SPIRAL,
        arms: 2,
        color: 0x8844ff,
        description: 'God of time - blue-purple 2-armed spiral'
    }
];

// =============================================================================
// NEBULA LOCATION CATEGORIES
// =============================================================================

/**
 * Placement parameters for each nebula category.
 *
 * @type {Object<string, {minRadius: number, maxRadius: number, count: number, particleCount: number, sizeRange: [number, number], pointSize: number, opacity: number}>}
 */
const NEBULA_LOCATIONS = {
    /**
     * Clustered Nebulas: 3 fixed cluster centers in the near field.
     * Created in createClusteredNebulas(). Up to 3 layers via createSpectacularClusteredNebulas().
     */
    CLUSTERED: {
        minRadius: 12000,
        maxRadius: 20000,
        count: 8,
        particleCount: 1200,
        sizeRange: [2000, 5000],
        pointSize: 2.5,
        opacity: 0.65,
        clusterCenters: [
            { x: 15000, y: 0, z: 12000 },
            { x: -18000, y: 500, z: -15000 },
            { x: 8000, y: -800, z: -20000 }
        ],
        clusterSpread: 3000,
        verticalSpread: 1500,
        /** Color palettes by cluster index */
        colorSchemes: {
            0: { hueRange: [0.15, 0.45], label: 'Orange/Yellow' },
            1: { hueRange: [0.50, 0.75], label: 'Cyan/Green' },
            2: { hueRange: [0.80, 1.00], label: 'Magenta/Purple' }
        }
    },

    /**
     * Galaxy-Formation Nebulas: Spherically distributed around 4 cluster centers.
     * Created in createNebulas(). Each has a distinct shape from NEBULA_TYPES.
     */
    GALAXY_FORMATION: {
        minRadius: 15000,
        maxRadius: 30000,
        count: 8,
        particleCount: [4000, 6000],
        sizeRange: [1200, 2000],
        pointSize: 2.5,
        opacity: 0.65,
        clusterCount: 4,
        clusterSpread: [2000, 4000]
    },

    /**
     * Distant Nebulas: Evenly distributed in outer regions.
     * Created in createDistantNebulas(). Mostly equatorial distribution.
     */
    DISTANT: {
        minRadius: 50000,
        maxRadius: 75000,
        count: 6,
        particleCount: 1200,
        sizeRange: [3000, 7000],
        pointSize: 80,
        opacity: 0.6,
        polarRange: 0.5,
        colorScheme: { hueRange: [0.0, 1.0], label: 'Full spectrum' }
    },

    /**
     * Exotic Core Nebulas: Deep space nebulas with glowing cores and point lights.
     * Created in createExoticCoreNebulas(). Wider polar distribution than distant.
     */
    EXOTIC_CORE: {
        minRadius: 45000,
        maxRadius: 65000,
        count: 8,
        particleCount: 1500,
        sizeRange: [3500, 7000],
        pointSize: 150,
        opacity: 0.85,
        polarRange: 0.6,
        hasGlowingCore: true,
        coreSize: 0.15,
        lightIntensity: 8,
        colorScheme: { hueRange: [0.0, 1.0], label: 'Rainbow spread (evenly distributed)' }
    }
};

// =============================================================================
// NEBULA NAMING SYSTEMS
// =============================================================================

/**
 * Mythical names for the 8 primary clustered nebulas (used in createClusteredNebulas).
 * @type {string[]}
 */
const CLUSTERED_NEBULA_NAMES = [
    'Olympus Nebula',
    'Titan Nebula',
    'Atlantis Nebula',
    'Prometheus Nebula',
    'Elysium Nebula',
    'Tartarus Nebula',
    'Hyperion Nebula',
    'Chronos Nebula'
];

/**
 * Named distant nebulas using Greek alphabet designations.
 * @type {string[]}
 */
const DISTANT_NEBULA_NAMES = [
    'Distant Nebula Alpha',
    'Distant Nebula Beta',
    'Distant Nebula Gamma',
    'Distant Nebula Delta',
    'Distant Nebula Epsilon',
    'Distant Nebula Zeta'
];

/**
 * Named exotic core nebulas using frontier/boundary themes.
 * @type {string[]}
 */
const EXOTIC_NEBULA_NAMES = [
    'Frontier Nebula',
    'Outer Veil Nebula',
    'Deep Space Nebula',
    'Void Nebula',
    'Boundary Nebula',
    'Edge Nebula',
    'Threshold Nebula',
    'Horizon Nebula'
];

/**
 * Pool of 65 mythical/fictional place names for dynamically named nebulas.
 * Used by getMythicalNebulaName() with optional cluster prefixes.
 * @type {string[]}
 */
const MYTHICAL_NEBULA_NAME_POOL = [
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

/**
 * Prefixes applied 40% of the time to clustered nebula names for variety.
 * @type {string[]}
 */
const NEBULA_NAME_PREFIXES = [
    'Greater', 'Lesser', 'New', 'Old', 'High',
    'Low', 'Upper', 'Lower', 'North', 'South',
    'East', 'West'
];

// =============================================================================
// NEBULA-TO-GALAXY MISSION MAPPINGS
// =============================================================================

/**
 * Every nebula category maps to a galaxy/faction for the mission discovery system.
 * All 8 hostile factions are represented across the nebula categories.
 *
 * CLUSTERED NEBULAS (first 8, paired):
 *   Pair 0 (Nebulas 0,1) -> Galaxy 0 (Federation / Spiral)      - even=core, odd=patrol
 *   Pair 1 (Nebulas 2,3) -> Galaxy 1 (Klingon Empire / Elliptical)
 *   Pair 2 (Nebulas 4,5) -> Galaxy 2 (Rebel Alliance / Irregular)
 *   Pair 3 (Nebulas 6,7) -> Galaxy 3 (Romulan Star Empire / Ring)
 *
 * DISTANT NEBULAS (fill in galaxies 4-7 first, then cycle):
 *   Distant Nebula Alpha   -> Galaxy 4 (Galactic Empire / Dwarf)
 *   Distant Nebula Beta    -> Galaxy 5 (Cardassian Union / Lenticular)
 *   Distant Nebula Gamma   -> Galaxy 6 (Sith Empire / Quasar)
 *   Distant Nebula Delta   -> Galaxy 7 (Vulcan High Command / Ancient)
 *   Distant Nebula Epsilon -> Galaxy 0 (Federation)
 *   Distant Nebula Zeta    -> Galaxy 1 (Klingon Empire)
 *
 * EXOTIC CORE NEBULAS (continue cycling through all 8):
 *   Frontier Nebula   -> Galaxy 2 (Rebel Alliance)
 *   Outer Veil Nebula -> Galaxy 3 (Romulan Star Empire)
 *   Deep Space Nebula -> Galaxy 4 (Galactic Empire)
 *   Void Nebula       -> Galaxy 5 (Cardassian Union)
 *   Boundary Nebula   -> Galaxy 6 (Sith Empire)
 *   Edge Nebula       -> Galaxy 7 (Vulcan High Command)
 *   Threshold Nebula  -> Galaxy 0 (Federation)
 *   Horizon Nebula    -> Galaxy 1 (Klingon Empire)
 *
 * GALAXY-FORMATION NEBULAS (1:1 with galaxy types, gated by black hole clear):
 *   Olympus Nebula    -> Galaxy 0 (Federation)    [requires BH enemies cleared]
 *   Titan Nebula      -> Galaxy 1 (Klingon)       [requires BH enemies cleared]
 *   Atlantis Nebula   -> Galaxy 2 (Rebel Alliance) [requires BH enemies cleared]
 *   Prometheus Nebula -> Galaxy 3 (Romulan)        [requires BH enemies cleared]
 *   Elysium Nebula    -> Galaxy 4 (Galactic Empire) [requires BH enemies cleared]
 *   Tartarus Nebula   -> Galaxy 5 (Cardassian)     [requires BH enemies cleared]
 *   Hyperion Nebula   -> Galaxy 6 (Sith Empire)    [requires BH enemies cleared]
 *   Chronos Nebula    -> Galaxy 7 (Vulcan)          [requires BH enemies cleared]
 *
 * FACTION COVERAGE SUMMARY:
 *   Galaxy 0 (Federation):       2 clustered + 1 distant + 1 exotic + 1 formation = 5 nebulas
 *   Galaxy 1 (Klingon Empire):   2 clustered + 1 distant + 1 exotic + 1 formation = 5 nebulas
 *   Galaxy 2 (Rebel Alliance):   2 clustered + 1 exotic + 1 formation = 4 nebulas
 *   Galaxy 3 (Romulan):          2 clustered + 1 exotic + 1 formation = 4 nebulas
 *   Galaxy 4 (Galactic Empire):  1 distant + 1 exotic + 1 formation = 3 nebulas
 *   Galaxy 5 (Cardassian Union): 1 distant + 1 exotic + 1 formation = 3 nebulas
 *   Galaxy 6 (Sith Empire):      1 distant + 1 exotic + 1 formation = 3 nebulas
 *   Galaxy 7 (Vulcan):           1 distant + 1 exotic + 1 formation = 3 nebulas
 *
 * TRIGGER CONDITIONS:
 *   Clustered:         Close approach (100 units). Always triggers on approach.
 *   Distant/Exotic:    Enter nebula boundary (size radius). Always triggers.
 *   Galaxy-Formation:  Close approach (100 units). Deferred until all enemies
 *                      with placementType 'black_hole' in that galaxy are eliminated.
 *
 * DEFEAT HANDLING:
 *   If a faction is already fully eliminated when a nebula is discovered,
 *   a liberation gratitude message is shown instead of a mission path.
 */

// =============================================================================
// NEBULA DISCOVERY RANGES
// =============================================================================

/**
 * Distance thresholds for the nebula discovery system.
 */
const NEBULA_DISCOVERY = {
    /** Distance to trigger initial surface discovery */
    surfaceRange: 3000,
    /** Distance at which discovery music fades */
    exitRange: 4000,
    /** Deep discovery range for clustered and galaxy-formation nebulas */
    deepDiscoveryCloseRange: 100,
    /** Deep discovery for distant/exotic nebulas uses the nebula's own size as range */
    deepDiscoveryUsesSize: true
};

// =============================================================================
// NEBULA USERDATA SCHEMA
// =============================================================================

/**
 * Documents the userData properties attached to each nebula THREE.Group.
 *
 * Common properties (all nebula categories):
 * @typedef {Object} NebulaUserData
 * @property {string}  type           - Always 'nebula'
 * @property {string}  name           - Display name (e.g., "Olympus Nebula")
 * @property {string}  [mythicalName] - Short name without "Nebula" suffix
 * @property {THREE.Color} color      - Base HSL color
 * @property {number}  size           - Nebula radius in world units
 * @property {boolean} discovered     - Whether player has triggered surface discovery
 * @property {number}  [rotationSpeed] - Rotation per frame (-0.0008 to +0.0008)
 * @property {THREE.Vector3} [position3D] - Cached absolute position
 * @property {number}  [cluster]      - Cluster index for clustered/formation types
 * @property {string}  [clusterName]  - Cluster display name
 *
 * Category-specific flags:
 * @property {string}  [shape]        - Shape type (galaxy-formation nebulas only)
 * @property {boolean} [isDistant]    - true for distant nebulas (50k-75k range)
 * @property {boolean} [isExoticCore] - true for exotic core nebulas (45k-65k range)
 *
 * Discovery system:
 * @property {boolean} [deepDiscovered] - Whether deep discovery has been triggered
 */

// =============================================================================
// NEBULA CHILD OBJECT TYPES
// =============================================================================

/**
 * Supernova core userData schema (child of clustered nebula groups).
 * Added to ~50% of clustered nebulas as a central feature.
 *
 * @typedef {Object} SupernovaCoreUserData
 * @property {string}  name          - e.g., "Nebula Core 3"
 * @property {string}  type          - Always 'supernova'
 * @property {boolean} isCentralCore - Always true
 */

/**
 * Brown dwarf userData schema (child of clustered nebula groups).
 * 2-4 brown dwarfs orbit each supernova core.
 *
 * @typedef {Object} BrownDwarfUserData
 * @property {string}  name        - e.g., "Brown Dwarf 1"
 * @property {string}  type        - Always 'brown_dwarf'
 * @property {number}  orbitRadius - Distance from center (100-250 units)
 * @property {number}  orbitSpeed  - Angular velocity (0.001-0.003 rad/frame)
 * @property {number}  orbitAngle  - Current angle in radians
 * @property {THREE.Vector3} orbitCenter - Always (0, 0, 0) relative to parent
 */

// =============================================================================
// PARTICLE MATERIAL DEFAULTS
// =============================================================================

/**
 * Default THREE.PointsMaterial settings shared across nebula categories.
 */
const NEBULA_MATERIAL_DEFAULTS = {
    vertexColors: true,
    transparent: true,
    blending: 'AdditiveBlending',
    sizeAttenuation: true,
    depthWrite: false
};

// =============================================================================
// SUMMARY TABLE
// =============================================================================

/**
 * Quick reference for all nebula categories in the game:
 *
 * | Category         | Count | Distance (units) | Size Range    | Particles  | Point Size | Opacity | Mission Type              |
 * |------------------|-------|------------------|---------------|------------|------------|---------|---------------------------|
 * | Clustered        | 8x3=24| 12,000 - 20,000  | 2,000 - 5,000 | 1,200      | 2.5        | 0.65    | Core/Patrol (paired)      |
 * | Galaxy-Formation | 8     | 15,000 - 31,000  | 1,200 - 2,000 | 4,000-6,000| 2.5        | 0.65    | Remnant (after BH clear)  |
 * | Distant          | 6     | 50,000 - 75,000  | 3,000 - 7,000 | 1,200      | 80         | 0.60    | Hostile forces (direct)   |
 * | Exotic Core      | 8     | 45,000 - 65,000  | 3,500 - 7,000 | 1,500      | 150        | 0.85    | Hostile forces (direct)   |
 * |------------------|-------|------------------|---------------|------------|------------|---------|---------------------------|
 * | TOTAL            | ~46   |                  |               |            |            |         | All 8 factions covered    |
 *
 * Shape types (Galaxy-Formation only):
 *   spiral     - Arms + center bulge (Olympus: 3 arms, Chronos: 2 arms)
 *   elliptical - Flattened spheroid (Titan)
 *   ring       - Toroid with hollow center (Atlantis)
 *   irregular  - Asymmetric dual-arm spiral (Prometheus)
 *   quasar     - Central bulge + vertical polar jets (Elysium)
 *   lenticular - Ultra-flat disk with bright center (Tartarus)
 *   ancient    - Small irregular cluster (Hyperion)
 *
 * Mission path types:
 *   core    - Dashed line (100/50) to black hole stronghold
 *   patrol  - Dashed line (60/40) to enemies near cosmic features
 *   remnant - Dashed line to scattered survivors after BH stronghold falls
 *   liberation - No path; gratitude message when faction already defeated
 */
