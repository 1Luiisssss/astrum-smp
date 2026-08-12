/* ======================================================================
   ASTRUM SMP — Techno-Brutalism Editorial
   Vanilla JS only. Integrations: mcsrvstat.us (server status),
   Modrinth API (mod/texture icons, cached in localStorage), blueprint
   HEAD-check against GitHub raw.
   ====================================================================== */
(() => {
  'use strict';

  // Evita que el navegador "recuerde" la posición de scroll al recargar
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('load', () => {
    if (!window.location.hash) window.scrollTo(0, 0);
  });

  /* ----------------------------------------------------------------
     CONFIG — edita solo estas constantes para actualizar datos reales
     ---------------------------------------------------------------- */
  const SERVER_ADDRESS = 'mc.hackos.dev:27015';
  const MODRINTH_USER = '1Luiiissss';
  // Único lugar a cambiar cuando subas el repo real de blueprints
  // (antes había que reemplazarlo a mano 9 veces dentro del HTML).
  const BLUEPRINT_REPO_BASE = 'https://raw.githubusercontent.com/1Luiisssss/astrum-smp/main/blueprints/';

  const BLUEPRINTS = [
    { cat: 'Granja', title: 'Granja de Bambú', desc: 'Producción automática de bambú — ideal para combustible de hornos y compostaje rápido.', files: [{ label: 'Descargar .litematic', file: 'granja-bambu.litematic' }] },
    { cat: 'Granja', title: 'Granja de Trueque (Piglins)', desc: 'Sistema de trueque con piglins para oro, perlas de ender y más, completamente automatizado.', files: [{ label: 'Descargar .litematic', file: 'granja-trueque-piglins.litematic' }] },
    { cat: 'Automatización', title: 'Sistema de Almacenamiento Kayzm', desc: 'Storage masivo con 3 sistemas de ordenamiento automático por categoría de ítem.', files: [{ label: 'Descargar .litematic', file: 'sistema-almacenamiento-kayzm.litematic' }] },
    { cat: 'Granja', title: 'Granja de Hierro (Overworld)', desc: 'Diseño adaptado para overworld, alta tasa de producción sostenida de hierro.', files: [{ label: 'Descargar .litematic', file: 'granja-hierro-overworld.litematic' }] },
    { cat: 'Automatización', title: 'Cargador de Piglins', desc: 'Transporta y posiciona piglins automáticamente hacia la zona de trueque.', files: [{ label: 'Descargar .litematic', file: 'cargador-piglins.litematic' }] },
    { cat: 'Automatización', title: 'Almacenamiento de Shulkers', desc: 'Bodega compacta para cajas shulker, acceso rápido y organizado.', files: [{ label: 'Descargar .litematic', file: 'almacenamiento-shulker.litematic' }] },
    { cat: 'Granja', title: 'Granja de XP y Oro', desc: 'Diseño enfocado en experiencia y oro de forma eficiente y continua.', files: [{ label: 'Descargar .litematic', file: 'granja-xp-oro.litematic' }] },
    { cat: 'Granja', title: 'Zona de Creepers + Recolección de Pólvora', desc: 'Sistema completo: área de spawn controlado de creepers junto con la recolección automática de la pólvora que sueltan.', files: [
        { label: 'Descargar zona de generación', file: 'zona-generacion-creepers.litematic' },
        { label: 'Descargar zona de recolección', file: 'zona-recoleccion-polvora.litematic' },
      ] },
  ];

  /* ----------------------------------------------------------------
     PRELOADER — contador 00→100 + barra, luego translateY(-100%)
     ---------------------------------------------------------------- */
  (function initPreloader() {
    const el = document.getElementById('preloader');
    const countEl = document.getElementById('preloaderCount');
    const fillEl = document.getElementById('preloaderFill');
    if (!el) return;

    document.documentElement.style.overflow = 'hidden';
    const duration = 1400;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 2);
      const value = Math.floor(eased * 100);
      countEl.textContent = String(value).padStart(2, '0');
      fillEl.style.width = `${eased * 100}%`;
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        finish();
      }
    }
    requestAnimationFrame(tick);

    function finish() {
      // Pequeño respiro para que el 100 se alcance a leer antes de la cortina
      setTimeout(() => {
        el.classList.add('is-done');
        document.documentElement.style.overflow = '';
        setTimeout(() => el.remove(), 900);
      }, 200);
    }

    // Failsafe: si algo se traba, no dejar al usuario atrapado
    setTimeout(finish, 4000);
  })();

  /* ----------------------------------------------------------------
     SCROLL REVEAL
     ---------------------------------------------------------------- */
  const revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  /* ----------------------------------------------------------------
     NAV — glass-free glow-free scroll state + mobile menu
     ---------------------------------------------------------------- */
  const nav = document.getElementById('siteNav');
  const onNavScroll = () => {
    if (window.scrollY > 30) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');
  };
  onNavScroll();
  window.addEventListener('scroll', onNavScroll, { passive: true });

  const burger = document.getElementById('navBurger');
  const mobileMenu = document.getElementById('navMobile');
  if (burger && mobileMenu) {
    burger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(isOpen));
    });
    mobileMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ----------------------------------------------------------------
     MODRINTH CACHE — localStorage + TTL 6h, con fallback a cache vieja
     ---------------------------------------------------------------- */
  const ModrinthCache = {
    TTL_MS: 6 * 60 * 60 * 1000,
    read(key) {
      try {
        const raw = localStorage.getItem(`mr_cache:${key}`);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },
    write(key, data) {
      try { localStorage.setItem(`mr_cache:${key}`, JSON.stringify({ data, timestamp: Date.now() })); }
      catch { /* localStorage no disponible: seguimos sin cache */ }
    },
    isFresh(entry) { return !!entry && (Date.now() - entry.timestamp) < ModrinthCache.TTL_MS; },
    async fetchJSON(key, url) {
      const cached = ModrinthCache.read(key);
      if (ModrinthCache.isFresh(cached)) return cached.data;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Modrinth API respondió ${res.status}`);
        const data = await res.json();
        ModrinthCache.write(key, data);
        return data;
      } catch (err) {
        if (cached) { console.warn(`Modrinth API falló, usando cache para "${key}":`, err); return cached.data; }
        throw err;
      }
    },
  };

  /* ----------------------------------------------------------------
     SERVER STATUS — mcsrvstat.us (nav pill + dossier)
     ---------------------------------------------------------------- */
  (async function loadServerStatus() {
    const dotBig = document.getElementById('serverStatusDot');
    const textBig = document.getElementById('serverStatusText');
    const playersEl = document.getElementById('serverStatusPlayers');
    const versionEl = document.getElementById('serverStatusVersion');
    const dotNav = document.getElementById('navStatusDot');
    const textNav = document.getElementById('navStatusText');

    const setState = (dotClass, label, players, version) => {
      [dotBig, dotNav].forEach((d) => { if (d) d.className = `dot ${dotClass}`; });
      if (textBig) textBig.textContent = label;
      if (textNav) textNav.textContent = label;
      if (playersEl) playersEl.textContent = players ?? '—';
      if (versionEl) versionEl.textContent = version ?? '—';
    };

    try {
      const res = await fetch(`https://api.mcsrvstat.us/3/${SERVER_ADDRESS}`);
      if (!res.ok) throw new Error(`mcsrvstat.us respondió ${res.status}`);
      const data = await res.json();

      if (data.online) {
        const online = data.players?.online ?? 0;
        const max = data.players?.max ?? '?';
        setState('dot--online', 'Servidor Online', `${online} / ${max}`, data.version || '—');
      } else {
        setState('dot--offline', 'Servidor Offline', '—', '—');
      }
    } catch (err) {
      console.warn('No se pudo consultar el estado del servidor:', err);
      setState('dot--unknown', 'Estado no disponible', '—', '—');
    }
  })();

  /* ----------------------------------------------------------------
     MOD ICONS — Modrinth v2/projects, oculta el ícono si el slug no existe
     ---------------------------------------------------------------- */
  (async function loadModIcons() {
    const slots = Array.from(document.querySelectorAll('.icon-slot[data-slug]'));
    const slugs = slots.map((el) => el.dataset.slug);
    if (!slugs.length) return;

    try {
      const idsParam = encodeURIComponent(JSON.stringify(slugs));
      const projects = await ModrinthCache.fetchJSON(
        `mod-icons:${slugs.join(',')}`,
        `https://api.modrinth.com/v2/projects?ids=${idsParam}`
      );
      const bySlug = {};
      projects.forEach((p) => { bySlug[p.slug] = p; });

      slots.forEach((slot) => {
        const project = bySlug[slot.dataset.slug];
        const img = slot.querySelector('img');
        if (project && project.icon_url && img) {
          img.src = project.icon_url;
          img.alt = project.title || slot.dataset.slug;
        } else {
          slot.style.display = 'none';
        }
      });
    } catch (err) {
      console.warn('No se pudieron cargar los íconos de Modrinth:', err);
      slots.forEach((slot) => { slot.style.display = 'none'; });
    }
  })();

  const modsToggleBtn = document.getElementById('modsToggleBtn');
  const modsExtraGrid = document.getElementById('modIconGridExtra');
  if (modsToggleBtn && modsExtraGrid) {
    modsToggleBtn.addEventListener('click', () => {
      const isOpening = !modsExtraGrid.classList.contains('open');
      modsExtraGrid.classList.toggle('open');
      modsToggleBtn.textContent = isOpening ? 'Ver menos mods' : 'Ver más mods';
    });
  }

  /* ----------------------------------------------------------------
     TEXTURE PACKS — todos los resourcepacks publicados en Modrinth
     ---------------------------------------------------------------- */
  (async function loadTexturePacks() {
    const grid = document.getElementById('textureGrid');
    if (!grid) return;

    try {
      const projects = await ModrinthCache.fetchJSON(
        `texture-packs:${MODRINTH_USER}`,
        `https://api.modrinth.com/v2/user/${MODRINTH_USER}/projects`
      );
      const packs = projects.filter((p) => p.project_type === 'resourcepack');

      if (!packs.length) {
        grid.innerHTML = '<p class="icon-slot--loading">Aún no hay texture packs publicados.</p>';
        return;
      }

      grid.innerHTML = '';
      packs.forEach((pack) => {
        const link = document.createElement('a');
        link.href = `https://modrinth.com/resourcepack/${pack.slug}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = pack.title;
        link.className = 'icon-slot';

        const img = document.createElement('img');
        img.src = pack.icon_url || '';
        img.alt = pack.title;
        img.loading = 'lazy';

        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = pack.title;

        link.append(img, label);
        grid.appendChild(link);
      });
    } catch (err) {
      console.warn('No se pudieron cargar los texture packs de Modrinth:', err);
      grid.innerHTML = '<p class="icon-slot--loading">No se pudieron cargar los texture packs.</p>';
    }
  })();

  /* ----------------------------------------------------------------
     BLUEPRINTS — genera las filas desde BLUEPRINTS y verifica los
     links con HEAD contra GitHub raw (evita mandar a error 404 genérico)
     ---------------------------------------------------------------- */
  (function renderBlueprints() {
    const list = document.getElementById('blueprintList');
    if (!list) return;

    const svgArrow = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v13m0 0l-5-5m5 5l5-5M4 20h16" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    BLUEPRINTS.forEach((bp, i) => {
      const row = document.createElement('div');
      row.className = 'bp-row';

      const num = document.createElement('span');
      num.className = 'bp-row__num';
      num.textContent = String(i + 1).padStart(2, '0');

      const body = document.createElement('div');
      body.className = 'bp-row__body';
      const cat = document.createElement('span');
      cat.className = 'bp-row__cat';
      cat.textContent = bp.cat;
      const title = document.createElement('h3');
      title.className = 'bp-row__title';
      title.textContent = bp.title;
      const desc = document.createElement('p');
      desc.className = 'bp-row__desc';
      desc.textContent = bp.desc;
      body.append(cat, title, desc);

      const links = document.createElement('div');
      links.className = 'bp-row__links';
      bp.files.forEach((f) => {
        const a = document.createElement('a');
        a.href = BLUEPRINT_REPO_BASE + f.file;
        a.setAttribute('download', '');
        a.innerHTML = `<span class="bp-link-label">${f.label}</span>${svgArrow}`;
        links.appendChild(a);
        checkBlueprintLink(a);
      });

      row.append(num, body, links);
      list.appendChild(row);
    });
  })();

  function checkBlueprintLink(link) {
    const url = link.getAttribute('href');
    fetch(url, { method: 'HEAD' })
      .then((res) => { if (!res.ok) throw new Error(`Status ${res.status}`); })
      .catch((err) => {
        console.warn(`Blueprint no disponible todavía: ${url}`, err);
        link.removeAttribute('href');
        link.removeAttribute('download');
        link.classList.add('is-disabled');
        const label = link.querySelector('.bp-link-label');
        if (label) label.textContent = 'Próximamente';
      });
  }

  /* ----------------------------------------------------------------
     MODALES — Requisitos / Changelog
     ---------------------------------------------------------------- */
  function wireModal(modalId, openTriggerIds, closeId) {
    const modal = document.getElementById(modalId);
    const closeBtn = document.getElementById(closeId);
    const triggers = openTriggerIds.map((id) => document.getElementById(id)).filter(Boolean);
    if (!modal || !triggers.length) return;

    const open = () => modal.classList.add('is-open');
    const close = () => modal.classList.remove('is-open');

    triggers.forEach((btn) => btn.addEventListener('click', open));
    if (closeBtn) closeBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }
  wireModal('requirementsModal', ['requirementsBtn'], 'requirementsClose');
  wireModal('changelogModal', ['changelogBtn'], 'changelogClose');

  /* ----------------------------------------------------------------
     FOOTER YEAR
     ---------------------------------------------------------------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
