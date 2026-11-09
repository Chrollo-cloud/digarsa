import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { devAdminPlugin } from "../devAdminPlugin.js";

function fixture(root = "/tmp") {
  let middleware;
  const plugin = devAdminPlugin();
  plugin.configureServer({ config: { root }, middlewares: { use: value => { middleware = value; } } });
  return async (url, headers = {}, method = 'POST', remoteAddress = '127.0.0.1') => {
    const response = { headers: {}, body: '', statusCode: 200, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = value; } };
    await middleware({ url, method, headers, socket: { remoteAddress } }, response, () => { response.next = true; });
    return response;
  };
}

test('local Admin credential endpoint rejects cross-origin, non-loopback, GET and missing explicit action', async () => {
  const request = fixture();
  for (const [headers, method] of [
    [{ host: 'evil.test', origin: 'http://evil.test', 'x-digarsa-local-setup': '1' }, 'POST'],
    [{ host: '127.0.0.1:5173', origin: 'http://evil.test', 'x-digarsa-local-setup': '1' }, 'POST'],
    [{ host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173', 'x-digarsa-local-setup': '1' }, 'GET'],
    [{ host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173' }, 'POST'],
  ]) {
    const result = await request('/__demo/admin-credentials', headers, method);
    assert.equal(result.statusCode, 403);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    assert.ok(!result.body.includes('password'));
  }
  const remote = await request('/__demo/admin-credentials', {host:'localhost:5173', origin:'http://localhost:5173', 'x-digarsa-local-setup':'1'}, 'POST', '192.168.1.8');
  assert.equal(remote.statusCode, 403);
});

test('dev setup is explicit and missing ignored credentials produce a recoverable error', async () => {
  const request = fixture();
  const result = await request('/__demo/admin-credentials', { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173', 'x-digarsa-local-setup': '1' });
  assert.equal(result.statusCode, 400);
  assert.match(JSON.parse(result.body).error, /env.demo-admin.local/);
  const page = await request('/__demo/admin', {host:'localhost:5173'}, 'GET');
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Ketik ID akun/);
  assert.equal((await request('/admin', {host:'localhost:5173'})).next, true);
});

test('explicit localhost action reads only the chosen ignored demo environment at request time', async () => {
  const root = await mkdtemp('/tmp/digarsa-admin-env-test-');
  try {
    const request = fixture(root);
    await writeFile(`${root}/.env.demo-admin.local`, 'DIGARSA_DEMO_ADMIN_PASSWORD=Fixture-only-password-8742!\n');
    const response = await request('/__demo/admin-credentials', {
      host: 'localhost:5173', origin: 'http://localhost:5173', 'x-digarsa-local-setup': '1',
    });
    assert.equal(response.statusCode, 200);
    const data = JSON.parse(response.body);
    assert.equal(data.email, 'srikandi@gmail.com');
    assert.equal(data.password, 'Fixture-only-password-8742!');
    assert.equal(response.headers['Cache-Control'], 'no-store');
  } finally {
    await rm(root, { recursive: true });
  }
});
