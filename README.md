# A Birthday Adventure 🌸

A browser-based 3D romantic fantasy adventure, made by Nilesh for Pooja Sharma.
It runs on Three.js and Vite, and the assets were built in Blender 4.5.

> The game's real title only appears during the final reveal. Until then the page is called **"Pooja's Birthday Adventure"**, so the secret stays hidden.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN, so you can test on a phone)
npm run build      # production build in dist/
npm run preview    # serve the production build
```

`dist/` is a static site, so you can host it anywhere (Netlify, Vercel, GitHub Pages). It uses relative paths, so it also works from a subfolder.

## Controls

| Desktop | Mobile |
|---|---|
| WASD / arrows: move (runs by default, **Shift** to walk) | Left joystick (push lightly to walk) |
| Mouse: look (click to lock the pointer), wheel to zoom | Drag on the screen to look |
| Space: jump | ⤒ button |
| E / Enter: interact or collect | ✋ button |

The buttons in the top right are mute, graphics quality (HQ/LQ), and fullscreen.

## The journey

The game has five connected floating islands. Each has one petal, and each petal opens a story chapter with its own shayari.

1. **Welcome Island**: a petal floats near the cherry tree.
2. **Mau**: a petal floats between the two chairs.
3. **Garden of Memories**: open the glowing diary in the gazebo.
4. **Distance Bridge** (Maharashtra ✦ Chandigarh): answer the call at the magical phone booth.
5. **Birthday Kingdom**: this petal appears on the flower platform once the other four are found.

When all five are collected, the finale plays. The petals orbit Pooja and merge into a blooming flower. Then the name reveal, the shayari, "Happy Birthday" on piano, and the narration play in order. The birthday letter comes last.

A light pillar always marks the next objective.

## Project structure

```
blender/
  Petals_Birthday_World.blend   world layout + asset library (collections: ENVIRONMENT, TERRAIN, VEGETATION, WATER, ARCHITECTURE, PROPS, COLLECTIBLES, VFX, LIGHTING, CAMERAS)
  Pooja_Character.blend         the supplied Pooja model, decimated to 30k tris, rigged, with 6 animations
  scripts/
    build_world.py              builds all 55 assets + world layout and exports the GLBs  (npm run assets)
    rig_character.py            decimate + rig + animate (Idle/Walk/Run/Jump/Collect/Celebrate) + export pooja.glb
    prep_character.py, inspect_fbx.py, run_blender.mjs
public/assets/models/
  environment_assets.glb        asset library loaded by the game (instanced at runtime)
  props/*.glb                   every asset as its own GLB
  pooja.glb                     rigged + animated character (~1.4 MB)
src/
  environments/layout.json      single source of truth for islands, bridges, props and petals (read by Blender AND the game)
  environments/                 Terrain (heights, collision, paths), Sky, Water, Effects
  game/                         Game, World, CharacterController, CameraController, Collectibles, Cinematics
  story/                        dialogue.js, shayari.js, birthdayLetter.js
  components/                   Assets (GLB + instancing + wind), Audio (procedural), Input
  ui/UI.js, styles/main.css
```

## Changing the world

Edit `src/environments/layout.json`. You can move props, add trees, or move the petals. Then:

```bash
npm run assets   # rebuilds the .blend and the GLBs headlessly
```

The game reads the same layout file, so collision, paths and vegetation scatter update automatically.

## Notes

- **Audio** is 100% original. It is generated in code with the Web Audio API: ambient music, wind, waterfalls, footsteps, chimes, the phone ring, the petal-merge harp swell, and a piano "Happy Birthday" (the melody is public domain). No licensed files are used. Sound starts on the first tap, as browsers require.
- **Performance:** vegetation and props use GPU instancing, and grass and trees sway in shaders. Phones default to LQ, which means lower resolution, no bloom and reduced vegetation density. HQ turns on bloom and 2K shadows.
- **Character:** the supplied FBX (`base_basic_shaded.fbx`) had no rig, so `rig_character.py` builds a humanoid armature with custom skin weights. The dupatta and kurta stay with the body and don't stretch with the legs.
