const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const engineSource = fs.readFileSync('applyonce-extension/engine.js', 'utf8');

function createInputMock(name, placeholder, labelText, containerInputs) {
  let _val = '';
  const mock = {
    tagName: 'INPUT',
    type: 'text',
    name,
    id: name,
    placeholder,
    get value() { return _val; },
    set value(v) { _val = v; },
    disabled: false,
    readOnly: false,
    hidden: false,
    checkVisibility: () => true,
    offsetParent: {},
    labels: [{ innerText: labelText }],
    getAttribute: (attr) => (attr === 'name' ? name : attr === 'placeholder' ? placeholder : null),
    closest: (sel) => {
      if (sel === '[inert]' || sel === 'fieldset') return null;
      if (sel.includes('row') || sel.includes('form-group') || sel.includes('field') || sel.includes('div')) {
        return {
          querySelectorAll: () => containerInputs || [mock],
          querySelector: () => null,
          matches: () => false,
          parentElement: null
        };
      }
      return null;
    },
    matches: (sel) => sel === 'input' || sel.includes('input,'),
    focus: () => {},
    blur: () => {},
    scrollIntoView: () => {},
    dispatchEvent: () => true
  };
  return mock;
}

test('split name fields (Sei and Mei under single label) are correctly allocated', () => {
  const containerInputs = [];
  const seiInput = createInputMock('name_first_box', '姓', '氏名', containerInputs);
  const meiInput = createInputMock('name_second_box', '名', '氏名', containerInputs);
  containerInputs.push(seiInput, meiInput);

  const ctx = vm.createContext({
    document: {
      title: '応募フォーム',
      querySelectorAll: () => containerInputs,
      querySelector: () => null,
      getElementById: () => null,
      body: { innerText: '応募フォーム' }
    },
    location: { href: 'https://example.com' },
    Event: class { constructor(type) { this.type = type; } },
    UIEvent: class { constructor(type) { this.type = type; } },
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
    HTMLSelectElement: class {},
    module: { exports: {} }
  });

  vm.runInContext(engineSource, ctx);
  const runtime = ctx.pageRuntime;

  const profile = {
    familyJP: '山田',
    givenJP: '太郎',
    fullNameJP: '山田 太郎'
  };

  const fillResult = runtime('fill', profile, {});
  assert.equal(fillResult.filled, 2);
  assert.equal(seiInput.value, '山田');
  assert.equal(meiInput.value, '太郎');
});

test('split kana fields (Sei and Mei under Furigana) are correctly allocated', () => {
  const containerInputs = [];
  const seiKana = createInputMock('kana_first_box', '', 'フリガナ', containerInputs);
  const meiKana = createInputMock('kana_second_box', '', 'フリガナ', containerInputs);
  containerInputs.push(seiKana, meiKana);

  const ctx = vm.createContext({
    document: {
      title: '応募フォーム',
      querySelectorAll: () => containerInputs,
      querySelector: () => null,
      getElementById: () => null,
      body: { innerText: '応募フォーム' }
    },
    location: { href: 'https://example.com' },
    Event: class { constructor(type) { this.type = type; } },
    UIEvent: class { constructor(type) { this.type = type; } },
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
    HTMLSelectElement: class {},
    module: { exports: {} }
  });

  vm.runInContext(engineSource, ctx);
  const runtime = ctx.pageRuntime;

  const profile = {
    familyKana: 'ヤマダ',
    givenKana: 'タロウ',
    fullNameKana: 'ヤマダ タロウ'
  };

  const fillResult = runtime('fill', profile, {});
  assert.equal(fillResult.filled, 2);
  assert.equal(seiKana.value, 'ヤマダ');
  assert.equal(meiKana.value, 'タロウ');
});

test('smart address parsing decomposes single-line address into pref, city, and addressLine', () => {
  const prefInput = createInputMock('pref', '', '都道府県', null);
  const cityInput = createInputMock('city', '', '市区町村', null);
  const addrInput = createInputMock('addr1', '', '番地・号', null);

  const allInputs = [prefInput, cityInput, addrInput];

  const ctx = vm.createContext({
    document: {
      title: '応募フォーム',
      querySelectorAll: () => allInputs,
      querySelector: () => null,
      getElementById: () => null,
      body: { innerText: '応募フォーム' }
    },
    location: { href: 'https://example.com' },
    Event: class { constructor(type) { this.type = type; } },
    UIEvent: class { constructor(type) { this.type = type; } },
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
    HTMLSelectElement: class {},
    module: { exports: {} }
  });

  vm.runInContext(engineSource, ctx);
  const runtime = ctx.pageRuntime;

  // Profile only provides single line address
  const profile = {
    address: '東京都港区六本木6-10-1'
  };

  const fillResult = runtime('fill', profile, {});
  assert.equal(fillResult.filled, 3);
  assert.equal(prefInput.value, '東京都');
  assert.equal(cityInput.value, '港区');
  assert.equal(addrInput.value, '六本木6-10-1');
});

test('gender radio button is accurately selected and dispatches click', () => {
  let clicked = false;
  function createRadio(value, label) {
    const r = {
      tagName: 'INPUT',
      type: 'radio',
      name: 'gender',
      value,
      checked: false,
      disabled: false,
      readOnly: false,
      hidden: false,
      checkVisibility: () => true,
      offsetParent: {},
      labels: [{ innerText: label }],
      getAttribute: (a) => (a === 'name' ? 'gender' : a === 'value' ? value : null),
      closest: () => null,
      matches: (s) => s.includes('radio'),
      focus: () => {},
      blur: () => {},
      click: () => { clicked = true; r.checked = true; },
      dispatchEvent: () => true
    };
    return r;
  }

  const maleRadio = createRadio('男性', '男性');
  const femaleRadio = createRadio('女性', '女性');

  const ctx = vm.createContext({
    document: {
      title: '応募フォーム',
      querySelectorAll: () => [maleRadio, femaleRadio],
      querySelector: () => null,
      body: { innerText: '応募フォーム' }
    },
    location: { href: 'https://example.com' },
    Event: class { constructor(type) { this.type = type; } },
    MouseEvent: class { constructor(type) { this.type = type; } },
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
    HTMLSelectElement: class {},
    module: { exports: {} }
  });

  vm.runInContext(engineSource, ctx);
  const runtime = ctx.pageRuntime;

  const fillResult = runtime('fill', { gender: '女性' }, {});
  assert.equal(fillResult.filled, 1);
  assert.equal(femaleRadio.checked, true);
  assert.equal(maleRadio.checked, false);
  assert.equal(clicked, true);
});
