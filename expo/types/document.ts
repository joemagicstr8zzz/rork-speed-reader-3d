export type DocumentFormat = 'TXT' | 'PDF' | 'DOCX' | 'DOC' | 'EPUB' | 'MOBI' | 'RTF' | 'HTML';

export type Document = {
  id: string;
  title: string;
  format: DocumentFormat;
  sourceFormat: DocumentFormat;
  content: string;
  createdAt: number;
  updatedAt: number;
  progress: {
    chunkIndex: number;
    bookmarks: number[];
  };
  lastMode: '2D' | '3D';
  wordCount: number;
  isReadable: boolean;
  unreadableReason?: string | null;
  conversionWarnings?: string[];
};

export type ReadingMode = '2D' | '3D';

export type ViewingStyle = 'cross' | 'parallel';

export type BackgroundTheme = 'light' | 'dark' | 'sepia' | 'highContrast' | 'custom';

export type BackgroundType = 'solid' | 'gradient' | 'pattern';

export type GradientType = 'linear' | 'radial';

export type PatternType = 'hex' | 'triangles' | 'stripes' | 'dots' | 'paper' | 'noise' | 'cloud' | 'custom';

export type Settings = {
  wpm: number;
  chunkSize: number;
  fontFamily: 'sans' | 'serif' | 'mono';
  fontSize: number;
  backgroundTheme: BackgroundTheme;
  customBackgroundColor: string;
  customTextColor: string;
  orpStrength: number;
  threeD: {
    defaultStyle: ViewingStyle;
    depth: number;
    ghostAlpha: number;
    fusionGuide: boolean;
    wordSpacing: number;
  };
  background: {
    type: BackgroundType;
    gradientType: GradientType;
    gradientColors: string[];
    gradientAngle: number;
    patternType: PatternType;
    patternScale: number;
    patternOpacity: number;
    patternColor: string;
    customPatternUrl: string;
  };
  pdf: {
    perPageOcrFallback: boolean;
    minCharsPerPage: number;
    ocrLanguage: string;
    ocrEnhanceText: boolean;
  };
  epub: {
    skipNonLinear: boolean;
    includeImageAlt: boolean;
    respectAriaHidden: boolean;
  };
};
