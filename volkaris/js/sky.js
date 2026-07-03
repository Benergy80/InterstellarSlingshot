// ════════════════════════════════════════════════════════════════
// VOLKARIS — sky, orbiting sun, day/night cycle
//
// The sun physically orbits the planet (tilted plane), so every
// point on the surface gets its own sunrise, high noon, banded
// synthwave sunset and neon-drenched night. The sky dome is a
// shader: gradient atmosphere + the classic striped retro sun.
// At night the dome goes transparent and the mothergame's Hubble
// Ultra Deep Field skybox shows through — plus VOLKARIS has a
// Saturn ring system arcing across the sky at all hours.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { C, NEON, makeCanvas, canvasTexture, clamp, lerp } from './config.js';

export function buildSky(scene, renderer) {
  const sunDir = new THREE.Vector3(1, 0, 0);

  // ── Hubble deep field (visible at night / faintly by day) ──
  const skyboxMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.75, 0.78, 0.92),
    side: THREE.BackSide, fog: false, depthWrite: false,
    transparent: true, opacity: 0.6,
  });
  const skybox = new THREE.Mesh(new THREE.SphereGeometry(3400, 32, 20), skyboxMat);
  skybox.renderOrder = -12;
  scene.add(skybox);
  new THREE.TextureLoader().load('../images/hubble_ultra_deep_field_high_rez_edit1.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.MirroredRepeatWrapping;
    t.repeat.set(2, 1);
    skyboxMat.map = t;
    skyboxMat.needsUpdate = true;
  });

  // ── Atmosphere dome (shader) ──
  const atmoUniforms = {
    uSunDir: { value: sunDir },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uDay: { value: 1 },
  };
  const atmoMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, toneMapped: false,
    uniforms: atmoUniforms,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform vec3 uSunDir;
      uniform vec3 uCamUp;
      uniform float uDay;

      void main() {
        vec3 h = normalize(vDir);
        float elev = dot(h, uCamUp);                  // -1..1 above local horizon
        float sunElev = dot(uSunDir, uCamUp);
        float sunAng = acos(clamp(dot(h, uSunDir), -1.0, 1.0));

        // ── day gradient: hot horizon → violet zenith ──
        vec3 zen = mix(vec3(0.10, 0.02, 0.22), vec3(0.22, 0.10, 0.55), uDay);
        vec3 hor = mix(vec3(0.55, 0.08, 0.45),                       // night horizon glow (magenta)
                       vec3(1.0, 0.42, 0.18), uDay);                 // day horizon (orange)
        // sunset band intensifies when the sun sits low
        float sunset = (1.0 - clamp(abs(sunElev) * 3.0, 0.0, 1.0));
        hor = mix(hor, vec3(1.0, 0.30, 0.62), sunset * 0.7);          // hot pink hour
        float t = clamp(elev * 2.2 + 0.18, 0.0, 1.0);
        vec3 col = mix(hor, zen, pow(t, 0.75));

        // sun-side warm wash
        float sunWash = pow(clamp(dot(h, uSunDir), 0.0, 1.0), 3.0);
        col += vec3(0.55, 0.22, 0.12) * sunWash * uDay;

        // ── the retro striped sun ──
        float disc = 1.0 - smoothstep(0.075, 0.082, sunAng);
        if (disc > 0.0) {
          // vertical position within the disc (for gradient + stripes)
          float local = (dot(h, uCamUp) - sunElev) / 0.082;           // -1..1 across disc
          vec3 sunCol = mix(vec3(1.2, 0.25, 0.55), vec3(1.25, 0.95, 0.35), clamp(local * 0.5 + 0.5, 0.0, 1.0));
          // stripes: gaps widen toward the bottom of the disc
          float stripes = step(clamp(-local, 0.0, 1.0) * 0.85, fract(local * 9.0));
          disc *= stripes;
          col = mix(col, sunCol, disc);
        }
        // glow halo around the sun
        col += vec3(1.0, 0.5, 0.3) * (1.0 - smoothstep(0.08, 0.34, sunAng)) * 0.22;

        // alpha: opaque by day, sheer at night so the deep field shows
        float horizonGlow = (1.0 - clamp(abs(elev) * 4.0, 0.0, 1.0)) * 0.45;
        float a = clamp(max(uDay * 1.1, horizonGlow + disc), 0.0, 1.0);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 32), atmoMat);
  atmo.renderOrder = -11;
  scene.add(atmo);

  // ── Saturn rings — pastel bands, always arcing overhead ──
  {
    const [cv, ctx] = makeCanvas(512, 16);
    const bands = [
      [0.00, 0.16, 'rgba(120,240,255,0.55)'], [0.18, 0.30, 'rgba(255,110,199,0.45)'],
      [0.32, 0.36, 'rgba(0,0,0,0)'],          [0.38, 0.62, 'rgba(167,75,255,0.5)'],
      [0.64, 0.70, 'rgba(255,196,0,0.35)'],   [0.72, 0.74, 'rgba(0,0,0,0)'],
      [0.76, 1.00, 'rgba(0,246,255,0.4)'],
    ];
    ctx.clearRect(0, 0, 512, 16);
    for (const [a, b, css] of bands) {
      ctx.fillStyle = css;
      ctx.fillRect(a * 512, 0, (b - a) * 512, 16);
    }
    const tex = canvasTexture(cv);
    tex.rotation = 0;
    const inner = C.R * 1.7, outer = C.R * 2.9;
    const g = new THREE.RingGeometry(inner, outer, 128, 1);
    // remap uv radially so the band texture runs inner→outer
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    const mat = new THREE.MeshBasicMaterial({
      map: tex, side: THREE.DoubleSide, transparent: true,
      depthWrite: false, fog: false, toneMapped: false,
    });
    const ring = new THREE.Mesh(g, mat);
    ring.rotation.x = Math.PI / 2 - 0.47;   // tilt like Saturn seen from the surface
    ring.rotation.y = 0.2;
    ring.renderOrder = -10;
    scene.add(ring);
  }

  // ── Lights ──
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 40;
  sun.shadow.camera.far = 420;
  const S = 70;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.4;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0x8f6bff, 0x2a1440, 0.55);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0x3a2a6a, 0.5);
  scene.add(amb);

  // fog is retinted live
  const fogDay = new THREE.Color(C.FOG_DAY), fogNight = new THREE.Color(C.FOG_NIGHT);
  scene.fog = new THREE.FogExp2(C.FOG_DAY, C.FOG_DENSITY);

  const _up = new THREE.Vector3();
  return {
    sunDir, sun,
    night: 0,   // exposed for bloom/glow ramps
    update(t, playerPos, bloom, glowMat) {
      // sun orbit (tilted plane so terminator sweeps interestingly)
      const a = t * Math.PI * 2 / C.SUN_PERIOD + 0.35;   // start mid-morning
      sunDir.set(Math.cos(a), Math.sin(a) * Math.cos(C.SUN_TILT), Math.sin(a) * Math.sin(C.SUN_TILT)).normalize();

      _up.copy(playerPos).normalize();
      const localSun = sunDir.dot(_up);                   // -1 night … +1 noon
      const day = clamp((localSun + 0.18) / 0.5, 0, 1);   // smooth dusk band
      this.night = 1 - day;

      // shadow-casting light rides above the player, aimed at them
      sun.position.copy(playerPos).addScaledVector(sunDir, 220);
      sun.target.position.copy(playerPos);
      sun.intensity = lerp(0.12, 2.6, day);
      sun.color.setHSL(lerp(0.78, 0.09, day), lerp(0.6, 0.55, day), lerp(0.6, 0.62, day));

      hemi.intensity = lerp(0.55, 0.6, day);
      amb.intensity = lerp(0.95, 0.42, day);

      scene.fog.color.copy(fogNight).lerp(fogDay, day);
      atmoUniforms.uDay.value = day;
      atmoUniforms.uCamUp.value.copy(_up);
      skyboxMat.opacity = lerp(0.85, 0.16, day);

      // neon breathes brighter after dark
      if (bloom) bloom.strength = C.BLOOM.strength + this.night * 0.35;
      if (glowMat) glowMat.color.setScalar(0.8 + this.night * 0.4);
      return day;
    },
  };
}
