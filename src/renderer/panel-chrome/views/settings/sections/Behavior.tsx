import type { AppConfig } from '@shared/types';

interface Props {
  config: AppConfig;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
}

export function Behavior({ config: _config, updateConfig: _updateConfig }: Props): JSX.Element {
  return <div>Behavior (stub)</div>;
}
