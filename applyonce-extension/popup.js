"use strict";

const $ = selector => document.querySelector(selector);
let activeTab = null;
let cachedScan = [];
let busy = false;

function showStatus(message, kind = "") {
  const node = $("#status");
  node.textContent = message;
  node.className = `status ${kind}`;
}

function setBusy(state) {
  busy = state;
  for (const id of ["fillBasic", "fillAI", "getContext"]) {
    const el = $(`#${id}`);
    if (el) el.disabled = state;
  }
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^(https?:\/\/|file:\/\/)/.test(tab.url || "")) {
    throw new Error("通常のWebサイトまたはローカルの応募フォームページを開いてください（chrome:// などの設定画面には入力できません）。");
  }
  activeTab = tab;
  return tab;
}

async function scanPage() {
  const tab = await currentTab();
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: pageRuntime,
      args: ["scan", {}, {}]
    });
  } catch {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageRuntime,
      args: ["scan", {}, {}]
    });
  }
  cachedScan = results.filter(r => r.result && r.result.fields).map(r => ({ frameId: r.frameId, ...r.result }));
  return cachedScan;
}

async function fillPage(profile, aiAnswers = {}) {
  const tab = await currentTab();
  const results = [];
  const frameIds = [...new Set(cachedScan.map(r => r.frameId))];

  for (const frameId of frameIds) {
    try {
      const r = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [frameId] },
        func: pageRuntime,
        args: ["fill", profile, aiAnswers[String(frameId)] || {}]
      });
      results.push(...r.map(x => x.result).filter(Boolean));
    } catch (e) {
      results.push({
        filled: 0,
        skipped: 0,
        details: [{ label: `frame ${frameId}`, result: `入力対象外 (${e.message})` }]
      });
    }
  }
  return results;
}

function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

