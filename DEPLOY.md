# Deployment

**Producción:** https://zenithstudio.qzz.io/
**Alojamiento:** GitHub Pages, dominio propio, DNS en Cloudflare
**Build:** ninguno. Sitio 100% estático.

---

## ⚠ GitHub Pages no soporta `_headers`

El archivo `_headers` del repo lo leen **Netlify** y **Cloudflare Pages**.
En GitHub Pages **no hace nada**: es un archivo más que se sirve como texto.

Eso significa que en producción **no hay CSP ni cabeceras de seguridad**.
No es grave para este sitio —todo el JS es tuyo y los CDNs son de confianza—
pero conviene saberlo. Si algún día quieres las cabeceras, tienes dos vías:

1. **Activar el proxy naranja de Cloudflare.** Ahora el DNS está en modo
   *DNS only* (los A apuntan a `185.199.108-111.153`, que son IPs de GitHub).
   Si en Cloudflare cambias esos registros a *Proxied*, el tráfico pasa por
   Cloudflare y ya puedes añadir cabeceras con **Transform Rules** o un Worker.
2. **Migrar el alojamiento** a Cloudflare Pages o Netlify, que sí leen
   `_headers`. El sitio no necesita ningún cambio para moverse.

Mientras tanto, `_headers` se queda en el repo por si mudas de hosting.

---

## Publicar

El repo que GitHub Pages sirve tiene que contener el sitio. Dos opciones:

### A) El repo ES el sitio (recomendado)

```bash
cd astrum-smp
git init
git add .
git commit -m "AstrumSMP: rebuild del sitio"
git branch -M main
git remote add origin https://github.com/1Luiisssss/<TU-REPO>.git
git push -u origin main
```

Luego en el repo: **Settings → Pages → Source: Deploy from a branch →
`main` / `/ (root)`**, y en **Settings → Pages → Custom domain**:
`zenithstudio.qzz.io`.

### B) El repo tiene otra cosa y el sitio va en `/docs`

```bash
cp -r astrum-smp/* TU-REPO/docs/
```

Y en **Settings → Pages → Source: `main` / `/docs`**.

---

## Cloudflare DNS

Estado actual, correcto y funcionando:

| Tipo | Nombre | Apunta a | Proxy |
|---|---|---|---|
| A | `zenithstudio` | `185.199.108.153` | DNS only |
| A | `zenithstudio` | `185.199.109.153` | DNS only |
| A | `zenithstudio` | `185.199.110.153` | DNS only |
| A | `zenithstudio` | `185.199.111.153` | DNS only |

Son las cuatro IPs de GitHub Pages. **No las toques** — si las cambias o
activas el proxy naranja sin ajustar nada, el SSL se rompe.

`qzz.io` es un DNS dinámico gratuito: si el subdominio es tuyo, ya tienes el
control. El certificado de GitHub se emite para `zenithstudio.qzz.io`
automáticamente en cuanto apuntas el CNAME/los A y activas el dominio
personalizado. HTTPS ya está activo y verificado.

---

## Orden de actualización de contenido

Casi todo pasa por **un solo archivo**:

| Qué | Dónde |
|---|---|
| Versión, IP, puerto | `js/config.js` → `server` |
| Discord, IG, YouTube, Modrinth | `js/config.js` → `links` |
| IGN, capa | `js/config.js` → `author` |
| Lista de mods | `js/data.js` → `MODS` |
| Blueprints publicados | `js/data.js` → `BLUEPRINTS` → `ready: true` |
| Colores, tipografía | `css/main.css` → `:root` |
| Textos de las secciones | `index.html` |

---

## Pendientes

- [x] **Dominio** — `canonical`, `og:url`, `og:image`, `twitter:image`,
      `sitemap.xml`, `robots.txt` y el JSON-LD apuntan a
      `https://zenithstudio.qzz.io/`.
- [x] **Versión** — el sitio iba a `1.12.2` y el ping devolvía `1.17.1`.
      Confirmado que la migración está hecha: copy, roadmap y OG a `1.17.1`.
      Para el próximo salto, `js/config.js` → `server.version`.
- [ ] **CORS en Railway** — `astrumsmp-stats.up.railway.app/stats.json` no
      manda `Access-Control-Allow-Origin`, así que el navegador lo bloquea y
      la web usa los valores de respaldo. Hay ejemplo abajo.
- [ ] **Blueprints** — los 9 están en `ready: false`. Pon `true` en los que
      hayas subido al repo.
- [ ] **Texturas** — las 20 de `img/blocks/` vienen de un paquete de recursos
      de Mojang. Revisa que la redistribución en tu web está permitida; si
      publicas el pack, enlaza a Modrinth en vez de servir los ficheros.

---

## CORS en el endpoint de stats

Tu servicio de Railway tiene que mandar `Access-Control-Allow-Origin` o el
navegador bloquea la petición y la web cae a los valores de respaldo del
HTML (funciona, pero no se actualiza).

Con FastAPI:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://zenithstudio.qzz.io"],
    allow_methods=["GET"],
)
```

Con Express:

```js
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://zenithstudio.qzz.io');
  next();
});
```

**Importante:** el dominio va con `https://` y **sin barra final**.

Mientras no esté resuelto, cambia los números a mano en
`index.html` (atributo `data-count`) o en `js/config.js` → `statsFallback`.

---

## Notas de caché

`robots.txt` y `sitemap.xml` los lee GitHub Pages sin problema. En el
`Content-Type` de `sitemap.xml` sirve `application/xml`, que es lo que
esperan los buscadores.

Si tras publicar ves una versión antigua, es caché de GitHub Pages o del
navegador: prueba en incógnito o `Ctrl+Shift+R`.
