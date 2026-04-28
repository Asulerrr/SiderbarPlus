import { screen, type Display } from 'electron';
import type { Edge } from '../../shared/types';
import { DOCK_WIDTH } from '../../shared/constants';

export interface DockBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 持久化的 displayId 在多屏插拔后可能失效，统一用 getTargetDisplay 兜底主屏。 */
export const getTargetDisplay = (displayId?: number): Display => {
  if (typeof displayId === 'number') {
    const found = screen.getAllDisplays().find((d) => d.id === displayId);
    if (found) {
      return found;
    }
  }
  return screen.getPrimaryDisplay();
};

export const getDockBounds = (edge: Edge, displayId?: number): DockBounds => {
  const { workArea, bounds } = getTargetDisplay(displayId);

  // X 维度用 display.bounds（屏幕物理边）而不是 workArea：我们注册了 AppBar 后
  // workArea 会被自身的占位区域收缩，再用 workArea 算 dock x 会产生递归偏移
  // （pin/unpin、edge 切换、tray 显示重注册时会一次次往里挪）。
  // Y/height 仍用 workArea，保证避开 top/bottom taskbar。
  // 已知边界：用户若有左侧任务栏 + dock 也设在左侧，dock 会和任务栏重叠。
  // 这是非常罕见的组合，v1 接受。
  return {
    x: edge === 'right' ? bounds.x + bounds.width - DOCK_WIDTH : bounds.x,
    y: workArea.y,
    width: DOCK_WIDTH,
    height: workArea.height
  };
};
