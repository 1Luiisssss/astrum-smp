# AstrumSMP — sitio

**Producción:** https://zenithstudio.qzz.io/
**Servidor de Minecraft:** `astrum.qzz.io` (esto es otra cosa: el juego)

Sitio de un servidor privado de Minecraft. Estático, sin build, sin framework.
Lo único que hay que editar para cambiar algo del servidor es `js/config.js`.

```
npm run serve     # servidor local en http://127.0.0.1:8900
```

Cualquier servidor estático sirve. También vale `python -m http.server 8900`.
Para publicar, ver `DEPLOY.md`.

---

## Estructura

```
index.html               Todo el marcado, semántico y accesible
css/main.css             Un solo archivo. Tokens arriba, componentes abajo
js/
  config.js              ← ÚNICA FUENTE DE VERDAD. Empieza por aquí
  data.js                APIs: estado del server, stats, iconos de Modrinth
  voxel.js               Nube de bloques 3D del hero, en WebGL puro
  skin.js                Visor 3D del skin (skinview3d)
  gallery.js             Coverflow de capturas
  scroll.js              Lenis + GSAP/ScrollTrigger y los revelados
  main.js                Preloader, menú, FAQ, copiar IP, orquestación
img/
  blocks/                20 texturas 16×16 del resource pack (4 KB en total)
  screenshots/           Las 8 capturas del mundo, en WebP
  favicon.svg  og.png  apple-touch-icon.png
tools/
  extract_images.py      Saca capturas del HTML viejo y las pasa a WebP
  gen_brand.py           Genera favicon, apple-touch-icon y la tarjeta OG
```

---

## Cambiar cosas

| Qué | Dónde |
|---|---|
| IP, versión, puerto | `js/config.js` → `server` |
| Discord, Instagram, YouTube, Modrinth | `js/config.js` → `links` |
| Tu usuario de Minecraft | `js/config.js` → `author.mcUsername` |
| Poner la capa en el visor | `js/config.js` → `author.hasCape: true` |
| Blueprints publicados | `js/data.js` → `BLUEPRINTS`, pon `ready: true` |
| Lista de mods | `js/data.js` → `MODS` |
| Textos de las capturas | `js/data.js` → `SLIDES` |
| Valores de stats de respaldo | `js/config.js` → `statsFallback` |
| Cada cuánto se reconsulta el server | `js/config.js` → `pollMs` |
| Colores y tipografía | `css/main.css` → bloque `:root` |

---

## Decisiones técnicas

### El sistema de escala

```css
html { font-size: clamp(15px, 0.55vw + 8.4px, 20px); }
```

Todo el sitio está en `rem`, así que **una sola regla** hace que el diseño
escale como una unidad entre móvil y monitor. No hay un solo `px` de layout.

### Nada depende de JS para ser visible

La clase `.gsap-ready` se añade al `<html>` **solo** cuando confirmamos que GSAP
cargó. La clase `.no-js` se quita en cuanto el JS está listo. Si cualquiera de
los dos falla, el contenido se muestra igualmente — solo se pierde la animación.

### El hero 3D no usa three.js

Para dibujar 20 cubos texturizados, three.js son 670 KB. `js/voxel.js` hace lo
mismo en WebGL puro: **~7 KB, cero peticiones extra**. Además three.js ya no
publica build UMD desde la 0.169, así que el `<script>` clásico directamente no
existe (esto es lo que rompía la primera versión).

- Un atlas 3×3 de las texturas reales del resource pack → una sola textura
- UV mapeadas por celda, con medio téxel de margen para que no haya bleeding
- `IntersectionObserver` para no renderizar con el hero fuera de pantalla
- Si no hay WebGL, el canvas se borra y el hero queda en negro y tipografía

### Las capturas

Estaban embebidas en el HTML como 8 JPEG en base64: 1.07 MB en el propio
`index.html`, que se descargaban **antes** de que el usuario viera nada.
Ahora son WebP en `img/screenshots/`: 0.30 MB, con `loading="lazy"` y solo las
dos primeras en `eager`.

```
0.66 MB (base64)  →  0.30 MB (webp)   ·  54% menos
```

### Los iconos de Modrinth

Modrinth migró sus campos de imagen: `icon` en base64 ya no existe, ahora es
`icon_url` de CDN. Y `/v2/project/{id}/icon` devuelve 404.

Se usa el endpoint masivo `/v2/projects?ids=[…]`: **una sola petición para los
34 mods** en vez de 34 peticiones, que es lo que dispara su rate-limiter.
Las URLs se cachean en `localStorage` una hora.

Los 3 mods sin icono en Modrinth caen a una letra del nombre en vez de a un
spinner infinito.

### El estado del servidor

`api.mcstatus.io` con refresco cada 60 s, solo con la pestaña visible. Si la
consulta falla se marca `unknown`, no `offline` — no es lo mismo y no queremos
enseñar una calumnia sobre nuestro propio servidor.

El MOTD viene con los códigos de color de Minecraft (`§a`, `§l`…) y se traduce
a `<span>` con el color puesto.

### Botón de jugar

```html
minecraft://?addExternalServer=astrum.qzz.io
```

Abre el launcher oficial con un clic. Si en 1.5 s la pestaña no se oculta
—señal de que no hay launcher— el botón degrada a copiar la IP.

### Contraste

Todo el texto pasa AA (4.5:1). Dos ajustes que parecen arbitrarios y no lo son:

- `--fg-faint: #7b7b85` → 4.78:1. Con el gris más oscuro se quedaba en 3.03:1
- Los botones rojos usan `#d81f34` en vez de `#e8233c` → blanco encima pasa de
  4.43:1 (falla) a 5.04:1

Y `--red-text: #ff6b80` para el rojo en texto pequeño: el rojo de marca da
4.51:1, justo al borde.

---

## Pendiente antes de publicar

- [x] **Versión** — el sitio iba a `1.12.2` y el ping devolvía `1.17.1`.
      Confirmado: la migración está hecha. Copy, roadmap y OG actualizados.
      Para el próximo salto, `js/config.js` → `server.version` y el copy.
- [ ] **CORS en Railway** — el endpoint de stats no manda
      `Access-Control-Allow-Origin`. Hay un ejemplo en `DEPLOY.md`.
- [ ] **Dominio** — `canonical`, `og:url` y `sitemap.xml` apuntan a
      `https://zenithstudio.qzz.io/`.
- [ ] **Blueprints** — todos con `ready: false` hasta que subas los archivos.
- [ ] **Texturas** — las 20 de `img/blocks/` vienen de un paquete de recursos.
      Revisa que la redistribución en tu web está permitida.

---

## Licencia de los assets

Las texturas de `img/blocks/` y el resource pack son de Mojang. El sitio de un
servidor de comunidad es el uso habitual y legítimo, pero **no las
redistribuyas** como si fueran tuyas. Si publicas el resource pack, enlaza a
Modrinth en vez de servir los ficheros.
