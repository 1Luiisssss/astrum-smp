from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from mcrcon import MCRcon
from dotenv import load_dotenv
from oauth_routes import router as auth_router
import os, re, json

load_dotenv("config.env")

RCON_HOST  = os.getenv("RCON_HOST")
RCON_PORT  = int(os.getenv("RCON_PORT"))
RCON_PASS  = os.getenv("RCON_PASSWORD")
API_SECRET = os.getenv("API_SECRET")
API_PORT   = int(os.getenv("API_PORT", 8000))

app = FastAPI(title="Astrum SMP API")

# ─── REGISTRAR RUTAS OAUTH2 ───────────────────────
app.include_router(auth_router)  # ← NUEVO

# ─── CORS: permite que tu web llame al backend ────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Cambia por tu dominio en producción
    allow_methods=["GET", "POST"],  # GET añadido para OAuth2
    allow_headers=["*"],
)

# ─── SERVIR EL HTML ESTÁTICO ──────────────────────
# Esto permite abrir el HTML desde http://localhost:8000
app.mount("/", StaticFiles(directory=".", html=True), name="static")  # ← NUEVO

# ─── MODELO DE DATOS ──────────────────────────────
class WhitelistRequest(BaseModel):
    nick: str
    discord_id: str

# ─── VALIDAR NICK ─────────────────────────────────
def nick_valido(nick: str) -> bool:
    return bool(re.match(r'^[a-zA-Z0-9_]{3,24}$', nick))

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

    try:
        with MCRcon(RCON_HOST, RCON_PASS, port=RCON_PORT) as rcon:
            respuesta = rcon.command(f"whitelist add {req.nick}")
            print(f"✅ Whitelist add {req.nick} | Discord: {req.discord_id} | Respuesta: {respuesta}")

        if "Added" in respuesta or "already" in respuesta.lower():
            return {"ok": True, "mensaje": f"{req.nick} agregado a la whitelist"}
        else:
            return {"ok": False, "mensaje": respuesta}

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

# ─── INICIAR ──────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    print(f"🚀 Backend corriendo en http://0.0.0.0:{API_PORT}")
    print(f"   RCON -> {RCON_HOST}:{RCON_PORT}")
    uvicorn.run("backend:app", host="0.0.0.0", port=API_PORT, reload=False)
