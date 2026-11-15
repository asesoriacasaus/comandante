import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseDuration, parsePace, formatDuration, formatPace, paceFrom, isoWithOffset, weekKm, isLongRun, warningText } from '../js/lib/runs.js';

const CASES_D = ['00:14:51', '1:05:03', '14:51', '00:75:00', '12:99', 'abc', '', '0:00:30'];
const CASES_P = ['7\'35"', "5'05\"", '6:10', '7\'35" /km', '7\'75"', 'rápido', null];

test('el cliente y el servidor convierten igual', () => {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync('apps-script/Runs.gs', 'utf8'), ctx);
  for (const c of CASES_D) assert.equal(parseDuration(c), vm.runInContext('parseDuration_(' + JSON.stringify(c) + ')', ctx), 'duración ' + c);
  for (const c of CASES_P) assert.equal(parsePace(c), vm.runInContext('parsePace_(' + JSON.stringify(c) + ')', ctx), 'ritmo ' + c);
});
test('formatos', () => {
  assert.equal(formatDuration(891), '14:51'); assert.equal(formatDuration(3903), '1:05:03'); assert.equal(formatDuration(null), '');
  assert.equal(formatPace(455), '7:35 /km'); assert.equal(formatPace(305), '5:05 /km');
  assert.equal(paceFrom(1.96, 891), 455); assert.equal(paceFrom(0, 891), null);
});
test('hora con offset', () => {
  assert.equal(isoWithOffset('2026-10-31', '11:17', 60), '2026-10-31T11:17:00+01:00');
  assert.equal(isoWithOffset('2026-10-31', '11:17', 120), '2026-10-31T11:17:00+02:00');
  assert.equal(isoWithOffset('2026-01-05', '07:00', -300), '2026-01-05T07:00:00-05:00');
  assert.equal(isoWithOffset('2026-01-05', '07:00', 330), '2026-01-05T07:00:00+05:30');
});
test('kilómetros de la semana y tirada larga', () => {
  const runs = [{ date: '2026-11-16', distanceKm: 10.04 }, { date: '2026-11-18', distanceKm: 5 }, { date: '2026-11-10', distanceKm: 7 }];
  assert.equal(weekKm(runs, '2026-11-19'), 15); assert.equal(weekKm(runs, '2026-11-12'), 7);
  assert.ok(isLongRun({ durationSec: 3600 })); assert.ok(isLongRun({ distanceKm: 10 })); assert.ok(!isLongRun({ durationSec: 891, distanceKm: 1.96 }));
  assert.match(warningText('pace_mismatch'), /revísalo/); assert.equal(warningText('x'), '');
});
