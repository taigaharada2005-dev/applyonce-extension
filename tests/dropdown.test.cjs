const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const engineSource = fs.readFileSync('applyonce-extension/engine.js', 'utf8');

function createSelectMock(id, name, labelText, optionsData) {
  const options = optionsData.map((opt, idx) => ({
    tagName: 'OPTION',
    value: opt.value !== undefined ? opt.value : opt.text,
    text: opt.text !== undefined ? opt.text : opt.value,
    selected: false,
    disabled: Boolean(opt.disabled),
    index: idx
  }));

  const dispatchedEvents = [];
  let _value = options[0]?.value || '';
  let _selectedIndex = 0;

  const mock = {
    tagName: 'SELECT',
    type: 'select-one',
    id,
    name,
    options,
    get value() { return _value; },
    set value(v) {
      _value = v;
      const foundIdx = options.findIndex(o => o.value === v);
      if (foundIdx !== -1) {
        _selectedIndex = foundIdx;
        options.forEach((o, i) => { o.selected = (i === foundIdx); });
      }
    },
    get selectedIndex() { return _selectedIndex; },
    set selectedIndex(i) {
      _selectedIndex = i;
      if (options[i]) {
        _value = options[i].value;
        options.forEach((o, idx) => { o.selected = (idx === i); });
      }
    },
    disabled: false,
    readOnly: false,
    hidden: false,
    checkVisibility: () => true,
    offsetParent: {},
    labels: [{ innerText: labelText }],
    getAttribute: (attr) => (attr === 'name' ? name : attr === 'id' ? id : null),
    closest: () => null,
    matches: (sel) => sel.includes('select'),
    focus: () => {},
    blur: () => {},
    scrollIntoView: () => {},
    dispatchEvent: (ev) => { dispatchedEvents.push(ev.type); return true; }
  };

  return { mock, options, dispatchedEvents };
}

test('getOptionsSummary extracts up to 150 options and filters placeholders', () => {
  // Create 60 options (e.g. 47 prefectures + extras)
  const optList = [{ text: '選択してください', value: '' }];
  for (let i = 1; i <= 60; i++) {
    optList.push({ text: `選択肢${i}`, value: `val_${i}` });
  }

  const { mock } = createSelectMock('test_select', 'test_select', 'テスト項目', optList);

  const ctx = vm.createContext({
    document: {
      title: 'テスト',
      querySelectorAll: () => [mock],
      querySelector: () => null,
      body: { innerText: 'テスト' }
    },
    location: { href: 'https://example.com' },
    Event: class { constructor(type) { this.type = type; } },
    HTMLSelectElement: class {},
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
    module: { exports: {} }
  });

  vm.runInContext(engineSource, ctx);
  const runtime = ctx.pageRuntime;

  const scan = runtime('scan', {}, {});
  assert.equal(scan.fields.length, 1);
  assert.equal(scan.fields[0].options.length, 60);
  assert.equal(scan.fields[0].options[0], '選択肢1');
  assert.equal(scan.fields[0].options[59], '選択肢60');
});

test('prefecture dropdown correctly matches deep/scrolled prefectures (Osaka, Fukuoka, Okinawa, etc.) with JIS codes and names', () => {
  const prefOptions = [
    { text: '選択してください', value: '' },
    { text: '北海道', value: '01' },
    { text: '青森県', value: '02' },
    { text: '東京都', value: '13' },
    { text: '愛知県', value: '23' },
    { text: '京都府', value: '26' },
    { text: '大阪府', value: '27' },
    { text: '福岡県', value: '40' },
    { text: '沖縄県', value: '47' }
  ];

  function runPrefTest(prefValue, expectedCode, expectedIndex) {
    const { mock: prefSelect, options } = createSelectMock('pref', 'prefecture', '都道府県', prefOptions);
    const ctx = vm.createContext({
      document: {
        title: '応募フォーム',
        querySelectorAll: () => [prefSelect],
        querySelector: () => null,
        body: { innerText: '応募フォーム' }
      },
      location: { href: 'https://example.com' },
      Event: class { constructor(type) { this.type = type; } },
      UIEvent: class { constructor(type) { this.type = type; } },
      HTMLSelectElement: class {},
      HTMLInputElement: class {},
      HTMLTextAreaElement: class {},
      module: { exports: {} }
    });
    vm.runInContext(engineSource, ctx);
    const res = ctx.pageRuntime('fill', { prefecture: prefValue }, {});
    assert.equal(res.filled, 1);
    assert.equal(prefSelect.value, expectedCode);
    assert.equal(options[expectedIndex].selected, true);
  }

  // 1. Fill Osaka (大阪府 -> code 27)
  runPrefTest('大阪府', '27', 6);

  // 2. Fill Fukuoka (short name: 福岡 -> code 40)
  runPrefTest('福岡', '40', 7);

  // 3. Fill Okinawa (沖縄県 -> code 47)
  runPrefTest('沖縄県', '47', 8);
});

