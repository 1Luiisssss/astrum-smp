/* ==========================================================================
   gallery.js — túnel de scroll en profundidad.

   Las ocho capturas viven cada una a su distancia en el eje Z. El scroll
   no las desplaza: mueve la cámara, que las atraviesa. Con `perspective`
   en el escenario y `preserve-3d` en el mundo, CSS 3D hace el resto.

   CÓMO SE MIDE EL PROGRESO
   La sección reserva `100vh + recorrido`, y el escenario es `sticky` en
   lo alto. Al bajar, la posición del escenario dentro del viewport va de
   0 a -recorrido: eso es el progreso, y se traduce en un desplazamiento
   en Z de la cámara. Sin ScrollTrigger: un listener de `scroll` pasivo.

   POR QUÉ UN BUCLE PROPIO Y NO EL TICKER DE GSAP
   El ticker de GSAP va con requestAnimationFrame, que el navegador
   CONGELA cuando la pestaña no está delante. Si el túnel dependiera de
   él, al volver de una pestaña de fondo las capturas se quedarían en
   cualquier sitio. Con un bucle propio pasa lo mismo, pero además hay un
   `scroll` que pinta un frame suelto: con un solo scroll, el túnel vuelve
   a su sitio sin esperar al bucle.

   FALLO SEGURO — lo importante
   Los marcos se montan con opacidad 1 y sin transform. El JS los atenúa,
   nunca al revés. Si este archivo no llega a correr, o se corta a la
   mitad, lo que se ve son las ocho capturas apiladas en el sitio: feo,
   pero nunca un hueco negro. Es la misma regla que lleva la web entera.
   ========================================================================== */

