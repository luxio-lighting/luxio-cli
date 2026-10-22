import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { Device } from '../shared/device/src/device.js';
import { decodeRequest, encodeResponse } from '../shared/protocol/src/index.js';

const device = new Device('cli-test'); device.state.build = 11; device.state.brightness = 256;
let requests = 0;
const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  requests++;
  response.setHeader('Content-Type', 'application/x-protobuf');
  response.end(encodeResponse(device.handle(decodeRequest(Buffer.concat(chunks)))));
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address() as { port: number };
const target = `127.0.0.1:${address.port}`;
const cases = [
  { args: ['set-color', 'ff0000'], mode: 0, color: [255, 0, 0] },
  { args: ['set-color', '#Aa11Bb'], mode: 0, color: [170, 17, 187] },
  { args: ['set', '#00FF00'], mode: 0, color: [0, 255, 0] },
  { args: ['set-gradient', 'Ff0000,00ff00,0000ff'], mode: 1 },
  { args: ['set-gradient', ' #102030 , 001122 '], mode: 1 },
  { args: ['set-color', '0000ff'], mode: 0, color: [0, 0, 255] },
  { args: ['set-color', 'fff'], error: true },
  { args: ['set-color', 'GG0000'], error: true },
  { args: ['set-gradient', 'ff0000'], error: true },
  { args: ['set-gradient', 'ff0000,,00ff00'], error: true },
  { args: ['set-gradient', Array(9).fill('ff0000').join(',')], error: true },
];
let gradientId: string | undefined;
try {
  for (const entry of cases) {
    const before = requests;
    // Exercise both explicit device flags and the environment default.
    const child = spawn(process.execPath, ['dist/index.js', ...(entry.args[0] === 'set' ? ['--device', target] : []), ...entry.args], { env: { ...process.env, LUXIO_DEVICE: target } });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    if (entry.error) {
      assert.equal(code, 1); assert.match(stderr, /six-digit/); assert.equal(requests, before, 'Invalid input must not contact the device');
    } else {
      assert.equal(code, 0, stderr); const result = JSON.parse(stdout); assert.equal(result.state.mode, entry.mode);
      assert.equal(device.state.brightness, 256);
      if (entry.color) assert.deepEqual(Object.values(device.state.color).slice(0, 3), entry.color);
      if (entry.args[0] === 'set-gradient') {
        if (gradientId) assert.equal(device.state.activeScriptId, gradientId, 'Reuse the saved gradient');
        gradientId = device.state.activeScriptId;
        const pixels = device.output();
        const hexes = entry.args[1].split(',').map(v => v.trim().replace(/^#/, ''));
        const first = hexes[0], last = hexes.at(-1)!;
        assert.deepEqual(Object.values(pixels[0]), [parseInt(first.slice(0, 2), 16), parseInt(first.slice(2, 4), 16), parseInt(first.slice(4, 6), 16), 0, 0, 0]);
        assert.deepEqual(Object.values(pixels.at(-1)!), [parseInt(last.slice(0, 2), 16), parseInt(last.slice(2, 4), 16), parseInt(last.slice(4, 6), 16), 0, 0, 0]);
        assert.deepEqual(device.output(), pixels, 'Gradient must remain still');
        assert.equal(device.scripts.length, 1);
      }
    }
    console.log(`PASS: luxio ${entry.args.join(' ')}`);
  }
  for (let i = 0; i < 150; i++) {
    const created = device.handle({ id: 1000 + i, operation: 7, script: { id: '', name: `Saved ${i}`, source: 'function setup() end function loop() end', mode: i % 2 ? 1 : 2 } });
    assert.ok(created.script, created.error);
  }
  for (const args of [['off'], ['brightness', '1'], ['brightness', '256'], ['on'], ['brightness', '0'], ['brightness', '257']]) {
    const child = spawn(process.execPath, ['dist/index.js', '--device', target, ...args]);
    let stderr = ''; child.stderr.on('data', data => { stderr += data; }); child.stdout.resume();
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    const invalid = args[1] === '0' || args[1] === '257';
    assert.equal(code, invalid ? 1 : 0, stderr);
    if (invalid) assert.match(stderr, /1–256/);
    else { assert.equal(device.state.on, args[0] === 'on'); assert.equal(device.state.brightness, args[1] === '1' ? 1 : 256); }
    console.log(`PASS: luxio ${args.join(' ')}`);
  }
  const before = requests;
  const child = spawn(process.execPath, ['dist/index.js', '--device', target, 'scripts']);
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(code, 0, stderr);
  const listed = JSON.parse(stdout).scripts;
  assert.equal(listed.length, 151); assert.equal(new Set(listed.map((script: { id: string }) => script.id)).size, 151);
  assert.equal(requests - before, 3);
  console.log('PASS: CLI lists all 151 saved items across three pages');
} finally { server.close(); device.animation?.close(); }
