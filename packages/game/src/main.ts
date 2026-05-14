/**
 * Game entry point.
 *
 * URL pattern: /game/:tenantId[?episode=1&level=1&difficulty=normal]
 * Authentication cookie is sent automatically by the browser.
 */
import { Game } from './engine/Game.ts';
import type { TenantConfig, SaveData } from './types/index.ts';

async function bootstrap(): Promise<void> {
  // Extract tenantId from URL: /game/:tenantId/...
  const segments = window.location.pathname.split('/').filter(Boolean);
  // segments[0] = 'game', segments[1] = tenantId
  const tenantId = segments[1];

  if (!tenantId) {
    const p = document.createElement('p');
    p.style.color = '#fff';
    p.style.padding = '2rem';
    p.textContent = 'No tenant specified in URL. Use /game/{tenantId}';
    document.body.appendChild(p);
    return;
  }

  // Load config
  let cfg: TenantConfig;
  try {
    const res = await fetch(`/api/game/${tenantId}/config`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cfg = await res.json();
    document.title = cfg.game.title;
  } catch (err) {
    const p = document.createElement('p');
    p.style.color = 'red';
    p.style.padding = '2rem';
    p.textContent = `Failed to load tenant config: ${err}`;
    document.body.appendChild(p);
    return;
  }

  // Load existing save (may 404 — that's fine)
  let save: SaveData | null = null;
  try {
    const saveRes = await fetch(`/api/game/${tenantId}/save`, { credentials: 'include' });
    if (saveRes.ok) save = await saveRes.json();
  } catch {
    // No save — start fresh
  }

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas element not found');

  const game = new Game(canvas, cfg, tenantId, save);
  await game.init();
}

bootstrap().catch(err => {
  console.error('Fatal game error:', err);
  const p = document.createElement('p');
  p.style.color = 'red';
  p.style.padding = '2rem';
  p.style.fontFamily = 'monospace';
  p.textContent = `Fatal error: ${err.message}`;
  document.body.appendChild(p);
});
