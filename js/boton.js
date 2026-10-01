/* ==========================================================================
   boton.js — el borde de los botones se dibuja solo al pasar por encima.

   La idea: un SVG con un <rect> de la misma medida que el botón, dibujado
   encima con `stroke`. Con `stroke-dasharray` igual al perímetro y
   `stroke-dashoffset` al mismo valor, la línea no se ve; al bajar el
   offset a 0, la línea recorre el contorno entero, como si alguien lo
   estuviera dibujando.

   POR QUÉ UN SVG Y NO UN BORDOR CSS
   Un `border` no se puede "dibujar": no tiene longitud. Lo más parecido
   con CSS puro es revelar una máscara, y para una píldora el contorno no
   es un segmento sino cuatro curvas: no sale limpio. El SVG sí tiene
   longitud, así que el trazo es exacto.

   POR QUÉ NO SE MIDE CON getTotalLength()
   Porque en un <defs>, o en un SVG todavía sin tamaño, devuelve 0. Aquí
   el SVG está a la vista y mide lo mismo que el botón, pero no hace falta
   arriesgarse: un rectángulo de w × h con las esquinas redondeadas a
   h/2 (que es una píldora) tiene un perímetro que se sabe de antemano:

       dos rectos de (w - h)  +  un círculo de radio h/2

   Es aritmética, no medición. Si algún día el radio deja de ser la mitad
   de la altura, el dibujo se descentrará un poco, pero no se-romperá.

   Si el JS no corre, el botón conserva su borde CSS de siempre. Nada
   desaparece: esto solo añade una capa encima.
   ========================================================================== */

(function () {
  'use strict';

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ANCHO = 1.5;          // grosor del trazo, en px de usuario

  /** Perímetro de una píldora de w × h con radio h/2. */
  function perimetro(w, h) {
    return 2 * (w - h) + Math.PI * h;
  }

  /**
   * Prepara el anillo de un botón: mide el botón, ajusta el viewBox del
   * SVG al píxel (para que no haya escalado ni deformación de la esquina)
   * y deja el trazo invisible.
   */
  function ajustar(boton) {
    const svg = boton.querySelector('.btn__ring');
    if (!svg) return;
    const rect = svg.querySelector('rect');
    if (!rect) return;

    const caja = boton.getBoundingClientRect();
    // Redondeo al píxel: un viewBox con decimales produce trazos
    // medio píxel de ancho y se ven Double los bordes.
    const w = Math.round(caja.width);
    const h = Math.round(caja.height);
    if (w < 8 || h < 8) return;      // botón oculto todavía; se repitirá

    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    rect.setAttribute('x', ANCHO / 2);
    rect.setAttribute('y', ANCHO / 2);
    rect.setAttribute('width', Math.max(0, w - ANCHO));
    rect.setAttribute('height', Math.max(0, h - ANCHO));
    rect.setAttribute('rx', (h - ANCHO) / 2);
    rect.setAttribute('stroke-width', ANCHO);

    const L = perimetro(w, h);
    rect.style.strokeDasharray = String(L);
    rect.style.strokeDashoffset = String(L);
  }

  function preparar() {
    const botones = [...document.querySelectorAll('.btn')];
    if (!botones.length) return;

    botones.forEach((b) => {
      // El SVG lo pone el JS, para no tener que escribirlo en cada
      // <a class="btn"> del HTML.
      if (!b.querySelector('.btn__ring')) {
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'btn__ring');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const rect = document.createElementNS(NS, 'rect');
        svg.appendChild(rect);
        b.appendChild(svg);
      }
      ajustar(b);
    });
  }

  /* --- Cuándo volver a medir -------------------------------------------
     La medida depende del texto y del ancho disponible, así que hay que
     repetirla cuando cambie cualquiera de las dos cosas. */
  let pendiente = 0;
  function volverAMedir() {
    if (pendiente) return;
    pendiente = requestAnimationFrame(() => {
      pendiente = 0;
      preparar();
    });
  }

  if (document.fonts?.ready) document.fonts.ready.then(preparar, preparar);
  addEventListener('resize', volverAMedir, { passive: true });
  // Los botones anidados en tarjetas que cambian de ancho (la galería, las
  // rejillas responsivas) no disparan un resize de la ventana.
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(volverAMedir);
    document.querySelectorAll('.btn').forEach((b) => ro.observe(b));
  }

  preparar();

  /* Con menos movimiento no hay línea que recorra nada: el borde se
     pone entero y ya. El CSS se encarga de saltarse la transición. */
  if (reduce) {
    document.querySelectorAll('.btn__ring rect').forEach((r) => {
      r.style.strokeDashoffset = '0';
    });
  }
})();
