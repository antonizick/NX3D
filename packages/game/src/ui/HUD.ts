/**
 * HUD — drawn on top of the 3D view in a separate 2D pass.
 * Renders on a CSS-scaled canvas so fonts look crisp even at low render resolution.
 */
import type { Player } from '../engine/Player.ts';

const FACE_SIZE  = 96;
const HUD_HEIGHT = 112;

export class HUD {
  private faceImages: HTMLImageElement[] = [];

  constructor(
    private tenantId: string,
    private hudColor: string
  ) {}

  async loadFaces(): Promise<void> {
    const names = ['face_100', 'face_80', 'face_60', 'face_40', 'face_20', 'face_0'];
    this.faceImages = await Promise.all(
      names.map(n => loadImg(`/assets/${this.tenantId}/assets/sprites/player_portraits/${n}.webp`))
    );
  }

  draw(ctx: CanvasRenderingContext2D, player: Player, sw: number, sh: number, levelTime: number, parTime: number, currentLevel: number, totalLevels: number): void {
    const hudY  = sh - HUD_HEIGHT;
    const faceX = sw / 2 - FACE_SIZE / 2;
    const faceY = hudY + (HUD_HEIGHT - FACE_SIZE) / 2;

    // Background bar
    ctx.fillStyle = this.hudColor;
    ctx.fillRect(0, hudY, sw, HUD_HEIGHT);

    // ── Health face ─────────────────────────────────────────────────────────
    const face = this.faceImages[player.faceIndex];
    if (face?.complete) {
      ctx.drawImage(face, faceX, faceY, FACE_SIZE, FACE_SIZE);
    } else {
      ctx.fillStyle = '#f0d060';
      ctx.beginPath();
      ctx.arc(faceX + FACE_SIZE / 2, faceY + FACE_SIZE / 2, FACE_SIZE / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Lives — left of face ─────────────────────────────────────────────────
    const faceMidY = faceY + FACE_SIZE / 2 + 6;
    ctx.fillStyle = '#ffffff';
    ctx.font      = 'bold 16px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`LIVES: ${player.lives}`, faceX - 8, faceMidY);

    // ── Level counter — right of face ────────────────────────────────────────
    ctx.textAlign = 'left';
    ctx.fillText(`Level ${currentLevel} of ${totalLevels}`, faceX + FACE_SIZE + 8, faceMidY);

    // ── Health ──────────────────────────────────────────────────────────────
    ctx.fillStyle = '#ff3333';
    ctx.font      = 'bold 20px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`HP: ${player.health}%`, 8, hudY + 32);

    // ── Ammo ────────────────────────────────────────────────────────────────
    const ammoType = player.currentWeapon.ammoType;
    const ammo     = ammoType === 'none' ? '∞' : (player.ammo[ammoType] ?? 0);
    ctx.fillStyle  = '#ffee00';
    ctx.textAlign  = 'right';
    ctx.fillText(`${ammo} ${ammoType !== 'none' ? ammoType.toUpperCase() : ''}`, sw - 8, hudY + 32);

    // ── Score ────────────────────────────────────────────────────────────────
    ctx.fillStyle  = '#ffffff';
    ctx.textAlign  = 'left';
    ctx.font       = '14px monospace';
    ctx.fillText(`SCORE: ${String(player.score).padStart(8, '0')}`, 8, hudY + 68);

    // ── Time ─────────────────────────────────────────────────────────────────
    const timeLeft = Math.max(0, parTime - levelTime);
    const m = Math.floor(timeLeft / 60);
    const s = Math.floor(timeLeft % 60);
    ctx.fillStyle  = timeLeft < 30 ? '#ff4444' : '#ffffff';
    ctx.textAlign  = 'right';
    ctx.fillText(`PAR ${m}:${String(s).padStart(2, '0')}`, sw - 8, hudY + 68);

    // ── Weapon name ───────────────────────────────────────────────────────────
    ctx.fillStyle  = '#aaaaaa';
    ctx.textAlign  = 'left';
    ctx.font       = '12px monospace';
    ctx.fillText(player.currentWeapon.name.toUpperCase(), 8, hudY + 96);

    // ── Pain tint (hit flash) ────────────────────────────────────────────────
    if (player.painTimer > 0) {
      const alpha = Math.min(1, player.painTimer / 150) * 0.4;
      ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
      ctx.fillRect(0, 0, sw, hudY);
    }

    // ── Low-health pulse ─────────────────────────────────────────────────────
    // Pulses when health < 30%; intensity grows as health drops further
    if (player.health < 30) {
      const pulse     = Math.sin(Date.now() / 600) * 0.5 + 0.5;
      const intensity = (30 - player.health) / 30;
      const alpha     = pulse * intensity * 0.2;
      ctx.fillStyle   = `rgba(255, 0, 0, ${alpha})`;
      ctx.fillRect(0, 0, sw, hudY);
    }
  }

  drawReticle(ctx: CanvasRenderingContext2D, sw: number, sh: number, alpha: number): void {
    if (alpha <= 0) return;
    const cx   = sw / 2;
    const cy   = (sh - HUD_HEIGHT) / 2;
    const arm  = 8;
    const gap  = 3;
    const dotR = 1.5;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur  = 4;

    ctx.beginPath();
    ctx.moveTo(cx - arm - gap, cy); ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap,       cy); ctx.lineTo(cx + arm + gap, cy);
    ctx.moveTo(cx, cy - arm - gap); ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap);       ctx.lineTo(cx, cy + arm + gap);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** Show big centred message (level name, game over, etc.) */
  drawMessage(ctx: CanvasRenderingContext2D, msg: string, subMsg: string, sw: number, sh: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, sw, sh);

    ctx.fillStyle  = '#c8a000';
    ctx.font       = 'bold 48px monospace';
    ctx.textAlign  = 'center';
    ctx.fillText(msg, sw / 2, sh / 2 - 24);

    ctx.fillStyle  = '#ffffff';
    ctx.font       = '24px monospace';
    ctx.fillText(subMsg, sw / 2, sh / 2 + 24);
  }
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(img); // resolve anyway; draw() checks .complete
    img.src = src;
  });
}
