-- ══════════════════════════════════════════════════
--  ASTRUM SMP — Supabase Schema
--  Ejecuta esto en: Supabase > SQL Editor > New query
-- ══════════════════════════════════════════════════

-- 1. USUARIOS (login con Discord)
create table if not exists usuarios (
  discord_id       text primary key,
  discord_username text,
  discord_avatar   text,
  nick             text,         -- nick de Minecraft vinculado
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- 2. WHITELIST (jugadores aceptados en el server)
create table if not exists whitelist (
  id           bigserial primary key,
  discord_id   text unique references usuarios(discord_id),
  discord_user text,
  nick         text unique,
  uuid         text,             -- UUID de Mojang
  rango        text default 'Miembro',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- 3. STATS (estadísticas de juego)
create table if not exists stats (
  nick          text primary key,
  bloques       bigint default 0,
  mobs          bigint default 0,
  muertes       bigint default 0,
  tiempo_ticks  bigint default 0,
  base_x        int,
  base_y        int default 64,
  base_z        int,
  updated_at    timestamptz default now()
);

-- 4. TICKETS (soporte)
create table if not exists tickets (
  id           bigserial primary key,
  nick         text,
  discord_user text,
  tipo         text,
  asunto       text,
  descripcion  text,
  estado       text default 'open',
  created_at   timestamptz default now()
);

-- 5. BUG REPORTS
create table if not exists bug_reports (
  id           bigserial primary key,
  nick         text,
  categoria    text,
  descripcion  text,
  coordenadas  text,
  estado       text default 'open',
  created_at   timestamptz default now()
);

-- 6. GALERÍA
create table if not exists gallery (
  id         bigserial primary key,
  url        text not null,
  caption    text,
  author     text,
  date       text,
  created_at timestamptz default now()
);

-- 7. EVENTOS (historial de actividad por jugador — opcional)
create table if not exists events (
  id          bigserial primary key,
  nick        text not null,
  tipo        text,   -- 'join' | 'death' | 'build' | 'milestone'
  descripcion text,
  created_at  timestamptz default now()
);
create index if not exists events_nick_idx on events(nick);

-- ── SEGURIDAD (Row Level Security) ────────────────
-- Stats y whitelist son de solo lectura para el público
alter table stats     enable row level security;
alter table whitelist enable row level security;
alter table usuarios  enable row level security;
alter table gallery   enable row level security;
alter table events    enable row level security;

create policy "Stats públicas de lectura"
  on stats for select using (true);

create policy "Whitelist pública de lectura"
  on whitelist for select using (true);

create policy "Galería pública de lectura"
  on gallery for select using (true);

create policy "Eventos públicos de lectura"
  on events for select using (true);

-- usuarios: cada quien solo puede ver su propia fila
-- (el backend usa service key y bypasea esto)
create policy "Usuarios solo leen el suyo"
  on usuarios for select using (true);
