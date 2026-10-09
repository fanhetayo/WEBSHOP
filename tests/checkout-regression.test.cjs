const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const read = p => fs.readFileSync(p, 'utf8');
function harness(blockStorage = false) {
  let stored = null;
  const calls = [];
  let response = async () => ({ data: { receipt: { id: 'order-1' } } });
  const exports = {};
  const context = {
    exports, crypto: require('node:crypto').webcrypto, TextEncoder, Uint8Array,
    sessionStorage: {
      getItem() { if (blockStorage) throw Error('blocked'); return stored; },
      setItem(k, v) { if (blockStorage) throw Error('blocked'); stored = v; },
    },
    require(name) {
      if (name.includes('supabaseClient')) return { projectStorageKey: 'test:', client: () => ({ functions: { invoke: async (name, { body }) => { calls.push(body); return response(); } } }) };
      if (name === './domain') return { checkoutItems: x => x, validateCustomer: x => x, errorMessage: e => e.message };
      throw Error(name);
    },
  };
  vm.runInNewContext(ts.transpileModule(read('src/lib/api.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { api: exports, calls, respond: fn => { response = fn; } };
}
const cart = [{ product_id: 'product', quantity: 1, variant: '' }];
const customer = { name: 'Customer', phone: '628123456789', address: 'Full address', note: '' };
for (const blocked of [false, true]) {
  test(`completed identical order gets new proof (storage blocked=${blocked})`, async () => {
    const h = harness(blocked);
    const first = await h.api.submitOrder(cart, customer, 'bank', null);
    await h.api.submitOrder(cart, customer, 'bank', first.access);
    assert.notEqual(h.calls[0].requestId, h.calls[1].requestId);
    assert.notEqual(h.calls[0].receiptToken, h.calls[1].receiptToken);
  });
  test(`uncertain retry preserves proof and rejects changed input (storage blocked=${blocked})`, async () => {
    const h = harness(blocked);
    h.respond(async () => { throw Error('network lost'); });
    await assert.rejects(h.api.submitOrder(cart, customer, 'bank', null));
    const access = h.api.readOrderAccess();
    assert.ok(access);
    await assert.rejects(h.api.submitOrder(cart, { ...customer, note: 'changed' }, 'bank', null), /sebelumnya/);
    assert.equal(h.calls.length, 1);
    h.respond(async () => ({ data: { receipt: { id: 'confirmed' } } }));
    await h.api.submitOrder(cart, customer, 'bank', null);
    assert.equal(h.calls[0].requestId, h.calls[1].requestId);
    assert.equal(h.calls[0].receiptToken, h.calls[1].receiptToken);
  });
}
test('receipt recovery completes uncertain proof before an intentional new order', async () => {
  const h = harness(true);
  h.respond(async () => ({ data: {} }));
  await assert.rejects(h.api.submitOrder(cart, customer, 'bank', null));
  const old = h.api.readOrderAccess();
  h.respond(async () => ({ data: { receipt: { id: 'recovered' } } }));
  await h.api.loadReceipt(old, true);
  await h.api.submitOrder(cart, customer, 'bank', old);
  assert.notEqual(h.calls[2].requestId, old.requestId);
});
test('module lock prevents parallel submissions across checkout remounts', async () => {
  const h = harness();
  const first = h.api.submitOrder(cart, customer, 'bank', null);
  await assert.rejects(h.api.submitOrder(cart, customer, 'bank', null), /diproses/);
  await first;
  assert.equal(h.calls.length, 1);
});
test('checkout retains settings, guards mutations, and subtracts only submitted lines', () => {
  const app = read('App.tsx');
  assert.match(app, /settings.data \|\| lastSettings.current/);
  assert.match(app, /onBusy=\{submissionBusy\}/);
  assert.ok((app.match(/if \(submitting.current\) return;/g) || []).length >= 4);
  assert.match(app, /setCart\(current => current.flatMap/);
  assert.doesNotMatch(app, /setCart\(\[\]\)/);
  assert.match(read('src/shop/Checkout.tsx'), /fieldset className="stack" disabled=\{busy\}/);
});
test('receipt remount refreshes server status before exposing payment actions', () => {
  const source = read('src/shop/OrderReceipt.tsx');
  assert.match(source, /useEffect\(\(\) =>[\s\S]*loadReceipt\(access, true\)/);
  assert.match(source, /if \(active\) \{ setReceipt\(value\); setFresh\(true\); \}/);
  assert.match(source, /fresh && receipt.status === 'pending'/);
  assert.match(source, /method.type === 'QRIS' \? <Photo/);
});
test('payment editor clears irrelevant QR payload and guards type during upload', () => {
  const source = read('src/admin/Payments.tsx');
  assert.match(source, /qris_url: draft.type === 'QRIS' \? draft.qris_url : ''/);
  assert.match(source, /select disabled=\{busy\}/);
});