(function () {
  'use strict';

  const D = window.ASTRUM?.data;
  const sec = document.getElementById('gal');
  if (!D || !sec) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slides = D.SLIDES;
  const pad = (v) => String(v).padStart(2, '0');
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

  const N = slides.length;

  /* Ritmo del túnel. GAP es la distancia entre capturas; TRAVEL, cuánto
     se mueve la cámara en total. Con el último marco llegando a z=0, el
     recorrido es justo (N-1) * GAP. */
  const GAP = 900;
  const TRAVEL = (N - 1) * GAP;

  /* --- Montaje ---------------------------------------------------------- */

  sec.className = 'tun';
  sec.innerHTML = `
    <div class="tun__stage">
      <div class="tun__world" id="tun-world">
        ${slides.map((s, i) => `
          <figure class="tun__frame">
            <img src="${s.img}" alt="${esc(s.cap)}"
                 width="1200" height="800"
                 loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async">
            <figcaption class="tun__meta">
              <span class="tun__num">${pad(i + 1)}</span>
              <span class="tun__cap">${esc(s.cap)}</span>
            </figcaption>
          </figure>
        `).join('')}
      </div>

      <div class="tun__hud">
        <small>Profundidad</small>
        <b id="tun-depth">0 m</b>
      </div>
      <div class="tun__track" aria-hidden="true"><i></i></div>
      <p class="tun__hint" id="tun-hint">Baja para entrar</p>
    </div>
  `;

  const frames = [...sec.querySelectorAll('.tun__frame')];
  const depthEl = sec.querySelector('#tun-depth');
  const hintEl = sec.querySelector('#tun-hint');
  const trackEl = sec.querySelector('.tun__track');

  /* La altura de la sección. Sin esto el recorrido no existe: la sección
     mediría lo mismo que el escenario y no habría nada que bajar. */
  function medir() {
    sec.style.height = (window.innerHeight + TRAVEL) + 'px';
  }
  medir();
  addEventListener('resize', medir, { passive: true });

  /* Menos movimiento: el CSS ya pone las capturas en columna y quita el
     HUD. No hay nada que animar, y sobre todo nada que ocultar. */
  if (reduce) {
    console.info('[astrum] tunel: reducido a columna (prefers-reduced-motion)');
    return;
  }

  console.info(`[astrum] tunel: ${N} marcos, recorrido ${TRAVEL}px`);

  /* --- El movimiento ----------------------------------------------------
     cur interpola hacia target: eso da la suavidad cuando la rueda
     viene a tirones. Sin GSAP no se nota la diferencia con una-section,
     y a cambio no dependemos de su reloj. */
  let target = 0;
  let cur = 0;
  let ultimo = -1;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /** Progreso 0..1 de la sección dentro del viewport. */
  function leerProgreso() {
    const r = sec.getBoundingClientRect();
    const total = sec.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    return clamp(-r.top / total, 0, 1);
  }

  function pintar() {
    const z = cur * TRAVEL;

    for (let i = 0; i < N; i++) {
      const f = frames[i];
      const zi = z - i * GAP;              // <0 detrás, >0 delante

      /* Se atenúa por los dos lados: al entrar por el fondo del túnel y
         al salir por delante. Entre los dos, opacidad 1.

         Lo importante es que aquí NUNCA se pone a 0 de golpe y se queda:
         si el bucle se congela, la última foto pintada se queda como
         estaba, que es visible. */
      const lejos = clamp(1 + zi / (2.6 * GAP), 0, 1);
      const cerca = clamp((GAP * 0.72 - zi) / (GAP * 0.5), 0, 1);
      const op = Math.min(lejos, cerca);

      /* El descentrado lateral, leve, para que no parezca una escalera
         perfectamente recta. */
      const k = i === 0 ? 0 : clamp(-zi / (1.5 * GAP), 0, 1);
      const x = Math.sin(i * 2.1 + 0.6) * innerWidth * 0.07 * k;
      const y = Math.cos(i * 1.7) * innerHeight * 0.045 * k;

      f.style.opacity = op.toFixed(3);
      f.style.transform =
        `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${zi.toFixed(1)}px)`;
    }

    const ms = Math.round(cur * 9);
    if (ms !== ultimo) {
      ultimo = ms;
      if (depthEl) depthEl.textContent = ms + ' m';
      if (trackEl) trackEl.style.setProperty('--p', cur.toFixed(4));
      if (hintEl) hintEl.style.opacity = clamp(1 - cur * 22, 0, 1).toFixed(2);
    }
  }

  function bucle() {
    cur += (target - cur) * 0.11;
    if (Math.abs(target - cur) < 0.0004) cur = target;
    pintar();
    requestAnimationFrame(bucle);
  }

  addEventListener('scroll', () => { target = leerProgreso(); }, { passive: true });
  addEventListener('resize', () => { target = leerProgreso(); }, { passive: true });

  /* Un frame suelto en cada scroll, para que el túnel esté en su sitio al
     instante aunque el bucle esté congelado.

     OJO: esto NO usa requestAnimationFrame, y es a propósito. Antes había
     un `enCola` que evitaba pintar más de una vez por frame, y se quedaba
     en `true` para siempre si el primer rAF no llegaba a dispararse — que
     es justo lo que pasa si la página carga en una pestaña de segundo
     plano. A partir de ese scroll, el frame de seguridad no volvía a
     correr nunca y el túnel se quedaba clavado. Un bandera que puede
     atascarse no puede ser la red de seguridad.

     En su lugar, un sello de tiempo: como mucho un pintado cada 32 ms
     (~30 fps). Suficiente para que el scroll se sienta fluido, y no
     depende de ningún reloj que se pueda congelar. */
  let ultimoPintado = 0;
  addEventListener('scroll', () => {
    const ahora = performance.now();
    if (ahora - ultimoPintado < 32) return;
    ultimoPintado = ahora;
    cur = target;
    pintar();
  }, { passive: true });

  /* --- Accesibilidad ---------------------------------------------------- */

  sec.tabIndex = 0;
  sec.setAttribute('role', 'group');
  sec.setAttribute('aria-label', 'Capturas del mundo, en túnel de profundidad');

  // Las flechas hacia arriba y hacia abajo mueven el scroll normal, que es
  // lo que gobierna el túnel. No se reimplementa nada: el control nativo
  // ya hace lo correcto.

  // Un frame inicial, por si se recarga a media página.
  target = leerProgreso();
  cur = target;
  pintar();
  requestAnimationFrame(bucle);

  /* Si el navegador congelo el bucle porque la pestaña no estaba delante,
     el rAF inicial no llega a dispararse y el bucle no arranca nunca. Al
     volver a la pestaña se pide uno nuevo, y de paso se pinta el estado
     actual: puede haber scrolls que nunca pasaron por el listener. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    target = leerProgreso();
    cur = target;
    pintar();
    requestAnimationFrame(bucle);
  });
})();
