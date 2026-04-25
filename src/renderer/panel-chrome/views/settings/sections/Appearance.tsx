import type { AppConfig } from '@shared/types';

interface Props {
  config: AppConfig;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
}

export function Appearance({ config: _config, updateConfig: _updateConfig }: Props): JSX.Element {
  return <div>Appearance (stub)</div>;
}
