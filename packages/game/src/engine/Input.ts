/**
 * Centralised input manager — keyboard + mouse (pointer lock).
 * Call update() once per frame to consume deltas.
 */
export class Input {
  private keys = new Set<string>();
  private mouseDX = 0;
  private mouseButtons = new Set<number>();
  private _justPressed = new Set<string>();

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', e => {
      if (!this.keys.has(e.code)) this._justPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));

    canvas.addEventListener('click', () => {
      if (!document.pointerLockElement) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement) this.mouseDX = 0;
    });
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement === canvas) {
        this.mouseDX += e.movementX;
      }
    });
    document.addEventListener('mousedown', e => this.mouseButtons.add(e.button));
    document.addEventListener('mouseup',   e => this.mouseButtons.delete(e.button));
  }

  isDown(code: string): boolean { return this.keys.has(code); }
  isMouseDown(btn = 0): boolean { return this.mouseButtons.has(btn); }

  justPressed(code: string): boolean {
    return this._justPressed.has(code);
  }

  /** Returns mouse X delta since last update() call, then resets it. */
  consumeMouseDX(): number {
    const v = this.mouseDX;
    this.mouseDX = 0;
    return v;
  }

  /** Call at END of each frame after all consumers have read input. */
  endFrame(): void {
    this._justPressed.clear();
  }

  isPointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
