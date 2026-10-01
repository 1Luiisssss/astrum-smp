/* ==========================================================================
   scroll.js — Lenis + GSAP/ScrollTrigger y todo lo que se mueve al hacer
   scroll.

   REGLA DE ORO: el contenido NUNCA depende de que una animación corra para
   ser visible.

   La clase .gsap-ready es la que pone `opacity: 0` a los elementos por
   revelar, y no se añade a ciegas: primero comprobamos que el ticker de
   GSAP realmente avanza. Sin esa comprobación pasaba esto —

     gsap.from() aplica el estado inicial en el acto  →  el navegador
     congela rAF porque la pestaña está oculta  →  el tween nunca avanza  →
     el elemento se queda en negro para siempre.

   Bastaba con abrir el enlace en una pestaña de fondo, o cambiar de
   pestaña durante la carga, para dejar medio sitio invisible. Ahora, si no
   podemos animar, no escondemos nada: contenido quieto pero legible.
   ========================================================================== */

(function () {
  'use strict';

  const D = window.ASTRUM?.data;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const hasGSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  /* ¿El ticker está corriendo, o el navegador lo tiene congelado? */
  function tickerAlive() {
    return new Promise((resolve) => {
      const f0 = gsap.ticker.frame;
      setTimeout(() => resolve(gsap.ticker.frame > f0), 350);
    });
  }

  let animate = false;

  /* Los reveals quedan a la espera de crearse. Hasta que el preloader no
     haya soltado el scroll, ScrollTrigger no mide bien y los valores de
     inicio se calculan sobre una página bloqueada. */
  let buildWhenUnlocked = null;
  function onScrollUnlocked() { buildWhenUnlocked?.(); buildWhenUnlocked = null; }

  /* ==================================================================== */
  /*  Lenis: scroll suave, sincronizado con ScrollTrigger                   */
  /* ==================================================================== */

  let lenis = null;

  function initLenis() {
    if (!animate || !window.Lenis) return;
    lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      syncTouch: false
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // Otros módulos (el drawer) necesitan bloquear el scroll.
  window.ASTRUM.scroll = {
    stop()  { lenis ? lenis.stop() : (document.documentElement.style.overflow = 'clip'); },
    start() { lenis ? lenis.start() : (document.documentElement.style.overflow = ''); },
    to(target, opts) {
      const el = target instanceof HTMLElement ? target : $(target);
      if (lenis) lenis.scrollTo(el || target, { offset: -80, duration: 1.2, ...opts });
      else el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  };

  /* ==================================================================== */
  /*  Los revelados                                                         */
  /* ==================================================================== */

  function buildReveals() {
    const EASE = 'expo.out';

    /* Cada línea sube desde detrás de su máscara. */
    $$('[data-line]').forEach((el) => {
      gsap.from(el, {
        yPercent: 108,
        duration: 1.25,
        ease: EASE,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });

    /* Entrada con un poco de desplazamiento. */
    $$('[data-reveal]').forEach((el) => {
      gsap.from(el, {
        y: 28,
        opacity: 0,
        duration: 1.1,
        ease: EASE,
        scrollTrigger: { trigger: el, start: 'top 90%', once: true }
      });
    });

    /* Solo opacidad, para bloques grandes. */
    $$('[data-fade]').forEach((el) => {
      gsap.from(el, {
        opacity: 0,
        duration: 1.2,
        ease: EASE,
        scrollTrigger: { trigger: el, start: 'top 92%', once: true }
      });
    });

    /* Logotipo del hero: entra desde abajo, sin depender del scroll. */
    const heroLogo = $('.hero__logo text');
    if (heroLogo) {
      gsap.from(heroLogo, {
        yPercent: 40,
        opacity: 0,
        duration: 1.5,
        ease: EASE,
        delay: 0.15
      });
    }

    /* Paralaje del logo: sube y pierde algo de presencia, pero se queda
       legible — es el titular, no una decoración. */
    const logo = $('.hero__logo');
    if (logo) {
      gsap.to(logo, {
        yPercent: 10,
        opacity: 0.55,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
      });
    }

    /* Contadores de las stats. */
    $$('#stats [data-count]').forEach((el) => {
      const target = +(el.dataset.target ?? el.dataset.count);
      const obj = { v: 0 };
      gsap.to(obj, {
        v: target,
        duration: 2,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        onUpdate() { el.textContent = D ? D.n(Math.round(obj.v)) : Math.round(obj.v); }
      });
    });

    const footWord = $('.foot__word text');
    if (footWord) {
      gsap.from(footWord, {
        yPercent: 30, opacity: 0, duration: 1.4, ease: EASE,
        scrollTrigger: { trigger: '.foot__word', start: 'top 95%', once: true }
      });
    }
  }

  /* ==================================================================== */
  /*  Red de seguridad                                                      */
  /* ==================================================================== */

  /* Último recurso: si algo se ha quedado en opacidad 0, se muestra.
     Cubre toda la página, no solo el viewport, porque un elemento puede
     haber sido revelado a medias justo al cambiar de pestaña. */
  function rescue() {
    if (!hasGSAP) return;
    let n = 0;
    $$('[data-fade], [data-reveal]').forEach((el) => {
      if (parseFloat(getComputedStyle(el).opacity) > 0.05) return;
      gsap.set(el, { opacity: 1, y: 0, clearProps: 'transform' });
      n++;
    });
    $$('[data-line]').forEach((el) => {
      const tf = getComputedStyle(el).transform;
      if (tf === 'none' || tf === 'matrix(1, 0, 0, 1, 0, 0)') return;
      gsap.set(el, { yPercent: 0 });
      n++;
    });
    if (n) console.info(`[astrum] ${n} elemento(s) rescatados de opacidad 0`);
    ScrollTrigger.refresh();
  }

  document.addEventListener('astrum:ready', () => {
    onScrollUnlocked();
    setTimeout(rescue, 250);
  });
  addEventListener('pageshow', () => { onScrollUnlocked(); setTimeout(rescue, 250); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(rescue, 250);
  });
  // Y una inspección periódica barata por si algo se atasca más tarde.
  setInterval(() => {
    if (!document.hidden) rescue();
  }, 4000);

  /* ==================================================================== */
  /*  Nav: fondo al despegar                                                 */
  /* ==================================================================== */

  (function nav() {
    const el = $('#nav');
    if (!el) return;
    const set = () => el.classList.toggle('is-stuck', window.scrollY > 24);
    addEventListener('scroll', set, { passive: true });
    set();
  })();

  /* ==================================================================== */
  /*  Marquee: acelera al hacer scroll y vuelve a la calma                   */
  /* ==================================================================== */

  /* OJO con cómo se hace. La versión anterior cambiaba `animation-duration`
     en cada scroll. Eso es un error grave: al cambiar la duración de una
     animación CSS en marcha, el navegador recalcula dónde está y da un
     salto visible. Con la rueda, el marquee pegaba tirones.

     Ahora la duración se fija UNA vez y lo que se anima es el
     `animation-play-state`... no: lo que se anima es el transform con
     GSAP, que interpola de forma continua y no reinicia nada.            */

  (function marquee() {
    if (!animate) return;
    const el = $('.marquee');
    if (!el) return;

    const tracks = $$('.marquee__track', el);
    if (!tracks.length) return;

    // El ancho de una vuelta completa: el track se desplaza -100% de sí mismo.
    const loop = () => {
      tracks.forEach((t) => {
        t._an?.kill();
        const dist = t.scrollWidth || 1;
        t._an = gsap.fromTo(
          t,
          { xPercent: 0 },
          {
            xPercent: -100,
            duration: dist / 55,      // px por segundo constante
            ease: 'none',
            repeat: -1
          }
        );
      });
    };
    loop();
    addEventListener('resize', loop, { passive: true });

    /* Pausa al pasar el ratón. Con CSS no se podía (ya no hay animación
       CSS), así que se baja el timeScale a 0 y se sube al salir. */
    el.addEventListener('pointerenter', () => {
      tracks.forEach((t) => t._an?.pause());
    });
    el.addEventListener('pointerleave', () => {
      tracks.forEach((t) => t._an?.resume());
    });

    /* Al hacer scroll solo cambiamos la VELOCIDAD, no la posición: GSAP
       ajusta timeScale de forma continua, así que no hay saltos. */
    let vel = 0;
    let lastY = window.scrollY;
    let decayRaf = 0;

    addEventListener('scroll', () => {
      const y = window.scrollY;
      const d = Math.abs(y - lastY);
      lastY = y;
      vel = Math.min(vel + d * 0.02, 2.6);
      if (!decayRaf) decayRaf = requestAnimationFrame(relax);
    }, { passive: true });

    function relax() {
      vel *= 0.94;
      tracks.forEach((t) => t._an && t._an.timeScale(1 + vel));
      if (vel < 0.01) {
        tracks.forEach((t) => t._an && t._an.timeScale(1));
        decayRaf = 0;
        return;
      }
      decayRaf = requestAnimationFrame(relax);
    }
  })();

  /* Sin GSAP —o sin animación— el marquee sigue moviéndose con la
     animación CSS. Antes vivía solo aquí; al pasarlo a GSAP para poder
     acelerar sin saltos, hay que dejar esta vuelta atrás o el marquee
     se queda congelado en los navegadores sin animación. */
  (function marqueeFallback() {
    const el = $('.marquee');
    if (!el || animate) return;
    el.classList.add('marquee--css');
  })();

  /* ==================================================================== */
  /*  Arranque                                                              */
  /* ==================================================================== */

  tickerAlive().then((alive) => {
    // Si no podemos animar, no escondemos nada. Contenido quieto > invisible.
    animate = hasGSAP && alive && !reduce;
    document.documentElement.classList.add(animate ? 'gsap-ready' : 'no-anim');

    if (!animate) {
      // Sin animación, los contadores muestran su valor final directamente.
      $$('#stats [data-count]').forEach((el) => {
        el.textContent = D ? D.n(+(el.dataset.target ?? el.dataset.count)) : el.dataset.count;
      });
      return;
    }

    initLenis();

    /* No creamos los triggers hasta que el scroll esté libre. Mientras el
       preloader bloquea con overflow:clip, ScrollTrigger mide sobre una
       página sin scroll y coloca mal todos los puntos de inicio: los
       elementos nunca entran en el rango y se quedan invisibles. */
    const construir = () => {
      buildReveals();
      ScrollTrigger.refresh();
      rescue();
    };
    if (document.documentElement.style.overflow === 'clip') {
      buildWhenUnlocked = construir;
    } else {
      construir();
    }

    let t;
    addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => { ScrollTrigger.refresh(); lenis?.resize(); }, 180);
    }, { passive: true });
  });
})();
