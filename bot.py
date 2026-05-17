import discord
from discord.ext import commands
from discord import app_commands
from dotenv import load_dotenv
from mcrcon import MCRcon
from datetime import datetime, timezone, timedelta
import os
import asyncio
import random
import httpx

load_dotenv("config.env")

TOKEN              = os.getenv("DISCORD_TOKEN")
GUILD_ID           = int(os.getenv("DISCORD_GUILD_ID"))
ROLE_ID            = int(os.getenv("DISCORD_VERIFIED_ROLE_ID"))
CHANNEL_ID         = int(os.getenv("DISCORD_VERIFY_CHANNEL_ID"))
WELCOME_CHANNEL_ID = int(os.getenv("WELCOME_CHANNEL_ID", "1495112801608269905"))
GALLERY_CHANNEL_ID = int(os.getenv("GALLERY_CHANNEL_ID", "1495267035842613458"))
SUPABASE_URL       = os.getenv("SUPABASE_URL")
SUPABASE_KEY       = os.getenv("SUPABASE_KEY")
RCON_HOST          = os.getenv("RCON_HOST")
RCON_PASSWORD      = os.getenv("RCON_PASSWORD")
RCON_PORT          = int(os.getenv("RCON_PORT", "25575"))
MC_IP              = "mc.hackos.dev:27015"
MC_VERSION         = "1.21.11"

intents = discord.Intents.default()
intents.members = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

# ──────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────

def rcon_cmd(command: str) -> str:
    with MCRcon(RCON_HOST, RCON_PASSWORD, port=RCON_PORT) as rcon:
        return rcon.command(command)

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

def is_admin():
    async def predicate(interaction: discord.Interaction) -> bool:
        return interaction.user.guild_permissions.administrator
    return app_commands.check(predicate)

# En memoria (reemplazar por BD si quieres persistencia)
warns_db: dict[int, list[dict]] = {}   # {user_id: [{motivo, fecha, admin}]}
muted_db: dict[int, int] = {}          # {user_id: role_id_guardado}


# ──────────────────────────────────────────────
# EVENTOS
# ──────────────────────────────────────────────

@bot.event
async def on_ready():
    await bot.tree.sync(guild=discord.Object(id=GUILD_ID))
    print(f"Bot encendido como {bot.user}")
    bot.loop.create_task(actualizar_estado())

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
                    "date":       datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    "message_id": str(message.id)
                }
                ok = await save_photo(entry)
                if ok:
                    await message.add_reaction("📸")
    await bot.process_commands(message)

@bot.event
async def on_member_join(member):
    try:
        welcome = bot.get_channel(WELCOME_CHANNEL_ID)
        if welcome:
            embed = discord.Embed(
                title="¡Bienvenido/a a Astrum SMP!",
                description=(
                    f"Hola {member.mention}, nos alegra tenerte aquí.\n\n"
                    f"Dirígete a <#1495115813135450132> y usa `/verificar` para obtener acceso al servidor."
                ),
                color=0x8B1A1A
            )
            embed.set_thumbnail(url=member.display_avatar.url)
            embed.add_field(name="Miembro #", value=str(member.guild.member_count), inline=True)
            embed.set_footer(text=f"Astrum SMP · {MC_IP}")
            await welcome.send(embed=embed)
    except Exception as e:
        print(f"[on_member_join] Error: {e}")

# ──────────────────────────────────────────────
# COMANDOS PÚBLICOS
# ──────────────────────────────────────────────

@bot.tree.command(name="verificar", description="Verificate para obtener acceso al servidor", guild=discord.Object(id=GUILD_ID))
async def verificar(interaction: discord.Interaction):
    role = interaction.guild.get_role(ROLE_ID)
    if role in interaction.user.roles:
        await interaction.response.send_message("Ya estás verificado/a.", ephemeral=True)
        return
    try:
        await interaction.user.add_roles(role)
        embed = discord.Embed(title="✅ Verificación exitosa", description=f"Ya tienes acceso.\n\nRegistra tu nick en:\n`https://astrum.qzz.io`", color=0x2ecc71)
        embed.set_footer(text=f"Astrum SMP · {MC_IP}")
        await interaction.response.send_message(embed=embed, ephemeral=True)
    except discord.Forbidden:
        await interaction.response.send_message("Error: el bot no tiene permisos para asignar roles.", ephemeral=True)

