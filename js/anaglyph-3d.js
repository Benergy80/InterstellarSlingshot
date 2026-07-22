// Anaglyph 3D effect for red/cyan glasses.
// Toggle: ` (backtick) | Scene depth: - / = | Crosshair depth: [ / ] | URL: ?3d=1
// All depth adjustments step by 0.05.
(function () {

  // ---------- AnaglyphEffect (adapted from Three.js r128 examples) ----------
  // Dubois matrices produce higher-quality color than naive channel masking.
  // Renders the scene twice (left eye red, right eye cyan) using StereoCamera
  // with off-axis projection (no toe-in → zero vertical-parallax distortion).

  function AnaglyphEffect(renderer, width, height) {
    width = width || window.innerWidth;
    height = height || window.innerHeight;

    var colorMatrixLeft = new THREE.Matrix3().fromArray([
       0.456100, -0.0400822, -0.0152161,
       0.500484, -0.0378246, -0.0205971,
       0.176381, -0.0157589, -0.00546856
    ]);
    var colorMatrixRight = new THREE.Matrix3().fromArray([
      -0.0434706,  0.378476,  -0.0721527,
      -0.0879388,  0.73364,   -0.112961,
      -0.00155529, -0.0184503, 1.2264
    ]);

    var _camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var _scene = new THREE.Scene();
    var _stereo = new THREE.StereoCamera();

    var _params = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat
    };

    var pixelRatio = renderer.getPixelRatio();
    var _renderTargetL = new THREE.WebGLRenderTarget(
      width * pixelRatio, height * pixelRatio, _params
    );
    var _renderTargetR = new THREE.WebGLRenderTarget(
      width * pixelRatio, height * pixelRatio, _params
    );

    var _material = new THREE.ShaderMaterial({
      uniforms: {
        mapLeft:  { value: _renderTargetL.texture },
        mapRight: { value: _renderTargetR.texture },
        colorMatrixLeft:  { value: colorMatrixLeft },
        colorMatrixRight: { value: colorMatrixRight }
      },
      vertexShader: [
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D mapLeft;',
        'uniform sampler2D mapRight;',
        'uniform mat3 colorMatrixLeft;',
        'uniform mat3 colorMatrixRight;',
        'varying vec2 vUv;',
        'float lin(float c) {',
        '  return c <= 0.04045 ? c * 0.0773993808 :',
        '    pow(c * 0.9478672986 + 0.0521327014, 2.4);',
        '}',
        'vec4 lin(vec4 c) {',
        '  return vec4(lin(c.r), lin(c.g), lin(c.b), c.a);',
        '}',
        'float dev(float c) {',
        '  return c <= 0.0031308 ? c * 12.92 :',
        '    pow(c, 0.41666) * 1.055 - 0.055;',
        '}',
        'void main() {',
        '  vec4 colorL = lin(texture2D(mapLeft, vUv));',
        '  vec4 colorR = lin(texture2D(mapRight, vUv));',
        '  vec3 color = clamp(',
        '    colorMatrixLeft * colorL.rgb + colorMatrixRight * colorR.rgb,',
        '    0.0, 1.0);',
        '  gl_FragColor = vec4(dev(color.r), dev(color.g), dev(color.b),',
        '    max(colorL.a, colorR.a));',
        '}'
      ].join('\n')
    });

    var _mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), _material);
    _scene.add(_mesh);

    this.stereo = _stereo;

    this.setSize = function (w, h) {
      renderer.setSize(w, h);
      var pr = renderer.getPixelRatio();
      _renderTargetL.setSize(w * pr, h * pr);
      _renderTargetR.setSize(w * pr, h * pr);
    };

    this.render = function (scene, camera) {
      var currentRT = renderer.getRenderTarget();
      scene.updateMatrixWorld();
      if (camera.parent === null) camera.updateMatrixWorld();

      _stereo.update(camera);

      renderer.setRenderTarget(_renderTargetL);
      renderer.clear();
      renderer.render(scene, _stereo.cameraL);

      renderer.setRenderTarget(_renderTargetR);
      renderer.clear();
      renderer.render(scene, _stereo.cameraR);

      renderer.setRenderTarget(null);
      renderer.render(_scene, _camera);
      renderer.setRenderTarget(currentRT);
    };

    this.dispose = function () {
      _renderTargetL.dispose();
      _renderTargetR.dispose();
      _mesh.geometry.dispose();
      _material.dispose();
    };
  }

  // ---------- Anaglyph mode controller ----------

  var _effect = null;
  var _enabled = false;
  var _eyeSep = 0.2;    // scene eye separation (game units)
  var _hudDepth = 0.2;  // crosshair stereo depth; + = into the scene, - = pops out
  var DEPTH_STEP = 0.05;
  var HUD_PX_PER_UNIT = 30;   // hudDepth 0.2 → 6px per-eye horizontal shift
  var PRAISE_DEPTH = 0.25;    // praise float-out in hudDepth units (pop-out)
  var PRAISE_FLOAT_PX = PRAISE_DEPTH * HUD_PX_PER_UNIT; // 7.5px per eye

  var anaglyphMode = {
    get enabled() { return _enabled; },
    get eyeSep() { return _eyeSep; },
    get hudDepth() { return _hudDepth; },

    init: function () {
      if (_effect || typeof renderer === 'undefined') return;
      _effect = new AnaglyphEffect(renderer);
      _effect.stereo.eyeSep = _eyeSep;
      _effect.setSize(window.innerWidth, window.innerHeight);

      if (/[?&]3d=1/.test(location.search)) {
        this.enable();
      }
    },

    enable: function () {
      if (!_effect) this.init();
      _enabled = true;
      _syncButtons();
      _syncDepthUI();
      _hudOn();
      _wrapPraise();
    },

    disable: function () {
      _enabled = false;
      _syncButtons();
      _syncDepthUI();
      _hudOff();
    },

    toggle: function () {
      if (_enabled) this.disable(); else this.enable();
    },

    // Single depth control (0.05–0.35, default 0.2). HUD depth is
    // DERIVED: 0.2 across the range, easing up to 0.25 as scene depth
    // approaches its max — no separate HUD control anywhere.
    setEyeSep: function (val) {
      _eyeSep = Math.round(Math.max(0.05, Math.min(0.35, val)) * 100) / 100;
      if (_effect) _effect.stereo.eyeSep = _eyeSep;
      _hudDepth = _eyeSep >= 0.34 ? 0.25 : 0.2;
      _syncDepthUI();
    },

    adjustEyeSep: function (delta) {
      this.setEyeSep(_eyeSep + delta);
    },

    resize: function (w, h) {
      if (_effect) _effect.setSize(w, h);
    },

    // Project a world position through both stereo eye cameras → per-eye
    // screen X in px. Placing a red-filtered copy at leftX and a cyan copy
    // at rightX puts a DOM element at EXACTLY that point's scene depth.
    // Returns null when 3D is off (caller falls back to mono placement).
    eyeProjectPx: function (worldPos) {
      if (!_enabled || !_effect) return null;
      _ensureEyeFilters();
      if (!_invM) _invM = new THREE.Matrix4();
      // Refresh the stereo rig from the live camera — callers may project
      // before this frame's render pass has updated it.
      if (typeof camera !== 'undefined' && camera && camera.isCamera) {
        _effect.stereo.update(camera);
      }
      var cams = [_effect.stereo.cameraL, _effect.stereo.cameraR];
      var xs = [];
      for (var i = 0; i < 2; i++) {
        var v = worldPos.clone();
        _invM.copy(cams[i].matrixWorld).invert();
        v.applyMatrix4(_invM).applyMatrix4(cams[i].projectionMatrix);
        if (v.z > 1) return null; // behind the camera
        xs.push((v.x + 1) / 2 * window.innerWidth);
      }
      return { leftX: xs[0], rightX: xs[1] };
    },

    dispose: function () {
      if (_effect) { _effect.dispose(); _effect = null; }
      _enabled = false;
    }
  };

  // ---------- Render wrapper ----------
  // Every render call site uses this instead of renderer.render() directly.

  window.gameRender = function (scene, camera) {
    if (_enabled && _effect) {
      _effect.render(scene, camera);
    } else {
      renderer.render(scene, camera);
    }
  };

  // ---------- Crosshair stereo depth ----------
  // The #crosshair div is a DOM overlay the anaglyph shader never sees, so in
  // 3D it sits flat at the screen plane (and its green is invisible to the red
  // eye). While 3D is on we hide the original and track it with two live
  // clones — one filtered to the red channel (left eye), one to cyan (right
  // eye) — offset horizontally by hudDepth. Positive depth = uncrossed
  // disparity (red left, cyan right) = crosshair sits INTO the scene.

  var _hudClones = null; // [redClone, cyanClone]
  var _hudSource = null;
  var _hudRAF = 0;
  var _invM = null; // scratch Matrix4 for eyeProjectPx (lazy: THREE loads later)

  function _ensureEyeFilters() {
    if (document.getElementById('anaglyph-eye-filters')) return;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'anaglyph-eye-filters';
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    // Luminance → single channel, so the green crosshair reads at equal
    // brightness through both lenses instead of vanishing for the red eye.
    svg.innerHTML =
      '<filter id="anaglyph-left-eye" color-interpolation-filters="sRGB">' +
      '<feColorMatrix type="matrix" values="' +
      '0.299 0.587 0.114 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/></filter>' +
      '<filter id="anaglyph-right-eye" color-interpolation-filters="sRGB">' +
      '<feColorMatrix type="matrix" values="' +
      '0 0 0 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0"/></filter>';
    document.body.appendChild(svg);
  }

  function _makeHudClone(src, eye) {
    var c = src.cloneNode(false);
    c.removeAttribute('id');
    c.setAttribute('aria-hidden', 'true');
    c.style.position = 'fixed';
    c.style.pointerEvents = 'none';
    c.style.filter = 'url(#anaglyph-' + eye + '-eye)';
    c.style.visibility = 'visible';
    document.body.appendChild(c);
    return c;
  }

  function _hudOn() {
    _hudOff();
    _ensureEyeFilters();
    _hudRAF = requestAnimationFrame(_hudSync);
  }

  function _hudOff() {
    if (_hudRAF) { cancelAnimationFrame(_hudRAF); _hudRAF = 0; }
    if (_hudClones) {
      _hudClones[0].remove();
      _hudClones[1].remove();
      _hudClones = null;
    }
    if (_hudSource) { _hudSource.style.visibility = ''; _hudSource = null; }
    var stale = document.querySelectorAll('.anaglyph-praise');
    for (var i = 0; i < stale.length; i++) stale[i].remove();
    var praise = document.getElementById('arcadeText');
    if (praise) praise.style.visibility = '';
  }

  function _hudSync() {
    if (!_enabled) return;
    _hudRAF = requestAnimationFrame(_hudSync);

    if (!_hudSource) {
      _hudSource = document.getElementById('crosshair');
      if (!_hudSource) return; // not in the DOM yet — keep polling
    }
    if (!_hudClones) {
      _hudClones = [
        _makeHudClone(_hudSource, 'left'),
        _makeHudClone(_hudSource, 'right')
      ];
      _hudSource.style.visibility = 'hidden';
    }

    // Rect center of the (hidden but laid-out) original, incl. its CSS
    // transform; the clones re-apply the same class transform around it.
    var rect = _hudSource.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var shift = _hudDepth * HUD_PX_PER_UNIT;
    var display = _hudSource.style.display;

    for (var i = 0; i < 2; i++) {
      var clone = _hudClones[i];
      if (clone.className !== _hudSource.className) {
        clone.className = _hudSource.className;
      }
      clone.style.display = display;
      clone.style.left = (i === 0 ? cx - shift : cx + shift) + 'px';
      clone.style.top = cy + 'px';
    }
  }

  // ---------- Arcade praise float-out ----------
  // The praise word already grows and fades (arcadePop). In 3D we replace it
  // with red/cyan eye copies whose horizontal separation ANIMATES during the
  // grow/fade phase — crossed disparity (red right, cyan left) increasing
  // over time reads as the word floating off the screen toward the viewer.
  // The pop-in (0-11%) lands at screen depth; disparity then ramps to full
  // by 70% and HOLDS, so peak pop-out happens while the word is still
  // clearly visible (the old 38%→100% ramp peaked at opacity 0).
  // flashArcadeText is wrapped lazily on first enable() because
  // visual-flair.js loads after this file.

  var _praiseWrapped = false;

  function _ensurePraiseKeyframes() {
    if (document.getElementById('anaglyph-praise-style')) return;
    var st = document.createElement('style');
    st.id = 'anaglyph-praise-style';
    st.textContent =
      '@keyframes anaglyphPraiseL{0%,11%{margin-left:0}70%,100%{margin-left:' +
      PRAISE_FLOAT_PX + 'px}}' +
      '@keyframes anaglyphPraiseR{0%,11%{margin-left:0}70%,100%{margin-left:-' +
      PRAISE_FLOAT_PX + 'px}}';
    document.head.appendChild(st);
  }

  function _wrapPraise() {
    if (_praiseWrapped) return;
    if (typeof window.flashArcadeText !== 'function') return; // retry next enable
    var orig = window.flashArcadeText;
    window.flashArcadeText = function (text, tier, subtitle) {
      orig(text, tier, subtitle);
      if (!_enabled) return;
      var el = document.getElementById('arcadeText');
      if (!el) return; // praise was skipped (e.g. boss intro card is up)
      _ensureEyeFilters();
      _ensurePraiseKeyframes();
      // A new praise replaces the previous one — drop its eye copies too.
      var stale = document.querySelectorAll('.anaglyph-praise');
      for (var i = 0; i < stale.length; i++) stale[i].remove();
      // Keep the original (hidden) as the game's #arcadeText dedupe handle.
      el.style.visibility = 'hidden';
      var eyes = ['left', 'right'];
      for (var j = 0; j < 2; j++) {
        var c = el.cloneNode(true);
        c.removeAttribute('id');
        c.setAttribute('aria-hidden', 'true');
        c.className = 'anaglyph-praise';
        c.style.visibility = 'visible';
        c.style.filter = 'url(#anaglyph-' + eyes[j] + '-eye)';
        c.style.animation =
          'arcadePop 2s cubic-bezier(.2,.7,.3,1) forwards, ' +
          (j === 0 ? 'anaglyphPraiseL' : 'anaglyphPraiseR') + ' 2s linear forwards';
        document.body.appendChild(c);
        setTimeout(function (node) { node.remove(); }.bind(null, c), 2050);
      }
    };
    _praiseWrapped = true;
  }

  // ---------- Depth slider UI ----------
  // ONE control: scene depth 0.05–0.35, no numeric readout.
  // Desktop: #anaglyphDepthRow inside the Flight Controls panel (under the
  // button row). Mobile: #mobileDepthWrap, a vertical slider on the left
  // edge above the tilt toggle. Both appear only while 3D is on; both are
  // static index.html markup wired here.

  function _isCoarse() {
    return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      window.innerWidth <= 768;
  }

  var _depthWired = false;

  function _wireDepthSliders() {
    if (_depthWired) return;
    var ids = ['anaglyphDepthDesktop', 'anaglyphDepthMobile'];
    var found = false;
    ids.forEach(function (id) {
      var s = document.getElementById(id);
      if (!s) return;
      found = true;
      s.addEventListener('input', function () {
        anaglyphMode.setEyeSep(parseFloat(this.value));
      });
    });
    _depthWired = found;
  }

  function _syncDepthUI() {
    _wireDepthSliders();
    var desk = document.getElementById('anaglyphDepthRow');
    var mob = document.getElementById('mobileDepthWrap');
    var coarse = _isCoarse();
    if (desk) desk.style.display = (_enabled && !coarse) ? 'block' : 'none';
    if (mob) mob.style.display = (_enabled && coarse) ? 'block' : 'none';
    var d = document.getElementById('anaglyphDepthDesktop');
    var m = document.getElementById('anaglyphDepthMobile');
    if (d) d.value = _eyeSep;
    if (m) m.value = _eyeSep;
  }

  // ---------- On-screen toggle buttons ----------
  // #anaglyphBtn (desktop Flight Controls row) and #mobileAnaglyphBtn
  // (mobile top row) toggle the mode; their lit state tracks it.

  function _syncButtons() {
    var ids = ['anaglyphBtn', 'mobileAnaglyphBtn'];
    for (var i = 0; i < ids.length; i++) {
      var b = document.getElementById(ids[i]);
      if (!b) continue;
      if (_enabled) {
        b.style.borderColor = '#0ff';
        b.style.color = '#0ff';
        b.style.boxShadow = '0 0 12px rgba(0,255,255,0.6), inset 0 0 8px rgba(0,255,255,0.2)';
        b.style.opacity = '1';
      } else {
        b.style.borderColor = '';
        b.style.color = '';
        b.style.boxShadow = '';
        b.style.opacity = '';
      }
    }
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('#anaglyphBtn, #mobileAnaglyphBtn');
    if (!t) return;
    e.preventDefault();
    anaglyphMode.toggle();
  });

  // ---------- Keyboard shortcuts ----------
  // Backtick toggles; -/= nudge the one depth control (HUD depth is
  // derived from it, so no [/] keys anymore).

  window.addEventListener('keydown', function (e) {
    if (e.key === '`') {
      e.preventDefault();
      anaglyphMode.toggle();
      return;
    }
    if (_enabled) {
      if (e.key === '-') { e.preventDefault(); anaglyphMode.adjustEyeSep(-DEPTH_STEP); }
      if (e.key === '=') { e.preventDefault(); anaglyphMode.adjustEyeSep(DEPTH_STEP); }
    }
  });

  window.anaglyphMode = anaglyphMode;

  // ?3d=1 boot flag: the normal boot goes through the INTRO renderer path
  // (game-intro.js initializeThreeJSForIntro), which never calls
  // anaglyphMode.init() — that call lives only in game-core's initThreeJS,
  // a path the intro boot skips. Poll until the renderer exists, then enable.
  if (/[?&]3d=1/.test(location.search)) {
    var _bootPoll = setInterval(function () {
      if (typeof renderer !== 'undefined' && renderer) {
        clearInterval(_bootPoll);
        if (!_enabled) anaglyphMode.enable();
      }
    }, 500);
  }

})();
