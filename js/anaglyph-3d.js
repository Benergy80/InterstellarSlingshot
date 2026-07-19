// Anaglyph 3D effect for red/cyan glasses.
// Toggle: ` (backtick) | Depth: - (less) / = (more) | URL: ?3d=1
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
  var _eyeSep = 1.5; // tuned for space-game scale (units are game units)

  var anaglyphMode = {
    get enabled() { return _enabled; },
    get eyeSep() { return _eyeSep; },

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
    },

    disable: function () {
      _enabled = false;
      _showBadge(false);
    },

    toggle: function () {
      if (_enabled) this.disable(); else this.enable();
    },

    setEyeSep: function (val) {
      _eyeSep = Math.max(0.1, Math.min(20, val));
      if (_effect) _effect.stereo.eyeSep = _eyeSep;
      _flashDepth();
    },

    adjustEyeSep: function (delta) {
      this.setEyeSep(_eyeSep + delta);
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
    _badge.textContent = '3D  depth:' + _eyeSep.toFixed(1);
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
      if (e.key === '-') { e.preventDefault(); anaglyphMode.adjustEyeSep(-0.2); }
      if (e.key === '=') { e.preventDefault(); anaglyphMode.adjustEyeSep(0.2); }
    }
  });

  window.anaglyphMode = anaglyphMode;

})();
