import asyncio
import logging
import os
import re
import time
from collections import defaultdict, deque
from datetime import timedelta

import discord
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv("DISCORD_TOKEN")
GUILD_ID = os.getenv("GUILD_ID")  # opcional: para sincronizar comandos al instante en un solo servidor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
log = logging.getLogger("bot")

# ---------------------------------------------------------------------------
# CONFIGURACIÓN — ajusta estos valores a tu servidor
# ---------------------------------------------------------------------------

WELCOME_CHANNEL_ID = 1248808559232422032   # canal #welcome
LOG_CHANNEL_ID = 1545574014989369354        # canal donde se publican los logs de seguridad

MIN_ACCOUNT_AGE_DAYS = 7                    # cuentas más nuevas que esto generan alerta

RAID_JOIN_THRESHOLD = 6                     # ingresos...
RAID_JOIN_WINDOW = 10                       # ...en esta ventana (segundos) = modo raid
RAID_LOCKDOWN_MINUTES = 15                  # duración del lockdown automático

NUKE_ACTION_THRESHOLD = 3                   # eliminaciones de canal/rol por un mismo usuario...
NUKE_ACTION_WINDOW = 10                     # ...en esta ventana (segundos) = respuesta anti-nuke

MENTION_SPAM_LIMIT = 5                      # menciones distintas en un solo mensaje
MENTION_TIMEOUT_MINUTES = 10                # timeout aplicado por mention spam

INVITE_REGEX = re.compile(
    r"(discord\.gg|discord(?:app)?\.com/invite)/\S+", re.IGNORECASE
)

EMBED_COLOR_ALERT = 0xB33A3A
EMBED_COLOR_INFO = 0x1a1a1a

# ---------------------------------------------------------------------------
# Intents / Bot
# ---------------------------------------------------------------------------

intents = discord.Intents.default()
intents.message_content = True  # necesario para el filtro de automod / invitaciones
intents.members = True  # necesario para logs de moderación, raid y bienvenidas

bot = commands.Bot(command_prefix="!", intents=intents, help_command=None)

INITIAL_COGS = [
    "cogs.moderation",
    "cogs.automod",
]

# Estado en memoria para detección de raid / nuke
join_times: deque[float] = deque()
nuke_actions: dict[int, deque[float]] = defaultdict(deque)
raid_mode = False
locked_channels: list[discord.TextChannel] = []
raid_unlock_task: asyncio.Task | None = None


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

async def log_event(guild: discord.Guild, title: str, description: str,
                     color: int = EMBED_COLOR_INFO):
    channel = guild.get_channel(LOG_CHANNEL_ID)
    if channel is None:
        log.warning(f"Canal de logs de seguridad no encontrado en {guild.name}")
        return
    embed = discord.Embed(title=title, description=description, color=color)
    embed.timestamp = discord.utils.utcnow()
    try:
        await channel.send(embed=embed)
    except discord.Forbidden:
        log.error(f"Sin permisos para escribir en el canal de logs de {guild.name}")


async def get_audit_actor(guild: discord.Guild, action: discord.AuditLogAction):
    """Devuelve el autor más reciente de una acción en el audit log, si existe."""
    try:
        async for entry in guild.audit_logs(limit=1, action=action):
            return entry.user
    except discord.Forbidden:
        log.warning(f"Sin permiso 'Ver registro de auditoría' en {guild.name}")
    return None


# ---------------------------------------------------------------------------
# Eventos base
# ---------------------------------------------------------------------------

@bot.event
async def on_ready():
    log.info(f"Conectado como {bot.user} (ID: {bot.user.id})")
    log.info(f"Sirviendo en {len(bot.guilds)} servidor(es)")
    try:
        if GUILD_ID:
            guild = discord.Object(id=int(GUILD_ID))
            synced = await bot.tree.sync(guild=guild)
            log.info(f"Comandos slash sincronizados en guild {GUILD_ID}: {len(synced)}")
        else:
            synced = await bot.tree.sync()
            log.info(f"Comandos slash sincronizados globalmente: {len(synced)} (puede tardar hasta 1h en propagarse)")
    except Exception as e:
        log.error(f"Error sincronizando comandos: {e}")


