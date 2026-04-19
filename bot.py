import discord
from discord.ext import commands
from discord import app_commands
from dotenv import load_dotenv
import os

load_dotenv("config.env")

TOKEN        = os.getenv("DISCORD_TOKEN")
GUILD_ID     = int(os.getenv("DISCORD_GUILD_ID"))
ROLE_ID      = int(os.getenv("DISCORD_VERIFIED_ROLE_ID"))
CHANNEL_ID   = int(os.getenv("DISCORD_VERIFY_CHANNEL_ID"))

intents = discord.Intents.default()
intents.members = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

# ─── CUANDO EL BOT ENCIENDE ───────────────────────
@bot.event
async def on_ready():
    await bot.tree.sync(guild=discord.Object(id=GUILD_ID))
    print(f"✅ Bot encendido como {bot.user}")
    print(f"   Servidor: {GUILD_ID}")
    print(f"   Rol verificado: {ROLE_ID}")

# ─── MENSAJE DE BIENVENIDA EN EL CANAL ────────────
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
        embed.set_footer(text="Astrum SMP · mc.hackos.dev:27022")
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

    # Si ya tiene el rol
    if role in member.roles:
        await interaction.response.send_message(
            "✅ Ya estás verificado/a. Podés ir a la web y registrar tu nick.",
            ephemeral=True
        )
        return

    # Dar el rol
    try:
        await member.add_roles(role)
        embed = discord.Embed(
            title="✅ Verificación exitosa",
            description=(
                "Ya tenés acceso para registrarte.\n\n"
                "**Siguiente paso:**\n"
                "Volvé a la web del servidor y registrá tu nick de Minecraft.\n\n"
                "🌐 `http://TU-IP-O-DOMINIO-DE-LA-WEB`"
            ),
            color=0x2ecc71
        )
        embed.set_footer(text="Astrum SMP · mc.hackos.dev:27022")
        await interaction.response.send_message(embed=embed, ephemeral=True)
        print(f"✅ Verificado: {member.name} ({member.id})")

    except discord.Forbidden:
        await interaction.response.send_message(
            "❌ Error: el bot no tiene permisos para asignar roles. Avisale al admin.",
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

# ─── INICIAR ──────────────────────────────────────
bot.run(TOKEN)
