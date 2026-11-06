# ASSETS.md: art, audio and font licenses

`npm run check` (tools/check-assets.mjs) fails if an image, audio, model or font file in the repo isn't listed here.

| File | Type | Source | License |
|---|---|---|---|
| *(none)* | | | |

All visuals are currently generated in code:
- **Terrain:** terraced quads with per-biome vertex colors, from [src/render/terrain.ts](src/render/terrain.ts).
- **Units:** Three.js primitive geometry, from [src/render/units.ts](src/render/units.ts).
- **Palette:** original, in [src/render/palette.ts](src/render/palette.ts). Team colors follow the Okabe–Ito colorblind-safe palette, which is a published color recommendation rather than copyrighted art.

There are no audio, image or font files. The UI uses the system font.

Third-party code (not assets) is listed in `package.json`: three (MIT) and preact (MIT).
