"use strict";
// This function is injected on user click into the active page. It is intentionally self-contained.
function pageRuntime(mode, profile = {}, answers = {}) {
  // Sensitive/credential items that must never be auto-filled without explicit human action
  const forbidden = /password|パスワード|captcha|認証|otp|one\.?time|security\.?code|recovery|secret|決済|カード番号|cvv|ssn|社会保障|パスポート番号|口座番号|障がい|障害|disability|民族|ethnicity|race|人種|veteran|兵役|同意|consent|terms|規約|プライバシー|privacy|work\.?authorization|就労資格|ビザ|visa|sponsor|犯罪|criminal|前科|salary|compensation|希望年収|現年収|年収|notice\.?period|退職予定/i;

  function tidy(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function norm(s) { return tidy(s).toLowerCase().replace(/[\s\u3000_\-:：()（）＊*[\]【】「」]/g, ""); }
  function isForbidden(s) { return forbidden.test(s); }

  function cleanJapanese(s) {
    return String(s || "")
      .replace(/[\s\u3000_\-:：()（）＊*[\]【】「」]/g, "")
      .replace(/(?:※|必須|必修|任意|漢字|全角|半角|全角入力|半角数字|半角英数|ハイフンなし|ハイフンあり|ハイフン不要|例[：:]?)+/gi, "");
  }

  function cleanAiText(s) {
    if (typeof s !== "string") return "";
    let cleaned = s.replace(/[*＊]+/g, "");
    cleaned = cleaned
      .split("\n")
      .map(line => line.trim())
      .join("\n");
    return cleaned.replace(/\n{3,}/g, "\n\n").trim();
  }

  function toHiragana(str) {
    return String(str || "").replace(/[\u30a1-\u30f6]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
  }

  function toKatakana(str) {
    return String(str || "").replace(/[\u3041-\u3096]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) + 0x60)
    );
  }

  const PREFECTURES = [
    { code: 1, name: "北海道", short: "北海道" },
    { code: 2, name: "青森県", short: "青森" },
    { code: 3, name: "岩手県", short: "岩手" },
    { code: 4, name: "宮城県", short: "宮城" },
    { code: 5, name: "秋田県", short: "秋田" },
    { code: 6, name: "山形県", short: "山形" },
    { code: 7, name: "福島県", short: "福島" },
    { code: 8, name: "茨城県", short: "茨城" },
    { code: 9, name: "栃木県", short: "栃木" },
    { code: 10, name: "群馬県", short: "群馬" },
    { code: 11, name: "埼玉県", short: "埼玉" },
    { code: 12, name: "千葉県", short: "千葉" },
    { code: 13, name: "東京都", short: "東京" },
    { code: 14, name: "神奈川県", short: "神奈川" },
    { code: 15, name: "新潟県", short: "新潟" },
    { code: 16, name: "富山県", short: "富山" },
    { code: 17, name: "石川県", short: "石川" },
    { code: 18, name: "福井県", short: "福井" },
    { code: 19, name: "山梨県", short: "山梨" },
    { code: 20, name: "長野県", short: "長野" },
    { code: 21, name: "岐阜県", short: "岐阜" },
    { code: 22, name: "静岡県", short: "静岡" },
    { code: 23, name: "愛知県", short: "愛知" },
    { code: 24, name: "三重県", short: "三重" },
    { code: 25, name: "滋賀県", short: "滋賀" },
    { code: 26, name: "京都府", short: "京都" },
    { code: 27, name: "大阪府", short: "大阪" },
    { code: 28, name: "兵庫県", short: "兵庫" },
    { code: 29, name: "奈良県", short: "奈良" },
    { code: 30, name: "和歌山県", short: "和歌山" },
    { code: 31, name: "鳥取県", short: "鳥取" },
    { code: 32, name: "島根県", short: "島根" },
    { code: 33, name: "岡山県", short: "岡山" },
    { code: 34, name: "広島県", short: "広島" },
    { code: 35, name: "山口県", short: "山口" },
    { code: 36, name: "徳島県", short: "徳島" },
    { code: 37, name: "香川県", short: "香川" },
    { code: 38, name: "愛媛県", short: "愛媛" },
    { code: 39, name: "高知県", short: "高知" },
    { code: 40, name: "福岡県", short: "福岡" },
    { code: 41, name: "佐賀県", short: "佐賀" },
    { code: 42, name: "長崎県", short: "長崎" },
    { code: 43, name: "熊本県", short: "熊本" },
    { code: 44, name: "大分県", short: "大分" },
    { code: 45, name: "宮崎県", short: "宮崎" },
    { code: 46, name: "鹿児島県", short: "鹿児島" },
    { code: 47, name: "沖縄県", short: "沖縄" }
  ];

  function isPrefectureString(s) {
    const n = norm(s);
    return PREFECTURES.some(p => n.includes(norm(p.name)) || n.includes(norm(p.short)));
  }

  function matchPrefectureOption(options, valStr) {
    const n = norm(valStr);
    const found = PREFECTURES.find(p => n.includes(norm(p.name)) || n.includes(norm(p.short)));
    if (!found) return null;

    const codeStr = String(found.code);
    const codePad = codeStr.padStart(2, "0");

    // 1. 都道府県名で検索 (東京都, 東京)
    let opt = options.find(o => {
      const t = norm(o.text);
      const v = norm(o.value);
      return t.includes(norm(found.name)) || t.includes(norm(found.short)) ||
             v.includes(norm(found.name)) || v.includes(norm(found.short));
    });
    if (opt) return opt;

    // 2. JISコードで検索 (value="13" や value="013" や text="13")
    opt = options.find(o => {
      const v = String(o.value || "").trim();
      const t = String(o.text || "").trim();
      return v === codeStr || v === codePad || t.startsWith(codeStr) || t.startsWith(codePad);
    });
    return opt || null;
  }

  function matchYearOption(options, valStr, valNum) {
    let y = !isNaN(valNum) && valNum >= 1900 && valNum <= 2100 ? valNum : null;
    if (!y) {
      const m = String(valStr).match(/(19\d{2}|20\d{2})/);
      if (m) y = parseInt(m[1], 10);
    }
    // 和暦から西暦を抽出 (例: 平成14年 -> 2002)
    if (!y) {
      const s = norm(valStr);
      let wm;
      if ((wm = s.match(/(?:令和|r)(\d+|元)/))) y = 2018 + (wm[1] === "元" ? 1 : parseInt(wm[1], 10));
      else if ((wm = s.match(/(?:平成|h)(\d+|元)/))) y = 1988 + (wm[1] === "元" ? 1 : parseInt(wm[1], 10));
      else if ((wm = s.match(/(?:昭和|s)(\d+|元)/))) y = 1925 + (wm[1] === "元" ? 1 : parseInt(wm[1], 10));
    }
    if (!y) return null;

    const warekiList = [];
    if (y >= 2019) {
      const r = y - 2018;
      warekiList.push(`令和${r}年`, `令和${r}`, `R${r}`, `R${String(r).padStart(2, "0")}`, r === 1 ? "令和元年" : "");
    }
    if (y >= 1989 && y <= 2019) {
      const h = y - 1988;
      warekiList.push(`平成${h}年`, `平成${h}`, `H${h}`, `H${String(h).padStart(2, "0")}`, h === 1 ? "平成元年" : "");
    }
    if (y >= 1926 && y <= 1989) {
      const s = y - 1925;
      warekiList.push(`昭和${s}年`, `昭和${s}`, `S${s}`, `S${String(s).padStart(2, "0")}`, s === 1 ? "昭和元年" : "");
    }
    const normWareki = warekiList.filter(Boolean).map(norm);

    // 1. 選択肢テキストまたは値に含まれる4桁数値を照合 (例: "2002年", "2002(H14)", "平成14年(2002年)")
    let opt = options.find(o => {
      const t = String(o.text || "");
      const v = String(o.value || "");
      const nums = (t + " " + v).match(/\d{4}/g) || [];
      return nums.some(n => parseInt(n, 10) === y);
    });
    if (opt) return opt;

    // 2. 和暦での一致 (例: "平成14年", "H14")
    opt = options.find(o => {
      const t = norm(o.text);
      const v = norm(o.value);
      return normWareki.some(w => t.includes(w) || v.includes(w));
    });
    if (opt) return opt;

    // 3. 末尾2桁西暦
    const shortYear = String(y).slice(-2);
    opt = options.find(o => norm(o.value) === shortYear || norm(o.text) === `${shortYear}年`);
    return opt || null;
  }

  function matchNumericOption(options, valNum) {
    const numPad = String(valNum).padStart(2, "0");
    const numStr = String(valNum);

    // 1. value の完全一致 ("3" または "03")
    let opt = options.find(o => {
      const v = String(o.value || "").trim();
      return v === numStr || v === numPad;
    });
    if (opt) return opt;

    // 2. text 内の数値照合 (例: "3月", "03日", "3")
    opt = options.find(o => {
      const nums = ((o.text || "") + " " + (o.value || "")).match(/\d+/g) || [];
      return nums.some(n => parseInt(n, 10) === valNum);
    });
    return opt || null;
  }

  function getDirectText(el) {
    const list = [];
    if (el.labels) list.push(...[...el.labels].map(n => n.innerText || n.textContent));
    if (el.id) {
      try {
        const la = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (la) list.push(la.innerText);
      } catch {}
    }
    const p = el.getAttribute("placeholder");
    if (p) list.push(p);
    const aria = el.getAttribute("aria-label");
    if (aria) list.push(aria);
    const title = el.getAttribute("title");
    if (title) list.push(title);
    return tidy(list.join(" "));
  }

  function getLabel(el) {
    const texts = [];
    if (el.labels) texts.push(...[...el.labels].map(n => n.innerText || n.textContent));
    if (el.id) {
      try {
        const la = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (la) texts.push(la.innerText);
      } catch {}
    }
    for (const key of ["aria-label", "placeholder", "name", "id", "data-testid", "autocomplete", "title", "value"]) {
      const val = el.getAttribute(key);
      if (val) texts.push(val);
    }
    const ariaBy = el.getAttribute("aria-labelledby");
    if (ariaBy) {
      for (const id of ariaBy.split(/\s+/)) {
        const target = document.getElementById(id);
        if (target) texts.push(target.innerText);
      }
    }
    const legend = el.closest("fieldset")?.querySelector("legend");
    if (legend) texts.push(legend.innerText);

    // Look upward for field labels and structural section heading
    let sectionHeading = "";
    let container = el.parentElement;
    for (let depth = 0; depth < 5 && container; depth++, container = container.parentElement) {
      if (container.matches("body,html")) break;
      // Check for preceding section title / heading
      if (!sectionHeading) {
        let prev = container.previousElementSibling;
        while (prev && !sectionHeading) {
          if (prev.matches("h1,h2,h3,h4,legend,.section-title,[class*=section-title],[class*=section_title],[class*=heading]")) {
            sectionHeading = tidy(prev.innerText).slice(0, 80);
            break;
          }
          prev = prev.previousElementSibling;
        }
      }
      if (container.matches("form,main,article,[role=form]")) break;
      const siblingInputs = container.querySelectorAll('input,textarea,select,[contenteditable="true"]');
      if (siblingInputs.length > 8) break;
      for (const child of [...container.children].slice(0, 10)) {
        if (child === el || child.contains(el)) continue;
        if (child.matches("label,legend,.label,.form-label,[class*=label],[class*=question],h3,h4,h5,strong,p,span") &&
            !child.querySelector('input,textarea,select,[contenteditable="true"]')) {
          texts.push((child.innerText || "").slice(0, 160));
        }
      }
    }
    if (sectionHeading) texts.unshift(`[${sectionHeading}]`);
    return tidy([...new Set(texts.filter(Boolean).map(tidy))].join(" | ")).slice(0, 320);
  }

  function getSectionHeading(el) {
    let container = el.parentElement;
    for (let depth = 0; depth < 6 && container; depth++, container = container.parentElement) {
      if (container.matches("body,html")) break;
      let prev = container.previousElementSibling;
      while (prev) {
        if (prev.matches("h1,h2,h3,h4,legend,.section-title,[class*=section-title],[class*=heading]")) {
          return tidy(prev.innerText).slice(0, 80);
        }
        prev = prev.previousElementSibling;
      }
      const headingInside = container.querySelector("h1,h2,h3,h4,legend,.section-title");
      if (headingInside && !headingInside.contains(el)) {
        return tidy(headingInside.innerText).slice(0, 80);
      }
    }
    return "";
  }

  function getOptionsSummary(el) {
    if (el.matches("select")) {
      return [...el.options]
        .map(o => tidy(o.text || o.value))
        .filter(t => t && !/^(?:選択してください|選択|未選択|--|-|ご選択ください|選んでください|\s*)$/i.test(t))
        .slice(0, 150);
    }
    return [];
  }

  function typeOf(el) {
    if (el.matches('input[type="radio"]')) return "radio";
    if (el.matches('select')) return "select";
    if (el.matches('input[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="true"]')) return "combobox";
    if (el.matches('input')) return (el.type || "text").toLowerCase();
    if (el.matches('textarea')) return "textarea";
    return "contenteditable";
  }

  function isVisible(el) {
    if (typeof el.checkVisibility === "function") {
      return el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
    }
    return Boolean(el.offsetParent !== null || (typeof window !== "undefined" && window.getComputedStyle(el).display !== "none"));
  }

  function eligible(el) {
    const isCombobox = el.matches ? el.matches('[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="true"]') : false;
    if (el.disabled || (el.readOnly && !isCombobox) || el.closest("[inert]")) return false;
    const type = typeOf(el);
    if (!["text", "email", "tel", "url", "number", "date", "textarea", "select", "radio", "combobox", "contenteditable"].includes(type)) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (el.hidden || !isVisible(el)) return false;
    if (el.matches("[contenteditable]")) return el.getAttribute("contenteditable") !== "false";
    return true;
  }

  function getHasValue(el) {
    if (el.matches('input[type="radio"]')) {
      return el.checked;
    }
    if (el.matches('select')) {
      if (!el.value) return false;
      const selectedOpt = el.options[el.selectedIndex];
      if (!selectedOpt) return false;
      const text = selectedOpt.text.trim();
      return !/選択してください|^選択$|^--$|^-$|^\s*$/i.test(text);
    }
    if (el.matches('input,textarea')) {
      return Boolean(tidy(el.value));
    }
    return Boolean(tidy(el.innerText));
  }

  const elements = [...document.querySelectorAll('input,textarea,select,[contenteditable="true"]')].filter(eligible);

  function firstNonEmpty(...vals) { return vals.find(v => typeof v === "string" && v.trim()) || ""; }

  // Prepare profile fields with intelligent splitting and fallback
  let familyJP = (profile.familyJP || "").trim();
  let givenJP = (profile.givenJP || "").trim();
  let fullJP = (profile.fullNameJP || "").trim();

  if ((!familyJP || !givenJP) && fullJP) {
    const splitJP = fullJP.split(/[\s\u3000]+/);
    if (splitJP.length >= 2) {
      if (!familyJP) familyJP = splitJP[0];
      if (!givenJP) givenJP = splitJP.slice(1).join(" ");
    } else if (fullJP.length === 4) {
      if (!familyJP) familyJP = fullJP.slice(0, 2);
      if (!givenJP) givenJP = fullJP.slice(2);
    } else if (fullJP.length === 3) {
      if (!familyJP) familyJP = fullJP.slice(0, 2);
      if (!givenJP) givenJP = fullJP.slice(2);
    }
  }
  if (!fullJP) {
    fullJP = [familyJP, givenJP].filter(Boolean).join(" ");
  }

  let familyKana = (profile.familyKana || "").trim();
  let givenKana = (profile.givenKana || "").trim();
  let fullKana = (profile.fullNameKana || "").trim();

  if ((!familyKana || !givenKana) && fullKana) {
    const splitKana = fullKana.split(/[\s\u3000]+/);
    if (splitKana.length >= 2) {
      if (!familyKana) familyKana = splitKana[0];
      if (!givenKana) givenKana = splitKana.slice(1).join(" ");
    }
  }
  if (!fullKana) {
    fullKana = [familyKana, givenKana].filter(Boolean).join(" ");
  }

  const firstEN = (profile.firstEN || "").trim();
  const lastEN = (profile.lastEN || "").trim();
  const fullEN = [firstEN, lastEN].filter(Boolean).join(" ");

  // Phone processing (full, hyphenated, non-hyphenated & split support)
  const phoneRaw = (profile.phone || "").replace(/\D/g, "");
  let phone1 = "", phone2 = "", phone3 = "";
  if (phoneRaw.length === 11) {
    phone1 = phoneRaw.slice(0, 3);
    phone2 = phoneRaw.slice(3, 7);
    phone3 = phoneRaw.slice(7, 11);
  } else if (phoneRaw.length === 10) {
    if (phoneRaw.startsWith("03") || phoneRaw.startsWith("06")) {
      phone1 = phoneRaw.slice(0, 2);
      phone2 = phoneRaw.slice(2, 6);
      phone3 = phoneRaw.slice(6, 10);
    } else {
      phone1 = phoneRaw.slice(0, 3);
      phone2 = phoneRaw.slice(3, 6);
      phone3 = phoneRaw.slice(6, 10);
    }
  }
  const phoneHyphen = (phone1 && phone2 && phone3) ? `${phone1}-${phone2}-${phone3}` : profile.phone || "";

  // Postal code processing (full, hyphenated, non-hyphenated & split support)
  const zipRaw = (profile.postalCode || "").replace(/\D/g, "");
  const zip1 = zipRaw.length >= 3 ? zipRaw.slice(0, 3) : "";
  const zip2 = zipRaw.length >= 7 ? zipRaw.slice(3, 7) : "";
  const zipHyphen = zipRaw.length === 7 ? `${zip1}-${zip2}` : profile.postalCode || "";

  // Address processing (single, 2-box, 3-box support)
  let pref = profile.prefecture || "";
  let city = profile.city || "";
  let addrLine = profile.addressLine || "";
  let building = profile.building || "";
  const rawAddr = (profile.address || "").trim();

  // If pref/city/addrLine are missing but full address exists, intelligently parse Japanese address
  if ((!pref || !city || !addrLine) && rawAddr) {
    const prefMatch = rawAddr.match(/^(東京都|北海道|京都府|大阪府|.{2,3}県)/);
    if (!pref && prefMatch) {
      pref = prefMatch[1];
    }
    const remAfterPref = prefMatch ? rawAddr.slice(prefMatch[1].length).trim() : rawAddr;
    const cityMatch = remAfterPref.match(/^([^市区町村]+?[市区町村])/);
    if (!city && cityMatch) {
      city = cityMatch[1];
    }
    if (!addrLine) {
      const remAfterCity = cityMatch ? remAfterPref.slice(cityMatch[1].length).trim() : remAfterPref;
      addrLine = remAfterCity;
    }
  }
  if (!addrLine && profile.address) addrLine = profile.address;

  const fullAddress = firstNonEmpty(
    profile.address,
    [pref, city, addrLine, building].filter(Boolean).join("")
  );

  function isGivenName(cleanPrimary) {
    if (/^(?:氏名|お名前|名前)$/.test(cleanPrimary)) return false;
    if (/大学|学校|企業|会社|法人|専攻|志望|職種|役職|サービス|支店|店舗|部署/.test(cleanPrimary)) return false;
    return /(?:氏名|お名前|名前)?名$/.test(cleanPrimary) || /^(?:名|first_?name|given_?name|mei)$/i.test(cleanPrimary);
  }

  function findInputSiblings(el, matcher) {
    let container = el.closest(".row, .form-group, .field, .form-row, tr, div, fieldset, li, p") || el.parentElement;
    if (container && container.matches("form, body, main")) container = el.parentElement;
    if (!container) return [el];
    const inputs = [...container.querySelectorAll('input, select')].filter(inp => {
      const type = typeOf(inp);
      if (["hidden", "submit", "button", "checkbox", "radio"].includes(type)) return false;
      const l = norm(getLabel(inp));
      const n = (inp.name || "") + " " + (inp.id || "") + " " + (inp.placeholder || "");
      return matcher(l, n) || inp === el;
    });
    return inputs.length > 0 ? inputs : [el];
  }

  function classify(label, el) {
    const s = norm(label);
    const cleanPrimary = cleanJapanese(label.split("|")[0]);

    if (isForbidden(label)) return ["", "除外する機微・確認項目"];
    if (!s || s.length < 2) return ["", "不明な項目"];

    const has = (...rs) => rs.some(r => r.test(s));
    const field = (v, why) => [firstNonEmpty(v), why];

    // 1. Furigana / Kana (with strict Hiragana vs Katakana distinction)
    if (has(/ふりがな|フリガナ|カナ|katakana|kana|ひらがな/) || (has(/セイ|メイ|せい|めい/) && !has(/漢字/))) {
      const direct = getDirectText(el);
      let wantHiragana = false;
      const cleanPlaceholder = (el.placeholder || "").replace(/^(?:例[：:]?\s*|e\.?g\.?[：:]?\s*)/i, "").replace(/[\s\u3000]/g, "").trim();

      // 1. Check direct element text (label, placeholder, title, aria-label)
      if (/ひらがな|平仮名/i.test(direct)) {
        wantHiragana = true;
      } else if (/カタカナ|片仮名/i.test(direct)) {
        wantHiragana = false;
      } else if (/ふりがな/.test(direct)) {
        wantHiragana = true;
      } else if (/フリガナ/.test(direct)) {
        wantHiragana = false;
      } else if (cleanPlaceholder && /^[ぁ-ん]+$/.test(cleanPlaceholder)) {
        wantHiragana = true;
      } else if (cleanPlaceholder && /^[ァ-ン]+$/.test(cleanPlaceholder)) {
        wantHiragana = false;
      } else {
        // 2. Check full label excluding parent section heading [ ... ]
        const labelWithoutHeading = label.replace(/^\[[^\]]*\]\s*\|\s*/, "");
        if (/ひらがな|平仮名/i.test(labelWithoutHeading)) {
          wantHiragana = true;
        } else if (/カタカナ|片仮名/i.test(labelWithoutHeading)) {
          wantHiragana = false;
        } else if (/ふりがな/.test(labelWithoutHeading) && !/フリガナ/.test(labelWithoutHeading)) {
          wantHiragana = true;
        } else if (/ふりがな/.test(labelWithoutHeading) && /フリガナ/.test(labelWithoutHeading)) {
          const posHira = labelWithoutHeading.indexOf("ふりがな");
          const posKata = labelWithoutHeading.indexOf("フリガナ");
          wantHiragana = posHira !== -1 && (posKata === -1 || posHira < posKata);
        } else if (/フリガナ/.test(labelWithoutHeading)) {
          wantHiragana = false;
        } else if (/せい|めい/.test(labelWithoutHeading) && !/セイ|メイ/.test(labelWithoutHeading)) {
          wantHiragana = true;
        } else {
          // Default: if "ふりがな" appears anywhere in Hiragana, output Hiragana!
          wantHiragana = /ふりがな/.test(label);
        }
      }

      const famK = wantHiragana ? toHiragana(familyKana) : toKatakana(familyKana);
      const givK = wantHiragana ? toHiragana(givenKana) : toKatakana(givenKana);
      const fulK = wantHiragana ? toHiragana(fullKana) : toKatakana(fullKana);

      // Sibling group detection: if 2 inputs are grouped under Kana, allocate Sei and Mei
      const kanaSiblings = findInputSiblings(el, (l, n) => /フリガナ|ふりがな|カナ|kana/i.test(l) || /kana|sei|mei/i.test(n));
      if (kanaSiblings.length === 2) {
        const idx = kanaSiblings.indexOf(el);
        if (idx === 0) return field(famK, wantHiragana ? "ふりがな（姓・ひらがな）" : "フリガナ（姓・カタカナ）");
        if (idx === 1) return field(givK, wantHiragana ? "ふりがな（名・ひらがな）" : "フリガナ（名・カタカナ）");
      }

      if (has(/姓|セイ|せい|苗字|名字|last/) || /^(?:sei|kana1)$/i.test(el.name || el.id)) {
        return field(famK, wantHiragana ? "ふりがな（姓・ひらがな）" : "フリガナ（姓・カタカナ）");
      }
      if (has(/メイ|めい|first/) || isGivenName(cleanPrimary) || /^(?:mei|kana2)$/i.test(el.name || el.id)) {
        return field(givK, wantHiragana ? "ふりがな（名・ひらがな）" : "フリガナ（名・カタカナ）");
      }
      return field(fulK, wantHiragana ? "ふりがな（ひらがな）" : "フリガナ（カタカナ）");
    }

    // 2. Email (handles both primary and confirmation email fields)
    if (has(/e.?mail|メールアドレス|電子メール|メール/)) {
      return field(profile.email, "メールアドレス");
    }

    // 3. Phone (handles single, hyphen/non-hyphen, and split 3-box inputs)
    if (has(/phone|tel|携帯|電話番号|連絡先電話/)) {
      const phoneSiblings = findInputSiblings(el, (l, n) => /phone|tel|携帯|電話/.test(l) || /tel|phone/i.test(n));
      const siblingCount = phoneSiblings.length;
      const siblingIndex = phoneSiblings.indexOf(el);

      // Sibling group detection: if 3 inputs are grouped in the phone container, match strictly by order
      if (siblingCount === 3) {
        if (siblingIndex === 0 && phone1) return field(phone1, "電話番号（市外局番）");
        if (siblingIndex === 1 && phone2) return field(phone2, "電話番号（市内局番）");
        if (siblingIndex === 2 && phone3) return field(phone3, "電話番号（加入者番号）");
      }

      if (siblingCount === 2) {
        if (siblingIndex === 0) return field(phone1 && phone2 ? `${phone1}${phone2}` : phone1, "電話番号（前半）");
        if (siblingIndex === 1) return field(phone3, "電話番号（後半）");
      }

      // Name / ID / Label pattern checks
      const elMax = el.maxLength;
      const nameId = (el.name || "") + " " + (el.id || "");
      if (has(/市外局番|1番目|head|part1/) || elMax === 3 || elMax === 2 || /(?:tel|phone)[_\-]?(?:1|first|head|a)(?:$|[_\-\[])/i.test(nameId) || /\[0\]/.test(nameId)) {
        if (phone1) return field(phone1, "電話番号（市外局番）");
      }
      if (has(/市内局番|2番目|mid|part2/) || (elMax === 4 && has(/2/)) || /(?:tel|phone)[_\-]?(?:2|mid|middle|b)(?:$|[_\-\[])/i.test(nameId) || /\[1\]/.test(nameId)) {
        if (phone2) return field(phone2, "電話番号（市内局番）");
      }
      if (has(/加入者番号|3番目|tail|part3/) || (elMax === 4 && has(/3/)) || /(?:tel|phone)[_\-]?(?:3|last|tail|c)(?:$|[_\-\[])/i.test(nameId) || /\[2\]/.test(nameId)) {
        if (phone3) return field(phone3, "電話番号（加入者番号）");
      }

      // If maxLength is small (<= 5), it CANNOT be a full phone number
      if (elMax > 0 && elMax <= 5) {
        if (phone1 && elMax <= 3) return field(phone1, "電話番号（市外局番）");
        if (phone2 && elMax === 4) return field(phone2, "電話番号（市内局番）");
        return ["", "電話番号分割枠"];
      }

      // Adaptive formatting for single phone input:
      if (elMax === 11 || elMax === 10 || has(/ハイフンなし|数字のみ/)) {
        return field(phoneRaw || profile.phone, "電話番号（ハイフンなし）");
      }
      if (elMax === 13 || elMax === 12 || has(/ハイフンあり/)) {
        return field(phoneHyphen || profile.phone, "電話番号（ハイフンあり）");
      }
      return field(profile.phone, "電話番号");
    }

    // 4. Postal Code (handles single, hyphen/non-hyphen, and split 3/4 box inputs)
    if (has(/郵便番号|postal.?code|zipcode|zip/)) {
      const zipSiblings = findInputSiblings(el, (l, n) => /郵便番号|postal|zip/.test(l) || /zip|postal/i.test(n));
      const siblingCount = zipSiblings.length;
      const siblingIndex = zipSiblings.indexOf(el);

      if (siblingCount === 2) {
        if (siblingIndex === 0 && zip1) return field(zip1, "郵便番号（上3桁）");
        if (siblingIndex === 1 && zip2) return field(zip2, "郵便番号（下4桁）");
      }

      const elMax = el.maxLength;
      const nameId = (el.name || "") + " " + (el.id || "");
      if (has(/上3桁|3桁|前|part1/) || elMax === 3 || /(?:zip|postal)[_\-]?(?:1|first|head|a)(?:$|[_\-\[])/i.test(nameId) || /\[0\]/.test(nameId)) {
        if (zip1) return field(zip1, "郵便番号（上3桁）");
      }
      if (has(/下4桁|4桁|後|part2/) || elMax === 4 || /(?:zip|postal)[_\-]?(?:2|mid|last|b)(?:$|[_\-\[])/i.test(nameId) || /\[1\]/.test(nameId)) {
        if (zip2) return field(zip2, "郵便番号（下4桁）");
      }

      if (elMax > 0 && elMax <= 5) {
        if (zip1 && elMax === 3) return field(zip1, "郵便番号（上3桁）");
        if (zip2 && elMax === 4) return field(zip2, "郵便番号（下4桁）");
        return ["", "郵便番号分割枠"];
      }

      if (elMax === 7 || has(/ハイフンなし|7桁|数字のみ/)) {
        return field(zipRaw || profile.postalCode, "郵便番号（ハイフンなし）");
      }
      if (elMax === 8 || has(/ハイフンあり/)) {
        return field(zipHyphen || profile.postalCode, "郵便番号（ハイフンあり）");
      }
      return field(zipHyphen || profile.postalCode, "郵便番号");
    }

    // 5. Name (Kanji / English / Romaji)
    // A name field should ONLY be filled with English/Romaji if:
    // (a) The field explicitly asks for Romaji / English / Alphabet / Passport, and does NOT ask for Kanji/Kana.
    // (b) OR the whole page is in English (no Japanese characters anywhere in visible body) and the label is purely ASCII.
    const pageHasJapanese = /[ぁ-んァ-ン一-龥]/.test(document.body?.innerText || "") ||
                            (document.documentElement.lang && document.documentElement.lang.toLowerCase().startsWith("ja"));
    const fieldExplicitlyWantsEnglish =
      /ローマ字|英語|アルファベット|英字|半角英数|romaji|alphabet|passport|in.?english|english.?name/i.test(label) &&
      !/漢字|かんじ|kanji|日本語|フリガナ|ふりがな|カナ/i.test(label);
    const useEnglishName = fieldExplicitlyWantsEnglish || (!pageHasJapanese && /^[\x00-\x7F]+$/.test(s));

    // Sibling detection for split Name fields (handles <label>氏名</label> <input> <input>)
    if (has(/氏名|お名前|名前|^name/)) {
      const nameSiblings = findInputSiblings(el, (l, n) => /氏名|お名前|名前|^name/i.test(l) || /name|sei|mei/i.test(n));
      if (nameSiblings.length === 2) {
        const idx = nameSiblings.indexOf(el);
        if (idx === 0) {
          return useEnglishName ? field(firstNonEmpty(lastEN, fullEN), "姓（英語・ローマ字）") : field(firstNonEmpty(familyJP, fullJP), "姓（漢字）");
        }
        if (idx === 1) {
          return useEnglishName ? field(firstNonEmpty(firstEN, fullEN), "名（英語・ローマ字）") : field(firstNonEmpty(givenJP, fullJP), "名（漢字）");
        }
      }
    }

    if (has(/姓|苗字|名字/) || has(/last.?name|family.?name|sur.?name/) || /^(?:sei|name1)$/i.test(el.name || el.id)) {
      if (useEnglishName) {
        return field(firstNonEmpty(lastEN, fullEN), "姓（英語・ローマ字）");
      }
      return field(firstNonEmpty(familyJP, fullJP), "姓（漢字）");
    }

    if (has(/first.?name|given.?name/) || isGivenName(cleanPrimary) || /^(?:mei|name2)$/i.test(el.name || el.id)) {
      if (useEnglishName) {
        return field(firstNonEmpty(firstEN, fullEN), "名（英語・ローマ字）");
      }
      return field(firstNonEmpty(givenJP, fullJP), "名（漢字）");
    }

    if (has(/full.?name|display.?name|お名前|氏名|名前|your.?name|^name$/)) {
      if (useEnglishName) {
        return field(firstNonEmpty(fullEN, lastEN && firstEN ? `${firstEN} ${lastEN}` : ""), "氏名（英語・ローマ字）");
      }
      return field(firstNonEmpty(fullJP, [familyJP, givenJP].filter(Boolean).join(" ")), "氏名（漢字）");
    }

    // 6. Birth Date (生年月日)
    if (has(/生年月日|誕生|birthday|birth.?date|生年/)) {
      const directClean = (getDirectText(el) || "").replace(/生年月日|生年|birthday|birth.?date/gi, "");
      const sWithoutGeneral = s.replace(/生年月日|生年|birthday|birth.?date/gi, "");
      const nameId = ((el.name || "") + " " + (el.id || "")).toLowerCase();

      // Sibling group detection: if 3 inputs/selects are grouped together under "生年月日"
      if (typeOf(el) === "select" || el.matches("input")) {
        const birthSiblings = findInputSiblings(el, (l, n) => /生年月日|誕生|birthday|birth/i.test(l) || /birth|year|month|day/i.test(n));
        if (birthSiblings.length === 3) {
          const idx = birthSiblings.indexOf(el);
          if (idx === 0) return field(profile.birthYear, "生年月日（年）");
          if (idx === 1) return field(profile.birthMonth, "生年月日（月）");
          if (idx === 2) return field(profile.birthDay, "生年月日（日）");
        }
      }

      // Check options characteristics if it's a select element
      if (typeOf(el) === "select" && el.options) {
        const opts = [...el.options].filter(o => o.value && !/選択|--/.test(o.text));
        const sampleNums = opts.slice(0, 8).map(o => parseInt(o.value || o.text, 10)).filter(n => !isNaN(n));
        if (sampleNums.some(n => n >= 1900 && n <= 2100)) {
          return field(profile.birthYear, "生年月日（年）");
        }
        if (sampleNums.length > 0 && sampleNums.every(n => n >= 1 && n <= 12) && opts.length <= 13) {
          return field(profile.birthMonth, "生年月日（月）");
        }
        if (sampleNums.length > 0 && sampleNums.some(n => n > 12 && n <= 31) && opts.length <= 32) {
          return field(profile.birthDay, "生年月日（日）");
        }
      }

      const isM = /月|month|mm/i.test(sWithoutGeneral) || /月|month|mm/i.test(directClean) || /(?:^|[_\-])month(?:$|[_\-])/i.test(nameId);
      const isD = /日|day|dd/i.test(sWithoutGeneral) || /日|day|dd/i.test(directClean) || /(?:^|[_\-])day(?:$|[_\-])/i.test(nameId);
      const isY = /年|year|yyyy/i.test(sWithoutGeneral) || /年|year|yyyy/i.test(directClean) || /(?:^|[_\-])year(?:$|[_\-])/i.test(nameId) || has(/生年$/);

      if (isM && !isY) return field(profile.birthMonth, "生年月日（月）");
      if (isD && !isY) return field(profile.birthDay, "生年月日（日）");
      if (isY && !isM && !isD) return field(profile.birthYear, "生年月日（年）");
      if (isM) return field(profile.birthMonth, "生年月日（月）");
      if (isD) return field(profile.birthDay, "生年月日（日）");
      if (isY) return field(profile.birthYear, "生年月日（年）");

      if (typeOf(el) === "date") {
        const ym = `${profile.birthYear}-${String(profile.birthMonth || "01").padStart(2, '0')}-${String(profile.birthDay || "01").padStart(2, '0')}`;
        return field(ym, "生年月日");
      }
      const fullBirth = [profile.birthYear, profile.birthMonth, profile.birthDay].filter(Boolean).join("/");
      return field(fullBirth, "生年月日");
    }

    // 7. Gender (性別)
    if (has(/性別|gender/)) {
      return field(profile.gender, "性別");
    }

    // 8. Academic Type (文理区分)
    if (has(/文理|文系|理系/)) {
      return field(profile.academicType || "理系", "文理区分");
    }

    // 9. Graduation Status (卒業見込み・就業状況)
    if (has(/卒業見込|卒業区分|在籍状況|就業状況/)) {
      return field(profile.graduationStatus || "卒業見込み", "卒業区分");
    }

    // 10. Address & Region (handles 1-box, 2-box, 3-box layouts)
    if (has(/都道府県|prefecture|state|province/)) {
      return field(firstNonEmpty(pref, city), "都道府県");
    }
    if (has(/建物|ビル|マンション|アパート|apartment|building|住所2|address.?2/)) {
      return field(building, "建物名・部屋番号");
    }
    if (has(/city|市区町村/)) {
      return field(city, "市区町村");
    }
    if (has(/番地|丁目|号|address.?1|住所1/)) {
      return field(addrLine || fullAddress, "番地");
    }
    if (has(/address|住所|所在地/)) {
      return field(fullAddress, "住所");
    }
    if (has(/country|国名|居住国/)) {
      return field(profile.country, "国");
    }

    // 11. Social & Links
    if (has(/linkedin/)) return field(profile.linkedin, "LinkedIn");
    if (has(/github/)) return field(profile.github, "GitHub");
    if (has(/portfolio|ポートフォリオ|website|web.?site|personal.?url/)) return field(profile.portfolio, "Portfolio");

    // 12. Education
    const directEdu = getDirectText(el);
    const nameIdEdu = (el.name || "") + " " + (el.id || "");
    if (has(/graduation.?month|卒業予定月|卒業月|修了月/) || ((has(/卒業年月|修了年月/) || /graduation/i.test(nameIdEdu)) && (/月|month/i.test(directEdu) || /month/i.test(nameIdEdu)))) {
      return field(profile.graduationMonth, "卒業月");
    }
    if (has(/graduation.?year|卒業年|卒業予定年|修了年/) || ((has(/卒業年月|修了年月/) || /graduation/i.test(nameIdEdu)) && (/年|year/i.test(directEdu) || /year/i.test(nameIdEdu)))) {
      return field(profile.graduationYear, "卒業年");
    }
    if (has(/degree|学位/)) return field(profile.degree, "学位");
    if (has(/school.?name|学校名|大学名|university|college|在籍大学/)) {
      return field(firstNonEmpty(useEnglishName ? profile.schoolEN : profile.schoolJP, profile.schoolJP, profile.schoolEN), "学校名");
    }
    if (has(/faculty|学部/)) return field(profile.faculty, "学部");
    if (has(/major|field.?of.?study|専門分野|専攻|学科/)) return field(profile.major, "専攻");
    if (has(/gpa|成績平均/)) return field(profile.gpa, "GPA");
    if (has(/研究室|ゼミ|研究テーマ|卒業論文/)) return field(profile.projects, "研究・ゼミ");

    // 13. Narrative / Statement fields
    if (has(/cover.?letter|why.?us|why.?this|why.?company|志望動機|志望理由|応募理由|なぜ.*(弊社|当社|会社)/)) {
      return field(profile.motivation, "志望動機");
    }
    if (has(/自己pr|自己アピール|強み|長所|self.?pr|strength/)) {
      return field(profile.selfPR, "自己PR");
    }
    if (has(/career.?goal|将来.*(仕事|目標)|キャリアプラン|挑戦したいこと|目指す/)) {
      return field(profile.careerGoals, "将来の目標");
    }
    if (has(/project|研究|プロジェクト/)) {
      return field(profile.projects, "プロジェクト");
    }
    if (has(/qualifications|certifications|資格|免許/)) {
      return field(profile.certifications, "資格");
    }
    if (has(/skills|スキル|技術スタック|プログラミング言語/)) {
      return field(profile.skills, "スキル");
    }
    if (has(/experience|work.?history|employment.?history|internship|職歴|業務経験|インターン|ガクチカ|学生時代に力を|取り組んだこと|困難|挫折/)) {
      return field(profile.experience, "経験・ガクチカ");
    }
    if (has(/summary|profile|自己紹介|概要|about.?you|about.?yourself/)) {
      return field(firstNonEmpty(profile.englishSummary, profile.selfPR), "概要");
    }

    return ["", "未対応"];
  }

  function narrative(f) {
    if (isForbidden(f.label)) return false;
    const label = norm(f.label);
    const exclude = /e.?mail|氏名|name|住所|address|postal|zip|city|phone|電話|linkedin|github|portfolio|大学名|学部|専攻|学校名|gpa|卒業年|卒業月|graduate.?year|選択|sex|salary|url|生年月日/i;
    if (exclude.test(label)) return false;
    const positive = /志望|自己pr|motiv|why.?|cover.?letter|strength|ガクチカ|学生時代|経験|プロジェクト|研究|長所|短所|困難|挫折|成し遂げ|achievement|accomplish|describe|tell.?us|explain|summary|自己紹介|自由記述|comment|アピール|career|value|大切にして|挑戦|reason|career.?goal|career.?aspiration/i;
    return positive.test(f.label) || ((f.type === "textarea" || f.type === "contenteditable") && (f.maxLength === 0 || f.maxLength >= 160));
  }

  function setValue(el, val) {
    const type = typeOf(el);
    if (type === "contenteditable") {
      el.focus();
      el.textContent = val;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: val }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.blur();
      return true;
    }

    if (type === "radio") {
      const want = norm(val);
      const labelText = norm(getLabel(el));
      const valText = norm(el.value);
      let isMatch = valText === want || labelText.includes(want) || want.includes(valText);

      // Gender specific matching
      if (!isMatch) {
        if (/男|male/.test(want) && !/女|female/.test(want)) {
          isMatch = /^男性?$|^男$|^male$|^m$/i.test(valText) || /^男性?$|^男$|^male$|^m$/i.test(labelText) || /男性|男/.test(labelText);
        } else if (/女|female/.test(want)) {
          isMatch = /^女性?$|^女$|^female$|^f$/i.test(valText) || /^女性?$|^女$|^female$|^f$/i.test(labelText) || /女性|女/.test(labelText);
        }
      }

      if (!isMatch && (/理系/.test(want) && /理系/.test(valText + labelText))) isMatch = true;
      if (!isMatch && (/文系/.test(want) && /文系/.test(valText + labelText))) isMatch = true;
      if (!isMatch && (/見込/.test(want) && /見込/.test(valText + labelText))) isMatch = true;
      if (!isMatch && (/学士/.test(want) && /学士|学部/.test(valText + labelText))) isMatch = true;

      if (isMatch) {
        try { el.scrollIntoView?.({ block: "nearest", inline: "nearest" }); } catch {}
        el.focus();
        el.checked = true;
        try { el.click(); } catch {}
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (typeof MouseEvent !== "undefined") {
          try { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); } catch {}
        }
        el.blur();
        return true;
      }
      return false;
    }

    if (type === "combobox") {
      try { el.scrollIntoView?.({ block: "nearest", inline: "nearest" }); } catch {}
      el.focus();
      const protoObj = typeof HTMLInputElement !== "undefined" ? HTMLInputElement.prototype : Object.getPrototypeOf(el);
      const setter = protoObj ? Object.getOwnPropertyDescriptor(protoObj, "value")?.set : null;
      if (setter) {
        setter.call(el, val);
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      el.blur();
      return true;
    }

    if (type === "select") {
      const allOpts = [...el.options].filter(o => o && !o.disabled);
      // 未選択・プレースホルダー的な選択肢を除外した候補
      const validOpts = allOpts.filter(o => {
        const t = tidy(o.text || o.value);
        return t && !/^(?:選択してください|選択|未選択|--|-|ご選択ください|選んでください|\s*)$/i.test(t);
      });
      const opts = validOpts.length > 0 ? validOpts : allOpts;

      const want = norm(val);
      const valStr = String(val).trim();
      const valNum = parseInt(valStr, 10);
      const fieldLabel = norm(getLabel(el));
      const hasInLabel = (...rs) => rs.some(r => r.test(fieldLabel));

      let matching = null;

      // 1. 完全一致 (value または text の norm 一致)
      matching = opts.find(o => norm(o.value) === want || norm(o.text) === want);

      // 2. 都道府県の高度マッチング (JISコード, 都道府県名, 短縮形)
      if (!matching && (hasInLabel(/都道府県|prefecture|県名|居住|所在/) || isPrefectureString(valStr))) {
        matching = matchPrefectureOption(opts, valStr);
      }

      // 3. 西暦・和暦・年号の高度マッチング (2002年 ⇔ 平成14年 / H14 / 2002(H14))
      if (!matching && (hasInLabel(/年|year|yyyy|誕生|生年|生年月日|卒業/) || (!isNaN(valNum) && valNum >= 1920 && valNum <= 2060))) {
        matching = matchYearOption(opts, valStr, valNum);
      }

      // 4. 月・日の数値照合 (03 ⇔ 3月 ⇔ 3, 01 ⇔ 1日 ⇔ 1)
      if (!matching && !isNaN(valNum) && (hasInLabel(/月|month|日|day/) || (valNum >= 1 && valNum <= 31))) {
        matching = matchNumericOption(opts, valNum);
      }

      // 5. 学位・卒業区分・文理区分・性別のファジーマッチ
      if (!matching) {
        if (/学士|学部|大学/.test(want)) {
          matching = opts.find(o => /学士|学部|大学（学部/i.test(o.text || o.value) && !/院|修士|博士|短期|高専/.test(o.text || o.value));
        } else if (/修士|大学院/.test(want)) {
          matching = opts.find(o => /修士|大学院/i.test(o.text || o.value) && !/博士/.test(o.text || o.value));
        } else if (/博士/.test(want)) {
          matching = opts.find(o => /博士/i.test(o.text || o.value));
        } else if (/見込/.test(want)) {
          matching = opts.find(o => /見込|在学|予定/i.test(o.text || o.value));
        } else if (/卒業|既卒/.test(want) && !/見込|予定/.test(want)) {
          matching = opts.find(o => /卒業|既卒/i.test(o.text || o.value) && !/見込|予定/.test(o.text || o.value));
        } else if (/理系/.test(want)) {
          matching = opts.find(o => /理系/i.test(o.text || o.value));
        } else if (/文系/.test(want)) {
          matching = opts.find(o => /文系/i.test(o.text || o.value));
        } else if (/男/.test(want) && !/女/.test(want)) {
          matching = opts.find(o => /^男性?$|^男$|^male$/i.test(norm(o.text)) || /^男性?$|^男$|^male$/i.test(norm(o.value)));
        } else if (/女/.test(want)) {
          matching = opts.find(o => /^女性?$|^女$|^female$/i.test(norm(o.text)) || /^女性?$|^女$|^female$/i.test(norm(o.value)));
        }
      }

      // 6. 一般的な数値一致フォールバック
      if (!matching && !isNaN(valNum)) {
        matching = matchNumericOption(opts, valNum);
      }

      // 7. 前方一致 / 部分一致 (長い選択肢テキスト優先・2文字以上の一致)
      if (!matching && want.length >= 2) {
        // (a) 選択肢テキストが入力値を含む
        matching = opts.find(o => norm(o.text).includes(want) || norm(o.value).includes(want));
        // (b) 入力値が選択肢テキストを含む (最長一致優先で「都」などの1文字誤爆を完全防止)
        if (!matching) {
          const sorted = [...opts]
            .filter(o => {
              const ot = norm(o.text);
              return ot.length >= 2 && want.includes(ot);
            })
            .sort((a, b) => norm(b.text).length - norm(a.text).length);
          if (sorted.length > 0) matching = sorted[0];
        }
      }

      if (!matching || matching.disabled || (!matching.value && !matching.text)) return false;

      // 画面外にある長いプルダウンに対応するため、可視範囲にスクロール
      try {
        el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      } catch {}

      el.focus();

      // React / Vue / Angular 等の仮想DOMフレームワークの変更検知を確実に発火
      const proto = typeof HTMLSelectElement !== "undefined" ? HTMLSelectElement.prototype : Object.getPrototypeOf(el);
      const setter = proto ? Object.getOwnPropertyDescriptor(proto, "value")?.set : null;
      if (setter) {
        setter.call(el, matching.value);
      } else {
        el.value = matching.value;
      }

      try {
        if (typeof matching.index === "number" && matching.index >= 0) {
          el.selectedIndex = matching.index;
        }
        matching.selected = true;
      } catch {}

      el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      try {
        el.dispatchEvent(new UIEvent("change", { bubbles: true }));
      } catch {}

      el.blur();
      return true;
    }

    if (type === "number" && !/^-?\d+(\.\d+)?$/.test(String(val).trim())) return false;
    if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val).trim())) return false;
    if (type === "url" && !/^https?:\/\//i.test(String(val).trim())) return false;

    el.focus();
    const protoObj = type === "textarea"
      ? (typeof HTMLTextAreaElement !== "undefined" ? HTMLTextAreaElement.prototype : Object.getPrototypeOf(el))
      : (typeof HTMLInputElement !== "undefined" ? HTMLInputElement.prototype : Object.getPrototypeOf(el));
    const setter = protoObj ? Object.getOwnPropertyDescriptor(protoObj, "value")?.set : null;
    if (setter) {
      setter.call(el, val);
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
    return true;
  }

  const fields = elements.map((el, index) => {
    const label = getLabel(el);
    const [preset, classification] = classify(label, el);
    let maxLength = Number.isInteger(el.maxLength) && el.maxLength > 0 && el.maxLength < 10000 ? el.maxLength : 0;
    if (!maxLength) {
      const match = label.match(/(?:最大\s*|上限\s*)?(\d{2,4})\s*(?:文字|字)(?:\s*(?:以内|以下|程度|まで|前後))?/);
      if (match) maxLength = parseInt(match[1], 10);
    }
    const type = typeOf(el);
    const field = {
      index,
      label,
      type,
      section: getSectionHeading(el),
      options: type === "select" ? getOptionsSummary(el) : [],
      maxLength,
      classification,
      hasValue: getHasValue(el),
      preset: Boolean(preset)
    };
    field.narrative = narrative(field);
    return field;
  });

  const title = tidy(document.title).slice(0, 180);
  const jobContext = tidy(document.querySelector("main,article,[role='main'],form")?.innerText || document.body?.innerText || "").slice(0, 8000);

  if (mode === "scan") {
    return { title, url: location.href, fields, jobContext, frameUrl: location.href };
  }

  if (mode !== "fill") return { error: "unknown mode" };

  let filled = 0, skipped = 0;
  const details = [];

  for (const f of fields) {
    const el = elements[f.index];
    if (!el || f.hasValue || isForbidden(f.label)) {
      skipped++;
      continue;
    }

    // Step 1: Rule-based classification
    const [ruleValue, ruleReason] = classify(f.label, el);

    // Step 2: AI answers (applicable for narrative fields or as intelligent fallback for unclassified basic fields)
    const rawAiValue = typeof answers[String(f.index)] === "string" ? cleanAiText(answers[String(f.index)]) : "";

    // Priority:
    // - If it's a narrative field (志望動機・自己PR等) and AI generated an answer, prioritize AI.
    // - Otherwise, prioritize high-accuracy rule-based matching.
    // - If rule-based didn't match and AI provided a value, use AI fallback.
    let value = "";
    let fillSource = "";

    if (f.narrative && rawAiValue) {
      value = rawAiValue;
      fillSource = "ai-narrative";
    } else if (ruleValue) {
      value = ruleValue;
      fillSource = "rule";
    } else if (rawAiValue) {
      value = rawAiValue;
      fillSource = "ai-basic";
    }

    if (!value) {
      skipped++;
      continue;
    }

    if (f.maxLength && value.length > f.maxLength) {
      details.push({
        label: f.label.slice(0, 80),
        result: `文字数超過 (${value.length}/${f.maxLength} 文字)`
      });
      skipped++;
      continue;
    }

    try {
      const ok = setValue(el, value);
      if (ok) {
        filled++;
        let tag = "保存情報を入力";
        if (fillSource === "ai-narrative") tag = "✦ AI生成文を入力";
        else if (fillSource === "ai-basic") tag = "✦ AI構造補完で入力";

        details.push({
          label: f.label.slice(0, 80) || `項目 ${f.index + 1}`,
          result: tag
        });
      } else {
        skipped++;
        details.push({ label: f.label.slice(0, 80), result: "入力値の形式不一致により保留" });
      }
    } catch (error) {
      skipped++;
      details.push({ label: f.label.slice(0, 80), result: `入力保留: ${error.message}` });
    }
  }

  return { filled, skipped, details, title, frameUrl: location.href };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { pageRuntime };
}
