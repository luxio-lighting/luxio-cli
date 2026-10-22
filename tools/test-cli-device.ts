import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { requestHttp, type State } from '../shared/protocol/src/index.js';
const address = process.env.DEVICE_ADDRESS;
if (!address) throw new Error('Set DEVICE_ADDRESS to opt into physical testing');
const exec = promisify(execFile);
let id = 1, gradientId: string | undefined;
const initial = (await requestHttp(address, { id: id++, operation: 0 })).state!;
const existing = (await requestHttp(address, { id: id++, operation: 5 })).scripts.find(s => s.name === 'Luxio · CLI gradient');
const original = existing ? (await requestHttp(address, { id: id++, operation: 6, scriptId: existing.id })).script : undefined;
try {
  await requestHttp(address, { id: id++, operation: 2, brightness: 16 });
  for (const [target, command, value, mode] of [
    [address, 'set-color', 'ff0000', 0],
    [address, 'set-gradient', 'Ff0000,00ff00,0000ff', 1],
    ...(process.env.DEVICE_SERIAL ? [[process.env.DEVICE_SERIAL, 'set-gradient', 'ff8000,0000ff', 1]] : []),
    [address, 'set-color', '0000ff', 0],
  ] as [string, string, string, number][]) {
    const { stdout } = await exec(process.execPath, ['dist/index.js', '--device', target, command, value]);
    const result = JSON.parse(stdout);
    assert.equal(result.state.mode, mode); assert.equal(result.state.brightness, 16);
    if (mode === 1) {
      if (gradientId) assert.equal(result.state.activeScriptId, gradientId);
      gradientId = result.state.activeScriptId;
      await new Promise(resolve => setTimeout(resolve, 700));
      const state: State = (await requestHttp(address, { id: id++, operation: 0 })).state!;
      assert.equal(state.mode, 1); assert.equal(state.activeScriptId, gradientId);
    }
    console.log(`PASS: ${target} ${command} ${value} → mode ${mode}, brightness preserved`);
  }
} finally {
  if (original) await requestHttp(address, { id: id++, operation: 8, script: original });
  else {
    const saved = (await requestHttp(address, { id: id++, operation: 5 })).scripts.find(s => s.name === 'Luxio · CLI gradient');
    if (saved) await requestHttp(address, { id: id++, operation: 9, scriptId: saved.id });
  }
  await requestHttp(address, { id: id++, operation: 1, color: initial.color });
  await requestHttp(address, { id: id++, operation: 2, brightness: initial.brightness });
  if (initial.activeScriptId) await requestHttp(address, { id: id++, operation: 10, scriptId: initial.activeScriptId });
  console.log('Original strip state and saved CLI gradient restored.');
}
