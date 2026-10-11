const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { extractCriteria, createAIRouter } = require('../src/ai-shopping');
const reply = result => async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(result) } }] }) });
test('AI extraction uses authenticated JSON mode and validates returned budget', async () => {
  let request;
  const criteria = await extractCriteria('T co 200k can tai nghe', { key: 'fake-test-key', fetchImpl: async (url, options) => {
    request = { url, options }; return (await reply({ query: 'tai nghe', budget: 200000 })());
  } });
  assert.equal(criteria.budget, 200000);
  assert.equal(request.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer fake-test-key');
  assert.equal(JSON.parse(request.options.body).response_format.type, 'json_object');
  for (const budget of [-1, '200k', 1.1, 2147483648]) await assert.rejects(extractCriteria('test', { key: 'fake', fetchImpl: reply({ query: 'tai nghe', budget }) }), e => e.status === 502);
});
test('missing key, unclear intent, invalid JSON, quota and network errors are safe', async () => {
  await assert.rejects(extractCriteria('test', { key: '' }), e => e.status === 503);
  await assert.rejects(extractCriteria('test', { key: 'fake', fetchImpl: reply({ query: '', budget: null }) }), e => e.status === 422);
  await assert.rejects(extractCriteria('test', { key: 'fake', fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'oops' } }] }) }) }), e => e.status === 502);
  for (const status of [401, 403, 429, 500]) await assert.rejects(extractCriteria('test', { key: 'fake', fetchImpl: async () => ({ ok: false, status }) }), e => e.status === (status === 429 ? 429 : 503));
  await assert.rejects(extractCriteria('test', { key: 'fake', fetchImpl: async () => { throw Error('fake-key must not leak'); } }), e => e.status === 503 && !e.message.includes('fake-key'));
});
test('AI route enforces auth, budget cap, real catalog and per-account rate limit', async () => {
  let calls = 0; let values;
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.session = req.headers['x-test-auth'] ? { khachhang: { id: 1 } } : {}; next(); });
  app.use(createAIRouter({ query: (sql, params, cb) => { values = params; cb(null, [
    { id: 1, ten_sp: 'Tai nghe', gia: 150000, so_luong_ton: 1 },
    { id: 2, ten_sp: 'Tai nghe', gia: 500000, so_luong_ton: 1 },
    { id: 3, ten_sp: 'Tai nghe', gia: 90000, so_luong_ton: 0 }
  ]); } }, { key: 'fake', fetchImpl: async () => { calls++; return (await reply({ query: 'tai nghe', budget: 200000 })()); } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const send = (body, auth = true) => fetch(`http://127.0.0.1:${server.address().port}/api/goiy-ai`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { 'x-test-auth': 'yes' } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await send({ query: 'test' }, false)).status, 401);
    assert.equal((await send({ query: 'test', budget: -1 })).status, 400); assert.equal(calls, 0);
    const response = await send({ query: 'Toi co 200k', budget: 160000 });
    const result = await response.json(); assert.equal(response.status, 200);
    assert.equal(result.criteria.budget, 160000); assert.deepEqual(values, [160000]);
    assert.deepEqual(result.products.map(p => p.id), [1]);
    for (let i = 0; i < 9; i++) assert.equal((await send({ query: 'tai nghe' })).status, 200);
    assert.equal((await send({ query: 'tai nghe' })).status, 429); assert.equal(calls, 10);
  } finally { await new Promise(r => server.close(r)); }
});
