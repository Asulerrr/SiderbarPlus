import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DockGeometryStabilizer,
  type DockGeometryClock,
  type DockGeometryStabilizerOptions
} from '../dockGeometryStabilizer.ts';

const options: DockGeometryStabilizerOptions = {
  pollIntervalMs: 10,
  minimumHiddenMs: 30,
  quietPeriodMs: 20,
  maximumHiddenMs: 100
};

const createClock = () => {
  let now = 0;
  const scheduled: Array<() => void> = [];
  const clock: DockGeometryClock = {
    now: () => now,
    schedule: (callback) => {
      scheduled.push(callback);
      return callback;
    },
    // Intentionally leave callbacks queued to verify the generation guard.
    cancel: () => undefined
  };

  return {
    clock,
    tick(nextTime: number): void {
      now = nextTime;
      const callback = scheduled.shift();
      assert.ok(callback, 'expected a scheduled geometry poll');
      callback();
    }
  };
};

test('waits for a quiet period after Windows moves the Dock', () => {
  const fake = createClock();
  const stabilizer = new DockGeometryStabilizer(options, fake.clock);
  let atExpectedBounds = true;
  let applications = 0;
  let finishes = 0;

  stabilizer.start({
    isAtExpectedBounds: () => atExpectedBounds,
    applyExpectedBounds: () => {
      atExpectedBounds = true;
      ++applications;
    },
    finish: () => ++finishes
  });

  fake.tick(10);
  atExpectedBounds = false;
  fake.tick(20);
  fake.tick(30);
  assert.equal(finishes, 0);
  fake.tick(40);

  assert.equal(finishes, 1);
  assert.equal(applications, 3);
});

test('ignores callbacks from a superseded relocation', () => {
  const fake = createClock();
  const stabilizer = new DockGeometryStabilizer(
    { ...options, minimumHiddenMs: 10, quietPeriodMs: 10 },
    fake.clock
  );
  let firstFinishes = 0;
  let secondFinishes = 0;

  stabilizer.start({
    isAtExpectedBounds: () => true,
    applyExpectedBounds: () => undefined,
    finish: () => ++firstFinishes
  });
  stabilizer.start({
    isAtExpectedBounds: () => true,
    applyExpectedBounds: () => undefined,
    finish: () => ++secondFinishes
  });

  fake.tick(10);
  fake.tick(10);

  assert.equal(firstFinishes, 0);
  assert.equal(secondFinishes, 1);
});
