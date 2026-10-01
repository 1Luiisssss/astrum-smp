/* ==========================================================================
   skin.js — visor 3D del skin de 1Luiissss.

   Usa skinview3d v3. El arrastre para rotar ya viene de fábrica (OrbitControls);
   solo.autoRotate cuando el usuario no está interactuando, y pausamos el
   render cuando la sección sale de pantalla.
   ========================================================================== */

(function () {
  'use strict';

  const C = window.ASTRUM;
  const stage = document.getElementById('skin-stage');
  const canvas = document.getElementById('skin-canvas');
  const note = document.getElementById('skin-note');
  if (!stage || !canvas) return;

  const sv3 = window.skinview3d;
  if (!sv3?.SkinViewer) {
    fail('No se pudo cargar el visor 3D.');
    return;
  }

  /* Con doble clic (file://) las peticiones a mc-heads.net fallan por CORS:
     el origen es null. No es un fallo del sitio, pero avisar es mejor que
     dejar un rectángulo negro en mitad de la pagina. */
  if (location.protocol === 'file:') {
    fail('Abrilo con <code>npm run serve</code> y entra por <code>http://127.0.0.1:8900</code>. Con doble clic, el navegador bloquea las imagenes de Minecraft por CORS.');
    return;
  }

  const IGN = C.author.mcUsername;
  const SKIN_SOURCES = [
    `https://mc-heads.net/skin/${IGN}`,
    `https://crafatar.com/skins/${IGN}`,
    `https://minotar.net/skin/${IGN}`
  ];
  const CAPE_SOURCES = [
    `https://mc-heads.net/cape/${IGN}`,
    `https://crafatar.com/capes/${IGN}`
  ];

  function fail(msg) {
    if (note) note.textContent = msg;
    stage.innerHTML =
      '<div style="display:grid;place-items:center;height:100%;padding:2rem;text-align:center">' +
      '<p class="label" style="line-height:1.8">' + msg +
      ' <a href="https://namemc.com/profile/' + IGN + '" target="_blank" rel="noopener noreferrer" ' +
      'style="color:var(--red);display:block;margin-top:.75rem">Ver en NameMC →</a></p></div>';
  }

  /* --- Primer origen que responda -------------------------------------- */
  async function firstOk(urls) {
    for (const url of urls) {
      try {
        await loadImage(url);
        return url;
      } catch { /* siguiente */ }
    }
    return null;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(url));
      img.src = url;
    });
  }

  (async function init() {
    // Descargamos antes de instanciar: si no hay skin, no creamos el viewer.
    const skinUrl = await firstOk(SKIN_SOURCES);
    if (!skinUrl) {
      fail('No se pudo cargar el skin. Puedes verlo directamente en NameMC.');
      return;
    }

    const box = stage.getBoundingClientRect();
    const w = Math.max(box.width, 1);
    const h = Math.max(box.height, 1);

    // El skin se carga DESPUÉS de crear el visor, no en el constructor:
    // así el fallo cae en nuestro catch y podemos ofrecer NameMC.
    const viewer = new sv3.SkinViewer({
      canvas,
      width: w,
      height: h,
      model: 'auto-detect',
      zoom: 0.78,
      fov: 55,
      pixelRatio: Math.min(devicePixelRatio || 1, 2),
      enableControls: true,     // OrbitControls: arrastre y rueda ya nativos
      background: null          // transparente, se ve el fondo del CSS
    });

    // Luces: el modelo tiene que leerse sobre un fondo casi negro.
    viewer.globalLight.intensity = 3.2;
    viewer.cameraLight.intensity = 0.9;
    viewer.autoRotate = true;
    viewer.autoRotateSpeed = 0.55;

    try {
      await viewer.loadSkin(skinUrl);
    } catch (err) {
      console.warn('[astrum] skin: no se pudo pintar', err?.message);
      viewer.dispose();
      fail('No se pudo cargar el skin. Puedes verlo directamente en NameMC.');
      return;
    }

    // Capa opcional: solo se intenta si está activada en config.js.
    // mc-heads.net no manda CORS en /cape/, así que sondearlo sin capa
    //-equipped genera un 404 y dos errores de red en cada carga.
    if (C.author.hasCape) {
      try {
        const capeUrl = await firstOk(CAPE_SOURCES);
        if (capeUrl) await viewer.loadCape(capeUrl);
      } catch { /* sin capa */ }
    }

    if (note) note.textContent = 'Arrastra para rotar · rueda para acercar';

    /* --- Tamaño ---------------------------------------------------------- */
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) viewer.setSize(Math.round(width), Math.round(height));
    });
    ro.observe(stage);

    /* --- No renderizar fuera de pantalla -------------------------------- */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        viewer.renderPaused = !e.isIntersecting;
      }, { threshold: 0.15 }).observe(stage);
    }

    // El hint desaparece en cuanto el usuario demuestra que sabe arrastrar.
    const hint = document.getElementById('skin-hint');
    if (hint) {
      let hidden = false;
      const dismiss = () => {
        if (hidden) return;
        hidden = true;
        hint.style.transition = 'opacity .4s';
        hint.style.opacity = '0';
        stage.removeEventListener('pointerdown', dismiss);
      };
      stage.addEventListener('pointerdown', dismiss, { once: true });
    }

    // Si el contexto WebGL se pierde, skinview3d ya se recupera solo.
  })().catch((err) => {
    console.warn('[astrum] skin:', err);
    fail('No se pudo cargar el visor 3D.');
  });
})();
