import type { ConfigStore } from '../store/ConfigStore';
import { registerConfigHandlers } from './configHandlers';

export const registerIpcHandlers = (configStore: ConfigStore): void => {
  registerConfigHandlers(configStore);
};
