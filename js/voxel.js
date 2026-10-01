/* ==========================================================================
   voxel.js — nube de bloques flotando en el hero, en WebGL puro.

   Por qué sin three.js: para dibujar 20 cubos texturizados no hacen falta
   670 KB de biblioteca. Esto son ~7 KB y cero peticiones extra. (three.js
   además ya no publica build UMD desde la 0.169, así que el <script> clásico
   directamente no existe.)

   Usa las texturas reales del resource pack de AstrumSMP (img/blocks/)
   montadas en un atlas 3x3 → una sola textura, un solo material.

   Degrada a nada (se borra el canvas) si no hay WebGL, si el atlas no se puede
   construir o si prefers-reduced-motion está activo.
   ========================================================================== */

(function () {
  'use strict';

  const canvas = document.getElementById('voxel');
  if (!canvas) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false })
          || canvas.getContext('webgl',  { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) { canvas.remove(); return; }
  /* ==================================================================== */
  /*  Atlas 3x3                                                            */
  /* ==================================================================== */

  const BLOCKS = [
    'redstone', 'obsidian', 'purpur',
    'bamboo', 'iron', 'diamond',
    'shulker', 'sculk', 'cobblestone'
  ];
  const CELL = 16;
  const COLS = 3;
  const TEX = CELL * COLS;   // 48

  function buildAtlas() {
    return new Promise((resolve) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = TEX;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      let pending = BLOCKS.length;
      const tick = () => { if (--pending === 0) resolve(cv); };

      BLOCKS.forEach((name, i) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, (i % COLS) * CELL, ((i / COLS) | 0) * CELL, CELL, CELL);
          tick();
        };
        img.onerror = tick;
        img.src = `img/blocks/${name}.png`;
      });
    });
  }

  /* ==================================================================== */
  /*  Geometría: cubo unitario con UV mapeadas a una celda del atlas        */
  /* ==================================================================== */

  // 6 caras × 4 vértices. indices: 2 triángulos por cara.
  const FACES = [
    { n: [ 1, 0, 0], p: [[ .5,-.5, .5],[ .5,-.5,-.5],[ .5, .5,-.5],[ .5, .5, .5]] },
    { n: [-1, 0, 0], p: [[-.5,-.5,-.5],[-.5,-.5, .5],[-.5, .5, .5],[-.5, .5,-.5]] },
    { n: [ 0, 1, 0], p: [[-.5, .5,-.5],[ .5, .5,-.5],[ .5, .5, .5],[-.5, .5, .5]] },
    { n: [ 0,-1, 0], p: [[-.5,-.5, .5],[ .5,-.5, .5],[ .5,-.5,-.5],[-.5,-.5,-.5]] },
    { n: [ 0, 0, 1], p: [[-.5,-.5, .5],[ .5,-.5, .5],[ .5, .5, .5],[-.5, .5, .5]] },
    { n: [ 0, 0,-1], p: [[ .5,-.5,-.5],[-.5,-.5,-.5],[-.5, .5,-.5],[ .5, .5,-.5]] }
  ];
  const CORNER_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

  /**
   * Interleavea posición(3) + normal(3) + uv(2) = 8 floats por vértice.
   * Las UV se insetan medio téxel para que, con filtrado NEAREST, ninguna
   * cara se coma un píxel de la celda vecina.
   */
  function cubeData(cell) {
    const col = cell % COLS;
    const row = (cell / COLS) | 0;
    const half = 0.5 / TEX;
    const u0 = col / COLS + half;
    const u1 = (col + 1) / COLS - half;
    // Al subir un <canvas> como textura, v=0 es la fila superior del canvas,
    // así que la fila 0 del atlas ocupa v de 0 a 1/3.
    const v0 = row / COLS + half;
    const v1 = (row + 1) / COLS - half;

    const data = new Float32Array(24 * 8);
    let o = 0;
    for (const face of FACES) {
      for (let k = 0; k < 4; k++) {
        const p = face.p[k];
        const uv = CORNER_UV[k];
        data[o++] = p[0]; data[o++] = p[1]; data[o++] = p[2];
        data[o++] = face.n[0]; data[o++] = face.n[1]; data[o++] = face.n[2];
        data[o++] = u0 + (u1 - u0) * uv[0];
        data[o++] = v0 + (v1 - v0) * uv[1];
      }
    }
    return data;
  }

  const INDICES = new Uint16Array(FACES.flatMap((_, f) => [f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3]));

  /* ==================================================================== */
  /*  Shaders                                                              */
  /* ==================================================================== */

  const VS = `
    attribute vec3 aPos;
    attribute vec3 aNormal;
    attribute vec2 aUV;
    uniform mat4 uProj, uView, uModel;
    uniform mat3 uNormalMat;
    varying vec3 vN;
    varying vec2 vUV;
    void main() {
      vN = uNormalMat * aNormal;
      vUV = aUV;
      gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
    }`;

  const FS = `
    precision mediump float;
    uniform sampler2D uTex;
    uniform vec3 uAmbient, uKeyDir, uKeyCol, uRimDir, uRimCol;
    varying vec3 vN;
    varying vec2 vUV;
    void main() {
      vec3 n = normalize(vN);
      float key = max(dot(n, uKeyDir), 0.0);
      float rim = max(dot(n, uRimDir), 0.0);
      vec3 light = uAmbient + uKeyCol * key + uRimCol * rim;
      gl_FragColor = vec4(texture2D(uTex, vUV).rgb * light, 1.0);
    }`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[astrum/voxel]', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function program() {
    const vs = shader(gl.VERTEX_SHADER, VS);
    const fs = shader(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('[astrum/voxel]', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  /* ==================================================================== */
  /*  Matrices (las justas)                                                */
  /* ==================================================================== */

  const M4 = () => new Float32Array(16);

  function perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f;
    out[10] = (far + near) * nf; out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  }

  function multiply(out, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      out[c * 4]     = a[0] * b0 + a[4] * b1 + a[8]  * b2 + a[12] * b3;
      out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9]  * b2 + a[13] * b3;
      out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return out;
  }

  /** Rotación Y→X→Z + escala uniforme, y su matriz de normales. */
  function compose(out, nrm, pos, rx, ry, rz, s) {
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cz = Math.cos(rz), sz = Math.sin(rz);

    // R = Ry * Rx * Rz
    const m00 = cy * cz + sy * sx * sz;
    const m01 = cx * sz;
    const m02 = -sy * cz + cy * sx * sz;
    const m10 = -cy * sz + sy * sx * cz;
    const m11 = cx * cz;
    const m12 = sy * sz + cy * sx * cz;
    const m20 = sy * cx;
    const m21 = -sx;
    const m22 = cy * cx;

    out[0] = m00 * s; out[1] = m01 * s; out[2]  = m02 * s; out[3]  = 0;
    out[4] = m10 * s; out[5] = m11 * s; out[6]  = m12 * s; out[7]  = 0;
    out[8] = m20 * s; out[9] = m21 * s; out[10] = m22 * s; out[11] = 0;
    out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;

    // Escala uniforme → la matriz de normales es la rotación sin escalar.
    nrm[0] = m00; nrm[1] = m01; nrm[2] = m02;
    nrm[3] = m10; nrm[4] = m11; nrm[5] = m12;
    nrm[6] = m20; nrm[7] = m21; nrm[8] = m22;
  }

  /** Vista desde (0,0,dist) mirando al origen. */
  function viewMatrix(out, dist) {
    out.set([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-dist,1]);
    return out;
  }

  /* ==================================================================== */
  /*  Escena                                                               */
  /* ==================================================================== */

  /* Nube de bloques.
     Regla de composicion: el CENTRO esta prohibido. Ahi van el titular
     gigante y el parrafo, y si un bloque cae encima el texto deja de
     leerse. Por eso las posiciones salen de un anillo y no al azar: un
     radio minimo los mantiene en la periferia, y el z los aleja para que
     se lean como atmosfera y no como ruido. */
  const LAYOUT = (() => {
    const RINGS = [
      { n: 6, r: [3.8, 4.6], y: [-2.6, 2.8], z: [-1.5,  0.5], s: [0.58, 0.76] },
      { n: 6, r: [4.8, 6.2], y: [-3.4, 3.4], z: [-4.0, -1.6], s: [0.52, 0.72] },
      { n: 4, r: [5.8, 7.8], y: [-4.0, 4.0], z: [-8.0, -4.0], s: [0.48, 0.68] }
    ];
    const CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const out = [];

    RINGS.forEach((ring, ri) => {
      for (let i = 0; i < ring.n; i++) {
        // Filas desfasadas para que los bloques no se alineen en vertical.
        const ang = (i / ring.n) * Math.PI * 2 + ri * 0.55 + (i % 2 ? 0.18 : -0.18);
        const r  = ring.r[0] + ((i * 0.37) % 1) * (ring.r[1] - ring.r[0]);
        const y  = ring.y[0] + ((i * 0.61) % 1) * (ring.y[1] - ring.y[0]);
        const s  = ring.s[0] + ((i * 0.29) % 1) * (ring.s[1] - ring.s[0]);
        const z  = ring.z[0] + ((i * 0.43) % 1) * (ring.z[1] - ring.z[0]);
        out.push({
          c: CELLS[(i + ri * 3) % CELLS.length],
          p: [Math.cos(ang) * r, y, z],
          s,
          w: (i % 2 ? -1 : 1) * (0.09 + ((i * 0.17) % 1) * 0.13)
        });
      }
    });
    return out;
  })();

  const KEY_DIR = norm([-0.45, 0.72, 0.53]);
  const RIM_DIR = norm([0.55, -0.35, -0.76]);
  function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  buildAtlas().then((atlas) => {
    const prog = program();
    if (!prog) { canvas.remove(); return; }

    /* --- Textura ------------------------------------------------------ */
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    // Pixel-art puro: NEAREST y sin mipmaps.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    /* --- Geometría: un VBO por celda del atlas, reutilizado ------------ */
    const vaos = BLOCKS.map((_, cell) => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, cubeData(cell), gl.STATIC_DRAW);

      const stride = 8 * 4;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);

      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, INDICES, gl.STATIC_DRAW);

      gl.bindVertexArray(null);
      return vao;
    });

    /* --- Uniformes ---------------------------------------------------- */
    gl.useProgram(prog);
    const U = {};
    for (const name of ['uProj', 'uView', 'uModel', 'uNormalMat', 'uTex',
                        'uAmbient', 'uKeyDir', 'uKeyCol', 'uRimDir', 'uRimCol']) {
      U[name] = gl.getUniformLocation(prog, name);
    }

    const AMBIENT = [0.30, 0.30, 0.38];
    const KEY_COL = [0.95, 0.88, 0.78];
    const RIM_COL = [0.22, 0.28, 0.55];
    gl.uniform3fv(U.uAmbient, AMBIENT);
    gl.uniform3fv(U.uKeyDir, KEY_DIR);
    gl.uniform3fv(U.uKeyCol, KEY_COL);
    gl.uniform3fv(U.uRimDir, RIM_DIR);
    gl.uniform3fv(U.uRimCol, RIM_COL);
    gl.uniform1i(U.uTex, 0);

    /* --- Estado ------------------------------------------------------- */
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    // Sin culling: son 20 cubos y así el winding no puede salir mal.
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);

    /* --- Framebuffers ------------------------------------------------- */
    const mProj = M4(), mView = M4(), mModel = M4(), mNrm = new Float32Array(9);
    let dist = 12;
    let W = 0, H = 0;

    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.max(Math.round((canvas.clientWidth || innerWidth) * dpr), 1);
      const h = Math.max(Math.round((canvas.clientHeight || innerHeight) * dpr), 1);
      if (w === W && h === H) return;
      W = canvas.width = w;
      H = canvas.height = h;
      gl.viewport(0, 0, W, H);
    }

    function updateCamera() {
      const w = canvas.clientWidth || innerWidth;
      const aspect = w / (canvas.clientHeight || innerHeight || 1);
      // En pantallas estrechas alejamos la cámara para que quepan los bloques.
      dist = w < 720 ? 15.5 : w < 1100 ? 14 : 12.5;
      perspective(mProj, 42 * Math.PI / 180, aspect, 0.1, 100);
      viewMatrix(mView, dist);
    }

    addEventListener('resize', () => { resize(); updateCamera(); }, { passive: true });
    resize();
    updateCamera();

    /* --- Estado de animación ------------------------------------------ */
    const blocks = LAYOUT.map((cfg, i) => ({
      cell: cfg.c,
      base: [...cfg.p],
      pos: [...cfg.p],
      s: cfg.s,
      w: cfg.w,
      rx: (i * 0.71) % 6.28,
      ry: (i * 1.13) % 6.28,
      rz: (i * 0.37) % 6.28,
      phase: i * 0.63,
      bob: 0.10 + (i % 5) * 0.045
    }));

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    if (!reduce) {
      addEventListener('pointermove', (e) => {
        pointer.tx = (e.clientX / innerWidth - 0.5) * 2;
        pointer.ty = (e.clientY / innerHeight - 0.5) * 2;
      }, { passive: true });
    }

    let scrollY = 0;
    addEventListener('scroll', () => { scrollY = window.scrollY || 0; }, { passive: true });

    /* --- Draw --------------------------------------------------------- */
    const t0 = performance.now();

    function draw(now) {
      const t = (now - t0) / 1000;

      pointer.x += (pointer.tx - pointer.x) * 0.045;
      pointer.y += (pointer.ty - pointer.y) * 0.045;

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniformMatrix4fv(U.uProj, false, mProj);
      gl.uniformMatrix4fv(U.uView, false, mView);

      for (const b of blocks) {
        // Rotación continua
        if (!reduce) {
          b.rx += b.w * 0.011;
          b.ry += b.w * 0.017;
        }
        // Flotación y paralaje
        b.pos[0] = b.base[0] + (reduce ? 0 : Math.cos(t * 0.4 + b.phase) * b.bob * 0.5) + pointer.x * b.s * 0.12;
        b.pos[1] = b.base[1] + (reduce ? 0 : Math.sin(t * 0.6 + b.phase) * b.bob) - pointer.y * b.s * 0.10;
        b.pos[2] = b.base[2] - scrollY * 0.012;

        compose(mModel, mNrm, b.pos, b.rx, b.ry, b.rz, b.s);

        gl.uniformMatrix4fv(U.uModel, false, mModel);
        gl.uniformMatrix3fv(U.uNormalMat, false, mNrm);
        gl.bindVertexArray(vaos[b.cell]);
        gl.drawElements(gl.TRIANGLES, INDICES.length, gl.UNSIGNED_SHORT, 0);
      }
      gl.bindVertexArray(null);
    }

    /* --- Bucle: solo cuando el hero está en pantalla ------------------- */
    let visible = true;
    let raf = 0;

    function loop(now) {
      if (!visible) { raf = 0; return; }
      resize();
      draw(now);
      raf = requestAnimationFrame(loop);
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        const was = visible;
        visible = e.isIntersecting;
        if (visible && !was && raf === 0 && !reduce) raf = requestAnimationFrame(loop);
        else if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
      }, { threshold: 0 }).observe(canvas);
    }

    if (reduce) {
      draw(t0);
    } else {
      raf = requestAnimationFrame(loop);
    }

    /* --- Contexto perdido: lo recuperamos si se puede ------------------ */
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    });
    canvas.addEventListener('webglcontextrestored', () => {
      gl.viewport(0, 0, W, H);
      if (!reduce && !raf) raf = requestAnimationFrame(loop);
    });
  }).catch((err) => {
    console.warn('[astrum/voxel]', err);
    canvas.remove();
  });
})();
