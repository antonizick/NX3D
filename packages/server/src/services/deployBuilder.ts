import path from 'node:path';
import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getTenant, tenantRoot as tenantRootDir } from './tenantService.js';
import { ensureDir, writeJson } from './fileStore.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
// Always resolve against source dir so the template is found in both dev and compiled modes
const TEMPLATES_DIR = path.join(PROJECT_ROOT, 'packages', 'server', 'src', 'templates');

export interface BuildInfo {
  builtAt: string;
  filename: string;
  slug: string;
  size: number;
}

function toSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
}

function deployDir(tenantId: string): string {
  return path.join(tenantRootDir(tenantId), 'deploy');
}

export async function getBuildInfo(tenantId: string): Promise<BuildInfo | null> {
  try {
    const raw = await fs.readFile(path.join(deployDir(tenantId), 'build-info.json'), 'utf8');
    return JSON.parse(raw) as BuildInfo;
  } catch {
    return null;
  }
}

export function primaryPackagePath(tenantId: string, slug: string): string {
  return path.join(deployDir(tenantId), `${slug}-game.tar.gz`);
}

export async function buildDeployPackage(tenantId: string): Promise<BuildInfo> {
  const cfg = await getTenant(tenantId);
  if (!cfg) throw new Error('Tenant not found');

  const slug = toSlug(cfg.game.title);
  const gameDir = path.join(PROJECT_ROOT, 'packages', 'game');
  const tenantRoot = tenantRootDir(tenantId);
  const dDir = deployDir(tenantId);
  const archiveDir = path.join(dDir, 'archive');

  // Build game Vite frontend
  await execFileAsync('npm', ['run', 'build'], {
    cwd: gameDir,
    env: { ...process.env, NODE_ENV: 'production' },
    timeout: 120_000,
  });

  // Prepare temp staging directory
  const tmpDir = await fs.mkdtemp('/tmp/cwdeploy-');
  try {
    const pkgDir = path.join(tmpDir, `${slug}-game`);
    await ensureDir(pkgDir);

    // Built game frontend
    await copyDirFs(path.join(gameDir, 'dist'), path.join(pkgDir, 'public'));

    // Tenant data (no saves, no users)
    const tenantDest = path.join(pkgDir, 'tenant');
    await ensureDir(tenantDest);
    await copyDirFs(path.join(tenantRoot, 'assets'), path.join(tenantDest, 'assets'));
    await copyDirFs(path.join(tenantRoot, 'levels'), path.join(tenantDest, 'levels'));

    // Strip logoUrl — it's a remote URL, irrelevant in standalone
    const standaloneConfig = { ...cfg };
    delete standaloneConfig.logoUrl;
    await fs.writeFile(
      path.join(tenantDest, 'config.json'),
      JSON.stringify(standaloneConfig, null, 2)
    );
    await ensureDir(path.join(tenantDest, 'saves'));

    // Standalone server
    await fs.writeFile(path.join(pkgDir, 'server.mjs'), generateServerMjs(tenantId, cfg.game.title));

    // Package.json (server deps only — no build needed on target)
    await fs.writeFile(path.join(pkgDir, 'package.json'), JSON.stringify({
      name: 'customwolf-standalone',
      version: '1.0.0',
      type: 'module',
      scripts: { start: 'node server.mjs' },
      dependencies: {
        '@fastify/static': '^7.0.4',
        fastify: '^4.28.1',
      },
    }, null, 2));

    // Install script from template
    const installSh = await generateInstallSh(cfg.game.title, slug, tenantId);
    await fs.writeFile(path.join(pkgDir, 'install.sh'), installSh, { mode: 0o755 });

    // Create tar.gz
    await ensureDir(dDir);
    await ensureDir(archiveDir);

    const primary = `${slug}-game.tar.gz`;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archived = `${slug}-game-${ts}.tar.gz`;
    const primaryPath = path.join(dDir, primary);
    const archivePath = path.join(archiveDir, archived);

    await execFileAsync('tar', ['czf', primaryPath, '-C', tmpDir, `${slug}-game`], { timeout: 60_000 });
    await fs.copyFile(primaryPath, archivePath);

    const stat = await fs.stat(primaryPath);
    const builtAt = new Date().toISOString();
    const info: BuildInfo = { builtAt, filename: primary, slug, size: stat.size };
    await writeJson(path.join(dDir, 'build-info.json'), info);
    return info;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function copyDirFs(src: string, dest: string): Promise<void> {
  await ensureDir(dest);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(src, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(entries.map(async e => {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyDirFs(s, d);
    else await fs.copyFile(s, d);
  }));
}

// ─── Install script (template-based — no TS escaping headaches) ──────────────

async function generateInstallSh(gameTitle: string, slug: string, tenantId: string): Promise<string> {
  const tmpl = await fs.readFile(path.join(TEMPLATES_DIR, 'install.sh'), 'utf8');
  // Single-quote-safe escaping for the title
  const safeTitle = gameTitle.replace(/'/g, "'\\''");
  return tmpl
    .replace(/%%GAME_TITLE%%/g, safeTitle)
    .replace(/%%GAME_SLUG%%/g, slug)
    .replace(/%%TENANT_ID%%/g, tenantId);
}

// ─── Embedded standalone server (no bash content — safe as template literal) ─

function generateServerMjs(tenantId: string, gameTitle: string): string {
  // Template expressions inside the returned string are intentional JS,
  // escaped with \${ } so they survive being embedded inside this TS template.
  return `import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT       = parseInt(process.env.PORT ?? '8080', 10);
const TENANT_ID  = ${JSON.stringify(tenantId)};
const TITLE      = ${JSON.stringify(gameTitle)};
const TENANT_DIR = path.join(__dirname, 'tenant');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SAVES_DIR  = path.join(TENANT_DIR, 'saves');

async function rj(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return null; }
}

async function main() {
  await fs.mkdir(SAVES_DIR, { recursive: true });
  const app = Fastify({ logger: false });

  await app.register(fastifyStatic, {
    root: PUBLIC_DIR, prefix: '/game/', decorateReply: true, index: false,
  });
  await app.register(fastifyStatic, {
    root: path.dirname(TENANT_DIR), prefix: '/assets/', decorateReply: false, index: false,
  });

  app.get(\`/api/game/\${TENANT_ID}/config\`, async (_, reply) => {
    const cfg = await rj(path.join(TENANT_DIR, 'config.json'));
    return cfg ? reply.send(cfg) : reply.status(404).send({ error: 'Not found' });
  });

  app.get(\`/api/game/\${TENANT_ID}/level/:levelId\`, async (req, reply) => {
    const n = parseInt(req.params.levelId, 10);
    const level = await rj(path.join(TENANT_DIR, 'levels', \`level_\${String(n).padStart(2,'0')}.json\`));
    return level ? reply.send(level) : reply.status(404).send({ error: 'Level not found' });
  });

  app.get(\`/api/game/\${TENANT_ID}/save\`, async (_, reply) => {
    const save = await rj(path.join(SAVES_DIR, 'player_save.json'));
    return save ? reply.send(save) : reply.status(404).send({ error: 'No save' });
  });

  app.post(\`/api/game/\${TENANT_ID}/save\`, async (req, reply) => {
    await fs.mkdir(SAVES_DIR, { recursive: true });
    const data = { ...req.body, playerId: 'player', tenantId: TENANT_ID, savedAt: new Date().toISOString() };
    await fs.writeFile(path.join(SAVES_DIR, 'player_save.json'), JSON.stringify(data, null, 2));
    return reply.send({ ok: true });
  });

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/game')) {
      try {
        const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
        return reply.type('text/html').send(html);
      } catch {
        return reply.status(503).send('Game frontend unavailable.');
      }
    }
    return reply.status(404).send({ error: 'Not found' });
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });

  const nets = (await import('node:os')).networkInterfaces();
  const ip = Object.values(nets).flat().find(i => i?.family === 'IPv4' && !i.internal)?.address ?? 'localhost';
  console.log('');
  console.log(\`  \\x1b[32m✓\\x1b[0m  \\x1b[1m\${TITLE}\\x1b[0m  is running\`);
  console.log(\`     Local  : \\x1b[36mhttp://localhost:\${PORT}/game/\${TENANT_ID}\\x1b[0m\`);
  console.log(\`     Network: \\x1b[36mhttp://\${ip}:\${PORT}/game/\${TENANT_ID}\\x1b[0m\`);
  console.log('');
}

main().catch(err => { console.error(err); process.exit(1); });
`;
}
