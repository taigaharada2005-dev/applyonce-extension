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
        .filter(t => t && !/選択してください|^選択$|^--$|^-$|^\s*$/i.test(t))
        .slice(0, 20);
    }
    return [];
  }

  function typeOf(el) {
    if (el.matches('input[type="radio"]')) return "radio";
    if (el.matches('input')) return (el.type || "text").toLowerCase();
    if (el.matches('textarea')) return "textarea";
    if (el.matches('select')) return "select";
    return "contenteditable";
  }

  function isVisible(el) {
    if (typeof el.checkVisibility === "function") {
      return el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
    }
    return Boolean(el.offsetParent !== null || window.getComputedStyle(el).display !== "none");
  }

  function eligible(el) {
    if (el.disabled || el.readOnly || el.closest("[inert]")) return false;
    const type = typeOf(el);
    if (!["text", "email", "tel", "url", "number", "date", "textarea", "select", "radio", "contenteditable"].includes(type)) return false;
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
  const pref = profile.prefecture || "";
  const city = profile.city || "";
  const addrLine = profile.addressLine || profile.address || "";
  const building = profile.building || "";
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
    const inputs = [...container.querySelectorAll('input')].filter(inp => {
      const type = (inp.type || "text").toLowerCase();
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
      if (has(/年|year|yyyy/)) return field(profile.birthYear, "生年月日（年）");
      if (has(/月|month|mm/)) return field(profile.birthMonth, "生年月日（月）");
      if (has(/日|day|dd/)) return field(profile.birthDay, "生年月日（日）");
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
    if (has(/graduation.?year|卒業年|卒業予定年|修了年/)) return field(profile.graduationYear, "卒業年");
    if (has(/graduation.?month|卒業予定月|卒業月/)) return field(profile.graduationMonth, "卒業月");
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
      if (!isMatch && (/理系/.test(want) && /理系/.test(valText + labelText))) isMatch = true;
      if (!isMatch && (/文系/.test(want) && /文系/.test(valText + labelText))) isMatch = true;
      if (!isMatch && (/見込/.test(want) && /見込/.test(valText + labelText))) isMatch = true;
      if (!isMatch && (/学士/.test(want) && /学士|学部/.test(valText + labelText))) isMatch = true;

      if (isMatch) {
        el.focus();
        el.checked = true;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        el.blur();
        return true;
      }
      return false;
    }

    if (type === "select") {
      const opts = [...el.options];
      const want = norm(val);
      const valNum = parseInt(val, 10);

      // Multiple matching strategies for dropdown options:
      // 1. Exact norm match on value or text
      let matching = opts.find(o => norm(o.value) === want || norm(o.text) === want);

      // 2. Numeric match (e.g. "03" <-> "3月" or "3", "2028" <-> "2028年")
      if (!matching && !isNaN(valNum)) {
        matching = opts.find(o => {
          const optNum = parseInt(o.value || o.text, 10);
          return !isNaN(optNum) && optNum === valNum;
        });
      }

      // 3. Fuzzy degree/status match (e.g. "学士" <-> "大学（学部・学士）", "卒業見込み" <-> "見込")
      if (!matching) {
        if (/学士|学部|大学/.test(want)) {
          matching = opts.find(o => /学士|学部|大学（学部/i.test(o.text || o.value) && !/院|修士|博士|短期/.test(o.text || o.value));
        } else if (/修士|大学院/.test(want)) {
          matching = opts.find(o => /修士|大学院/i.test(o.text || o.value));
        } else if (/見込/.test(want)) {
          matching = opts.find(o => /見込/i.test(o.text || o.value));
        } else if (/理系/.test(want)) {
          matching = opts.find(o => /理系/i.test(o.text || o.value));
        } else if (/文系/.test(want)) {
          matching = opts.find(o => /文系/i.test(o.text || o.value));
        }
      }

      // 4. Substring match (e.g. "東京都" <-> "東京")
      if (!matching && want) {
        matching = opts.find(o => norm(o.text).includes(want) || want.includes(norm(o.text)));
      }

      if (!matching || matching.disabled || (!matching.value && !matching.text)) return false;

      el.focus();
      el.value = matching.value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.blur();
      return true;
    }

    if (type === "number" && !/^-?\d+(\.\d+)?$/.test(String(val).trim())) return false;
    if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val).trim())) return false;
    if (type === "url" && !/^https?:\/\//i.test(String(val).trim())) return false;

    el.focus();
    const prototype = type === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
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
    const rawAiValue = typeof answers[String(f.index)] === "string" ? answers[String(f.index)].trim() : "";

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