# ---------------------------------------------------------------------------
# Bienvenida + detección de raid + alerta de cuentas nuevas
# ---------------------------------------------------------------------------

@bot.event
async def on_member_join(member: discord.Member):
    global raid_mode, raid_unlock_task
    guild = member.guild
    now = time.monotonic()

    # --- Bienvenida ---
    channel = bot.get_channel(WELCOME_CHANNEL_ID)
    if channel:
        embed = discord.Embed(
            description=(
                f"Otro nombre más en la lista.\n"
                f"Bienvenido a **{guild.name}**, {member.mention}. "
                f"No esperes calidez aquí — solo orden."
            ),
            color=EMBED_COLOR_INFO,
        )
        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"Miembro #{guild.member_count}")
        await channel.send(embed=embed)
    else:
        log.warning(f"Canal de bienvenida (ID {WELCOME_CHANNEL_ID}) no encontrado")

    # --- Ventana de ingresos para detección de raid ---
    join_times.append(now)
    while join_times and now - join_times[0] > RAID_JOIN_WINDOW:
        join_times.popleft()

    if len(join_times) >= RAID_JOIN_THRESHOLD and not raid_mode:
        raid_mode = True
        locked = []
        everyone = guild.default_role
        for text_channel in guild.text_channels:
            overwrite = text_channel.overwrites_for(everyone)
            if overwrite.send_messages is not False:
                overwrite.send_messages = False
                try:
                    await text_channel.set_permissions(everyone, overwrite=overwrite,
                                                         reason="Lockdown automático por raid")
                    locked.append(text_channel)
                except discord.Forbidden:
                    continue
        locked_channels.clear()
        locked_channels.extend(locked)

        await log_event(
            guild, "🔒 Modo raid activado",
            f"Se detectaron {len(join_times)} ingresos en {RAID_JOIN_WINDOW}s.\n"
            f"Se bloqueó el envío de mensajes en {len(locked)} canal(es).\n"
            f"Se levantará automáticamente en {RAID_LOCKDOWN_MINUTES} minuto(s).",
            EMBED_COLOR_ALERT,
        )

        if raid_unlock_task:
            raid_unlock_task.cancel()
        raid_unlock_task = bot.loop.create_task(unlock_after_delay(guild, RAID_LOCKDOWN_MINUTES * 60))

    # --- Alerta de cuenta nueva (sin cuarentena, solo aviso) ---
    account_age = discord.utils.utcnow() - member.created_at
    if account_age < timedelta(days=MIN_ACCOUNT_AGE_DAYS):
        await log_event(
            guild, "⚠️ Cuenta nueva detectada",
            f"{member.mention} (`{member.id}`) tiene una cuenta creada hace "
            f"{account_age.days} día(s). Revisa su actividad.",
            EMBED_COLOR_ALERT,
        )


async def unlock_after_delay(guild: discord.Guild, delay_seconds: int):
    global raid_mode
    await discord.utils.sleep_until(discord.utils.utcnow() + timedelta(seconds=delay_seconds))
    everyone = guild.default_role
    for text_channel in locked_channels:
        overwrite = text_channel.overwrites_for(everyone)
        overwrite.send_messages = None
        try:
            await text_channel.set_permissions(everyone, overwrite=overwrite,
                                                 reason="Fin de lockdown automático")
        except discord.Forbidden:
            continue
    raid_mode = False
    locked_channels.clear()
    await log_event(guild, "🔓 Lockdown levantado",
                     "El modo raid terminó, los canales volvieron a la normalidad.")


# ---------------------------------------------------------------------------
# Anti-nuke: borrado masivo de canales/roles
# ---------------------------------------------------------------------------

