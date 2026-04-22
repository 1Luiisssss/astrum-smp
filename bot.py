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
WELCOME_CHANNEL_ID = int(os.getenv("WELCOME_CHANNEL_ID", "1495112801608269905"))
GALLERY_CHANNEL_ID = int(os.getenv("GALLERY_CHANNEL_ID", "1495267035842613458"))
SUPABASE_URL       = os.getenv("SUPABASE_URL")
SUPABASE_KEY       = os.getenv("SUPABASE_KEY")

intents = discord.Intents.default()
intents.members = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

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

@bot.event
async def on_ready():
    await bot.tree.sync(guild=discord.Object(id=GUILD_ID))
    print(f"Bot encendido como {bot.user}")

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
    await bot.process_commands(message)

@bot.event
async def on_member_join(member):
    welcome = bot.get_channel(WELCOME_CHANNEL_ID)
    if welcome:
        embed = discord.Embed(
            title="¡Bienvenido/a a Astrum SMP! ",
            description=(
                f"Hola {member.mention}, nos alegra tenerte aquí.\n\n"
                f"Dirígete a <#1495115813135450132> y usa `/verificar` para obtener acceso al servidor."
            ),
            color=0x8B1A1A
        )
        embed.set_thumbnail(url=member.display_avatar.url)
        embed.add_field(name="Miembro #", value=str(member.guild.member_count), inline=True)
        embed.set_footer(text="Astrum SMP · mc.hackos.dev:27022")
        await welcome.send(embed=embed)

@bot.tree.command(name="verificar", description="Verificate para registrar tu nick en la whitelist", guild=discord.Object(id=GUILD_ID))
async def verificar(interaction: discord.Interaction):
    role = interaction.guild.get_role(ROLE_ID)
    if role in interaction.user.roles:
        await interaction.response.send_message("Ya estas verificado/a.", ephemeral=True)
        return
    try:
        await interaction.user.add_roles(role)
        embed = discord.Embed(title="Verificacion exitosa", description="Ya tienes acceso.\n\nRegistra tu nick en:\n`https://astrum.qzz.io`", color=0x2ecc71)
        embed.set_footer(text="Astrum SMP · mc.hackos.dev:27022")
        await interaction.response.send_message(embed=embed, ephemeral=True)
    except discord.Forbidden:
        await interaction.response.send_message("Error: el bot no tiene permisos para asignar roles.", ephemeral=True)

@bot.tree.command(name="estado", description="Ver el estado del servidor de Minecraft", guild=discord.Object(id=GUILD_ID))
async def estado(interaction: discord.Interaction):
    await interaction.response.defer()
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get("https://api.mcsrvstat.us/3/mc.hackos.dev:27022", timeout=10)
            data = r.json()
        online = data.get("online", False)
        players = data.get("players", {})
        jugadores = players.get("online", 0)
        maximo = players.get("max", 100)
        lista = players.get("list", [])
        if online:
            embed = discord.Embed(title="Astrum SMP — En linea", color=0x2ecc71)
            embed.add_field(name="IP", value="`mc.hackos.dev:27022`", inline=True)
            embed.add_field(name="Jugadores", value=f"`{jugadores} / {maximo}`", inline=True)
            embed.add_field(name="Version", value="`1.21.11`", inline=True)
            if lista:
                embed.add_field(name="En linea ahora", value="\n".join([f"• {p['name']}" for p in lista]), inline=False)
        else:
            embed = discord.Embed(title="Astrum SMP — Fuera de linea", description="El servidor esta caido o en mantenimiento.", color=0xe74c3c)
        embed.set_footer(text="Astrum SMP · mc.hackos.dev:27022")
        await interaction.followup.send(embed=embed)
    except Exception as e:
        await interaction.followup.send(f"Error: {e}")

@bot.tree.command(name="info", description="Ver informacion general de Astrum SMP", guild=discord.Object(id=GUILD_ID))
async def info(interaction: discord.Interaction):
    embed = discord.Embed(title="Astrum SMP", description="Servidor de supervivencia comunitario. Sin pay-to-win, sin griefing.", color=0x8B1A1A)
    embed.add_field(name="IP Java", value="`mc.hackos.dev:27022`", inline=True)
    embed.add_field(name="Bedrock", value="`mc.hackos.dev:27022`", inline=True)
    embed.add_field(name="Version", value="`1.21.11`", inline=True)
    embed.add_field(name="Temporada", value="`Temporada 1`", inline=True)
    embed.add_field(name="Capacidad", value="`100 jugadores`", inline=True)
    embed.set_footer(text="Astrum SMP · mc.hackos.dev:27022")
    await interaction.response.send_message(embed=embed)

@bot.tree.command(name="reglas", description="Ver las reglas del servidor", guild=discord.Object(id=GUILD_ID))
async def reglas(interaction: discord.Interaction):
    embed = discord.Embed(title="Reglas de Astrum SMP", color=0x8B1A1A)
    embed.add_field(name="I. Sin griefing", value="Destruir o robar construcciones ajenas = ban permanente.", inline=False)
    embed.add_field(name="II. Sin hacks", value="Clientes modificados con ventaja injusta estan prohibidos.", inline=False)
    embed.add_field(name="III. PvP consensuado", value="El PvP fuera de zonas habilitadas requiere acuerdo previo.", inline=False)
    embed.add_field(name="IV. Respeto mutuo", value="Insultos, toxicidad o acoso = ban inmediato.", inline=False)
    embed.add_field(name="V. Sin exploits", value="Explotar bugs del juego esta prohibido. Reportalos.", inline=False)
    embed.set_footer(text="Astrum SMP · mc.hackos.dev:27022")
    await interaction.response.send_message(embed=embed, ephemeral=True)