async function tailorWithGemini(profile, scans) {
  if (!profile.apiKey) {
    throw new Error("プロフィール設定の「AI連携」でGemini APIキーを登録してください。");
  }

  // Structure extraction:
  // 1. Narrative fields (志望動機・自己PR等)
  // 2. Unmatched basic fields (未分類またはルールベースで合致しなかった基本情報欄)
  const allFields = scans.flatMap(scan => (scan.fields || [])
    .filter(f => !f.hasValue)
    .map(f => ({
      id: `${scan.frameId}:${f.index}`,
      label: f.label,
      section: f.section || "",
      type: f.type,
      options: f.options || [],
      maxLength: f.maxLength,
      narrative: Boolean(f.narrative),
      preset: Boolean(f.preset)
    }))
  );

  const narrativeCandidates = allFields.filter(f => f.narrative).slice(0, 25);
  const unmatchedBasicCandidates = allFields.filter(f => !f.narrative && !f.preset).slice(0, 25);

  const candidates = [...narrativeCandidates, ...unmatchedBasicCandidates];

  if (!candidates.length) {
    throw new Error("AIで処理すべき未入力の設問や未分類項目が見つかりません。通常の一括入力をお試しください。");
  }

  // All applicant facts formatted clearly
  const facts = {
    // Basic Profile
    fullNameJP: profile.fullNameJP || "",
    fullNameKana: profile.fullNameKana || "",
    familyJP: profile.familyJP || "",
    givenJP: profile.givenJP || "",
    familyKana: profile.familyKana || "",
    givenKana: profile.givenKana || "",
    firstEN: profile.firstEN || "",
    lastEN: profile.lastEN || "",
    birthYear: profile.birthYear || "",
    birthMonth: profile.birthMonth || "",
    birthDay: profile.birthDay || "",
    gender: profile.gender || "",
    email: profile.email || "",
    phone: profile.phone || "",
    postalCode: profile.postalCode || "",
    prefecture: profile.prefecture || "",
    city: profile.city || "",
    addressLine: profile.addressLine || "",
    building: profile.building || "",
    address: profile.address || "",
    country: profile.country || "日本",
    linkedin: profile.linkedin || "",
    github: profile.github || "",
    portfolio: profile.portfolio || "",

    // Academic Profile
    schoolJP: profile.schoolJP || "",
    schoolEN: profile.schoolEN || "",
    faculty: profile.faculty || "",
    major: profile.major || "",
    academicType: profile.academicType || "",
    degree: profile.degree || "",
    graduationStatus: profile.graduationStatus || "",
    graduationYear: profile.graduationYear || "",
    graduationMonth: profile.graduationMonth || "",
    gpa: profile.gpa || "",

    // Narrative and Experience Facts
    experience: profile.experience || "",
    projects: profile.projects || "",
    skills: profile.skills || "",
    certifications: profile.certifications || "",
    selfPR: profile.selfPR || "",
    motivation: profile.motivation || "",
    careerGoals: profile.careerGoals || "",
    englishSummary: profile.englishSummary || "",
    otherFacts: profile.otherFacts || ""
  };

  const context = $("#jobText").value.trim().slice(0, 10000)
    || scans.find(s => s.frameId === 0)?.jobContext.slice(0, 7000)
    || scans[0]?.jobContext.slice(0, 7000) || "";
  const company = $("#company").value.trim().slice(0, 100);

  // Structured representation of fields for AI
  const pageFormStructure = candidates.map(c => ({
    id: c.id,
    label: c.label,
    section: c.section || undefined,
    inputType: c.type,
    options: c.options && c.options.length ? c.options : undefined,
    maxLength: c.maxLength || undefined,
    category: c.narrative ? "NARRATIVE_ESSAY" : "BASIC_OR_STRUCTURED_INFO"
  }));

  const prompt = [
    "You are a professional, highly precise job application assistant. You receive the structured layout of an application form (FORM_FIELDS) extracted directly from the webpage DOM, along with the verified facts of the applicant (APPLICANT_FACTS). Return ONLY a JSON object with an 'answers' array of {id, value}.",
    "Strict Rules:",
    "1. For 'NARRATIVE_ESSAY' fields (志望動機, 自己PR, ガクチカ, 挑戦したいこと等):",
    "   - Craft thoughtful, professional answers directly addressing the question prompt.",
    "   - Use ONLY real experiences, skills, and projects found in APPLICANT_FACTS. Do NOT fabricate facts, companies, metrics, or awards.",
    "   - Align the applicant's real experience with the JOB_POSTING context.",
    "   - Tone: Polite, business Japanese (です・ます調) unless the question is explicitly in English.",
    "   - Character limit: If maxLength > 0, make sure the text does NOT exceed maxLength and aims for 80%-95% of maxLength. If maxLength is 0, write approx 250-400 characters.",
    "   - Plain text only (no markdown bullets or asterisks).",
    "2. For 'BASIC_OR_STRUCTURED_INFO' fields (unmatched form items, specific academic questions, dropdowns, etc.):",
    "   - Look at the field's section, label, and options, and select the corresponding exact fact from APPLICANT_FACTS.",
    "   - If it is a dropdown/select element with options, choose the best matching option string from its provided 'options' list.",
    "   - Do NOT guess or hallucinate sensitive info (such as passwords, criminal records, bank accounts, or visa authorization). If unsure or not applicable, omit the field.",
    "   - NAME FIELDS RULE: For applicant names (氏名, 姓, 名, Last Name, First Name, etc.), ALWAYS use Japanese Kanji (familyJP / givenJP / fullNameJP) unless the label explicitly requests English, Romaji, or Alphabet (e.g. 'ローマ字', '英語', 'Alphabet', 'Passport'). Never output English/Romaji for standard Kanji name fields.",
    "   - KANA FIELDS RULE: For Furigana/Kana fields (フリガナ, ふりがな, カナ), ALWAYS use Katakana (familyKana / givenKana / fullNameKana) or Hiragana as requested. Never use Kanji or English.",
    "3. Output Format: Return ONLY a valid JSON object matching this schema:",
    "   {\"answers\": [{\"id\": \"<field_id>\", \"value\": \"<value_to_fill>\"}]}",
    `COMPANY: ${company || "Not specified"}`,
    `PAGE_TITLE: ${scans.find(s => s.frameId === 0)?.title || scans[0]?.title || ""}`,
    `JOB_POSTING_CONTEXT: ${JSON.stringify(context)}`,
    `APPLICANT_FACTS: ${JSON.stringify(facts)}`,
    `FORM_FIELDS: ${JSON.stringify(pageFormStructure)}`
  ].join("\n\n");

  const provider = profile.aiProvider || (/^sk-/.test(profile.apiKey) || /gpt/i.test(profile.model) ? "openai" : "gemini");
  const selectedModel = profile.model || (provider === "openai" ? "gpt-6-luna" : "gemini-2.5-flash");

  let raw = "";

  if (provider === "openai") {
    showStatus(`OpenAI (${selectedModel}) でページの構造を解析し回答を生成中…`);

    const openAiBody = {
      model: selectedModel,
      messages: [
        {
          role: "system",
          content: "You are a professional, careful job application writing and form-filling assistant. Treat all applicant data as verified facts. Return ONLY a valid JSON object matching the requested schema. Never return conversational markdown commentary."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" }
    };

    // If using luna or o-series models, reasoning_effort can be configured
    if (/luna|o1|o3/i.test(selectedModel)) {
      openAiBody.reasoning_effort = "low";
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${profile.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(openAiBody)
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const errMsg = body?.error?.message || `HTTP ${response.status}`;
      throw new Error(`OpenAI API エラー (${selectedModel}): ${errMsg}`);
    }

    const output = await response.json();
    raw = output.choices?.[0]?.message?.content || "";
  } else {
    // Google Gemini fallback logic
    const candidateModels = [
      selectedModel,
      selectedModel === "gemini-2.5-flash" ? "gemini-1.5-flash" : "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-1.5-flash"
    ].filter((m, idx, self) => self.indexOf(m) === idx);

    let lastError = null;

    for (let i = 0; i < candidateModels.length; i++) {
      const curModel = candidateModels[i];
      try {
        if (i > 0) {
          showStatus(`${candidateModels[i - 1]} が混雑中のため、${curModel} で自動再試行しています…`);
          await new Promise(r => setTimeout(r, 1200));
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(curModel)}:generateContent`, {
          method: "POST",
          headers: {
            "x-goog-api-key": profile.apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          })
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const errMsg = body?.error?.message || `HTTP ${response.status}`;
          const isDemandIssue = /high demand|temporar|overload|resource_exhausted|503|429/i.test(errMsg);

          if (isDemandIssue && i < candidateModels.length - 1) {
            lastError = new Error(`Gemini API: ${errMsg}`);
            continue; // Try next fallback model
          }
          throw new Error(`Gemini API エラー (${curModel}): ${errMsg}`);
        }

        const output = await response.json();
        raw = (output.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
        if (raw) break;
      } catch (err) {
        lastError = err;
        if (i < candidateModels.length - 1 && /high demand|temporar|overload|resource_exhausted|503|429|fetch/i.test(err.message)) {
          continue;
        }
        throw err;
      }
    }

    if (!raw && lastError) throw lastError;
  }

  if (!raw) {
    throw new Error("AIから回答が返ってきませんでした。利用上限またはモデル設定・APIキーを確認してください。");
  }

  const data = parseJson(raw);
  if (!Array.isArray(data.answers)) {
    throw new Error("AIの応答形式が正しくありませんでした。");
  }

  const allowed = new Map(candidates.map(f => [f.id, f]));
  const answersByFrame = {};

  for (const answer of data.answers) {
    const field = allowed.get(String(answer.id));
    if (!field || typeof answer.value !== "string" || !answer.value.trim()) continue;
    const text = answer.value.trim();
    if (text.length > 5000 || (field.maxLength && text.length > field.maxLength)) continue;
    const [frameId, fieldId] = field.id.split(":");
    if (!answersByFrame[frameId]) answersByFrame[frameId] = {};
    answersByFrame[frameId][fieldId] = text;
  }

  return answersByFrame;
}

function updatePreview(scans) {
  const allFields = scans.flatMap(s => s.fields || []);
  const previewBox = $("#previewDetails");
  const previewList = $("#previewList");
  const previewCount = $("#previewCount");

  if (!allFields.length) {
    previewBox.hidden = true;
    return;
  }

  previewBox.hidden = false;
  previewCount.textContent = allFields.length;
  previewList.replaceChildren();

  for (const f of allFields) {
    const row = document.createElement("div");
    row.className = "preview-row";

    const labelSpan = document.createElement("span");
    labelSpan.className = "preview-label";
    const secPrefix = f.section ? `[${f.section}] ` : "";
    labelSpan.textContent = `${secPrefix}${f.label || `項目 ${f.index + 1}`}`;
    labelSpan.title = labelSpan.textContent;

    const tagSpan = document.createElement("span");
    tagSpan.className = `preview-tag ${f.preset ? "matched" : f.narrative ? "ai-tag" : "unmatched"}`;
    tagSpan.textContent = f.classification || (f.narrative ? "設問(AI生成)" : "基本情報(AI補完可)");

    row.append(labelSpan, tagSpan);
    previewList.append(row);
  }
}

function renderResults(results) {
  const filled = results.reduce((sum, item) => sum + (item.filled || 0), 0);
  const skipped = results.reduce((sum, item) => sum + (item.skipped || 0), 0);
  const details = results.flatMap(x => x.details || []);

  $("#resultDetails").hidden = !details.length;
  $("#resultList").replaceChildren();

  for (const detail of details) {
    const row = document.createElement("div");
    row.className = "resultrow";

    const isSuccess = detail.result.includes("入力") && !detail.result.includes("保留");
    const isAi = detail.result.includes("AI");

    const badge = document.createElement("span");
    badge.className = `result-badge ${isAi ? "badge-ai" : isSuccess ? "badge-ok" : "badge-skip"}`;
    badge.textContent = detail.result;

    const label = document.createElement("span");
    label.className = "result-text";
    label.textContent = detail.label || "項目";

    row.append(label, badge);
    $("#resultList").append(row);
  }

  showStatus(
    `${filled} 項目を入力しました（未入力・保留: ${skipped} 項目）。\n入力内容を必ず目視確認し、添付ファイルや同意項目を手動で確認してください。`,
    filled ? "ok" : "error"
  );
}

async function runFill(withAI) {
  if (busy) return;
  setBusy(true);
  showStatus(withAI ? "求人情報と設問を解析し、AI文面を生成しています…" : "フォームに一括入力しています…");

  try {
    const { profile = {} } = await chrome.storage.local.get("profile");
    if (!profile.email && !profile.fullNameJP && !profile.firstEN && !profile.schoolJP && !profile.experience) {
      throw new Error("まず右上の「プロフィール設定」からあなたの情報を保存してください。");
    }

    const scans = await scanPage();
    if (!scans.length) {
      throw new Error("このページの入力フォームを読み取れませんでした。");
    }

    let answers = {};
    if (withAI) {
      answers = await tailorWithGemini(profile, scans);
    }

    const fillProfile = { ...profile };
    delete fillProfile.apiKey;

    const results = await fillPage(fillProfile, answers);
    renderResults(results);
  } catch (error) {
    showStatus(error.message || String(error), "error");
  } finally {
    setBusy(false);
  }
}

$("#openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("#fillBasic").addEventListener("click", () => runFill(false));
$("#fillAI").addEventListener("click", () => runFill(true));

$("#getContext").addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  try {
    const scans = await scanPage();
    const primary = scans.find(x => x.frameId === 0) || scans[0];
    $("#jobText").value = primary?.jobContext || "";
    const totalCount = scans.reduce((sum, x) => sum + x.fields.length, 0);
    $("#detected").textContent = `検出: ${totalCount} 欄`;
    updatePreview(scans);
    showStatus("ページ本文を取得しました。募集要項以外の不要なテキストが含まれていないか確認してください。");
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
});

// Initialize on popup open
(async () => {
  try {
    const tab = await currentTab();
    const parsed = new URL(tab.url);
    const domain = parsed.protocol === "file:" ? "ローカルファイル" : parsed.hostname;
    $("#site").textContent = `${domain} · ${tab.title || "応募ページ"}`;

    const scans = await scanPage();
    const count = scans.reduce((sum, x) => sum + x.fields.length, 0);
    $("#detected").textContent = `${count} 欄を検出`;
    updatePreview(scans);

    showStatus(
      count
        ? "「保存した情報を一括入力」または「AI調整して入力」をクリックしてください。"
        : "入力フォームが見つかりません。応募フォームのある画面を開いてください。"
    );
  } catch (error) {
    $("#site").textContent = "このページでは操作できません";
    showStatus(error.message, "error");
  }
})();
