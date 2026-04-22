export const PANEL_MENU_WIDTH = 224;
export const PANEL_MENU_ITEM_COUNT = 7;
export const PANEL_MENU_SEPARATOR_COUNT = 1;

const PANEL_MENU_ITEM_HEIGHT = 32;
const PANEL_MENU_SEPARATOR_HEIGHT = 9;
const PANEL_MENU_VERTICAL_PADDING = 8;
const PANEL_MENU_SAFE_AREA = 2;

export interface PanelMenuSizeOptions {
  itemCount: number;
  separatorCount: number;
}

export const getPanelMenuWindowSize = ({
  itemCount,
  separatorCount
}: PanelMenuSizeOptions): { width: number; height: number } => ({
  width: PANEL_MENU_WIDTH,
  height:
    itemCount * PANEL_MENU_ITEM_HEIGHT +
    separatorCount * PANEL_MENU_SEPARATOR_HEIGHT +
    PANEL_MENU_VERTICAL_PADDING +
    PANEL_MENU_SAFE_AREA
});
