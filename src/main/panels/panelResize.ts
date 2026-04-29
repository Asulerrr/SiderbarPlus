export const clampPanelWidth = (width: number, workAreaWidth: number, maxPercent = 80, minPercent = 25): number => {
  const min = Math.max(360, Math.round(workAreaWidth * minPercent / 100));
  const max = Math.round(workAreaWidth * maxPercent / 100);
  return Math.min(Math.max(Math.round(width), min), max);
};