@bot.tree.command(name="estado", description="Ver el estado del servidor de Minecraft", guild=discord.Object(id=GUILD_ID))
async def estado(interaction: discord.Interaction):
    await interaction.response.defer()
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"https://api.mcsrvstat.us/3/{MC_IP}", timeout=10)
            data = r.json()
        online = data.get("online", False)
        players = data.get("players", {})
        jugadores = players.get("online", 0)
        maximo = players.get("max", 100)
        lista = players.get("list", [])
        version = data.get("version", MC_VERSION)
        if online:
            embed = discord.Embed(title="🟢 Astrum SMP — En línea", color=0x2ecc71)
            embed.add_field(name="IP", value=f"`{MC_IP}`", inline=True)
            embed.add_field(name="Jugadores", value=f"`{jugadores} / {maximo}`", inline=True)
            embed.add_field(name="Versión", value=f"`{version}`", inline=True)
            if lista:
                embed.add_field(name="En línea ahora", value="\n".join([f"• {p['name']}" for p in lista]), inline=False)
        else:
            embed = discord.Embed(title="🔴 Astrum SMP — Fuera de línea", description="El servidor está caído o en mantenimiento.", color=0xe74c3c)
        embed.set_footer(text=f"Astrum SMP · {MC_IP}")
        await interaction.followup.send(embed=embed)
    except Exception as e:
        await interaction.followup.send(f"Error al consultar el servidor: {e}")

@bot.tree.command(name="ip", description="Ver la IP del servidor", guild=discord.Object(id=GUILD_ID))
async def ip(interaction: discord.Interaction):
    embed = discord.Embed(title="🌐 IP de Astrum SMP", color=0x8B1A1A)
    embed.add_field(name="Java / Bedrock", value=f"`{MC_IP}`", inline=False)
    embed.set_footer(text=f"Astrum SMP · {MC_IP}")
    await interaction.response.send_message(embed=embed)

@bot.tree.command(name="info", description="Ver información general de Astrum SMP", guild=discord.Object(id=GUILD_ID))
async def info(interaction: discord.Interaction):
    embed = discord.Embed(title="Astrum SMP", description="Servidor de supervivencia comunitario. Sin pay-to-win, sin griefing.", color=0x8B1A1A)
    embed.add_field(name="IP Java", value=f"`{MC_IP}`", inline=True)
    embed.add_field(name="Bedrock", value=f"`{MC_IP}`", inline=True)
    embed.add_field(name="Versión", value=f"`{MC_VERSION}`", inline=True)
    embed.add_field(name="Temporada", value="`Temporada 1`", inline=True)
    embed.add_field(name="Capacidad", value="`100 jugadores`", inline=True)
    embed.set_footer(text=f"Astrum SMP · {MC_IP}")
    await interaction.response.send_message(embed=embed)

@bot.tree.command(name="reglas", description="Ver las reglas del servidor", guild=discord.Object(id=GUILD_ID))
async def reglas(interaction: discord.Interaction):
    embed = discord.Embed(title="📋 Reglas de Astrum SMP", color=0x8B1A1A)
    embed.add_field(name="I. Sin griefing", value="Destruir o robar construcciones ajenas = ban permanente.", inline=False)
    embed.add_field(name="II. Sin hacks", value="Clientes modificados con ventaja injusta están prohibidos.", inline=False)
    embed.add_field(name="III. PvP consensuado", value="El PvP fuera de zonas habilitadas requiere acuerdo previo.", inline=False)
    embed.add_field(name="IV. Respeto mutuo", value="Insultos, toxicidad o acoso = ban inmediato.", inline=False)
    embed.add_field(name="V. Sin exploits", value="Explotar bugs del juego está prohibido. Repórtalos.", inline=False)
    embed.set_footer(text=f"Astrum SMP · {MC_IP}")
    await interaction.response.send_message(embed=embed, ephemeral=True)

@bot.tree.command(name="skin", description="Ver la skin de un jugador de Minecraft", guild=discord.Object(id=GUILD_ID))
async def skin(interaction: discord.Interaction, nick: str):
    embed = discord.Embed(title=f"🎨 Skin de {nick}", color=0x8B1A1A)
    embed.set_image(url=f"https://mc-heads.net/body/{nick}")
    embed.set_thumbnail(url=f"https://mc-heads.net/head/{nick}")
    embed.set_footer(text=f"Astrum SMP · {MC_IP}")
    await interaction.response.send_message(embed=embed)

