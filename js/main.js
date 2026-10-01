/* ==========================================================================
   main.js — orquestador: preloader, menú, acordeón, copy-IP y datos en vivo.
   ========================================================================== */

(function () {
  'use strict';

  const C = window.ASTRUM;
  const D = window.ASTRUM?.data;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ==================================================================== */
  /*  Enlaces con comportamiento                                            */
  /* ==================================================================== */

  // Todos los botones/enlaces marcados con data-discord llevan al invite real.
  $$('[data-discord]').forEach((el) => {
    el.href = C.links.discord;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
  });

  // Un clic y dentro: el protocolo oficial de Minecraft abre el launcher.
  // Si el protocolo no está disponible, el botón degrada a copiar la IP.
  $$('[data-join]').forEach((el) => {
    el.href = `minecraft://?addExternalServer=${encodeURIComponent(C.server.host)}`;
    el.title = `Abrir ${C.server.host} en Minecraft`;
    el.addEventListener('click', (e) => {
      // Si en 1.5 s la pestaña no se oculta, asumimos que no hay launcher.
      let hidden = false;
      const onHide = () => { hidden = true; };
      document.addEventListener('visibilitychange', onHide, { once: true });
      setTimeout(() => {
        document.removeEventListener('visibilitychange', onHide);
        if (!hidden) {
          e.preventDefault();
          navigator.clipboard?.writeText(C.server.host);
          flash(el, 'IP copiada');
        }
      }, 1500);
    });
  });

  function flash(btn, msg) {
    const label = btn.querySelector('.btn__text-p') || btn;
    if (!label.dataset.orig) label.dataset.orig = label.textContent.trim();
    label.textContent = msg;
    setTimeout(() => { label.textContent = label.dataset.orig; }, 1800);
  }

  /* ==================================================================== */
  /*  Copiar IP                                                             */
  /* ==================================================================== */

  $$('[data-copy-ip], .copy').forEach((btn) => {
    // Normalizamos: cualquier .copy sin data-ip toma el del servidor.
    const ip = btn.dataset.ip || C.server.host;
    btn.dataset.ip = ip;

    const label = btn.querySelector('.copy__label, span') || btn;
    if (!label.dataset.orig) label.dataset.orig = label.textContent.trim();

    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(ip);
      } catch {
        // clipboard API bloqueada (sin https o sin permiso): plan B.
        const ta = document.createElement('textarea');
        ta.value = ip;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch { /* nada que hacer */ }
        ta.remove();
      }
      label.textContent = '¡Copiado!';
      btn.classList.add('is-done');
      clearTimeout(btn._t);
      btn._t = setTimeout(() => {
        label.textContent = label.dataset.orig;
        btn.classList.remove('is-done');
      }, 1800);
    });
  });

  /* ==================================================================== */
  /*  Drawer lateral                                                        */
  /* ==================================================================== */

  (function drawer() {
    const burger = $('#burger');
    const drawer = $('#drawer');
    if (!burger || !drawer) return;

    let open = false;
    let lastFocus = null;

    // Retardo en cascada por enlace. Va en CSS con transition-delay, no en
    // JS, así que funciona también si GSAP no está.
    $$('.drawer__link', drawer).forEach((a, i) => a.style.setProperty('--i', i));

    // Foco atrapado dentro del panel mientras esté abierto.
    const focusables = () =>
      $$('a[href], button:not([disabled])', drawer)
        .filter((el) => el.offsetParent !== null);

    const panel = $('.drawer__panel', drawer);
    const veil = $('.drawer__veil', drawer);
    const links = $$('.drawer__link', drawer);

    function set(state) {
      if (open === state) return;
      open = state;
      burger.setAttribute('aria-expanded', String(open));
      drawer.classList.toggle('is-open', open);
      // `clip` y no `hidden`: bloquea el scroll sin crear un contenedor
      // de scroll que rompa la medición de ScrollTrigger.
      document.documentElement.style.overflow = open ? 'clip' : '';
      window.ASTRUM?.scroll?.[open ? 'stop' : 'start']?.();

      animar();

      if (open) {
        drawer.removeAttribute('inert');
        lastFocus = document.activeElement;
        focusables()[0]?.focus({ preventScroll: true });
      } else {
        /* El `inert` se quita AL FINAL, cuando el panel ya se ha deslizado
           fuera. Si se quita en el acto, el cajón se vuelve inaccesible
           mientras todavía se ve, que es justo el corte que queremos
           evitar. El retardo es el mismo que el del `visibility` en el
           CSS: 0,62 s. */
        setTimeout(() => {
          if (!open) drawer.setAttribute('inert', '');
        }, 640);
        lastFocus?.focus?.({ preventScroll: true });
      }
    }

    /* La animación la lleva el CSS, no GSAP.

       Se quitó GSAP de aquí por lo mismo que del preloader: su reloj va
       con requestAnimationFrame, que Firefox congela cuando la pestaña
       no está delante. El velo, que lo animaba CSS, se veía borroso,
       mientras el panel se quedaba clavado en xPercent 100 — fuera de
       pantalla. Se veía "el blur y nada más".

       Aquí no hace falta un motor: son un panel, un velo y siete enlaces.
       Las transiciones CSS las mueve el compositor, así que no dependen de
       que ningún reloj siga vivo.

       Este bloque solo limpia estilos en línea, por si acaso. */
    function animar() {
      panel.style.transform = '';
      veil.style.opacity = '';
      links.forEach((a) => { a.style.opacity = ''; a.style.transform = ''; });
    }

    burger.addEventListener('click', () => set(!open));

    // Cerrar: el velo, la X, o cualquier enlace con data-close-drawer.
    drawer.addEventListener('click', (e) => {
      if (e.target.closest('[data-close-drawer]')) set(false);
    });

    addEventListener('keydown', (e) => {
      if (!open) return;
      if (e.key === 'Escape') { set(false); return; }

      // Tab no puede salir del panel.
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus(); e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus(); e.preventDefault();
        }
      }
    });

    // Navegación suave: primero cierra, y cuando el panel ya está casi
    // fuera, salta. Si saltara a la vez, se vería el scroll por debajo.
    $$('a[href^="#"]', drawer).forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (!id || id === '#' || id.length < 2) return;
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        set(false);
        setTimeout(() => window.ASTRUM?.scroll?.to(target), 340);
      });
    });
  })();

  /* ==================================================================== */
  /*  FAQ — acordeón                                                        */
  /* ==================================================================== */

  (function faq() {
    const items = $$('#faq-list .faq__item');
    if (!items.length) return;

    items.forEach((item) => {
      const btn = item.querySelector('.faq__q');
      btn.addEventListener('click', () => {
        const isOpen = item.classList.contains('is-open');
        // Una sola abierta a la vez: menos ruido visual.
        items.forEach((i) => {
          i.classList.remove('is-open');
          i.querySelector('.faq__q')?.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          item.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  })();

  /* ==================================================================== */
  /*  Preloader                                                             */
  /*  Solo el logo: se rellena de abajo arriba y se desvanece.             */
  /* ==================================================================== */

  (function preloader() {
    const el = $('#preloader');
    if (!el) return;

    const rect = $('#pre-rect');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Plazos. Todo el preloader dura LLENAR + LATIDO + la salida pintada
       (0,8 s). El tope está muy por encima para que la red del <head>
       (que espera 9 s) nunca gane la carrera y arranque la cortinilla a
       media carga: eso pasaba antes. */
    const LLENAR = 2600;   // el logo subiendo, según el boceto
    const LATIDO = 750;    // el pulso de "carga completa" al llegar al 100%
    const TOPE   = 5500;   // pase lo que pase, a los 5,5 s fuera

    /* Geometría del recorte. El logo va de y=242 (coronación) a y=494
       (base), así que el rectángulo de alto 252 empieza justo debajo de la
       base y sube hasta arriba. p=0 vacío, p=1 lleno. */
    const Y_TOP = 242;
    const Y_BOT = 494;

    function set(p) {
      if (rect) rect.setAttribute('y', (Y_BOT - (Y_BOT - Y_TOP) * p).toFixed(2));
    }

    /* easeInOutQuad, el del boceto: lento al arrancar, rápido en medio,
       lento al terminar. */
    function ease(t) {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    let recursosListos = false;
    let lleno = false;
    let latido = false;   // el latido de "carga completa" ya sonó
    let fuera = false;
    let animacion = 0;
    let salida = 0;

    function terminar() {
      clearTimeout(animacion);
      clearTimeout(salida);
      if (fuera) return;
      fuera = true;

      el.dataset.gone = '1';
      // Apaga la animación CSS de respaldo (bloque 7 del CSS).
      el.style.animation = 'none';
      document.documentElement.style.overflow = '';

      /* Con menos movimiento no hay desenfoque ni cortinilla: solo un
         fundido corto de opacidad, que no marea. La regla global de
         reduced-motion anula todas las transiciones, así que el CSS lleva
         una excepción solo para esta opacidad (bloque 7). */
      if (reduce) {
        el.classList.add('is-out');
        setTimeout(() => el.remove(), 420);
        start();
        return;
      }

      el.classList.add('is-out');
      /* La salida se PINTA A MANO con rAF, no con transiciones CSS.

         Visto en vídeo: en algún Firefox las transiciones CSS de esta
         salida no corren (ni el desenfoque del logo, ni el fundido, ni la
         cortinilla), mientras que las animaciones CSS y el rAF sí. El
         resultado son 5+ fotogramas con el logo nítido al 100% y luego un
         corte directo al héroe: ni un solo fotograma intermedio. Como el
         relleno ya demostró que el rAF corre en esa misma máquina, la
         salida la pinta el mismo motor, valor a valor, en línea.

         La clase `is-out` se pone IGUAL, como red: si el rAF muere a
         medias (pestaña a segundo plano), el CSS continúa desde los
         valores en línea que haya dejado. Y si muere antes del primer
         frame, el CSS hace la salida entera. Siempre hay un motor. */
      salidaJS();
      start();
    }

    /* Salida pintada a mano, fotograma a fotograma. La misma coreografía
       de tres tiempos, pero con valores en línea en vez de transiciones:
         0 ms   el logo se desenfoca y desvanece (0,6 s)
         200 ms la cortinilla sube por debajo (0,45 s)
         800 ms se quita el nodo

       El `transition: none` va DENTRO del primer frame, no antes: si el
       rAF está congelado, el primer frame no corre nunca y las
       transiciones CSS quedan intactas para hacer el trabajo. Ponerlo
       antes mataría la red de seguridad. */
    function salidaJS() {
      const logoEl = $('#pre-logo');
      const T_LOGO = 600;
      const RETARDO_CLIP = 200;
      const T_CLIP = 450;
      const T_TOTAL = 800;
      const t0 = performance.now();
      let primer = true;

      // Seguro final: no depende de rAF. Si el bucle se queda colgado
      // (pestaña oculta a mitad de la salida), deja el estado final
      // puesto y quita el nodo igual.
      salida = setTimeout(() => {
        if (!el.isConnected) return;
        if (logoEl) logoEl.style.opacity = '0';
        el.style.clipPath = 'inset(0 0 100% 0)';
        el.remove();
      }, T_TOTAL + 800);

      (function paso(ahora) {
        if (primer) {
          primer = false;
          if (logoEl) logoEl.style.transition = 'none';
          el.style.transition = 'none';
        }
        const p = Math.min(1, (ahora - t0) / T_LOGO);
        const e = 1 - Math.pow(1 - p, 3);   // easeOutCubic
        if (logoEl) {
          logoEl.style.opacity = String(Math.max(0, 1 - e));
          logoEl.style.filter = 'blur(' + (18 * e).toFixed(1) + 'px)';
          logoEl.style.transform = 'scale(' + (1 + 0.1 * e).toFixed(3) + ')';
        }
        const pc = Math.min(1, Math.max(0, (ahora - t0 - RETARDO_CLIP) / T_CLIP));
        const ec = pc * pc * (3 - 2 * pc);  // smoothstep
        el.style.clipPath = 'inset(0 0 ' + (ec * 100).toFixed(1) + '% 0)';
        if (ahora - t0 < T_TOTAL) requestAnimationFrame(paso);
        else {
          clearTimeout(salida);
          el.remove();
        }
      })(performance.now());
    }

    /* Sale cuando pasan TRES cosas: el logo está lleno, el latido de
       "carga completa" ya sonó, y los recursos han llegado. Antes solo
       eran dos, así que al llegar al 100% se iba al instante y se leía
       como un corte, no como el final de algo. */
    function quizá() {
      if (lleno && latido && recursosListos) terminar();
    }

    /* El latido: al llegar al 100%, el logo respira una vez (un pulso con
       brillo, 0,75 s de CSS) y se queda un momento en su sitio ANTES de
       irse. Es la señal de "ya está", sin la cual la salida parece que se
       escapa. No se espera a los recursos para empezar el latido: el pulso
       se ve igual mientras terminan de llegar. */
    function alLlenar() {
      if (lleno) return;
      lleno = true;
      if (!reduce) el.classList.add('is-full');
      setTimeout(() => { latido = true; quizá(); }, reduce ? 0 : LATIDO);
      quizá();
    }

    /* --- El relleno ------------------------------------------------------
       requestAnimationFrame a pelo, sin GSAP.

       Se quitó GSAP de aquí a propósito. Su lagSmoothing congela el
       reloj cuando un frame pasa de 500 ms, que es justo lo que pasa
       mientras decodifican las diez capturas de la galería: la animación
       se quedaba a medias y el logo no llegaba a llenarse nunca. Además
       había que esperar al CDN (hasta 2,4 s sondeando) antes de empezar,
       lo que alargaba la espera sin motivo.

       Aquí no hay nada que esperar ni nada que se pueda frenar. */
    if (reduce) {
      set(1);
      alLlenar();
    } else {
      const t0 = performance.now();
      (function paso(ahora) {
        const p = Math.min(1, (ahora - t0) / LLENAR);
        set(ease(p));
        if (p < 1) {
          requestAnimationFrame(paso);
        } else {
          alLlenar();
        }
      })(performance.now());
    }

    /* --- Los recursos que de verdad pesan --------------------------------
       El logo NO cuenta: es vectorial y ya está. Lo que cuenta es lo que
       tarda de verdad: capturas, texturas y fuentes.

       Esto NO bloquea la salida más de TOPE. Antes, si una sola imagen no
       disparaba ni onload ni onerror, `pendientes` no llegaba nunca a 0 y
       la cortinilla se quedaba ahí hasta que la otra red de seguridad la
       arrancaba a los 5 s, a media carga. */
    (function recursos() {
      const criticos = [
        ...(D?.SLIDES || []).map((s) => s.img),
        'img/blocks/redstone.png',
        'img/blocks/obsidian.png'
      ].filter(Boolean);

      let pendientes = criticos.length + 1;   // +1 por el evento load

      const listo = () => {
        if (pendientes <= 0) return;         // ya estaba: no descuenta dos veces
        if (--pendientes > 0) return;
        recursosListos = true;
        quizá();
      };

      /* onload y onerror hacen LO MISMO a propósito: una captura que da
         404, o que no se puede descargar, no debe retener la cortinilla.
         Antes onerror solo llevaba un contador, así que una imagen que
         fallaba sin disparar error dejaba `pendientes` en verde y la
         cortinilla se quedaba ahí hasta que la red del <head> la
         arrancaba a media carga. */
      criticos.forEach((url) => {
        const img = new Image();
        img.onload = listo;
        img.onerror = listo;
        img.src = url;
      });

      if (document.fonts?.ready) document.fonts.ready.then(listo, listo);
      else listo();

      if (document.readyState === 'complete') listo();
      else addEventListener('load', listo, { once: true });
    })();

    /* Tope duro. Este setTimeout no depende de rAF, así que funciona
       aunque el navegador tenga la pestaña congelada en segundo plano.

       Con menos movimiento el tope es corto, pero no de 200 ms: 200 ms de
       pantalla con el logo ya puesto es un parpadeo, no una animación.
       Se deja un compás corto y reconocible. */
    animacion = setTimeout(() => {
      set(1);
      alLlenar();
      terminar();
    }, reduce ? 650 : TOPE);

    /* Bloqueo de scroll durante la carga.
       NO usamos `overflow: hidden` a propósito: eso convierte el body en
       contenedor de scroll, y ScrollTrigger mide las posiciones con el
       scroll bloqueado, así que algunos triggers se quedaban sin
       disparar y el elemento se quedaba en opacidad 0 para siempre.
       `overflow: clip` bloquea el scroll sin crear contenedor ni alterar
       la medición. */
    document.documentElement.style.overflow = 'clip';
  })();

  /* Avisa de que la web está lista. Lo dispara el preloader al terminar
     y también la red de seguridad del <head>, por si main.js no llegó a
     ejecutarse. La guarda evita que se dispare dos veces. */
  let yaAvisado = false;
  function start() {
    if (yaAvisado) return;
    yaAvisado = true;
    document.dispatchEvent(new CustomEvent('astrum:ready'));
  }

  /* ==================================================================== */
  /*  Datos en vivo                                                         */
  /* ==================================================================== */

  (function live() {
    if (!D) return;

    D.status.refresh();
    D.stats.load();
    D.mods.load();
    D.texturas.load();

    // Reconsulta periódica, solo si la pestaña está visible.
    setInterval(() => {
      if (!document.hidden) D.status.refresh();
    }, C.pollMs);

    const refreshBtn = $('#status-refresh');
    refreshBtn?.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Consultando…';
      await D.status.refresh();
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Reconsultar';
    });
  })();
})();