test('birth year dropdown with Wareki/Seireki mixes correctly selects year (e.g. 2002 <-> 平成14年)', () => {
  const yearOptions = [
    { text: '生年を選択', value: '' },
    { text: '1998年 (平成10年)', value: '1998' },
    { text: '1999年 (平成11年)', value: '1999' },
    { text: '2000年 (平成12年)', value: '2000' },
    { text: '2001年 (平成13年)', value: '2001' },
    { text: '平成14年', value: 'H14' }, // Pure Wareki option
    { text: '2003年(H15)', value: '2003' },
    { text: '令和4年 (2022年)', value: '2022' }
  ];

  function runYearTest(yearVal, expectedVal, expectedIndex) {
    const { mock: yearSelect, options } = createSelectMock('birth_year', 'birth_year', '生年月日（年）', yearOptions);
    const ctx = vm.createContext({
      document: {
        title: '応募フォーム',
        querySelectorAll: () => [yearSelect],
        querySelector: () => null,
        body: { innerText: '応募フォーム' }
      },
      location: { href: 'https://example.com' },
      Event: class { constructor(type) { this.type = type; } },
      UIEvent: class { constructor(type) { this.type = type; } },
      HTMLSelectElement: class {},
      HTMLInputElement: class {},
      HTMLTextAreaElement: class {},
      module: { exports: {} }
    });
    vm.runInContext(engineSource, ctx);
    const res = ctx.pageRuntime('fill', { birthYear: yearVal }, {});
    assert.equal(res.filled, 1);
    assert.equal(yearSelect.value, expectedVal);
    assert.equal(options[expectedIndex].selected, true);
  }

  // Profile has 2002 (should match '平成14年' with value 'H14')
  runYearTest('2002', 'H14', 5);

  // Profile has 2000 (should match '2000年 (平成12年)')
  runYearTest('2000', '2000', 3);
});

test('month and day dropdowns with padding/units match accurately', () => {
  const monthOptions = [
    { text: '選択', value: '' },
    { text: '1月', value: '01' },
    { text: '2月', value: '02' },
    { text: '3月', value: '03' },
    { text: '4月', value: '04' }
  ];

  const { mock: monthSelect, options } = createSelectMock('birth_month', 'birth_month', '生年月日（月）', monthOptions);

  const ctx = vm.createContext({
    document: {
      title: '応募フォーム',
      querySelectorAll: () => [monthSelect],
      querySelector: () => null,
      body: { innerText: '応募フォーム' }
    },
    location: { href: 'https://example.com' },
    Event: class { constructor(type) { this.type = type; } },
    UIEvent: class { constructor(type) { this.type = type; } },
    HTMLSelectElement: class {},
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
    module: { exports: {} }
  });

  vm.runInContext(engineSource, ctx);
  const runtime = ctx.pageRuntime;

  // Single digit "3" matches "03" / "3月"
  const result = runtime('fill', { birthMonth: '3' }, {});
  assert.equal(result.filled, 1);
  assert.equal(monthSelect.value, '03');
  assert.equal(options[3].selected, true);
});

test('graduation status and degree fuzzy matching in long dropdowns', () => {
  const statusOptions = [
    { text: '選択してください', value: '' },
    { text: '大学院修了見込', value: 'grad_expected_master' },
    { text: '大学（学部）卒業見込', value: 'grad_expected_bachelor' },
    { text: '大学（学部）既卒', value: 'graduated_bachelor' },
    { text: 'その他', value: 'other' }
  ];

  const { mock: statusSelect } = createSelectMock('grad_status', 'grad_status', '卒業区分', statusOptions);

  const ctx = vm.createContext({
    document: {
      title: '応募フォーム',
      querySelectorAll: () => [statusSelect],
      querySelector: () => null,
      body: { innerText: '応募フォーム' }
    },
    location: { href: 'https://example.com' },
    Event: class { constructor(type) { this.type = type; } },
    UIEvent: class { constructor(type) { this.type = type; } },
    HTMLSelectElement: class {},
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
    module: { exports: {} }
  });

  vm.runInContext(engineSource, ctx);
  const runtime = ctx.pageRuntime;

  const result = runtime('fill', { graduationStatus: '卒業見込み' }, {});
  assert.equal(result.filled, 1);
  // Matches "大学院修了見込" or "大学（学部）卒業見込"
  assert.ok(statusSelect.value.includes('grad_expected'));
});

test('custom combobox readonly element is eligible and filled', () => {
  let filledVal = '';
  const customCombobox = {
    tagName: 'INPUT',
    type: 'text',
    id: 'custom_pref',
    name: 'custom_pref',
    get value() { return filledVal; },
    set value(v) { filledVal = v; },
    disabled: false,
    readOnly: true, // Typical custom dropdown trigger
    hidden: false,
    checkVisibility: () => true,
    offsetParent: {},
    labels: [{ innerText: '都道府県' }],
    getAttribute: (attr) => (attr === 'name' ? 'custom_pref' : attr === 'role' ? 'combobox' : null),
    closest: () => null,
    matches: (sel) => sel.includes('combobox'),
    focus: () => {},
    blur: () => {},
    scrollIntoView: () => {},
    dispatchEvent: () => true
  };

  const ctx = vm.createContext({
    document: {
      title: '応募フォーム',
      querySelectorAll: () => [customCombobox],
      querySelector: () => null,
      body: { innerText: '応募フォーム' }
    },
    location: { href: 'https://example.com' },
    Event: class { constructor(type) { this.type = type; } },
    UIEvent: class { constructor(type) { this.type = type; } },
    HTMLSelectElement: class {},
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
    module: { exports: {} }
  });

  vm.runInContext(engineSource, ctx);
  const runtime = ctx.pageRuntime;

  const scan = runtime('scan', {}, {});
  assert.equal(scan.fields.length, 1);

  const fill = runtime('fill', { prefecture: '東京都' }, {});
  assert.equal(fill.filled, 1);
  assert.equal(filledVal, '東京都');
});
