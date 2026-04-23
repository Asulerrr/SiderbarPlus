import assert from 'node:assert/strict';
import test from 'node:test';

import { buildConfigPersistPlan } from '../configPersistStrategy.ts';

test('writes temp file before replacing the main config file', () => {
  const plan = buildConfigPersistPlan({
    configPath: 'C:\\app\\config.json',
    backupPath: 'C:\\app\\config.json.bak',
    tempPath: 'C:\\app\\config.json.tmp'
  });

  assert.deepEqual(plan, {
    writeTempTo: 'C:\\app\\config.json.tmp',
    replaceTarget: 'C:\\app\\config.json',
    copyBackupFrom: 'C:\\app\\config.json',
    copyBackupTo: 'C:\\app\\config.json.bak'
  });
});
