"use strict";

// Shared by extension pages only; never injected into the application website.
globalThis.visionOCR = async function visionOCR(dataUrl, apiKey) {
  if (!apiKey?.trim()) throw new Error("プロフィール設定でOCR_API_KEYを登録してください。");
  const match = /^data:image\/(?:png|jpeg|webp|gif|bmp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("PNG・JPEG・WebP・GIF・BMP画像を選択してください。");
  if (match[1].length > 12 * 1024 * 1024) throw new Error("画像が大きすぎます。9MB以下の画像を選択してください。");
  let response;
  try {
    response = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey.trim() },
      body: JSON.stringify({ requests: [{
        image: { content: match[1] },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }]
        // Automatic language detection supports mixed Japanese/English documents.
      }] }),
      signal: AbortSignal.timeout(30000)
    });
  } catch (error) {
    throw new Error(error.name === "TimeoutError" ? "OCRがタイムアウトしました。再度お試しください。" : "OCRに接続できませんでした。ネットワークを確認してください。");
  }
  const body = await response.json().catch(() => null);
  const result = body?.responses?.[0];
  if (!response.ok || body?.error || result?.error) {
    const code = result?.error?.code || body?.error?.code || response.status;
    const hint = code === 400 || code === 401 || code === 403
      ? "APIキー、Cloud Vision APIの有効化、請求先とキーの制限を確認してください。"
      : code === 429 ? "利用上限に達しました。時間をおいて再度お試しください。" : "再度お試しください。";
    throw new Error(`Google Vision OCRエラー (${code})。${hint}`);
  }
  if (!result) throw new Error("OCRの応答形式が正しくありません。");
  const text = (result.fullTextAnnotation?.text || result.textAnnotations?.[0]?.description || "").trim();
  if (!text) throw new Error("文字を検出できませんでした。文字が鮮明な画像でお試しください。");
  return text;
};
