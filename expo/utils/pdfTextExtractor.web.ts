import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist/legacy/build/pdf';

export type PdfTextExtractionOptions = {
  perPageOcrFallback: boolean;
  minCharsPerPage: number;
  ocrLanguage?: string;
  ocrEnhanceText?: boolean;
};

export type PdfExtractionResult = {
  text: string;
  warnings: string[];
  pagesProcessed: number;
  pagesOcr: number[];
};

const DEFAULT_OPTIONS: PdfTextExtractionOptions = {
  perPageOcrFallback: true,
  minCharsPerPage: 20,
  ocrLanguage: 'en',
  ocrEnhanceText: true,
};

async function extractTextFromPDFWeb(
  buffer: ArrayBuffer,
  options: PdfTextExtractionOptions
): Promise<PdfExtractionResult> {
  const workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
  if (GlobalWorkerOptions.workerSrc !== workerSrc) {
    GlobalWorkerOptions.workerSrc = workerSrc;
  }

  console.log('[PDF] Starting web PDF extraction', {
    byteLength: buffer.byteLength,
    minCharsPerPage: options.minCharsPerPage,
  });

  const loadingTask = getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const pagesProcessed = pdf.numPages;
  const warnings: string[] = [];
  const pagesOcr: number[] = [];
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map(item => ('str' in item ? String(item.str) : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (pageText.length < options.minCharsPerPage) {
      warnings.push(`Page ${pageNumber} contains little or no selectable text.`);
    }

    pageTexts.push(pageText);
  }

  return {
    text: pageTexts.join('\n\n').trim(),
    warnings,
    pagesProcessed,
    pagesOcr,
  };
}

export async function extractTextFromPDF(
  buffer: ArrayBuffer,
  options: Partial<PdfTextExtractionOptions> = {}
): Promise<PdfExtractionResult> {
  const opts: PdfTextExtractionOptions = { ...DEFAULT_OPTIONS, ...options };
  return extractTextFromPDFWeb(buffer, opts);
}