@bot.tree.command(name="sugerir", description="Enviar una sugerencia al staff", guild=discord.Object(id=GUILD_ID))
async def sugerir(interaction: discord.Interaction, sugerencia: str):
    canal = discord.utils.get(interaction.guild.text_channels, name="sugerencias")
    if not canal:
        await interaction.response.send_message("No se encontró el canal #sugerencias.", ephemeral=True)
        return
    embed = discord.Embed(title="💡 Nueva Sugerencia", description=sugerencia, color=0x3498db, timestamp=datetime.now(timezone.utc))
    embed.set_footer(text=f"Por {interaction.user.display_name} · Astrum SMP")
    msg = await canal.send(embed=embed)
    await msg.add_reaction("✅")
    await msg.add_reaction("❌")
    await interaction.response.send_message("✅ Sugerencia enviada.", ephemeral=True)

# ──────────────────────────────────────────────
# COMANDOS SOLO ADMINS
# ──────────────────────────────────────────────

@bot.tree.command(name="anunciar", description="[ADMIN] Enviar un anuncio oficial", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def anunciar(interaction: discord.Interaction, titulo: str, mensaje: str):
    await interaction.response.defer(ephemeral=True)
    try:
        canal = discord.utils.get(interaction.guild.text_channels, name="anuncios")
        if not canal:
            await interaction.followup.send("No encontré el canal #anuncios.", ephemeral=True)
            return
        embed = discord.Embed(title=f"📣 {titulo}", description=mensaje, color=0x8B1A1A, timestamp=datetime.now(timezone.utc))
        embed.set_footer(text=f"Anunciado por {interaction.user.display_name} · Astrum SMP")
        await canal.send("@everyone", embed=embed)
        await interaction.followup.send("✅ Anuncio enviado.", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error: {e}", ephemeral=True)

@bot.tree.command(name="ban", description="[ADMIN] Banear a un jugador de Minecraft", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def ban_mc(interaction: discord.Interaction, nick: str, razon: str = "Sin razón"):
    await interaction.response.defer(ephemeral=True)
    try:
        rcon_cmd(f"ban {nick} {razon}")
        rcon_cmd(f"whitelist remove {nick}")
        embed = discord.Embed(title="🔨 Jugador baneado", color=0xe74c3c)
        embed.add_field(name="Nick", value=f"`{nick}`", inline=True)
        embed.add_field(name="Razón", value=razon, inline=True)
        embed.set_footer(text=f"Por {interaction.user.display_name} · Astrum SMP")
        await interaction.followup.send(embed=embed, ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error RCON: {e}", ephemeral=True)

@bot.tree.command(name="kick", description="[ADMIN] Expulsar a un jugador de Minecraft", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def kick_mc(interaction: discord.Interaction, nick: str, razon: str = "Sin razón"):
    await interaction.response.defer(ephemeral=True)
    try:
        rcon_cmd(f"kick {nick} {razon}")
        embed = discord.Embed(title="👢 Jugador expulsado", color=0xe67e22)
        embed.add_field(name="Nick", value=f"`{nick}`", inline=True)
        embed.add_field(name="Razón", value=razon, inline=True)
        embed.set_footer(text=f"Por {interaction.user.display_name} · Astrum SMP")
        await interaction.followup.send(embed=embed, ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error RCON: {e}", ephemeral=True)

@bot.tree.command(name="whitelist", description="[ADMIN] Gestionar la whitelist", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def whitelist_cmd(interaction: discord.Interaction, nick: str, accion: str = "add"):
    await interaction.response.defer(ephemeral=True)
    try:
        resp = rcon_cmd(f"whitelist {accion} {nick}")
        await interaction.followup.send(f"✅ RCON: `{resp}`", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error RCON: {e}", ephemeral=True)

@bot.tree.command(name="rcon", description="[ADMIN] Ejecutar un comando en la consola del servidor", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def rcon_command(interaction: discord.Interaction, comando: str):
    await interaction.response.defer(ephemeral=True)
    try:
        resp = rcon_cmd(comando)
        embed = discord.Embed(title="⚙️ Comando ejecutado", color=0x2ecc71)
        embed.add_field(name="Comando", value=f"`{comando}`", inline=False)
        embed.add_field(name="Respuesta", value=f"```{resp or 'Sin respuesta'}```", inline=False)
        embed.set_footer(text=f"Por {interaction.user.display_name} · Astrum SMP")
        await interaction.followup.send(embed=embed, ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error RCON: {e}", ephemeral=True)

@bot.tree.command(name="clear", description="[ADMIN] Eliminar mensajes del canal", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def clear(interaction: discord.Interaction, cantidad: int):
    await interaction.response.defer(ephemeral=True)
    deleted = await interaction.channel.purge(limit=cantidad)
    await interaction.followup.send(f"🧹 {len(deleted)} mensajes eliminados.", ephemeral=True)

@bot.tree.command(name="galeria-borrar", description="[ADMIN] Borrar una foto de la galería", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def galeria_borrar(interaction: discord.Interaction, id: int):
    await interaction.response.defer(ephemeral=True)
    try:
        headers = {"apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY}
        async with httpx.AsyncClient() as client:
            r = await client.delete(SUPABASE_URL + "/rest/v1/gallery?id=eq." + str(id), headers=headers)
        if r.status_code in (200, 204):
            await interaction.followup.send(f"✅ Foto #{id} eliminada.", ephemeral=True)
        else:
            await interaction.followup.send(f"No se encontró la foto #{id}.", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error: {e}", ephemeral=True)

@bot.tree.command(name="galeria-lista", description="[ADMIN] Ver fotos de la galería con sus IDs", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def galeria_lista(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    try:
        headers = {"apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY}
        async with httpx.AsyncClient() as client:
            r = await client.get(SUPABASE_URL + "/rest/v1/gallery?order=created_at.desc&limit=20", headers=headers)
        fotos = r.json()
        if not fotos:
            await interaction.followup.send("No hay fotos en la galería.", ephemeral=True)
            return
        lineas = [f"ID {f['id']} — {f['author']} ({f['date']}) — {f['caption'] or 'sin descripción'}" for f in fotos]
        await interaction.followup.send("📸 Fotos:\n" + "\n".join(lineas), ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error: {e}", ephemeral=True)

# ──────────────────────────────────────────────
# COMANDOS PÚBLICOS NUEVOS
# ──────────────────────────────────────────────

@bot.tree.command(name="jugadores", description="Ver quién está conectado en el servidor ahora", guild=discord.Object(id=GUILD_ID))
async def jugadores(interaction: discord.Interaction):
    await interaction.response.defer()
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"https://api.mcsrvstat.us/3/{MC_IP}", timeout=10)
            data = r.json()
        online = data.get("online", False)
        if not online:
            await interaction.followup.send("🔴 El servidor está offline.", ephemeral=True)
            return
        players = data.get("players", {})
        jugadores_online = players.get("online", 0)
        maximo = players.get("max", 100)
        lista = players.get("list", [])
        embed = discord.Embed(title=f"👥 Jugadores en línea — {jugadores_online}/{maximo}", color=0x2ecc71)
        if lista:
            embed.description = "\n".join([f"• `{p['name']}`" for p in lista])
        else:
            embed.description = "_No hay jugadores conectados._"
        embed.set_footer(text=f"Astrum SMP · {MC_IP}")
        await interaction.followup.send(embed=embed)
    except Exception as e:
        await interaction.followup.send(f"Error: {e}")

@bot.tree.command(name="tps", description="Ver los TPS actuales del servidor", guild=discord.Object(id=GUILD_ID))
async def tps(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    try:
        resp = rcon_cmd("tps")
        embed = discord.Embed(title="⚡ TPS del servidor", description=f"```{resp}```", color=0x3498db)
        embed.set_footer(text=f"Astrum SMP · {MC_IP}")
        await interaction.followup.send(embed=embed, ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error RCON: {e}", ephemeral=True)

@bot.tree.command(name="reporte", description="Reportar un jugador al staff", guild=discord.Object(id=GUILD_ID))
async def reporte(interaction: discord.Interaction, nick: str, motivo: str):
    canal_staff = discord.utils.get(interaction.guild.text_channels, name="reportes-staff")
    if not canal_staff:
        await interaction.response.send_message("❌ No se encontró el canal #reportes-staff.", ephemeral=True)
        return
    embed = discord.Embed(title="🚨 Nuevo Reporte", color=0xe74c3c, timestamp=datetime.now(timezone.utc))
    embed.add_field(name="Jugador reportado", value=f"`{nick}`", inline=True)
    embed.add_field(name="Reportado por", value=interaction.user.mention, inline=True)
    embed.add_field(name="Motivo", value=motivo, inline=False)
    embed.set_footer(text=f"Astrum SMP · {MC_IP}")
    await canal_staff.send(embed=embed)
    await interaction.response.send_message("✅ Reporte enviado al staff. Gracias.", ephemeral=True)

@bot.tree.command(name="server-info", description="Ver información del servidor de Minecraft", guild=discord.Object(id=GUILD_ID))
async def server_info(interaction: discord.Interaction):
    await interaction.response.defer()
    try:
        # Jugadores online via API
        async with httpx.AsyncClient() as client:
            r = await client.get(f"https://api.mcsrvstat.us/3/{MC_IP}", timeout=10)
            data = r.json()

        online = data.get("online", False)
        players = data.get("players", {})
        jugadores = players.get("online", 0)
        maximo = players.get("max", 20)
        version = data.get("version", MC_VERSION)
        lista = players.get("list", [])

        # TPS via Spark RCON
        tps_text = "N/A"
        mspt_text = "N/A"
        try:
            spark_resp = rcon_cmd("spark tps")
            import re
            clean = re.sub(r'§.', '', spark_resp)
            nums = re.findall(r'\d+\.?\d*', clean)
            if nums:
                tps_text = f"{nums[0]} TPS"
            mspt_resp = rcon_cmd("spark mspt")
            clean_mspt = re.sub(r'§.', '', mspt_resp)
            mspt_nums = re.findall(r'\d+\.?\d*', clean_mspt)
            if mspt_nums:
                mspt_text = f"{mspt_nums[0]} ms"
        except Exception:
            pass

        if not online:
            embed = discord.Embed(
                title="Astrum SMP — Fuera de línea",
                description="El servidor está caído o en mantenimiento.",
                color=0x2C2F33,
                timestamp=datetime.now(timezone.utc)
            )
            embed.set_footer(text=f"Astrum SMP · {MC_IP}")
            await interaction.followup.send(embed=embed)
            return

        try:
            tps_val = float(tps_text.split()[0])
            color = 0x2C2F33
        except Exception:
            color = 0x2C2F33

        embed = discord.Embed(
            title="Astrum SMP",
            color=color,
            timestamp=datetime.now(timezone.utc)
        )

        embed.add_field(name="IP", value=f"`{MC_IP}`", inline=True)
        embed.add_field(name="Version", value=f"`{version}`", inline=True)
        embed.add_field(name="Players", value=f"`{jugadores} / {maximo}`", inline=True)
        embed.add_field(name="TPS", value=f"`{tps_text}`", inline=True)
        embed.add_field(name="MSPT", value=f"`{mspt_text}`", inline=True)
        embed.add_field(name="Status", value="`Online`", inline=True)

        if lista:
            nombres = "\n".join([f"{p['name']}" for p in lista[:10]])
            embed.add_field(name=f"Online — {jugadores}", value=f"```{nombres}```", inline=False)

        mods = [
            "Cardboard", "Carpet AMS Addition", "Carpet Extra", "Cloth Config",
            "Clumps", "Fabric API", "Fabric Carpet", "FerriteCore", "Floodgate",
            "iCommon", "Lithium", "Potatoptimize", "Quick Pack", "ScalableLux",
            "ShulkerFix", "Spark"
        ]
        embed.add_field(name=f"Mods — {len(mods)}", value=f"```{chr(10).join(mods)}```", inline=False)

        # Carpet rules via RCON
        try:
            import re
            carpet_resp = rcon_cmd("carpet list")
            clean_carpet = re.sub(r'§.', '', carpet_resp)
            lines = clean_carpet.splitlines()
            rules = []
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                parts = line.split()
                if len(parts) >= 2 and parts[-1].lower() not in ("false", "carpet"):
                    rules.append(f"{parts[0]}: {parts[-1]}")
            if rules:
                embed.add_field(name="Carpet Rules", value=f"```{chr(10).join(rules[:15])}```", inline=False)
        except Exception:
            pass

        # Datapacks via RCON
        try:
            dp_resp = rcon_cmd("datapack list enabled")
            clean_dp = re.sub(r'§.', '', dp_resp)
            packs = re.findall(r'\[([^\]]+)\]', clean_dp)
            packs = [p for p in packs if p not in ("vanilla", "file/vanilla")]
            if packs:
                embed.add_field(name="Datapacks", value=f"```{chr(10).join(packs[:10])}```", inline=False)
        except Exception:
            pass

        embed.set_footer(text=f"Astrum SMP · {MC_IP}")
        await interaction.followup.send(embed=embed)

    except Exception as e:
        await interaction.followup.send(f"Error: {e}")




async def encuesta(interaction: discord.Interaction, pregunta: str, opcion1: str, opcion2: str):
    embed = discord.Embed(title=f"📊 {pregunta}", color=0x9b59b6, timestamp=datetime.now(timezone.utc))
    embed.add_field(name="🅰️ Opción 1", value=opcion1, inline=True)
    embed.add_field(name="🅱️ Opción 2", value=opcion2, inline=True)
    embed.set_footer(text=f"Por {interaction.user.display_name} · Astrum SMP")
    await interaction.response.send_message(embed=embed)
    msg = await interaction.original_response()
    await msg.add_reaction("🅰️")
    await msg.add_reaction("🅱️")

@bot.tree.command(name="sorteo", description="Crear un sorteo con temporizador", guild=discord.Object(id=GUILD_ID))
async def sorteo(interaction: discord.Interaction, premio: str, minutos: int):
    embed = discord.Embed(
        title="🎉 ¡SORTEO!",
        description=f"**Premio:** {premio}\n\nReacciona con 🎉 para participar!\nFinaliza en **{minutos} minuto(s)**.",
        color=0xf1c40f,
        timestamp=datetime.now(timezone.utc) + timedelta(minutes=minutos)
    )
    embed.set_footer(text=f"Organizado por {interaction.user.display_name} · Termina a las")
    await interaction.response.send_message(embed=embed)
    msg = await interaction.original_response()
    await msg.add_reaction("🎉")

    await asyncio.sleep(minutos * 60)

    msg = await interaction.channel.fetch_message(msg.id)
    reaccion = discord.utils.get(msg.reactions, emoji="🎉")
    if reaccion and reaccion.count > 1:
        usuarios = [u async for u in reaccion.users() if not u.bot]
        if usuarios:
            ganador = random.choice(usuarios)
            embed_fin = discord.Embed(title="🏆 ¡Sorteo finalizado!", description=f"**Premio:** {premio}\n**Ganador:** {ganador.mention} 🎊", color=0x2ecc71)
            await interaction.channel.send(embed=embed_fin)
            return
    await interaction.channel.send("❌ No hubo suficientes participantes en el sorteo.")

# ──────────────────────────────────────────────
# COMANDOS ADMIN NUEVOS
# ──────────────────────────────────────────────

@bot.tree.command(name="mute", description="[ADMIN] Silenciar a un miembro en Discord", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def mute(interaction: discord.Interaction, miembro: discord.Member, minutos: int, razon: str = "Sin razón"):
    await interaction.response.defer(ephemeral=True)
    try:
        hasta = datetime.now(timezone.utc) + timedelta(minutes=minutos)
        await miembro.timeout(hasta, reason=razon)
        embed = discord.Embed(title="🔇 Miembro silenciado", color=0xe67e22)
        embed.add_field(name="Usuario", value=miembro.mention, inline=True)
        embed.add_field(name="Duración", value=f"{minutos} min", inline=True)
        embed.add_field(name="Razón", value=razon, inline=False)
        embed.set_footer(text=f"Por {interaction.user.display_name} · Astrum SMP")
        await interaction.followup.send(embed=embed, ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error: {e}", ephemeral=True)

@bot.tree.command(name="unmute", description="[ADMIN] Quitar silencio a un miembro", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def unmute(interaction: discord.Interaction, miembro: discord.Member):
    await interaction.response.defer(ephemeral=True)
    try:
        await miembro.timeout(None)
        await interaction.followup.send(f"✅ Silencio removido a {miembro.mention}.", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error: {e}", ephemeral=True)

@bot.tree.command(name="warn", description="[ADMIN] Registrar una advertencia a un usuario", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def warn(interaction: discord.Interaction, miembro: discord.Member, motivo: str):
    uid = miembro.id
    if uid not in warns_db:
        warns_db[uid] = []
    warns_db[uid].append({
        "motivo": motivo,
        "fecha": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
        "admin": interaction.user.display_name
    })
    total = len(warns_db[uid])
    embed = discord.Embed(title="⚠️ Advertencia registrada", color=0xf39c12)
    embed.add_field(name="Usuario", value=miembro.mention, inline=True)
    embed.add_field(name="Total warns", value=str(total), inline=True)
    embed.add_field(name="Motivo", value=motivo, inline=False)
    embed.set_footer(text=f"Por {interaction.user.display_name} · Astrum SMP")
    await interaction.response.send_message(embed=embed, ephemeral=True)
    try:
        await miembro.send(f"⚠️ Has recibido una advertencia en **Astrum SMP**.\n**Motivo:** {motivo}\n**Total:** {total} warn(s).")
    except Exception:
        pass

@bot.tree.command(name="warns", description="[ADMIN] Ver advertencias de un usuario", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def warns_cmd(interaction: discord.Interaction, miembro: discord.Member):
    lista = warns_db.get(miembro.id, [])
    embed = discord.Embed(title=f"⚠️ Warns de {miembro.display_name}", color=0xf39c12)
    if not lista:
        embed.description = "Sin advertencias."
    else:
        for i, w in enumerate(lista, 1):
            embed.add_field(name=f"#{i} — {w['fecha']}", value=f"**Motivo:** {w['motivo']}\n**Por:** {w['admin']}", inline=False)
    await interaction.response.send_message(embed=embed, ephemeral=True)

@bot.tree.command(name="clearwarns", description="[ADMIN] Borrar todas las advertencias de un usuario", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def clearwarns(interaction: discord.Interaction, miembro: discord.Member):
    warns_db[miembro.id] = []
    await interaction.response.send_message(f"✅ Advertencias de {miembro.mention} eliminadas.", ephemeral=True)

@bot.tree.command(name="unban-mc", description="[ADMIN] Desbanear a un jugador de Minecraft", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def unban_mc(interaction: discord.Interaction, nick: str):
    await interaction.response.defer(ephemeral=True)
    try:
        resp = rcon_cmd(f"pardon {nick}")
        rcon_cmd(f"whitelist add {nick}")
        await interaction.followup.send(f"✅ `{nick}` desbaneado y añadido a whitelist.\nRCON: `{resp}`", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error RCON: {e}", ephemeral=True)

@bot.tree.command(name="broadcast", description="[ADMIN] Enviar mensaje a todos en el servidor Minecraft", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def broadcast(interaction: discord.Interaction, mensaje: str):
    await interaction.response.defer(ephemeral=True)
    try:
        rcon_cmd(f'say {mensaje}')
        await interaction.followup.send(f"✅ Mensaje enviado al servidor: `{mensaje}`", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error RCON: {e}", ephemeral=True)

@bot.tree.command(name="mantenimiento", description="[ADMIN] Activar o desactivar modo mantenimiento (whitelist)", guild=discord.Object(id=GUILD_ID))
@is_admin()
async def mantenimiento(interaction: discord.Interaction, estado: str):
    await interaction.response.defer(ephemeral=True)
    estado = estado.lower()
    if estado not in ("on", "off"):
        await interaction.followup.send("❌ Usa `on` o `off`.", ephemeral=True)
        return
    try:
        rcon_cmd(f"whitelist {'on' if estado == 'on' else 'off'}")
        emoji = "🔧" if estado == "on" else "✅"
        msg = "activado" if estado == "on" else "desactivado"
        await interaction.followup.send(f"{emoji} Mantenimiento **{msg}**. Whitelist: `{estado}`", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error RCON: {e}", ephemeral=True)


# ──────────────────────────────────────────────
# ERROR HANDLER
# ──────────────────────────────────────────────

@bot.tree.error
async def on_app_command_error(interaction: discord.Interaction, error: app_commands.AppCommandError):
    if isinstance(error, app_commands.CheckFailure):
        await interaction.response.send_message("❌ No tienes permisos para usar este comando.", ephemeral=True)
    else:
        await interaction.response.send_message(f"❌ Error inesperado: {error}", ephemeral=True)

async def actualizar_estado():
    await bot.wait_until_ready()
    while not bot.is_closed():
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(f"https://api.mcsrvstat.us/3/{MC_IP}", timeout=10)
                data = r.json()
            if data.get("online"):
                jugadores = data["players"].get("online", 0)
                maximo = data["players"].get("max", 100)
                actividad = discord.Game(name=f"AstrumSMP | {jugadores}/{maximo} jugadores")
            else:
                actividad = discord.Game(name="AstrumSMP | Servidor offline")
            await bot.change_presence(activity=actividad)
        except Exception:
            pass
        await asyncio.sleep(60)

bot.run(TOKEN)