@bot.tree.command(name="anunciar", description="Enviar un anuncio oficial (solo admins)", guild=discord.Object(id=GUILD_ID))
@app_commands.checks.has_permissions(administrator=True)
async def anunciar(interaction: discord.Interaction, titulo: str, mensaje: str):
    await interaction.response.defer(ephemeral=True)
    try:
        canal = discord.utils.get(interaction.guild.text_channels, name="anuncios")
        if not canal:
            await interaction.followup.send("No encontre el canal #anuncios.", ephemeral=True)
            return
        embed = discord.Embed(title=f"📣 {titulo}", description=mensaje, color=0x8B1A1A, timestamp=datetime.utcnow())
        embed.set_footer(text=f"Anunciado por {interaction.user.display_name} · Astrum SMP")
        await canal.send("@everyone", embed=embed)
        await interaction.followup.send("Anuncio enviado.", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error: {e}", ephemeral=True)

@bot.tree.command(name="ban", description="Banear a un jugador de Minecraft (solo admins)", guild=discord.Object(id=GUILD_ID))
@app_commands.checks.has_permissions(administrator=True)
async def ban_mc(interaction: discord.Interaction, nick: str, razon: str = "Sin razon"):
    await interaction.response.defer(ephemeral=True)
    from mcrcon import MCRcon
    try:
        with MCRcon(os.getenv("RCON_HOST"), os.getenv("RCON_PASSWORD"), port=int(os.getenv("RCON_PORT"))) as rcon:
            rcon.command(f"ban {nick} {razon}")
            rcon.command(f"whitelist remove {nick}")
        await interaction.followup.send(f"Baneado: `{nick}`. Razon: {razon}", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error RCON: {e}", ephemeral=True)

@bot.tree.command(name="kick", description="Expulsar a un jugador de Minecraft (solo admins)", guild=discord.Object(id=GUILD_ID))
@app_commands.checks.has_permissions(administrator=True)
async def kick_mc(interaction: discord.Interaction, nick: str, razon: str = "Sin razon"):
    await interaction.response.defer(ephemeral=True)
    from mcrcon import MCRcon
    try:
        with MCRcon(os.getenv("RCON_HOST"), os.getenv("RCON_PASSWORD"), port=int(os.getenv("RCON_PORT"))) as rcon:
            rcon.command(f"kick {nick} {razon}")
        await interaction.followup.send(f"Expulsado: `{nick}`. Razon: {razon}", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error RCON: {e}", ephemeral=True)

@bot.tree.command(name="whitelist", description="Gestionar la whitelist (solo admins)", guild=discord.Object(id=GUILD_ID))
@app_commands.checks.has_permissions(administrator=True)
async def whitelist_cmd(interaction: discord.Interaction, nick: str, accion: str = "add"):
    await interaction.response.defer(ephemeral=True)
    from mcrcon import MCRcon
    try:
        with MCRcon(os.getenv("RCON_HOST"), os.getenv("RCON_PASSWORD"), port=int(os.getenv("RCON_PORT"))) as rcon:
            resp = rcon.command(f"whitelist {accion} {nick}")
        await interaction.followup.send(f"RCON: `{resp}`", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error RCON: {e}", ephemeral=True)

@bot.tree.command(name="galeria-borrar", description="Borrar una foto de la galeria (solo admins)", guild=discord.Object(id=GUILD_ID))
@app_commands.checks.has_permissions(administrator=True)
async def galeria_borrar(interaction: discord.Interaction, id: int):
    await interaction.response.defer(ephemeral=True)
    try:
        headers = {"apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY}
        async with httpx.AsyncClient() as client:
            r = await client.delete(SUPABASE_URL + "/rest/v1/gallery?id=eq." + str(id), headers=headers)
        if r.status_code in (200, 204):
            await interaction.followup.send(f"Foto #{id} eliminada.", ephemeral=True)
        else:
            await interaction.followup.send(f"No se encontro la foto #{id}", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error: {e}", ephemeral=True)

@bot.tree.command(name="galeria-lista", description="Ver fotos de la galeria con sus IDs (solo admins)", guild=discord.Object(id=GUILD_ID))
@app_commands.checks.has_permissions(administrator=True)
async def galeria_lista(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    try:
        headers = {"apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY}
        async with httpx.AsyncClient() as client:
            r = await client.get(SUPABASE_URL + "/rest/v1/gallery?order=created_at.desc&limit=20", headers=headers)
        fotos = r.json()
        if not fotos:
            await interaction.followup.send("No hay fotos en la galeria.", ephemeral=True)
            return
        lineas = [f"ID {f['id']} — {f['author']} ({f['date']}) — {f['caption'] or 'sin descripcion'}" for f in fotos]
        await interaction.followup.send("Fotos:\n" + "\n".join(lineas), ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"Error: {e}", ephemeral=True)

bot.run(TOKEN)
