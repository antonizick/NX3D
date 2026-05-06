import type { GameState } from '../types/index.ts';

export type MenuAction = 'newgame' | 'continue' | 'save' | 'load' | 'quit' | 'easy' | 'normal' | 'hard' | 'resume';

interface MenuItem { label: string; action: MenuAction; }

const MAIN_MENU: MenuItem[] = [
  { label: 'Play Game',  action: 'newgame'  },
  { label: 'Exit Game',  action: 'quit'     },
];

const DIFFICULTY_MENU: MenuItem[] = [
  { label: 'Easy',   action: 'easy'   },
  { label: 'Normal', action: 'normal' },
  { label: 'Hard',   action: 'hard'   },
];

const PAUSE_MENU: MenuItem[] = [
  { label: 'Resume Game',       action: 'resume' },
  { label: 'Exit to Main Menu', action: 'quit'   },
];

function drawBranding(
  ctx: CanvasRenderingContext2D,
  sw: number,
  topY: number,
  title: string,
  logoImg: HTMLImageElement | null
): number {
  const cx = sw / 2;
  let y = topY;

  if (logoImg) {
    const maxW = Math.min(sw * 0.9, 800);
    const maxH = 320;
    const scale = Math.min(maxW / logoImg.naturalWidth, maxH / logoImg.naturalHeight);
    const dw = logoImg.naturalWidth  * scale;
    const dh = logoImg.naturalHeight * scale;
    ctx.drawImage(logoImg, cx - dw / 2, y, dw, dh);
    y += dh + 14;
  }

  ctx.fillStyle  = '#c8a000';
  ctx.font       = 'bold 36px monospace';
  ctx.textAlign  = 'center';
  ctx.fillText(title.toUpperCase(), cx, y);
  y += 10;

  return y;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, font: string): string[] {
  ctx.save();
  ctx.font = font;
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para.trim()) { lines.push(''); continue; }
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  ctx.restore();
  return lines;
}

export class Menu {
  private selectedIdx   = 0;
  private items: MenuItem[] = MAIN_MENU;
  private mode: 'main' | 'difficulty' | 'pause' = 'main';

  draw(
    ctx: CanvasRenderingContext2D,
    sw: number,
    sh: number,
    title: string,
    logoImg: HTMLImageElement | null = null,
    narrative?: string
  ): void {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, sw, sh);

    const brandingTop = sh / 5;
    const titleBottom = drawBranding(ctx, sw, brandingTop, title, logoImg);

    this.items.forEach((item, i) => {
      const isSelected = i === this.selectedIdx;
      ctx.fillStyle = isSelected ? '#ffffff' : '#888888';
      ctx.font      = isSelected ? 'bold 22px monospace' : '20px monospace';
      const y       = titleBottom + 40 + i * 40;
      ctx.fillText((isSelected ? '> ' : '  ') + item.label, sw / 2, y);
    });

    if (narrative?.trim() && this.mode === 'main') {
      const lastItemY = titleBottom + 40 + (this.items.length - 1) * 40;
      const narrativeCenterY = (lastItemY + (sh - 60)) / 2;
      const font = '18px monospace';
      const lines = wrapText(ctx, narrative.trim(), sw * 0.65, font);
      const lineHeight = 26;
      const blockH = lines.length * lineHeight;
      let y = narrativeCenterY - blockH / 2 + lineHeight;

      ctx.font      = font;
      ctx.fillStyle = '#c8a000';
      ctx.textAlign = 'center';
      for (const line of lines) {
        ctx.fillText(line, sw / 2, y);
        y += lineHeight;
      }
    }

    ctx.fillStyle = '#555555';
    ctx.font      = '12px monospace';
    ctx.fillText('↑↓ to select · ENTER to choose · ESC to cancel', sw / 2, sh - 40);
  }

  navigate(direction: 'up' | 'down'): void {
    if (direction === 'up') {
      this.selectedIdx = (this.selectedIdx - 1 + this.items.length) % this.items.length;
    } else {
      this.selectedIdx = (this.selectedIdx + 1) % this.items.length;
    }
  }

  select(): MenuAction | null {
    const action = this.items[this.selectedIdx]?.action ?? null;
    if (action === 'newgame') {
      this.mode  = 'difficulty';
      this.items = DIFFICULTY_MENU;
      this.selectedIdx = 1;
      return null;
    }
    return action;
  }

  reset(): void {
    this.mode        = 'main';
    this.items       = MAIN_MENU;
    this.selectedIdx = 0;
  }

  enterPause(): void {
    this.mode        = 'pause';
    this.items       = PAUSE_MENU;
    this.selectedIdx = 0;
  }

  static drawLoading(
    ctx: CanvasRenderingContext2D,
    sw: number,
    sh: number,
    title: string,
    logoImg: HTMLImageElement | null = null
  ): void {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, sw, sh);

    const brandingTop  = sh / 5;
    const titleBottom  = drawBranding(ctx, sw, brandingTop, title, logoImg);

    const dots = '.'.repeat((Math.floor(Date.now() / 400) % 4));
    ctx.fillStyle = '#ffffff';
    ctx.font      = 'bold 24px monospace';
    ctx.fillText(`LOADING${dots}`, sw / 2, titleBottom + 60);

    ctx.fillStyle = '#555555';
    ctx.font      = '18px monospace';
    ctx.fillText('Preparing level — please wait', sw / 2, titleBottom + 100);
  }

  static drawStateOverlay(
    ctx: CanvasRenderingContext2D,
    sw: number, sh: number,
    state: GameState,
    levelName: string
  ): void {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, sw, sh);

    let title = ''; let sub = '';
    switch (state) {
      case 'DEAD':           title = 'YOU DIED';         sub = 'Press ENTER to continue'; break;
      case 'LEVEL_COMPLETE': title = levelName.toUpperCase(); sub = 'Press ENTER for next level'; break;
      case 'WIN':            title = 'MISSION COMPLETE'; sub = 'Congratulations!'; break;
    }

    ctx.fillStyle = '#c8a000';
    ctx.font      = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(title, sw / 2, sh / 2 - 20);

    ctx.fillStyle = '#ffffff';
    ctx.font      = '26px monospace';
    ctx.fillText(sub, sw / 2, sh / 2 + 30);
  }

  static drawMessageOverlay(
    ctx: CanvasRenderingContext2D,
    sw: number,
    sh: number,
    message: string,
    primaryColor = '#c8a000'
  ): void {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, sw, sh);

    const font = '20px monospace';
    const lines = wrapText(ctx, message.trim(), sw * 0.72, font);
    const lineHeight = 28;
    const blockH = lines.length * lineHeight;
    let y = sh / 2 - blockH / 2;

    ctx.font      = font;
    ctx.fillStyle = primaryColor;
    ctx.textAlign = 'center';
    for (const line of lines) {
      if (line) ctx.fillText(line, sw / 2, y);
      y += lineHeight;
    }

    ctx.fillStyle = '#555555';
    ctx.font      = '12px monospace';
    ctx.fillText('Press ENTER to continue', sw / 2, sh - 50);
  }
}
