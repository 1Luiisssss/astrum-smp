# ─────────────────────────────────────────────
#  ASTRUM SMP — Discord + Google OAuth2 Routes
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

# ─── CONFIG ─────────────────────────────────────────────────────
DISCORD_CLIENT_ID     = os.getenv("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
DISCORD_GUILD_ID      = os.getenv("DISCORD_GUILD_ID")
REDIRECT_URI          = os.getenv("REDIRECT_URI", "http://localhost:8000/auth/callback")

GOOGLE_CLIENT_ID      = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET  = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI   = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

FRONTEND_URL          = os.getenv("FRONTEND_URL", "http://localhost:8000")
JWT_SECRET            = os.getenv("JWT_SECRET", "cambia-esto-por-un-secreto-seguro")
JWT_ALGORITHM         = "HS256"
JWT_EXPIRE_MINUTES    = 60

# ─── DISCORD ENDPOINTS ──────────────────────────────────────────
DISCORD_API       = "https://discord.com/api/v10"
DISCORD_AUTH_URL  = "https://discord.com/api/oauth2/authorize"
DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token"

# ─── GOOGLE ENDPOINTS ───────────────────────────────────────────
GOOGLE_AUTH_URL   = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL  = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO   = "https://www.googleapis.com/oauth2/v2/userinfo"

# ─── JWT HELPERS ────────────────────────────────────────────────
def create_jwt(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

# ─── DISCORD HELPERS ────────────────────────────────────────────
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
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{DISCORD_API}/users/@me/guilds",
            headers={"Authorization": f"Bearer {access_token}"})
        if r.status_code != 200:
            return False
        guilds = r.json()
        return any(g["id"] == DISCORD_GUILD_ID for g in guilds)

# ─── GOOGLE HELPERS ─────────────────────────────────────────────
async def get_google_token(code: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.post(GOOGLE_TOKEN_URL, data={
            "client_id":     GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "grant_type":    "authorization_code",
            "code":          code,
            "redirect_uri":  GOOGLE_REDIRECT_URI,
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})
        r.raise_for_status()
        return r.json()

async def get_google_user(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(GOOGLE_USERINFO,
            headers={"Authorization": f"Bearer {access_token}"})
        r.raise_for_status()
        return r.json()

# ════════════════════════════════════════════════════════════════
#  RUTAS — DISCORD
# ════════════════════════════════════════════════════════════════

@router.get("/auth/discord")
async def discord_login():
    params = (
        f"client_id={DISCORD_CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=identify+guilds"
    )
    return RedirectResponse(f"{DISCORD_AUTH_URL}?{params}")


@router.get("/auth/callback")
async def discord_callback(code: str = None, error: str = None):
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}?auth=error&reason=cancelled")

    try:
        token_data   = await get_discord_token(code)
        access_token = token_data["access_token"]
        user         = await get_discord_user(access_token)
        in_guild     = await check_guild_membership(access_token)

        if not in_guild:
            return RedirectResponse(f"{FRONTEND_URL}?auth=error&reason=not_in_guild")

        token = create_jwt({
            "source":           "discord",
            "discord_id":       user["id"],
            "discord_username": user["username"],
            "discord_avatar":   user.get("avatar"),
            "verified":         True,
        })

        return RedirectResponse(f"{FRONTEND_URL}?auth=success&token={token}")

    except httpx.HTTPStatusError as e:
        print(f"Discord API error: {e.response.status_code} - {e.response.text}")
        return RedirectResponse(f"{FRONTEND_URL}?auth=error&reason=api_error")
    except Exception as e:
        print(f"Discord OAuth error: {e}")
        return RedirectResponse(f"{FRONTEND_URL}?auth=error&reason=server_error")


# ════════════════════════════════════════════════════════════════
#  RUTAS — GOOGLE
# ════════════════════════════════════════════════════════════════

@router.get("/auth/google")
async def google_login():
    """Redirige al usuario a Google para autorizar."""
    params = (
        f"client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={GOOGLE_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=openid+email+profile"
        f"&prompt=select_account"
    )
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{params}")


@router.get("/auth/google/callback")
async def google_callback(code: str = None, error: str = None):
    """Google redirige aquí con el código. Mismo flujo que Discord."""
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}?auth=error&reason=cancelled&source=google")

    try:
        token_data   = await get_google_token(code)
        access_token = token_data["access_token"]
        user         = await get_google_user(access_token)
        # user = { id, email, name, picture, verified_email }

        token = create_jwt({
            "source":           "google",
            "google_id":        user["id"],
            "google_email":     user.get("email"),
            "google_name":      user.get("name"),
            "google_picture":   user.get("picture"),
            "discord_id":       None,
            "discord_username": user.get("name"),   # fallback para compatibilidad
            "discord_avatar":   user.get("picture"),
            "verified":         True,
        })

        return RedirectResponse(f"{FRONTEND_URL}?auth=success&token={token}&source=google")

    except httpx.HTTPStatusError as e:
        print(f"Google API error: {e.response.status_code} - {e.response.text}")
        return RedirectResponse(f"{FRONTEND_URL}?auth=error&reason=api_error&source=google")
    except Exception as e:
        print(f"Google OAuth error: {e}")
        return RedirectResponse(f"{FRONTEND_URL}?auth=error&reason=server_error&source=google")


# ════════════════════════════════════════════════════════════════
#  RUTAS — COMPARTIDAS
# ════════════════════════════════════════════════════════════════

@router.get("/auth/verify")
async def verify_token(request: Request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token requerido")

    token   = auth_header.split(" ")[1]
    payload = verify_jwt(token)

    return JSONResponse({
        "verified":         payload.get("verified", False),
        "source":           payload.get("source", "discord"),
        "discord_id":       payload.get("discord_id"),
        "discord_username": payload.get("discord_username"),
        "discord_avatar":   payload.get("discord_avatar"),
        "google_id":        payload.get("google_id"),
        "google_email":     payload.get("google_email"),
        "google_name":      payload.get("google_name"),
        "google_picture":   payload.get("google_picture"),
    })


@router.get("/auth/logout")
async def logout():
    return JSONResponse({"message": "Logout exitoso. Borra el token del localStorage."})
