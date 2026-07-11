export const getPanelWidthRange = (
  workAreaWidth: number,
  maxPercent = 80,
  minPercent = 25
): { min: number; max: number } => {
  const max = Math.round(workAreaWidth * maxPercent / 100);
  const min = Math.min(max, Math.max(360, Math.round(workAreaWidth * minPercent / 100)));
  return { min, max };
};

export const clampPanelWidth = (width: number, workAreaWidth: number, maxPercent = 80, minPercent = 25): number => {
  const { min, max } = getPanelWidthRange(workAreaWidth, maxPercent, minPercent);
  return Math.min(Math.max(Math.round(width), min), max);
};

export const getRightAnchoredViewX = (
  targetContentWidth: number,
  viewWidth: number,
  rightInset = 0
): number => targetContentWidth - rightInset - viewWidth;
