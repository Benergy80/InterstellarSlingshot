# Messenger (messenger.abeto.co) — rendering reverse-engineering notes

Research base for NEON CITY's ink render mode (`js/ink.js`, toggle **I**).
Method: played the game headless via Playwright, hooked `attachShadow` /
`getContext` / `shaderSource` to capture all 148 compiled GLSL programs,
recorded a full frame's FBO/draw sequence, dumped live uniform values, and
fanned out a static analysis of the 1.9 MB prettified bundle.

## What Messenger is

Three.js **r180**, WebGL2, Vite + Svelte 5. Canvas is hidden in a **closed
shadow root** (fun anti-inspection trick). Base framebuffer is
`{antialias:false, depth:false, stencil:false}` — the whole frame goes
through HalfFloat render targets; AA is SMAA in post. ~28 draw calls per
frame for an entire hand-drawn town (BatchedMesh + instancing + Draco +
KTX2, workers for BVH collision/draco/EXR/glyphs).

## The look — how it's actually done

1. **MRT G-buffer, one scene pass** (all materials are one ubershader):
   - RT0 = `vec4(color.rgb, surfaceId)`
   - RT1 = `vec4(depth, spheremapNormal.xy, outlineMask)`
2. **Cel shading is TWO tones, no ramp texture.** Blinn-Phong runs
   normally, then:
   ```glsl
   colorShadow = hsv(base.h - 0.02, base.s, base.v * 0.5);   // shadow = HSV shift, never grey
   cut  = smoothstep(0.2, 0.4, directLight * shadowMap);     // chars: 0.1..0.15 (harder)
   out  = mix(colorShadow, base, cut);
   ```
3. **Outlines are post-process edge detection** (NOT inverted hull): a
   5-tap cross kernel over surfaceId/depth/normal, each gradient mapped
   through soft double thresholds (`fit(fit(x, start, end, 0, 1), thresh,
   thresh+margin, 0, 1)`), distance-faded 50→300 u, thickness compensated
   vs a 1300 px reference height. Their tuned values:
   `idRange (1e-4, 2e-4, 0.1)` · `depthRange (1e-4, 0.01, 0.25)` ·
   `normalRange (0.4, 0.5, 0.3)` · `margin 0.2` · color `#373f42`.
   Art can *suppress* lines per-pixel via the mask channel (they break up
   rock/tree outlines with noise so lines look pen-drawn), and *add* fake
   pen strokes by perturbing surfaceId with noise (rock striations).
4. **Grade = tetrahedral 3D LUT** in the same fullscreen pass. No bloom,
   no filmic tonemap — LUT carries the palette.
5. **Sky clouds are posterized noise on a BackSide dome:**
   `step(0.27, scrollingNoise * staticNoise)` — the hard step IS the
   painted look. Dome orientation slerps behind the player (0.9) for
   parallax.
6. Faces animate in the *fragment shader* (blink/mouth sprite sheets with
   hashed timing), colors come from a palette atlas texture, characters
   batch-skin from one bone texture indexed by batch row.

## What we ported into NEON CITY (`js/ink.js`)

- Their exact kernel structure (5-tap cross, gradient-of-differences,
  fit∘fit soft thresholds, min-depth line ownership, distance fade,
  resolution-compensated thickness) — but **no MRT needed**: view normals
  are reconstructed from the depth buffer, so zero game materials change.
  `normalRange`, `smoothMargin` are their verbatim values; depth
  thresholds re-derived as |d²z|/z because our far plane is 150 000 u.
- Screen-space cel posterize with their HSV shadow philosophy (darker
  bands hue-shift −0.02 and gain saturation instead of going grey), with
  two guards: HDR emissives (>1.0) skipped so bloom still feeds, and a
  saturation "neon guard" so signage/tubes keep their glow.
- Toon cloud dome: their `step(0.27, drift × anchor)` recipe, night
  palette (dark cutouts rim-lit magenta from the city below).
- Order: InkPass replaces RenderPass → UnrealBloom → Output, so ink lines
  bleed in bloom like everything else. Modes: **I** cycles
  INK+CEL → INK → OFF (`window.NC.ink` exposes uniforms for tuning).
