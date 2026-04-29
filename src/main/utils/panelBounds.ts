import type { Edge } from '../../shared/types';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 将 config 中存储的百分比（30-100）转为像素。旧配置可能存像素值，超范围时回退默认 50%。 */
export const percentToPanelPx = (panelDefaultWidth: number, workAreaWidth: number): number => {
  const percent = panelDefaultWidth >= 25 && panelDefaultWidth <= 100 ? panelDefaultWidth : 50;
  return Math.round((workAreaWidth * percent) / 100);
};

export const getPreferredPanelWidth = (
  preferredWidth: number | undefined,
  fallbackWidth: number,
  workAreaWidth: number
): number => {
  if (typeof preferredWidth !== 'number' || !Number.isFinite(preferredWidth) || preferredWidth <= 0) {
    return fallbackWidth;
  }

  // [25, 100] 视为百分比（config 取值范围），转为像素
  if (preferredWidth >= 25 && preferredWidth <= 100) {
    return Math.round((workAreaWidth * preferredWidth) / 100);
  }

  return Math.round(preferredWidth);
};

export const getPanelBounds = (
  edge: Edge,
  dockBounds: WindowBounds,
  panelWidth: number
): WindowBounds => ({
  x: edge === 'right' ? dockBounds.x - panelWidth : dockBounds.x + dockBounds.width,
  y: dockBounds.y,
  width: panelWidth,
  height: dockBounds.height
});
