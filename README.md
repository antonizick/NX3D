# CustomWolf

Browser-based multi-tenant Wolfenstein 3D clone. Built with a Fastify backend, React 19 admin panel, and a pure-TypeScript HTML5 Canvas game engine. No database — 100% filesystem JSON.

## Architecture

```
packages/
├── server/    # Fastify API (port 3001) — auth, tenants, assets, levels, game routes
├── admin/     # React 19 + Vite (port 5173) — multi-tenant management dashboard
└── game/      # TypeScript + Vite (port 5174) — HTML5 Canvas raycaster game engine

tenants/
└── {tenantId}/
    ├── config.json           # Theme, enemies, weapons, items, game settings
    ├── users.json            # User records
    ├── assets/               # Textures, sprites, sounds (per-tenant)
    ├── levels/               # BSP-generated level definitions
    ├── saves/                # Player save data
    └── deploy/               # Self-contained game archives
```

## Features

- **DDA raycaster engine** — pixel-accurate rendering at 640×400 with N/S wall shading
- **Sprite system** — enemies, weapons, items, projectiles with angle-aware animation frames
- **Enemy AI** — alert, chase, attack, death states with configurable per-tenant stats
- **Weapon system** — hitscan and projectile weapons with configurable damage/rate-of-fire
- **Level generator** — BSP room generation with BFS connectivity guarantee
- **Multi-tenant** — fully isolated tenants with per-tenant themes, assets, and config
- **Admin panel** — tenant management, asset uploads, level editing, user management, MFA support
- **Deploy system** — build self-contained `.tar.gz` archives for standalone deployment
- **Audio** — positional sound effects, looping music, level-complete sequences
- **Docker + Caddy** — production-ready deployment with HTTPS

## Quick Start

### Prerequisites

- Node.js >= 22
- npm >= 10

### Development

```bash
# Clone and install
npm install

# Start all services (server + admin + game)
npm run dev

# Or use the dev script directly
bash dev.sh
```

| Service | URL | Description |
|---------|-----|-------------|
| Server | `http://localhost:3001` | Fastify API |
| Admin | `http://localhost:5173/admin/` | Management dashboard |
| Game | `http://localhost:5174/game/{tenantId}` | Game client |

### First-Time Setup

```bash
# Seed the database (creates default tenant + admin user)
cd packages/server && npx tsx seed.ts
```

Default credentials: **admin** / **changeme123**

### Production (Docker)

```bash
# Set environment variables
cp .env.example packages/server/.env
# Edit JWT_SECRET, COOKIE_SECRET, etc.

docker compose up -d
```

## Building

```bash
npm run build    # Build all packages
npm start        # Run production server
```

## Tenant Data Structure

All tenant data lives on the filesystem under `tenants/{tenantId}/`:

| Path | Description |
|------|-------------|
| `config.json` | Tenant configuration (theme, enemies, weapons, items, game settings) |
| `users.json` | User records with roles and permissions |
| `assets/textures/` | Wall, floor, ceiling, door textures (RGB WebP) |
| `assets/sprites/enemies/` | Enemy walk/attack/death/pain frames (RGBA WebP) |
| `assets/sprites/weapons/` | Weapon sprite frames (RGBA WebP) |
| `assets/sprites/items/` | Item sprites (RGBA WebP) |
| `assets/sprites/projectiles/` | Projectile sprites (RGBA WebP) |
| `assets/sprites/player_portraits/` | Player face states (6 files) |
| `assets/sounds/` | Music, player, enemy, weapon, item sounds (MP3) |
| `levels/` | Level definitions (`level_01.json`, etc.) |
| `saves/` | Player save data |
| `deploy/` | Built game archives |

## Asset URL Pattern

Assets are served with a double-`assets/` path:

```
/assets/{tenantId}/assets/textures/wall_stone.webp
/assets/{tenantId}/assets/sprites/enemies/guard/walk_0_0.webp
/assets/{tenantId}/assets/sounds/music/background.mp3
```

## Key Conventions

- **Server** uses ESM — imports end in `.js`
- **Admin/Game** use Vite — imports use `.ts`/`.tsx`
- All file writes go through `writeJson()` (atomic writes)
- Sprite keys follow `"enemyId/stateName_angle_frame"` format
- Game canvas runs at 640×400, CSS-scaled with `image-rendering: pixelated`
- HUD is a separate overlay canvas positioned absolute on top of the game canvas

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all services concurrently |
| `npm run build` | Build all packages for production |
| `npm start` | Run production server |
| `npx tsx packages/server/generateDefaultAssets.ts` | Generate default pixel-art textures + portraits |
| `npx tsx packages/server/generateSpriteAssets.ts` | Generate enemy, weapon, item, projectile sprites |

## Tech Stack

- **Backend:** Node.js 22, Fastify, ESM, filesystem JSON store
- **Admin:** React 19, TypeScript, Vite, TanStack Query, Sonner toasts
- **Game:** TypeScript, Vite, HTML5 Canvas (2D), DDA raycasting
- **Deployment:** Docker, Caddy, systemd (standalone)

## License

Private — all rights reserved.
