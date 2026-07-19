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
  var _eyeSep = 1.5;    // tuned for space-game scale (units are game units)
  var _hudDepth = 0.2;  // crosshair stereo depth; + = into the scene, - = pops out
  var DEPTH_STEP = 0.05;
  var HUD_PX_PER_UNIT = 30; // hudDepth 0.2 → 6px per-eye horizontal shift

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
      _showBadge(true);
      _hudOn();
    },

    disable: function () {
      _enabled = false;
      _showBadge(false);
      _hudOff();
    },

    toggle: function () {
      if (_enabled) this.disable(); else this.enable();
    },

    setEyeSep: function (val) {
      _eyeSep = Math.round(Math.max(0.05, Math.min(20, val)) * 100) / 100;
      if (_effect) _effect.stereo.eyeSep = _eyeSep;
      _flashDepth();
    },

    adjustEyeSep: function (delta) {
      this.setEyeSep(_eyeSep + delta);
    },

    setHudDepth: function (val) {
      _hudDepth = Math.round(Math.max(-1, Math.min(1, val)) * 100) / 100;
      _flashDepth();
    },

    adjustHudDepth: function (delta) {
      this.setHudDepth(_hudDepth + delta);
    },

    resize: function (w, h) {
      if (_effect) _effect.setSize(w, h);
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

  // ---------- HUD badge ----------

  var _badge = null;

  function _showBadge(show) {
    if (!_badge) {
      _badge = document.createElement('div');
      _badge.id = 'anaglyph-badge';
      _badge.style.cssText =
        'position:fixed;top:12px;right:12px;z-index:9999;' +
        'font:bold 14px/1 monospace;color:#0ff;' +
        'background:rgba(0,0,0,0.7);border:1px solid #0ff;' +
        'padding:6px 10px;border-radius:4px;pointer-events:none;' +
        'transition:opacity 0.3s;text-shadow:0 0 6px #0ff;';
      document.body.appendChild(_badge);
    }
    _badge.textContent =
      '3D  depth:' + _eyeSep.toFixed(2) + '  hud:' + _hudDepth.toFixed(2);
    _badge.style.opacity = show ? '1' : '0';
  }

  var _depthFlashTimer = 0;
  function _flashDepth() {
    if (!_enabled) return;
    _showBadge(true);
    clearTimeout(_depthFlashTimer);
    _depthFlashTimer = setTimeout(function () {
      _showBadge(_enabled);
    }, 1200);
  }

  // ---------- Keyboard shortcuts ----------

  window.addEventListener('keydown', function (e) {
    if (e.key === '`') {
      e.preventDefault();
      anaglyphMode.toggle();
      return;
    }
    if (_enabled) {
      if (e.key === '-') { e.preventDefault(); anaglyphMode.adjustEyeSep(-DEPTH_STEP); }
      if (e.key === '=') { e.preventDefault(); anaglyphMode.adjustEyeSep(DEPTH_STEP); }
      if (e.key === '[') { e.preventDefault(); anaglyphMode.adjustHudDepth(-DEPTH_STEP); }
      if (e.key === ']') { e.preventDefault(); anaglyphMode.adjustHudDepth(DEPTH_STEP); }
    }
  });

  window.anaglyphMode = anaglyphMode;

})();
