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

/**
 * Native PDF parsing is intentionally kept separate from the web pdfjs implementation.
 * This prevents Metro from bundling pdfjs-dist into iOS/Android, where its modern
 * class syntax breaks the native bundle transform.
 */
export async function extractTextFromPDF(
  _buffer: ArrayBuffer,
  _options: Partial<PdfTextExtractionOptions> = {}
): Promise<PdfExtractionResult> {
  throw new Error('PDF extraction is currently only supported in the web browser preview. On mobile, convert your PDF to EPUB, TXT, or DOCX first.');
}
