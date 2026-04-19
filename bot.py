import discord
from discord.ext import commands
from discord import app_commands
from dotenv import load_dotenv
import os
import httpx
from datetime import datetime

load_dotenv("config.env")

TOKEN              = os.getenv("DISCORD_TOKEN")
GUILD_ID           = int(os.getenv("DISCORD_GUILD_ID"))
ROLE_ID            = int(os.getenv("DISCORD_VERIFIED_ROLE_ID"))
CHANNEL_ID         = int(os.getenv("DISCORD_VERIFY_CHANNEL_ID"))
GALLERY_CHANNEL_ID = int(os.getenv("GALLERY_CHANNEL_ID", "1495267035842613458"))
SUPABASE_URL       = os.getenv("SUPABASE_URL")
SUPABASE_KEY       = os.getenv("SUPABASE_KEY")

intents = discord.Intents.default()
intents.members = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

# ─── SUPABASE HELPER ──────────────────────────────
async def save_photo(entry: dict):
    url = f"{SUPABASE_URL}/rest/v1/gallery"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(url, json=entry, headers=headers)
        return r.status_code in (200, 201)

# ─── CUANDO EL BOT ENCIENDE ───────────────────────
@bot.event
async def on_ready():
    await bot.tree.sync(guild=discord.Object(id=GUILD_ID))
    print(f"✅ Bot encendido como {bot.user}")
    print(f"   Servidor: {GUILD_ID}")
    print(f"   Rol verificado: {ROLE_ID}")

# ─── LISTENER DE IMÁGENES EN #capturas ────────────
@bot.event
async def on_message(message):
    if message.author.bot:
        return

    if message.channel.id == GALLERY_CHANNEL_ID:
        for attachment in message.attachments:
            if any(attachment.filename.lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.gif', '.webp']):
                entry = {
                    "url":        attachment.url,
                    "author":     message.author.display_name,
                    "avatar":     str(message.author.display_avatar.url),
                    "caption":    message.content or "",
                    "date":       datetime.utcnow().strftime("%Y-%m-%d"),
                    "message_id": str(message.id)
                }
                ok = await save_photo(entry)
                if ok:
                    await message.add_reaction("📸")
                    print(f"📸 Foto guardada en Supabase: {message.author.display_name}")
                else:
                    print(f"❌ Error guardando foto en Supabase")

    await bot.process_commands(message)

# ─── MENSAJE DE BIENVENIDA ────────────────────────
@bot.event
async def on_member_join(member):
    channel = bot.get_channel(CHANNEL_ID)
    if channel:
        embed = discord.Embed(
            title="👋 Bienvenido/a a Astrum SMP",
            description=(
                f"Hola {member.mention}!\n\n"
                f"Para acceder al servidor de Minecraft tenés que verificarte.\n\n"
                f"Escribe el comando `/verificar` acá mismo y te damos acceso."
            ),
            color=0x8B1A1A
        )
        embed.set_footer(text="Astrum SMP · mc.hackos.dev")
        await channel.send(embed=embed)

# ─── COMANDO /verificar ───────────────────────────
@bot.tree.command(
    name="verificar",
    description="Verificate para poder registrar tu nick en la whitelist",
    guild=discord.Object(id=GUILD_ID)
)
async def verificar(interaction: discord.Interaction):
    guild  = interaction.guild
    member = interaction.user
    role   = guild.get_role(ROLE_ID)

    if role in member.roles:
        await interaction.response.send_message(
            "✅ Ya estás verificado/a. Podés ir a la web y registrar tu nick.",
            ephemeral=True
        )
        return

    try:
        await member.add_roles(role)
        embed = discord.Embed(
            title="✅ Verificación exitosa",
            description=(
                "Ya tenés acceso para registrarte.\n\n"
                "**Siguiente paso:**\n"
                "Volvé a la web del servidor y registrá tu nick de Minecraft.\n\n"
                "🌐 `https://astrum.qzz.io`"
            ),
            color=0x2ecc71
        )
        embed.set_footer(text="Astrum SMP · mc.hackos.dev")
        await interaction.response.send_message(embed=embed, ephemeral=True)
        print(f"✅ Verificado: {member.name} ({member.id})")
    except discord.Forbidden:
        await interaction.response.send_message(
            "❌ Error: el bot no tiene permisos para asignar roles.",
            ephemeral=True
        )

# ─── COMANDO /whitelist (solo admins) ────────────
@bot.tree.command(
    name="whitelist",
    description="Ver o gestionar la whitelist (solo admins)",
    guild=discord.Object(id=GUILD_ID)
)
@app_commands.checks.has_permissions(administrator=True)
async def whitelist_cmd(interaction: discord.Interaction, nick: str, accion: str = "add"):
    await interaction.response.defer(ephemeral=True)
    from mcrcon import MCRcon
    rcon_host = os.getenv("RCON_HOST")
    rcon_port = int(os.getenv("RCON_PORT"))
    rcon_pass = os.getenv("RCON_PASSWORD")

    try:
        with MCRcon(rcon_host, rcon_pass, port=rcon_port) as rcon:
            if accion == "add":
                resp = rcon.command(f"whitelist add {nick}")
            elif accion == "remove":
                resp = rcon.command(f"whitelist remove {nick}")
            else:
                resp = "Acción no válida. Usa 'add' o 'remove'."
        await interaction.followup.send(f"✅ RCON: `{resp}`", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"❌ Error RCON: {e}", ephemeral=True)


# ─── COMANDO /galeria-borrar (solo admins) ────────
@bot.tree.command(
    name="galeria-borrar",
    description="Borrar una foto de la galería por su ID (solo admins)",
    guild=discord.Object(id=GUILD_ID)
)
@app_commands.checks.has_permissions(administrator=True)
async def galeria_borrar(interaction: discord.Interaction, id: int):
    await interaction.response.defer(ephemeral=True)
    try:
        url = f"{SUPABASE_URL}/rest/v1/gallery?id=eq.{id}"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}"
        }
        async with httpx.AsyncClient() as client:
            r = await client.delete(url, headers=headers)
        if r.status_code in (200, 204):
            await interaction.followup.send(f"✅ Foto #{id} eliminada de la galería.", ephemeral=True)
            print(f"🗑️ Foto #{id} eliminada por {interaction.user.name}")
        else:
            await interaction.followup.send(f"❌ No se encontró la foto #{id}.", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"❌ Error: {e}", ephemeral=True)

# ─── COMANDO /galeria-lista (solo admins) ─────────
@bot.tree.command(
    name="galeria-lista",
    description="Ver todas las fotos de la galería con sus IDs (solo admins)",
    guild=discord.Object(id=GUILD_ID)
)
@app_commands.checks.has_permissions(administrator=True)
async def galeria_lista(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    try:
        url = f"{SUPABASE_URL}/rest/v1/gallery?order=created_at.desc&limit=20"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}"
        }
        async with httpx.AsyncClient() as client:
            r = await client.get(url, headers=headers)
        fotos = r.json()
        if not fotos:
            await interaction.followup.send("No hay fotos en la galería.", ephemeral=True)
            return
        lista = "
".join([f"**ID {f['id']}** — {f['author']} ({f['date']}) — {f['caption'] or 'sin descripción'}" for f in fotos])
        await interaction.followup.send(f"📸 **Fotos en galería:**
{lista}", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"❌ Error: {e}", ephemeral=True)

# ─── INICIAR ──────────────────────────────────────
bot.run(TOKEN)
