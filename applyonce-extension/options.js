"use strict";

// Form fields & status nodes
const form = document.querySelector("#profileForm");
const saveStatus = document.querySelector("#saveStatus");
const apiTestStatus = document.querySelector("#apiTestStatus");
const fields = [...form.querySelectorAll("[name]")];

function flashStatus(msg, isError = false) {
  saveStatus.textContent = msg;
  saveStatus.style.color = isError ? "var(--error)" : "var(--ok)";
  setTimeout(() => {
    if (saveStatus.textContent === msg) saveStatus.textContent = "";
  }, 4500);
}

function updateProviderUI() {
  const provider = form.querySelector('[name="aiProvider"]')?.value || "openai";
  const apiKeyLabel = document.querySelector("#apiKeyLabel");
  const apiKeyInput = form.querySelector('[name="apiKey"]');
  if (provider === "openai") {
    if (apiKeyLabel) apiKeyLabel.textContent = "OpenAI APIキー (sk-...)";
    if (apiKeyInput) apiKeyInput.placeholder = "sk-... を入力";
  } else {
    if (apiKeyLabel) apiKeyLabel.textContent = "Google Gemini APIキー";
    if (apiKeyInput) apiKeyInput.placeholder = "AI Studioで発行したAPIキーを入力";
  }
}

const aiProviderSelect = document.querySelector("#aiProviderSelect");
if (aiProviderSelect) {
  aiProviderSelect.addEventListener("change", () => {
    updateProviderUI();
    const modelSelect = document.querySelector("#modelSelect");
    if (modelSelect) {
      if (aiProviderSelect.value === "openai") {
        modelSelect.value = "gpt-6-luna";
      } else {
        modelSelect.value = "gemini-2.5-flash";
      }
    }
  });
}

function applyDataToForm(data) {
  const currentKey = form.querySelector('[name="apiKey"]').value;
  for (const el of fields) {
    if (["apiKey", "OCR_API_KEY"].includes(el.name)) continue;
    if (data[el.name] !== undefined) {
      el.value = data[el.name];
    }
  }
  if (!form.querySelector('[name="apiKey"]').value && currentKey) {
    form.querySelector('[name="apiKey"]').value = currentKey;
  }
  updateProviderUI();
}

// Initialize form from storage
(async () => {
  const { profile = {} } = await chrome.storage.local.get("profile");
  for (const el of fields) {
    el.value = profile[el.name] !== undefined ? profile[el.name] : (el.name === "model" ? "gpt-6-luna" : (el.name === "aiProvider" ? "openai" : ""));
  }
  updateProviderUI();
})();

// Auto-split names if user enters fullNameJP / fullNameKana
const fullNameJPInput = form.querySelector('[name="fullNameJP"]');
const familyJPInput = form.querySelector('[name="familyJP"]');
const givenJPInput = form.querySelector('[name="givenJP"]');

function autoSplitJP() {
  const full = fullNameJPInput?.value.trim() || "";
  if (!full) return;
  const parts = full.split(/[\s\u3000]+/);
  if (parts.length >= 2) {
    if (familyJPInput && !familyJPInput.value.trim()) familyJPInput.value = parts[0];
    if (givenJPInput && !givenJPInput.value.trim()) givenJPInput.value = parts.slice(1).join(" ");
  }
}
if (fullNameJPInput) {
  fullNameJPInput.addEventListener("blur", autoSplitJP);
  fullNameJPInput.addEventListener("change", autoSplitJP);
}

const fullNameKanaInput = form.querySelector('[name="fullNameKana"]');
const familyKanaInput = form.querySelector('[name="familyKana"]');
const givenKanaInput = form.querySelector('[name="givenKana"]');

function autoSplitKana() {
  const full = fullNameKanaInput?.value.trim() || "";
  if (!full) return;
  const parts = full.split(/[\s\u3000]+/);
  if (parts.length >= 2) {
    if (familyKanaInput && !familyKanaInput.value.trim()) familyKanaInput.value = parts[0];
    if (givenKanaInput && !givenKanaInput.value.trim()) givenKanaInput.value = parts.slice(1).join(" ");
  }
}
if (fullNameKanaInput) {
  fullNameKanaInput.addEventListener("blur", autoSplitKana);
  fullNameKanaInput.addEventListener("change", autoSplitKana);
}