async def register_nuke_action(guild: discord.Guild, action: discord.AuditLogAction, what: str):
    actor = await get_audit_actor(guild, action)
    if actor is None or (actor.bot and actor.id == bot.user.id):
        return

    now = time.monotonic()
    dq = nuke_actions[actor.id]
    dq.append(now)
    while dq and now - dq[0] > NUKE_ACTION_WINDOW:
        dq.popleft()

    await log_event(
        guild, f"⚠️ {what} eliminado",
        f"Acción registrada, autor probable: {actor.mention} (`{actor.id}`)",
        EMBED_COLOR_ALERT,
    )

    if len(dq) >= NUKE_ACTION_THRESHOLD:
        member = guild.get_member(actor.id)
        if member:
            try:
                for role in list(member.roles):
                    if role != guild.default_role:
                        await member.remove_roles(role, reason="Anti-nuke: actividad sospechosa")
                await guild.ban(member, reason="Anti-nuke: eliminación masiva de canales/roles",
                                 delete_message_days=0)
                await log_event(
                    guild, "🚨 Respuesta anti-nuke ejecutada",
                    f"{actor.mention} (`{actor.id}`) fue baneado por eliminar "
                    f"{len(dq)} canal(es)/rol(es) en {NUKE_ACTION_WINDOW}s.",
                    EMBED_COLOR_ALERT,
                )
            except discord.Forbidden:
                await log_event(
                    guild, "🚨 Anti-nuke detectado pero sin permisos suficientes",
                    f"No se pudo sancionar a {actor.mention} — revisa la jerarquía de roles.",
                    EMBED_COLOR_ALERT,
                )


@bot.event
async def on_guild_channel_delete(channel: discord.abc.GuildChannel):
    await register_nuke_action(channel.guild, discord.AuditLogAction.channel_delete,
                                f"Canal #{channel.name}")


@bot.event
async def on_guild_role_delete(role: discord.Role):
    await register_nuke_action(role.guild, discord.AuditLogAction.role_delete,
                                f"Rol {role.name}")


# ---------------------------------------------------------------------------
# Anti mention-spam y filtro de invitaciones
# ---------------------------------------------------------------------------

@bot.event
async def on_message(message: discord.Message):
    if message.author.bot or not message.guild:
        return

    member = message.author
    unique_mentions = {m.id for m in message.mentions}

    if len(unique_mentions) >= MENTION_SPAM_LIMIT:
        try:
            await message.delete()
            await member.timeout(timedelta(minutes=MENTION_TIMEOUT_MINUTES), reason="Mention spam")
            await log_event(
                message.guild, "Mention spam detectado",
                f"{member.mention} mencionó a {len(unique_mentions)} usuarios en un mensaje.\n"
                f"Timeout aplicado: {MENTION_TIMEOUT_MINUTES} minuto(s).",
                EMBED_COLOR_ALERT,
            )
        except discord.Forbidden:
            log.error("Sin permisos para borrar mensaje o aplicar timeout (mention spam)")
        return

    if INVITE_REGEX.search(message.content) and not member.guild_permissions.manage_guild:
        try:
            await message.delete()
            await log_event(
                message.guild, "Invitación bloqueada",
                f"Se eliminó un mensaje de {member.mention} con una invitación a otro servidor.",
                EMBED_COLOR_ALERT,
            )
        except discord.Forbidden:
            log.error("Sin permisos para borrar mensaje con invitación")
        return

    # Importante: deja pasar el mensaje a los comandos con prefijo (!)
    await bot.process_commands(message)


# ---------------------------------------------------------------------------
# Logging de baneos / expulsiones
# ---------------------------------------------------------------------------

@bot.event
async def on_member_ban(guild: discord.Guild, user: discord.User):
    actor = await get_audit_actor(guild, discord.AuditLogAction.ban)
    actor_text = f" por {actor.mention}" if actor else ""
    await log_event(guild, "Usuario baneado", f"{user.mention} (`{user.id}`) fue baneado{actor_text}.")


@bot.event
async def on_member_remove(member: discord.Member):
    actor = await get_audit_actor(member.guild, discord.AuditLogAction.kick)
    if actor:
        await log_event(member.guild, "Usuario expulsado",
                         f"{member.mention} (`{member.id}`) fue expulsado por {actor.mention}.")


# ---------------------------------------------------------------------------
# Arranque
# ---------------------------------------------------------------------------

async def main():
    if not TOKEN:
        raise RuntimeError("Falta DISCORD_TOKEN en las variables de entorno (.env)")
    async with bot:
        for cog in INITIAL_COGS:
            await bot.load_extension(cog)
            log.info(f"Cog cargado: {cog}")
        await bot.start(TOKEN)


if __name__ == "__main__":
    asyncio.run(main())
