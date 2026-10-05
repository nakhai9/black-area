As a senior game architect and software engineer, I want you to build a modular, scalable 2D/Isometric Real-Time Strategy (RTS) mini-game heavily inspired by "Command & Conquer: Red Alert 2" and "Yuri's Revenge".

The game must feature 3 playable factions: **United States (USA), China, and Russia**, operating on a single battlefield plane.

### Visual Style & Graphics Characteristics (Based on RA2's 2.5D Engine):

- **Perspective & View:** Fixed top-down isometric camera angle (players cannot freely rotate the camera, reminiscent of classic RTS).
- **Sprites & Visuals:** Units, structures, and characters should be represented or rendered with clear 2D sprite styling (or clean 2.5D vector representations on HTML5 Canvas) with distinct visual traits per faction.
- **Terrain & Environment:** The battlefield should use a grid-based terrain system that supports subtle elevation (height levels, slopes, or distinct terrain boundaries to simulate depth).

### Technical Stack & Constraints:

- Language: **TypeScript** (Strict mode preferred, strongly typed for entities, states, and game loops).
- Renderer: HTML5 Canvas or a clean modular 2D structure.
- Architecture: Component-based or clean separation of concerns (Model-View-Controller or Entity-Component-System tailored for TypeScript).

### Project File Structure:

Please organize the code with a clear, production-ready directory structure. Show the file tree first, then provide the content for each core file. Use a structure similar to this:
/src
├── /core # Game loop, input handler, renderer, event bus
├── /entities # Base Unit class, Building class, Harvester logic
├── /factions # Configurations/stats for USA, China, Russia
├── /systems # Combat system, AI system, Resource economy system
├── /ui # HUD, sidebar controls, minimap rendering
├── /types # TypeScript interfaces & types (Unit, Building, Player)
├── constants.ts # Global game configurations (map size, costs, speeds)
└── main.ts # Entry point tying everything together

### Core Gameplay Requirements:

1. **Factions:** Distinct visual/stat differences for USA (high-tech/speed), China (heavy armor/mass), and Russia (artillery/defense).
2. **Economy:** Ore/Cash generation via Harvesters, Power grid management.
3. **Base Building:** Construction Yard, Power Plants, Barracks, War Factories.
4. **Units & Combat:** Box-selection, right-click movement, attack-move, and basic reactive AI for opponents.

### Deliverables:

- Provide the complete folder/file layout.
- Write clean, well-commented TypeScript code for each essential module so I can easily extend or modify it later.