// Save handler
form.addEventListener("submit", async e => {
  e.preventDefault();
  autoSplitJP();
  autoSplitKana();
  const profile = Object.fromEntries(fields.map(el => [el.name, el.value.trim()]));
  await chrome.storage.local.set({ profile });
  flashStatus("✓ プロフィールを保存しました。応募フォームで一括入力できます。");
});

// Clear Profile handler
const clearBtn = document.querySelector("#clearProfileBtn");
if (clearBtn) {
  clearBtn.addEventListener("click", async () => {
    if (confirm("入力欄の情報をすべてクリアしますか？（APIキーも消去されます）")) {
      for (const el of fields) {
        if (el.name === "aiProvider") el.value = "openai";
        else if (el.name === "model") el.value = "gpt-6-luna";
        else el.value = "";
      }
      await chrome.storage.local.remove("profile");
      updateProviderUI();
      flashStatus("プロフィール情報をすべて消去しました。");
    }
  });
}

// JSON Export
document.querySelector("#exportButton").addEventListener("click", async () => {
  const { profile = {} } = await chrome.storage.local.get("profile");
  const exported = { ...profile };
  delete exported.apiKey;
  delete exported.OCR_API_KEY;
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "applyonce-profile-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  flashStatus("バックアップJSONをダウンロードしました（APIキーは含まれません）。");
});

// JSON Import
const importFileInput = document.querySelector("#importFileInput");
document.querySelector("#importButton").addEventListener("click", () => {
  importFileInput.click();
});

importFileInput.addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (typeof data !== "object" || data === null) throw new Error("無効なJSONフォーマットです");

    for (const el of fields) {
      if (["apiKey", "OCR_API_KEY"].includes(el.name)) continue;
      if (typeof data[el.name] === "string") {
        el.value = data[el.name];
      }
    }
    updateProviderUI();
    flashStatus(`✓ 「${file.name}」からプロフィールを読み込みました。「保存」を押してください。`);
  } catch (err) {
    flashStatus(`インポート失敗: ${err.message}`, true);
  } finally {
    importFileInput.value = "";
  }
});

// Test API Key (OpenAI or Gemini)
document.querySelector("#testApiBtn").addEventListener("click", async () => {
  const apiKey = form.querySelector('[name="apiKey"]').value.trim();
  const model = form.querySelector('[name="model"]').value;
  const provider = form.querySelector('[name="aiProvider"]')?.value || (/^sk-/.test(apiKey) || /gpt/i.test(model) ? "openai" : "gemini");
  apiTestStatus.className = "inline-status";

  if (!apiKey) {
    apiTestStatus.textContent = "APIキーを入力してください。";
    apiTestStatus.classList.add("error");
    return;
  }

  apiTestStatus.textContent = `${provider === "openai" ? "OpenAI" : "Gemini"} API に接続テスト中…`;
  apiTestStatus.classList.add("loading");

  try {
    if (provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: "Reply with 'OK'." }],
          max_completion_tokens: 10
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const errMsg = body?.error?.message || `HTTP ${response.status}`;
        throw new Error(errMsg);
      }

      apiTestStatus.textContent = `✓ 接続成功！ (OpenAI ${model} が正常に応答しました)`;
      apiTestStatus.className = "inline-status ok";
    } else {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Respond with only 'OK'" }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const errMsg = body?.error?.message || `HTTP ${response.status}`;
        throw new Error(errMsg);
      }

      apiTestStatus.textContent = `✓ 接続成功！ (Gemini ${model} が正常に応答しました)`;
      apiTestStatus.className = "inline-status ok";
    }
  } catch (err) {
    apiTestStatus.textContent = `接続エラー: ${err.message}`;
    apiTestStatus.className = "inline-status error";
  }
});
