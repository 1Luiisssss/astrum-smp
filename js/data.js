/* ==========================================================================
   data.js — todo lo que viene de la red, en un solo sitio.
   Cada módulo degrada con elegancia: si una API cae, la página sigue viva.
   ========================================================================== */

(function () {
  'use strict';

  const C = window.ASTRUM;
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const fmt = new Intl.NumberFormat('es-ES');
  const n = (v) => (typeof v === 'number' ? fmt.format(v) : v);

  /** Cero a la izquierda, para el contador del preloader. */
  const pad = (v, len = 3) => String(v).padStart(len, '0');

  /* ---------------------------------------------------------------- MOTD */

  const SECT = '\u00A7'; // § — el prefijo de códigos de color de Minecraft

  const MC_COLORS = {
    '0': '#000000', '1': '#0000aa', '2': '#00aa00', '3': '#00aaaa',
    '4': '#aa0000', '5': '#aa00aa', '6': '#ffaa00', '7': '#aaaaaa',
    '8': '#555555', '9': '#5555ff', 'a': '#55ff55', 'b': '#55ffff',
    'c': '#ff5555', 'd': '#ff55ff', 'e': '#ffff55', 'f': '#ffffff'
  };

  /**
   * Traduce el MOTD crudo de Minecraft a nodos DOM con los colores puestos.
   * Se ignoran los códigos de formato (l=negrita, k=obfuscado, r=reset…).
   * Devuelve un elemento, listo para appendChild.
   */
  function mcText(raw) {
    const el = document.createElement('span');
    if (!raw) return el;

    const push = (str) => {
      if (!str) return;
      const last = el.lastChild;
      if (last && last.nodeType === Node.TEXT_NODE) last.textContent += str;
      else el.appendChild(document.createTextNode(str));
    };

    let i = 0;
    while (i < raw.length) {
      if (raw[i] === SECT && i + 1 < raw.length) {
        const col = MC_COLORS[raw[i + 1].toLowerCase()];
        if (col) {
          const span = document.createElement('span');
          span.style.color = col;
          el.appendChild(span);
        }
        i += 2;
        continue;
      }
      const next = raw.indexOf(SECT, i);
      const end = next === -1 ? raw.length : next;
      push(raw.slice(i, end));
      i = end;
    }
    return el;
  }

  /** Quita prefijos tipo "We support: 1.20-1.21" y deja solo el número. */
  function cleanVersion(v) {
    if (!v) return '';
    const m = String(v).match(/(\d+\.\d+(?:\.\d+)?)/);
    return m ? m[1] : String(v).slice(0, 24);
  }

  /* ------------------------------------------------- estado del servidor */

  const status = {
    online: null,
    players: 0,
    max: 0,
    version: C.server.version,
    motd: '',
    favicon: null,

    /** Reconsulta mcstatus.io. Nunca lanza: si falla, deja `online = null`. */
    async refresh() {
      const url = `${C.api.status}/${C.server.host}:${C.server.port}`;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();

        this.online = j.online === true;
        this.players = j.players?.online ?? 0;
        this.max = j.players?.max ?? 0;
        this.version = cleanVersion(j.version?.name_clean || j.version?.name_raw) || C.server.version;
        this.motd = j.motd?.clean || j.motd?.raw || '';
        this.favicon = j.icon || null;
      } catch (err) {
        console.warn('[astrum] status:', err.message);
        this.online = null; // null = desconocido, NO significa "caído"
      }
      this.paint();
      return this;
    },

    paint() {
      const state = this.online === null ? 'unknown' : this.online ? 'online' : 'offline';
      $$('[id$="-pulse"]').forEach((el) => { el.dataset.state = state; });

      const head = this.online === null
        ? 'Sin datos'
        : this.online
          ? (this.max ? `${n(this.players)}/${n(this.max)}` : `${n(this.players)} online`)
          : 'Offline';

      const set = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
      set('#nav-status', head);
      set('#foot-status', this.online === null ? 'Sin datos' : this.online ? 'En línea' : 'Offline');
      set('#live-players', this.online ? n(this.players) : '—');
      set('#hero-players', this.online ? n(this.players) : '—');
      set('#live-version', this.version);
      set('#hero-version', this.version);

      set('#live-updated', this.online === null
        ? 'No se pudo contactar'
        : `Actualizado ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`);

      const motd = $('#live-motd');
      if (motd) {
        motd.textContent = '';
        if (this.motd) motd.appendChild(mcText(this.motd));
        else motd.textContent = this.online ? '—' : 'Servidor no disponible';
      }

      document.dispatchEvent(new CustomEvent('astrum:status', { detail: this }));
    }
  };

  /* ----------------------------------------------------- stats del mundo */

  const stats = {
    data: { ...C.statsFallback },

    async load() {
      // Los data-count del HTML son el respaldo si el pipeline no existe.
      $$('#stats [data-count]').forEach((el) => {
        const k = el.dataset.count;
        this.data[k] = this.data[k] ?? +el.dataset.count;
      });
      try {
        const res = await fetch(`${C.api.stats}/stats.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        for (const [k, v] of Object.entries(j)) {
          if (typeof v === 'number' && k in this.data) this.data[k] = v;
        }
      } catch {
        console.info('[astrum] stats: usando valores del HTML (pipeline sin desplegar)');
      }
      this.paint();
    },

    /** Escribe el objetivo en data-target; el contador lo lee al hacer scroll. */
    paint() {
      $$('#stats [data-count]').forEach((el) => {
        el.dataset.target = this.data[el.dataset.count] ?? +el.dataset.count;
      });
    }
  };

  /* ---------------------------------------------------------------- mods */

  const MODS = [
    'sodium', 'lithium', 'journeymap', 'litematica', 'modmenu', 'architectury-api',
    'badoptimizations', 'c2me-fabric', 'capes', 'carpet-extra', 'carpet-tis-addition',
    'cloth-config', 'continuity', 'entityculling', 'essential', 'exordium',
    'fabric-api', 'carpet', 'fabric-language-kotlin', 'ferrite-core', 'immediatelyfast',
    'inventory-profiles-next', 'krypton', 'libipn', 'libjf', 'malilib', 'minihud',
    'modernfix', 'noisium', 'placeholder-api', 'sodium-extra', 'spark', 'tweakeroo', 'yacl'
  ];

  /* Los iconos viven en `img/mods/`, descargados con
     `python tools/bajar_iconos.py`, no se piden a Modrinth en cada visita.

     Tres razones, en orden de peso: cero peticiones a un tercero en cada
     carga, la rejilla se ve igual sin conexión, y no dependes de que
     Modrinth no te bloquee. Como los ficheros están en el repo, si
     Modrinth cambia un icono hay que volver a correr el script; es un
     cambio consciente, no algo que pase solo.

     `badoptimizations` no tiene icono: el proyecto existe en Modrinth pero
     el autor no ha subido ninguno, así que no hay nada que descargar. Se
     queda con la letra, que es el respaldo de siempre. */
  const iconoMod = (slug) => 'img/mods/' + slug + '.png';

  /* Los que Modrinth no publica con icono. Va en la lista a mano porque el
     contador de abajo dice "N de M con icono": si se pusiera MODS.length
     diria 34 de 34 y seria mentira. Se quita de aqui cuando
     `python tools/bajar_iconos.py` avise de que ya hay icono. */
  const MODS_SIN_ICONO = ['badoptimizations'];

  /* Los texture packs que publica 1Luiiissss. Se piden a Modrinth por
     usuario en vez de hardcodearlos, así que si publicas uno nuevo
     aparece solo, sin tocar nada. Los iconos, igual que los mods: en
     disco. `respaldo` es para cuando la API no responde. */
  const TEXTURAS = {
    usuario: '1Luiiissss',
    // Solo slug y título: la diapositiva enseña el icono y el título
    // grande vive en el encabezado (lo sincroniza syncTitle).
    respaldo: [
      { slug: 'optimized_vanilla', titulo: 'Optimized Vanilla+' },
      { slug: 'reddark-gui',       titulo: 'RedDark Gui' },
      { slug: 'durabilitytools',   titulo: 'DurabilityTools' },
      { slug: '1luiisssss',        titulo: '1Luiisssss' }
    ]
  };

  /* Escapa texto para meterlo en el HTML. Los títulos de los packs
     vienen de la API de Modrinth, que es un tercero: si trajeran un
     `<script>`, sin esto se ejecutaría. */
  const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

  const mods = {
    async load() {
      const wrap = $('#mods');
      if (!wrap) return;

      // Lo consulta el glare effect: con menos movimiento no hay barrido.
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

      /* La letra va SIEMPRE en el HTML, debajo de la imagen. Si el icono
         no existe, se ve la letra; si existe, la tapa. Así no hay un
         hueco vacío cuando un fichero falta, que es lo que pasaba antes:
         la imagen se añadía después y hasta que cargaba se veía un
         cuadrado negro. */
      wrap.innerHTML = MODS.map((slug, i) => `
        <a class="mod" href="https://modrinth.com/mod/${slug}" target="_blank" rel="noopener noreferrer"
           style="--i:${i}"
           data-slug="${slug}" title="${slug} — abrir en Modrinth" aria-label="${slug} en Modrinth">
          <img class="mod__icon" src="${iconoMod(slug)}" alt="" width="128" height="128"
               loading="lazy" decoding="async">
          <span class="mod__init" aria-hidden="true">${slug[0].toUpperCase()}</span>
        </a>`).join('');
      $('#mods-total').textContent = MODS.length;

      /* Barrido de luz inicial sobre la rejilla. Se dispara UNA vez, la
         primera vez que la sección se ve, y no al montar: si no, el
         reflejo cruzaría la pantalla antes de que nadie haya llegado
         hasta ahi. El retardo de cada tarjeta sale de su `--i`. */
      if (!reduce && 'IntersectionObserver' in window) {
        const una = new IntersectionObserver(([e], obs) => {
          if (!e.isIntersecting) return;
          obs.disconnect();
          wrap.classList.add('is-glare');
        }, { threshold: 0.35 });
        una.observe(wrap);
      }

      /* El contador dice "N de M con icono", asi que N sale de la lista de
         los que Modrinth no publica icono, no de lo que se ve. Poner
         MODS.length seria prometer 34 de 34, y hay 33. */
      $('#mods-total').textContent = MODS.length;
      $('#mods-count').textContent = MODS.length - MODS_SIN_ICONO.length;
    }
  };

  /* ------------------------------------------------------------ texturas */

  const texturas = {
    async load() {
      const wrap = $('#textures');
      if (!wrap) return;

      /* Un icono a la vista, que cambia solo cada TEX_T ms. Sin barra, sin
         puntos y sin flechas: solo el título grande de arriba (que sigue
         al carrusel) y el icono.

         La rotación NO se pausa con el ratón: antes lo hacía y parecía
         que se había quedado colgado cuando el cursor descansaba encima.
         Solo se pausa con el foco del teclado (si estás tabulando por el
         enlace, que no te cambie debajo) y con la pestaña oculta. */
      const TEX_T = 5000;
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const titleEl = $('#tex-title');

      let packs = [];
      let idx = 0;
      let timer = 0;
      let enPausa = false;
      let titleTimer = 0;
      let titleGen = 0;

      function pintar(lista) {
        packs = lista;
        if (idx > packs.length - 1) idx = 0;

        wrap.innerHTML = packs.map((p, i) => `
          <a class="tex-slide${i === idx ? ' is-active' : ''}" href="https://modrinth.com/resourcepack/${p.slug}"
             target="_blank" rel="noopener noreferrer"
             title="${esc(p.titulo)} — abrir en Modrinth" aria-label="${esc(p.titulo)} en Modrinth"
             aria-hidden="${i === idx ? 'false' : 'true'}" tabindex="${i === idx ? '0' : '-1'}">
            <span class="tex-slide__frame">
              <img class="tex-slide__icon" src="${iconoMod(p.slug)}" alt="" width="256" height="256"
                   loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async">
            </span>
          </a>`).join('');

        mostrar(idx);
      }

      /* El título grande de la sección sigue al carrusel: si se quedara
         fijo diría un pack mientras la tarjeta enseña otro. El fundido va
         en estilos EN LÍNEA a propósito: el revelado por scroll deja
         `opacity: 1` en línea con gsap.from, y una regla por clase no le
         ganaría nunca. Con menos movimiento no hay fundido, solo el
         cambio de texto (el contenido cambia, no se anima). */
      function syncTitle(texto) {
        if (!titleEl || titleEl.textContent === texto) return;
        if (reduce) { titleEl.textContent = texto; return; }
        const gen = ++titleGen;
        clearTimeout(titleTimer);
        titleEl.style.transition = 'opacity .28s ease';
        titleEl.style.opacity = '0';
        titleTimer = setTimeout(() => {
          if (gen !== titleGen) return;
          titleEl.textContent = texto;
          titleEl.style.opacity = '1';
        }, 290);
      }

      /* Enseña la diapositiva `i` y reprograma el siguiente cambio. */
      function mostrar(i) {
        if (!packs.length) return;
        idx = ((i % packs.length) + packs.length) % packs.length;

        syncTitle(packs[idx].titulo);

        wrap.querySelectorAll('.tex-slide').forEach((s, j) => {
          const activa = j === idx;
          s.classList.toggle('is-active', activa);
          s.setAttribute('aria-hidden', activa ? 'false' : 'true');
          s.setAttribute('tabindex', activa ? '0' : '-1');
        });

        programar();
      }

      function programar() {
        clearTimeout(timer);
        if (reduce || enPausa || document.hidden || packs.length < 2) return;
        timer = setTimeout(() => mostrar(idx + 1), TEX_T);
      }

      /* Pausa solo con el foco del teclado: si estás tabulando por el
         enlace del pack, que no te cambie debajo. El ratón no pausa: la
         rotación sigue aunque el cursor descanse encima. */
      wrap.addEventListener('focusin', () => {
        enPausa = true;
        clearTimeout(timer);
      });
      wrap.addEventListener('focusout', () => {
        enPausa = false;
        mostrar(idx);
      });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) mostrar(idx);
        else clearTimeout(timer);
      });

      // De salida, el respaldo: la sección nunca sale vacía.
      pintar(TEXTURAS.respaldo);

      /* Se consulta a Modrinth para pillar los packs nuevos. Si falla, o
         tardan, o el visitante no tiene red, se queda con el respaldo. La
         sección se ve igual de las dos maneras. */
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(
          `${C.api.modrinth}/user/${TEXTURAS.usuario}/projects`, { signal: ctrl.signal }
        );
        clearTimeout(t);
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const todos = await res.json();
        const frescos = todos
          .filter((p) => p.project_type === 'resourcepack')
          .map((p) => ({
            slug: p.slug,
            titulo: p.title
          }));

        if (frescos.length) pintar(frescos);
      } catch (err) {
        console.info('[astrum] texturas: se muestra el respaldo (' + err.message + ')');
      }
    }
  };
  /* --------------------------------------------------------- blueprints */

  const BLUEPRINTS = [
    { file: 'granja-bambu',                title: 'Granja de bambú',           tag: 'Granja',    ready: false },
    { file: 'granja-trueque-piglins',       title: 'Granja de trueque',        tag: 'Granja',    ready: false },
    { file: 'sistema-almacenamiento-kayzm', title: 'Almacenamiento Kayzm',      tag: 'Logística', ready: false },
    { file: 'granja-hierro-overworld',      title: 'Granja de hierro',          tag: 'Granja',    ready: false },
    { file: 'cargador-piglins',             title: 'Cargador de Piglins',       tag: 'Redstone',  ready: false },
    { file: 'almacenamiento-shulker',       title: 'Almacenamiento de Shulkers', tag: 'Logística', ready: false },
    { file: 'granja-xp-oro',                title: 'Granja de XP y oro',        tag: 'Granja',    ready: false },
    { file: 'zona-generacion-creepers',     title: 'Zona de creepers',          tag: 'Redstone',  ready: false },
    { file: 'zona-recoleccion-polvora',     title: 'Recolección de pólvora',    tag: 'Redstone',  ready: false }
  ];

  function renderBlueprints() {
    const wrap = $('#blueprints');
    if (!wrap) return;
    wrap.innerHTML = BLUEPRINTS.map((b) => `
      <article class="bp">
        <div class="bp__head">
          <h3 class="bp__title">${b.title}</h3>
          <span class="tag">${b.tag}</span>
        </div>
        <span class="bp__file">${b.file}.litematic</span>
        <div class="bp__foot">
          <span class="label">${b.ready ? 'Publicado' : 'Próximamente'}</span>
          ${b.ready
            ? `<a class="btn" href="${C.links.raw}/${b.file}.litematic" download>Descargar</a>`
            : ''}
        </div>
      </article>`).join('');
  }

  /* ---------------------------------------------------------- galería */

  const SLIDES = [
    { img: 'img/screenshots/mundo-01.webp',
      cap: 'Bedrock conseguida mediante un bug — la única reserva del servidor lograda de esta forma.' },
    { img: 'img/screenshots/mundo-02.webp',
      cap: 'Portal del Nether cortado mediante un update suppressor, una técnica que congela las actualizaciones de bloque.' },
    { img: 'img/screenshots/mundo-03.webp',
      cap: 'El primer zombie que apareció en el mundo — llevaba puesta la primera armadura de dios, con todas las protecciones existentes.' },
    { img: 'img/screenshots/mundo-04.webp',
      cap: 'El mismo zombie, de cerca.' },
    { img: 'img/screenshots/mundo-05.webp',
      cap: 'Generación de terreno mal formada: un bloque de hielo apareció flotando ahí, sin ninguna intervención.' },
    { img: 'img/screenshots/mundo-06.webp',
      cap: 'El primer atardecer del servidor, ocurrido aproximadamente en el día 2 o 3.' },
    { img: 'img/screenshots/mundo-07.webp',
      cap: 'Escenario de un bug de duplicación de ítems, típico de la versión 1.12.x.' },
    { img: 'img/screenshots/mundo-08.webp',
      cap: 'El Ender Chest guarda los portales del End conseguidos mediante un bug de una snapshot antigua.' }
  ];

  /* ------------------------------------------------------------ export */

  window.ASTRUM.data = {
    status, stats, mods, texturas, renderBlueprints,
    SLIDES, fmt, n, pad, mcText, cleanVersion,
    $, $$
  };

  status.paint();
  renderBlueprints();
})();
