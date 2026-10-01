/* ==========================================================================
   config.js — única fuente de verdad del sitio.
   Cambia algo aquí y cambia en todo el sitio.
   ========================================================================== */

window.ASTRUM = {
  /* --- Servidor ------------------------------------------------------- */
  server: {
    host: 'astrum.qzz.io',
    port: 25565,
    version: '1.17.1',
    platform: 'Java',
    edition: 'Java Edition'
  },

  /* --- Enlaces -------------------------------------------------------- */
  links: {
    discord:   'https://discord.gg/QEz9dRVVag',
    instagram: 'https://www.instagram.com/1luiissssss/',
    youtube:   'https://www.youtube.com/@r4iinClips',
    modrinth:  'https://modrinth.com/user/1Luiiissss',
    resourcepack: 'https://modrinth.com/resourcepack/1luiissss-vanilla',
    namemc:    'https://namemc.com/profile/1Luiissss',
    repo:      'https://github.com/1Luiisssss/astrum-smp',
    raw:       'https://raw.githubusercontent.com/1Luiisssss/astrum-smp/main/blueprints'
  },

  /* --- APIs ------------------------------------------------------------ */
  api: {
    /* mcstatus.io: status del servidor + favicon. CORS abierto. */
    status:  'https://api.mcstatus.io/v2/status/java',
    /* Pipeline propio en Railway: exporta las stats del mundo. */
    stats:   'https://astrumsmp-stats.up.railway.app',
    /* Modrinth: iconos de los mods planificados. */
    modrinth: 'https://api.modrinth.com/v2'
  },

  /* --- Identidad ------------------------------------------------------- */
  author: {
    username: '1Luiissss',
    mcUsername: '1Luiissss',  // editable si tu IGN ≠ tu usuario de GitHub
    /* Poner a true solo si tienes capa equipada. Si está en false el sitio
       ni lo intenta: sondarlo en cada carga solo produce un 404 y errores
       de red en la consola. */
    hasCape: false
  },

  /* --- Comportamiento -------------------------------------------------- */
  pollMs: 60_000,   // cada cuánto se reconsulta el estado del servidor
  statsFallback: {
    diasMundo: 5349,
    whitelist: 1,
    bloquesMinados: 153883,
    muertes: 4
  }
};
