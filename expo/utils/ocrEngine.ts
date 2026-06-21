import { Platform } from "react-native";

const OCR_SPACE_API_KEY = "K89440075888957";
const OCR_SPACE_API_URL = "https://api.ocr.space/parse/image";

export type OcrOptions = {
  language?: string;
  enhanceText?: boolean;
};

export type OcrResult = {
  text: string;
  language: string;
  confidence: number;
};

async function renderPdfPageToBase64(
  page: any,
  scale: number = 2.0
): Promise<string> {
  const viewport = page.getViewport({ scale });

  if (Platform.OS === "web") {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to get canvas 2D context for PDF rendering");
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    const base64 = canvas.toDataURL("image/png");
    return base64;
  }

  throw new Error("PDF page rendering is only supported on web platform");
}

function getOcrSpaceLanguageCode(language: string): string {
  const languageMap: Record<string, string> = {
    en: "eng",
    jp: "jpn",
    ja: "jpn",
    es: "spa",
    fr: "fre",
    de: "ger",
    it: "ita",
    pt: "por",
    ru: "rus",
    zh: "chs",
    ar: "ara",
  };
  return languageMap[language] || "eng";
}

export async function performOcr(
  imageSource: string | { page: any },
  options: OcrOptions = {}
): Promise<OcrResult> {
  const { language = "en", enhanceText = true } = options;

  let imageBase64: string;

  if (typeof imageSource === "string") {
    imageBase64 = imageSource;
  } else {
    imageBase64 = await renderPdfPageToBase64(imageSource.page);
  }

  const languageCode = getOcrSpaceLanguageCode(language);

  try {
    const formData = new FormData();
    formData.append("base64Image", imageBase64);
    formData.append("language", languageCode);
    formData.append("isOverlayRequired", "false");
    formData.append("detectOrientation", "true");
    formData.append("scale", "true");
    formData.append("OCREngine", "2");

    const response = await fetch(OCR_SPACE_API_URL, {
      method: "POST",
      headers: {
        apikey: OCR_SPACE_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OCR API request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.IsErroredOnProcessing) {
      const errorMessage = result.ErrorMessage?.[0] || "Unknown OCR error";
      throw new Error(`OCR processing error: ${errorMessage}`);
    }

    if (!result.ParsedResults || result.ParsedResults.length === 0) {
      throw new Error("No OCR results returned");
    }

    const parsedText = result.ParsedResults[0].ParsedText || "";
    const confidence = result.ParsedResults[0].TextOverlay?.Lines?.length > 0 ? 0.8 : 0.5;

    let cleanedText = parsedText
      .trim()
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    if (enhanceText) {
      cleanedText = cleanedText
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]+/g, " ");
    }

    const wordCount = cleanedText.split(/\s+/).filter(Boolean).length;

    console.log(
      `OCR completed: extracted ${cleanedText.length} chars, ${wordCount} words, confidence: ${confidence}`
    );

    return {
      text: cleanedText,
      language,
      confidence,
    };
  } catch (error) {
    console.error("OCR failed:", error);
    throw new Error(
      `OCR processing failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function ocrPdfPage(
  page: any,
  pageNumber: number,
  options: OcrOptions = {}
): Promise<OcrResult> {
  console.log(`Starting OCR for PDF page ${pageNumber}`);

  try {
    const result = await performOcr({ page }, options);
    console.log(
      `OCR completed for page ${pageNumber}: ${result.text.length} chars`
    );
    return result;
  } catch (error) {
    console.error(`OCR failed for PDF page ${pageNumber}:`, error);
    throw error;
  }
}
