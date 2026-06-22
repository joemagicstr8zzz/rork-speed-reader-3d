export type Chunk = {
  words: string[];
  orpIndex: number;
  duration: number;
};

/**
 * Split text into RSVP chunks with intelligent ORP placement.
 * Uses the reading-psychology principle that the optimal recognition
 * point sits at roughly 1/3 of a word's length from the left.
 */
export const createChunks = (text: string, chunkSize: number): Chunk[] => {
  const words = text
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim()
    .split(' ')
    .filter(w => w.length > 0);

  const chunks: Chunk[] = [];

  for (let i = 0; i < words.length; i += chunkSize) {
    const chunkWords = words.slice(i, Math.min(i + chunkSize, words.length));
    const orpIndex = calculateORP(chunkWords);

    chunks.push({
      words: chunkWords,
      orpIndex,
      duration: 0,
    });
  }

  return chunks;
};

/**
 * Calculate the Optimal Recognition Point character index within a chunk.
 *
 * For single-word chunks: ORP sits at ~1/3 of the clean word length (the
 * left-of-center point where the eye naturally fixates during reading).
 * Very short words (1-2 chars) get ORP at position 0.
 *
 * For multi-word chunks: ORP falls on the middle word, at its internal
 * ~1/3 point, so the reader's gaze anchors on the central word's
 * recognition point while peripheral vision picks up surrounding words.
 */
const calculateORP = (words: string[]): number => {
  if (words.length === 0) return 0;

  const targetWordIdx = words.length === 1 ? 0 : Math.floor(words.length / 2);
  const targetWord = words[targetWordIdx];
  const cleanWord = targetWord.replace(/[^a-zA-Z]/g, '');

  if (cleanWord.length <= 2) return 0;
  if (cleanWord.length <= 4) return 1;

  // ORP at roughly 1/3 of word length, clamped to avoid punctuation chars
  const rawOrp = Math.floor(cleanWord.length / 3);
  const clamped = Math.max(1, Math.min(rawOrp, cleanWord.length - 1));

  return clamped;
};

/** Duration in ms a chunk should stay on screen at the given WPM. */
export const calculateChunkDuration = (
  chunk: Chunk,
  wpm: number
): number => {
  const wordsPerSecond = wpm / 60;
  const msPerWord = 1000 / wordsPerSecond;
  return msPerWord * chunk.words.length;
};

/**
 * Calculate an intelligent letter-spacing value (in px) for word separation.
 * Scales with font size so larger text gets proportionally wider spacing.
 * Returns a value suitable for the CSS/text `letterSpacing` property.
 */
export const wordSpacingToLetterSpacing = (
  wordSpacing: number,
  fontSize: number
): number => {
  // wordSpacing is a 0-50 user setting; map it to 0-4px letterSpacing
  // with a baseline proportional to font size
  const base = fontSize * 0.015;
  const extra = (wordSpacing / 50) * (fontSize * 0.08);
  return Math.round((base + extra) * 10) / 10;
};

export const getBackgroundStyle = (
  theme: string,
  customBg: string
): { backgroundColor: string; textColor: string } => {
  switch (theme) {
    case 'light':
      return { backgroundColor: '#FFFFFF', textColor: '#000000' };
    case 'dark':
      return { backgroundColor: '#000000', textColor: '#FFFFFF' };
    case 'sepia':
      return { backgroundColor: '#F4ECD8', textColor: '#5B4636' };
    case 'highContrast':
      return { backgroundColor: '#000000', textColor: '#FFFF00' };
    case 'custom':
      return { backgroundColor: customBg, textColor: getContrastColor(customBg) };
    default:
      return { backgroundColor: '#000000', textColor: '#FFFFFF' };
  }
};

export const getContrastColor = (hexColor: string): string => {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
};

export const getFontFamily = (family: string): string => {
  switch (family) {
    case 'serif':
      return 'serif';
    case 'mono':
      return 'monospace';
    case 'sans':
    default:
      return 'system';
  }
};


