const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('applyonce-extension/ocr.js', 'utf8');
function client(fetch) {
  const context = vm.createContext({ fetch, AbortSignal });
  vm.runInContext(source, context);
  return context.visionOCR;
}
test('document OCR sends key in header and prefers structured full text', async () => {
  const ocr = client(async (url, options) => {
    assert.equal(url, 'https://vision.googleapis.com/v1/images:annotate');
    assert.equal(options.headers['x-goog-api-key'], 'secret');
    const body = JSON.parse(options.body);
    assert.equal(body.requests[0].features[0].type, 'DOCUMENT_TEXT_DETECTION');
    assert.equal(body.requests[0].image.content, 'YWJj');
    assert.ok(!options.body.includes('secret'));
    return { ok: true, json: async () => ({ responses: [{ fullTextAnnotation: { text: 'document' }, textAnnotations: [{ description: 'fallback' }] }] }) };
  });
  assert.equal(await ocr('data:image/png;base64,YWJj', 'secret'), 'document');
});
test('missing key and unsupported image never call API', async () => {
  const ocr = client(() => { throw new Error('unexpected request'); });
  await assert.rejects(ocr('data:image/png;base64,YWJj', ''), /OCR_API_KEY/);
  await assert.rejects(ocr('data:application/pdf;base64,YWJj', 'key'), /PNG/);
});
test('handles per-image error without exposing server message or credentials', async () => {
  const ocr = client(async () => ({ ok: true, json: async () => ({ responses: [{ error: { code: 403, message: 'secret' } }] }) }));
  await assert.rejects(ocr('data:image/png;base64,YWJj', 'key'), error => /403/.test(error.message) && !error.message.includes('secret'));
});
test('empty and malformed responses fail, legacy annotation remains supported', async () => {
  for (const responses of [[], [{}]]) {
    const ocr = client(async () => ({ ok: true, json: async () => ({ responses }) }));
    await assert.rejects(ocr('data:image/png;base64,YWJj', 'key'));
  }
  const ocr = client(async () => ({ ok: true, json: async () => ({ responses: [{ textAnnotations: [{ description: 'legacy' }] }] }) }));
  assert.equal(await ocr('data:image/png;base64,YWJj', 'key'), 'legacy');
});
