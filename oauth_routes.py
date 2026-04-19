# ─────────────────────────────────────────────
#  ASTRUM SMP — Discord OAuth2 Routes
#  Añade estas rutas a tu backend.py existente
#  pip install python-jose[cryptography] httpx python-dotenv
# ─────────────────────────────────────────────

import os
import httpx
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse
from jose import JWTError, jwt
from dotenv import load_dotenv

load_dotenv("config.env")

router = APIRouter()

# ─── CONFIG (pon esto en tu .env) ───────────────────────────────
DISCORD_CLIENT_ID     = os.getenv("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
DISCORD_GUILD_ID      = os.getenv("DISCORD_GUILD_ID")   # ID numérico de tu servidor
REDIRECT_URI          = os.getenv("REDIRECT_URI", "http://localhost:8000/auth/callback")
FRONTEND_URL          = os.getenv("FRONTEND_URL", "http://localhost:8000")
JWT_SECRET            = os.getenv("JWT_SECRET", "cambia-esto-por-un-secreto-seguro")
JWT_ALGORITHM         = "HS256"
JWT_EXPIRE_MINUTES    = 60

# ─── DISCORD ENDPOINTS ──────────────────────────────────────────
DISCORD_API      = "https://discord.com/api/v10"
DISCORD_AUTH_URL = "https://discord.com/api/oauth2/authorize"
DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token"

# ─── HELPERS ────────────────────────────────────────────────────
def create_jwt(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

async def get_discord_token(code: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.post(DISCORD_TOKEN_URL, data={
            "client_id":     DISCORD_CLIENT_ID,
            "client_secret": DISCORD_CLIENT_SECRET,
            "grant_type":    "authorization_code",
            "code":          code,
            "redirect_uri":  REDIRECT_URI,
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})
        r.raise_for_status()
        return r.json()

async def get_discord_user(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{DISCORD_API}/users/@me",
            headers={"Authorization": f"Bearer {access_token}"})
        r.raise_for_status()
        return r.json()

async def check_guild_membership(access_token: str) -> bool:
    """Verifica si el usuario está en el servidor usando su propio token."""
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{DISCORD_API}/users/@me/guilds",
            headers={"Authorization": f"Bearer {access_token}"})
        if r.status_code != 200:
            return False
        guilds = r.json()
        return any(g["id"] == DISCORD_GUILD_ID for g in guilds)

# ─── RUTAS ──────────────────────────────────────────────────────

@router.get("/auth/discord")
async def discord_login():
    """
    Redirige al usuario a Discord para autorizar.
    El frontend llama a GET /auth/discord y redirige al usuario.
    """
    params = (
        f"client_id={DISCORD_CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=identify+guilds"  # guilds permite verificar membresía
    )
    return RedirectResponse(f"{DISCORD_AUTH_URL}?{params}")


@router.get("/auth/callback")
async def discord_callback(code: str = None, error: str = None):
    """
    Discord redirige aquí con el código de autorización.
    Intercambiamos el código por un token, verificamos membresía
    y redirigimos al frontend con un JWT.
    """
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}?auth=error&reason=cancelled")

    try:
        # 1. Obtener access token de Discord
        token_data = await get_discord_token(code)
        access_token = token_data["access_token"]

        # 2. Obtener info del usuario
        user = await get_discord_user(access_token)

        # 3. Verificar si está en el servidor
        in_guild = await check_guild_membership(access_token)

        if not in_guild:
            # Usuario autenticó con Discord pero NO está en el servidor
            return RedirectResponse(
                f"{FRONTEND_URL}?auth=error&reason=not_in_guild"
            )

        # 4. Crear JWT con info del usuario
        token = create_jwt({
            "discord_id":       user["id"],
            "discord_username": user["username"],
            "discord_avatar":   user.get("avatar"),
            "verified":         True,
        })

        # 5. Redirigir al frontend con el token
        return RedirectResponse(f"{FRONTEND_URL}?auth=success&token={token}")

    except httpx.HTTPStatusError as e:
        print(f"Discord API error: {e.response.status_code} - {e.response.text}")
        return RedirectResponse(f"{FRONTEND_URL}?auth=error&reason=api_error")
    except Exception as e:
        print(f"OAuth error: {e}")
        return RedirectResponse(f"{FRONTEND_URL}?auth=error&reason=server_error")


@router.get("/auth/verify")
async def verify_token(request: Request):
    """
    El frontend llama a este endpoint con el JWT en el header
    para confirmar que la verificación sigue válida.
    Retorna la info del usuario si el token es válido.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token requerido")

    token = auth_header.split(" ")[1]
    payload = verify_jwt(token)

    return JSONResponse({
        "verified":         payload.get("verified", False),
        "discord_id":       payload.get("discord_id"),
        "discord_username": payload.get("discord_username"),
        "discord_avatar":   payload.get("discord_avatar"),
    })


@router.get("/auth/logout")
async def logout():
    """Simplemente instruye al frontend a borrar el JWT."""
    return JSONResponse({"message": "Logout exitoso. Borra el token del localStorage."})
