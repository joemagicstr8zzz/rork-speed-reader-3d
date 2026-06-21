declare module 'pdfjs-dist/legacy/build/pdf' {
  export const version: string;
  export const GlobalWorkerOptions: {
    workerSrc: string;
  };
  export type TextContentItem = {
    str?: string;
    transform?: number[];
    width?: number;
    height?: number;
    fontName?: string;
    dir?: string;
    hasEOL?: boolean;
  };
  export type TextContent = {
    items: TextContentItem[];
    styles?: Record<string, { fontFamily?: string; ascent?: number; descent?: number }>;
  };
  export type PDFPageProxy = {
    getTextContent: () => Promise<TextContent>;
    getViewport: (params: { scale: number }) => {
      width: number;
      height: number;
      transform?: number[];
    };
  };
  export type PDFDocumentProxy = {
    numPages: number;
    getPage: (pageNumber: number) => Promise<PDFPageProxy>;
    getMetadata: () => Promise<{
      info: {
        Title?: string;
        Author?: string;
        Subject?: string;
        Creator?: string;
        IsEncrypted?: boolean;
      };
      metadata: unknown;
    }>;
  };
  export function getDocument(src: { data: ArrayBuffer }): { promise: Promise<PDFDocumentProxy> };
}
