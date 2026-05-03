import type { GameState } from '../types/index.ts';

export type MenuAction = 'newgame' | 'continue' | 'save' | 'load' | 'quit' | 'easy' | 'normal' | 'hard' | 'resume';

type TexSize = 64 | 128 | 256;
const SIZES: readonly TexSize[] = [64, 128, 256];

function resButtonBounds(sw: number, sh: number): Array<{ x: number; y: number; w: number; h: number; size: TexSize }> {
  const btnW = 74, btnH = 22, gap = 8;
  const startX = (sw - (3 * btnW + 2 * gap)) / 2;
  const y = sh - 90;
  return [
    { x: startX,                   y, w: btnW, h: btnH, size: 64  },
    { x: startX + btnW + gap,      y, w: btnW, h: btnH, size: 128 },
    { x: startX + 2*(btnW + gap),  y, w: btnW, h: btnH, size: 256 },
  ];
}

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
  private resFocused    = false;
  private resIdx        = 0;   // index into SIZES

  draw(
    ctx: CanvasRenderingContext2D,
    sw: number,
    sh: number,
    title: string,
    logoImg: HTMLImageElement | null = null,
    texSize: TexSize = 64,
    narrative?: string
  ): void {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, sw, sh);

    const brandingTop = sh / 5;
    const titleBottom = drawBranding(ctx, sw, brandingTop, title, logoImg);

    this.items.forEach((item, i) => {
      const isSelected = !this.resFocused && i === this.selectedIdx;
      ctx.fillStyle = isSelected ? '#ffffff' : '#888888';
      ctx.font      = isSelected ? 'bold 22px monospace' : '20px monospace';
      const y       = titleBottom + 40 + i * 40;
      ctx.fillText((isSelected ? '> ' : '  ') + item.label, sw / 2, y);
    });

    // Narrative text — shown below menu items on main screen only
    if (narrative?.trim() && this.mode === 'main') {
      const lastItemY = titleBottom + 40 + (this.items.length - 1) * 40;
      const resButtonsTop = sh - 110;
      const narrativeCenterY = (lastItemY + resButtonsTop) / 2;
      const font = '13px monospace';
      const lines = wrapText(ctx, narrative.trim(), sw * 0.65, font);
      const lineHeight = 20;
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

    if (this.mode === 'main') {
      const buttons = resButtonBounds(sw, sh);
      const midY    = buttons[0]!.y + buttons[0]!.h / 2;

      // Row label
      ctx.font      = '10px monospace';
      ctx.fillStyle = this.resFocused ? '#777777' : '#3a3a3a';
      ctx.fillText('TEXTURE', sw / 2, buttons[0]!.y - 5);

      // Outer nav arrows (only when focused)
      if (this.resFocused) {
        ctx.fillStyle = '#666666';
        ctx.font      = '13px monospace';
        ctx.fillText('◄', buttons[0]!.x - 14, midY + 5);
        ctx.fillText('►', buttons[2]!.x + buttons[2]!.w + 14, midY + 5);
      }

      ctx.font = '11px monospace';
      for (let i = 0; i < buttons.length; i++) {
        const btn      = buttons[i]!;
        const isCurrent = btn.size === texSize;
        const isFocused = this.resFocused && i === this.resIdx;

        if (isFocused) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth   = 1;
          ctx.strokeRect(btn.x + 0.5, btn.y + 0.5, btn.w - 1, btn.h - 1);
          ctx.fillStyle   = '#ffffff';
        } else if (isCurrent) {
          ctx.strokeStyle = '#c8a000';
          ctx.lineWidth   = 1;
          ctx.strokeRect(btn.x + 0.5, btn.y + 0.5, btn.w - 1, btn.h - 1);
          ctx.fillStyle   = '#c8a000';
        } else {
          ctx.fillStyle = this.resFocused ? '#555555' : '#3a3a3a';
        }

        ctx.fillText(`${btn.size}×${btn.size}`, btn.x + btn.w / 2, midY + 4);
      }

      // Focus indicator when the whole row is navigated to but arrow keys haven't been used
      if (this.resFocused) {
        ctx.fillStyle = '#555555';
        ctx.font      = '10px monospace';
        ctx.fillText('← → change  ·  ENTER confirm', sw / 2, buttons[0]!.y + buttons[0]!.h + 13);
      }
    }
  }

  navigate(direction: 'up' | 'down'): void {
    if (this.mode === 'main') {
      if (this.resFocused) {
        this.resFocused = false;
        if (direction === 'down') this.selectedIdx = 0;
        // up: selectedIdx stays on last item (where we came from)
      } else {
        const n = this.items.length;
        if (direction === 'down') {
          if (this.selectedIdx === n - 1) { this.resFocused = true; }
          else { this.selectedIdx++; }
        } else {
          if (this.selectedIdx === 0) { this.resFocused = true; }
          else { this.selectedIdx--; }
        }
      }
    } else {
      if (direction === 'up') {
        this.selectedIdx = (this.selectedIdx - 1 + this.items.length) % this.items.length;
      } else {
        this.selectedIdx = (this.selectedIdx + 1) % this.items.length;
      }
    }
  }

  navigateResolution(dir: 'left' | 'right'): TexSize {
    const n = SIZES.length;
    if (dir === 'left') this.resIdx = (this.resIdx - 1 + n) % n;
    else                this.resIdx = (this.resIdx + 1) % n;
    return SIZES[this.resIdx]!;
  }

  get isResolutionFocused(): boolean { return this.resFocused && this.mode === 'main'; }

  syncTexSize(size: TexSize): void {
    const idx = SIZES.indexOf(size);
    this.resIdx = idx >= 0 ? idx : 0;
  }

  select(): MenuAction | null {
    if (this.resFocused) {
      this.resFocused = false;  // Enter confirms, returns focus to menu items
      return null;
    }
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
    this.resFocused  = false;
  }

  enterPause(): void {
    this.mode        = 'pause';
    this.items       = PAUSE_MENU;
    this.selectedIdx = 0;
    this.resFocused  = false;
  }

  static hitTestResolution(x: number, y: number, sw: number, sh: number): TexSize | null {
    for (const btn of resButtonBounds(sw, sh)) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) return btn.size;
    }
    return null;
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
    ctx.font      = '14px monospace';
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
    ctx.font      = '20px monospace';
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

    const font = '15px monospace';
    const lines = wrapText(ctx, message.trim(), sw * 0.72, font);
    const lineHeight = 22;
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
