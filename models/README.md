# 3D Models for Interstellar Slingshot

This directory contains GLB 3D models for enemies, bosses, and the player ship.

## Model Files

### Enemy Models (8 regions)
- `Enemy1.glb` - Galaxy 1 (Federation Space) enemies
- `Enemy2.glb` - Galaxy 2 (Klingon Territory) enemies
- `Enemy3.glb` - Galaxy 3 (Rebel Sectors) enemies
- `Enemy4.glb` - Galaxy 4 (Romulan Empire) enemies
- `Enemy5.glb` - Galaxy 5 (Imperial Core) enemies
- `Enemy6.glb` - Galaxy 6 (Cardassian Union) enemies
- `Enemy7.glb` - Galaxy 7 (Sith Dominion) enemies
- `Enemy8.glb` - Galaxy 8 (Local Group/Sol System) enemies

### Boss Models (8 regions)
- `Boss1.glb` - Galaxy 1 boss (Federation Overlord)
- `Boss2.glb` - Galaxy 2 boss (Klingon Overlord)
- `Boss3.glb` - Galaxy 3 boss (Rebel Overlord)
- `Boss4.glb` - Galaxy 4 boss (Romulan Overlord)
- `Boss5.glb` - Galaxy 5 boss (Imperial Overlord)
- `Boss6.glb` - Galaxy 6 boss (Cardassian Overlord)
- `Boss7.glb` - Galaxy 7 boss (Sith Overlord)
- `Boss8.glb` - Galaxy 8 boss (Vulcan Overlord)

### Player Model
- `Player.glb` - Player ship model

## Implementation

Models are loaded using THREE.js GLTFLoader and integrated into the game via `js/game-models.js`.

The system provides:
- Automatic model loading during game initialization
- Fallback to procedural geometry if models fail to load
- Model caching for efficient instantiation
- Regional variety (each galaxy region has unique enemy and boss models)
- Player ship visualization attached to camera

## Usage

Models are automatically loaded when the game starts. The game will:
1. Load all models asynchronously during initialization
2. Use models when available for enemies, bosses, and player ship
3. Fall back to procedural geometry if any model fails to load
4. Apply game materials and lighting to all models

No additional configuration needed - models are automatically integrated!
