from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from mcrcon import MCRcon
from dotenv import load_dotenv
from oauth_routes import router as auth_router
import os, re, json, httpx

load_dotenv("config.env")

RCON_HOST    = os.getenv("RCON_HOST")
RCON_PORT    = int(os.getenv("RCON_PORT"))
RCON_PASS    = os.getenv("RCON_PASSWORD")
API_SECRET   = os.getenv("API_SECRET")
API_PORT     = int(os.getenv("API_PORT", 8000))
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

app = FastAPI(title="Astrum SMP API")

# ─── REGISTRAR RUTAS OAUTH2 ───────────────────────
app.include_router(auth_router)

# ─── CORS ─────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ─── MODELO DE DATOS ──────────────────────────────
class WhitelistRequest(BaseModel):
    nick: str
    discord_id: str

# ─── VALIDAR NICK ─────────────────────────────────
def nick_valido(nick: str) -> bool:
    return bool(re.match(r'^[a-zA-Z0-9_]{3,24}$', nick))

# ─── SUPABASE HELPERS ─────────────────────────────
def supabase_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

async def discord_ya_registrado(discord_id: str) -> bool:
    """Devuelve True si el discord_id ya tiene un nick registrado."""
    url = f"{SUPABASE_URL}/rest/v1/whitelist?discord_id=eq.{discord_id}&select=id"
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers=supabase_headers())
        return len(r.json()) > 0

async def nick_ya_registrado(nick: str) -> bool:
    """Devuelve True si el nick ya fue registrado por otro usuario."""
    url = f"{SUPABASE_URL}/rest/v1/whitelist?nick=eq.{nick}&select=id"
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers=supabase_headers())
        return len(r.json()) > 0

async def guardar_registro(discord_id: str, nick: str):
    """Guarda el par discord_id + nick en Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/whitelist"
    async with httpx.AsyncClient() as client:
        await client.post(url, json={"discord_id": discord_id, "nick": nick}, headers=supabase_headers())

# ─── ENDPOINT: agregar a whitelist ────────────────
@app.post("/whitelist/add")
async def agregar_whitelist(
    req: WhitelistRequest,
    x_api_secret: str = Header(None)
):
    if x_api_secret != API_SECRET:
        raise HTTPException(status_code=401, detail="No autorizado")

    if not nick_valido(req.nick):
        raise HTTPException(
            status_code=400,
            detail="Nick inválido. Solo letras, números y guión bajo (3-24 caracteres)"
        )

    # ─── BLOQUEO ANTI-ABUSO ───────────────────────
    if await discord_ya_registrado(req.discord_id):
        raise HTTPException(
            status_code=409,
            detail="Ya tienes un nick registrado. No puedes registrar otro."
        )

    if await nick_ya_registrado(req.nick):
        raise HTTPException(
            status_code=409,
            detail="Ese nick ya está registrado por otro usuario."
        )
    # ──────────────────────────────────────────────

    try:
        with MCRcon(RCON_HOST, RCON_PASS, port=RCON_PORT) as rcon:
            respuesta = rcon.command(f"whitelist add {req.nick}")
            print(f"✅ Whitelist add {req.nick} | Discord: {req.discord_id} | Respuesta: {respuesta}")

        # Guardar siempre en Supabase si el RCON no falló
        await guardar_registro(req.discord_id, req.nick)
        print(f"📝 Supabase: {req.nick} guardado correctamente")
        return {"ok": True, "mensaje": f"{req.nick} agregado a la whitelist"}

    except ConnectionRefusedError:
        raise HTTPException(status_code=503, detail="No se pudo conectar al servidor.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── ENDPOINT: estado del servidor ────────────────
@app.get("/status")
async def estado():
    try:
        with MCRcon(RCON_HOST, RCON_PASS, port=RCON_PORT) as rcon:
            lista = rcon.command("list")
        return {"online": True, "jugadores": lista}
    except:
        return {"online": False, "jugadores": "0"}

# ─── ENDPOINT: galería (Supabase) ─────────────────
@app.get("/gallery")
async def get_gallery():
    try:
        url = f"{SUPABASE_URL}/rest/v1/gallery?order=created_at.desc&limit=20"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}"
        }
        async with httpx.AsyncClient() as client:
            r = await client.get(url, headers=headers)
            return JSONResponse(r.json())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── MODELOS TICKETS ──────────────────────────────
class TicketRequest(BaseModel):
    nick: str
    discord_user: str
    tipo: str
    asunto: str
    descripcion: str

class BugRequest(BaseModel):
    nick: str
    categoria: str
    descripcion: str
    coordenadas: str = ""

# ─── ENDPOINT: nuevo ticket (web → Supabase + Discord) ───
@app.post("/tickets/nuevo")
async def nuevo_ticket(
    req: TicketRequest,
    x_api_secret: str = Header(None)
):
    if x_api_secret != API_SECRET:
        raise HTTPException(status_code=401, detail="No autorizado")

    DISCORD_TOKEN  = os.getenv("DISCORD_TOKEN")
    DISCORD_GUILD  = os.getenv("DISCORD_GUILD_ID")
    TICKET_CHANNEL = os.getenv("TICKET_CHANNEL_NAME", "tickets-staff")

    tipo_emojis = {
        "soporte": "🔧", "apelacion": "⚖️",
        "reporte": "🚨", "tecnico": "💻", "otro": "📋"
    }
    emoji = tipo_emojis.get(req.tipo, "📋")

    embed = {
        "title": f"{emoji} Nuevo Ticket — {req.tipo.capitalize()}",
        "color": 0x8B1A1A,
        "fields": [
            {"name": "Nick MC",      "value": f"`{req.nick}`",      "inline": True},
            {"name": "Discord",      "value": req.discord_user,     "inline": True},
            {"name": "Tipo",         "value": req.tipo,             "inline": True},
            {"name": "Asunto",       "value": req.asunto,           "inline": False},
            {"name": "Descripción",  "value": req.descripcion,      "inline": False},
        ],
        "footer": {"text": "Astrum SMP · Web"},
        "timestamp": __import__('datetime').datetime.utcnow().isoformat()
    }

    # Buscar el canal por nombre via Discord API
    try:
        headers_dc = {"Authorization": f"Bot {DISCORD_TOKEN}"}
        async with httpx.AsyncClient() as client:
            # Obtener canales del guild
            r = await client.get(
                f"https://discord.com/api/v10/guilds/{DISCORD_GUILD}/channels",
                headers=headers_dc
            )
            canales = r.json()
            canal = next((c for c in canales if c["name"] == TICKET_CHANNEL and c["type"] == 0), None)
            if not canal:
                raise HTTPException(status_code=404, detail=f"Canal '{TICKET_CHANNEL}' no encontrado")

            # Enviar el embed
            await client.post(
                f"https://discord.com/api/v10/channels/{canal['id']}/messages",
                headers={**headers_dc, "Content-Type": "application/json"},
                json={"embeds": [embed]}
            )
    except HTTPException:
        raise
    except Exception as e:
        # Si Discord falla, igual respondemos ok (ya está en Supabase)
        print(f"[tickets] Discord error: {e}")

    return {"ok": True}

# ─── INICIAR ──────────────────────────────────────
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    print(f"🚀 Backend corriendo en http://0.0.0.0:{API_PORT}")
    print(f"   RCON -> {RCON_HOST}:{RCON_PORT}")
    uvicorn.run("backend:app", host="0.0.0.0", port=API_PORT, reload=False)
