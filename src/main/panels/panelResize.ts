export const clampPanelWidth = (width: number, workAreaWidth: number): number => {
  const min = 320;
  const max = Math.floor(workAreaWidth * 0.8);
  return Math.min(Math.max(Math.round(width), min), max);
};
