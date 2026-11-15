import { describe, expect, it } from 'vitest';

export interface DragState {
  isMouseDown: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  hasDragged: boolean;
}

export const DRAG_THRESHOLD_PX = 5;

export function shouldStartDrag(startX: number, startY: number, currentX: number, currentY: number): boolean {
  const dist = Math.hypot(currentX - startX, currentY - startY);
  return dist > DRAG_THRESHOLD_PX;
}

export function computeDragDelta(lastX: number, lastY: number, currentX: number, currentY: number) {
  return {
    dx: currentX - lastX,
    dy: currentY - lastY,
  };
}

export function computeNewPosition(currentX: number, currentY: number, dx: number, dy: number) {
  return {
    x: Math.round(currentX + dx),
    y: Math.round(currentY + dy),
  };
}

export function clampWindowPosition(x: number, y: number, screenWidth: number, screenHeight: number, petWidth = 280, petHeight = 320) {
  // Keep at least 40px of the pet visible on screen so it can't be dragged off entirely
  const minX = -(petWidth - 40);
  const maxX = screenWidth - 40;
  const minY = 0;
  const maxY = screenHeight - 40;

  return {
    x: Math.max(minX, Math.min(x, maxX)),
    y: Math.max(minY, Math.min(y, maxY)),
  };
}

describe('Mascot Drag & Drop Engine', () => {
  it('does not trigger drag when movement is within the click deadzone (<= 5px)', () => {
    expect(shouldStartDrag(100, 100, 102, 103)).toBe(false); // dist = sqrt(4 + 9) = 3.6px
    expect(shouldStartDrag(100, 100, 105, 100)).toBe(false); // dist = 5px
  });

  it('triggers drag when movement exceeds the 5px threshold', () => {
    expect(shouldStartDrag(100, 100, 106, 100)).toBe(true); // dist = 6px
    expect(shouldStartDrag(100, 100, 104, 105)).toBe(true); // dist = sqrt(16 + 25) = 6.4px
  });

  it('computes relative movement deltas correctly', () => {
    const delta1 = computeDragDelta(100, 200, 120, 215);
    expect(delta1).toEqual({ dx: 20, dy: 15 });

    const delta2 = computeDragDelta(120, 215, 110, 205);
    expect(delta2).toEqual({ dx: -10, dy: -10 });
  });

  it('accurately accumulates movement to update position', () => {
    let pos = { x: 500, y: 400 };
    const step1 = computeDragDelta(100, 100, 130, 150);
    pos = computeNewPosition(pos.x, pos.y, step1.dx, step1.dy);
    expect(pos).toEqual({ x: 530, y: 450 });

    const step2 = computeDragDelta(130, 150, 110, 130);
    pos = computeNewPosition(pos.x, pos.y, step2.dx, step2.dy);
    expect(pos).toEqual({ x: 510, y: 430 });
  });

  it('clamps window position so the pet is never lost off screen', () => {
    const screenWidth = 1920;
    const screenHeight = 1080;

    // Normal position in bounds
    expect(clampWindowPosition(1000, 500, screenWidth, screenHeight)).toEqual({ x: 1000, y: 500 });

    // Extreme left
    expect(clampWindowPosition(-500, 500, screenWidth, screenHeight)).toEqual({ x: -240, y: 500 });

    // Extreme right
    expect(clampWindowPosition(3000, 500, screenWidth, screenHeight)).toEqual({ x: 1880, y: 500 });

    // Top edge
    expect(clampWindowPosition(500, -200, screenWidth, screenHeight)).toEqual({ x: 500, y: 0 });

    // Bottom edge
    expect(clampWindowPosition(500, 2000, screenWidth, screenHeight)).toEqual({ x: 500, y: 1040 });
  });
});
