const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Test sanitizeAiText from popup.js
const popupSource = fs.readFileSync('applyonce-extension/popup.js', 'utf8');
const fakeEl = { addEventListener: () => {}, append: () => {}, replaceChildren: () => {}, textContent: '', value: '' };
const popupContext = vm.createContext({
  document: { querySelector: () => fakeEl },
  window: {},
  chrome: { storage: { local: {} }, tabs: {}, scripting: {}, runtime: {} },
  module: { exports: {} }
});
vm.runInContext(popupSource, popupContext);
const { sanitizeAiText } = popupContext.module.exports;

test('sanitizeAiText removes asterisks (single, double, multiple, and full-width)', () => {
  // Test case: **** (quad asterisks)
  assert.equal(sanitizeAiText('****'), '');
  assert.equal(sanitizeAiText('**'), '');
  assert.equal(sanitizeAiText('******'), '');

  // Test case: markdown bold **word**
  assert.equal(sanitizeAiText('私の**強み**は粘り強さです。'), '私の強みは粘り強さです。');

  // Test case: markdown bold with spaces
  assert.equal(sanitizeAiText('**【結論】** 貴社を志望します。'), '【結論】 貴社を志望します。');

  // Test case: bullet asterisks
  const bulletInput = '* 課題の発見\n* 迅速な対応\n* 成果の分析';
  const expectedBullet = '課題の発見\n迅速な対応\n成果の分析';
  assert.equal(sanitizeAiText(bulletInput), expectedBullet);

  // Test case: full-width asterisks (全角＊)
  assert.equal(sanitizeAiText('＊＊重要＊＊'), '重要');
  assert.equal(sanitizeAiText('＊ 項目1\n＊ 項目2'), '項目1\n項目2');

  // Test case: mixed asterisks and formatting
  const complexInput = '****\n**私の強み**は、周囲を巻き込む力です。****\n* 具体的には学生時代に…\n* ＊結果として＊成し遂げました。';
  const complexExpected = '私の強みは、周囲を巻き込む力です。\n具体的には学生時代に…\n結果として成し遂げました。';
  assert.equal(sanitizeAiText(complexInput), complexExpected);

  // Test case: consecutive blank lines caused by removing line with only asterisks
  const blankLineInput = '第一の理由です。\n\n****\n\n第二の理由です。';
  const blankLineExpected = '第一の理由です。\n\n第二の理由です。';
  assert.equal(sanitizeAiText(blankLineInput), blankLineExpected);

  // Test case: bullet points with spaces and asterisks
  const bullets = '   * チームリーダーとしての経験\n   ＊ 課題分析力\n   *** 実行力';
  const bulletsExpected = 'チームリーダーとしての経験\n課題分析力\n実行力';
  assert.equal(sanitizeAiText(bullets), bulletsExpected);

  // Test case: inline multiple asterisks
  assert.equal(sanitizeAiText('成果として**売上120%**を達成しました。'), '成果として売上120%を達成しました。');

  // Test case: clean text remains intact
  const normalText = '私の強みは粘り強さです。\n困難な状況でも諦めずに解決策を模索します。';
  assert.equal(sanitizeAiText(normalText), normalText);

  // Test case: handles non-string safely
  assert.equal(sanitizeAiText(null), '');
  assert.equal(sanitizeAiText(undefined), '');
  assert.equal(sanitizeAiText(''), '');
});

// Test pageRuntime cleanAiText behavior in engine.js
const engineSource = fs.readFileSync('applyonce-extension/engine.js', 'utf8');
const engineContext = vm.createContext({
  module: { exports: {} }
});
vm.runInContext(engineSource, engineContext);
const { pageRuntime } = engineContext.module.exports;

test('engine pageRuntime cleans asterisks when filling AI answers', () => {
  const mockTextarea = {
    tagName: 'TEXTAREA',
    type: 'textarea',
    id: 'motivation_field',
    name: 'motivation',
    value: '',
    disabled: false,
    readOnly: false,
    hidden: false,
    checkVisibility: () => true,
    offsetParent: {},
    labels: [{ innerText: '志望動機' }],
    getAttribute: (attr) => (attr === 'name' ? 'motivation' : null),
    closest: () => null,
    matches: (sel) => sel.includes('textarea'),
    focus: () => {},
    blur: () => {},
    dispatchEvent: () => {}
  };

  const mockContext = vm.createContext({
    document: {
      title: '応募フォーム',
      querySelectorAll: (sel) => {
        if (sel.includes('input') || sel.includes('textarea')) {
          return [mockTextarea];
        }
        return [];
      },
      querySelector: () => null,
      body: { innerText: '求人応募' }
    },
    window: {
      getComputedStyle: () => ({ display: 'block' })
    },
    location: { href: 'https://example.com/apply' },
    Event: class { constructor(type) { this.type = type; } },
    HTMLTextAreaElement: class {},
    HTMLInputElement: class {},
    module: { exports: {} }
  });

  vm.runInContext(engineSource, mockContext);
  const runtime = mockContext.pageRuntime;

  // Scan
  const scanResult = runtime('scan', {}, {});
  assert.equal(scanResult.fields.length, 1);
  assert.equal(scanResult.fields[0].narrative, true);

  // Fill with AI answers containing asterisks (****, **bold**, etc.)
  const aiAnswers = {
    '0': '****\n**貴社を志望する理由**は以下の通りです。****\n* 理念への共感\n* 成長機会'
  };

  const fillResult = runtime('fill', {}, aiAnswers);
  assert.equal(fillResult.filled, 1);
  assert.equal(mockTextarea.value.includes('*'), false);
  assert.equal(mockTextarea.value.includes('＊'), false);
  assert.equal(mockTextarea.value, '貴社を志望する理由は以下の通りです。\n理念への共感\n成長機会');
});
