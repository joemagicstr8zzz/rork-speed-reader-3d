export type Chunk = {
  words: string[];
  orpIndex: number;
  duration: number;
};

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

const calculateORP = (words: string[]): number => {
  if (words.length === 0) return 0;
  if (words.length === 1) {
    const word = words[0];
    const cleanWord = word.replace(/[^a-zA-Z]/g, '');
    if (cleanWord.length <= 1) return 0;
    if (cleanWord.length <= 5) return 0;
    if (cleanWord.length <= 9) return 1;
    if (cleanWord.length <= 13) return 2;
    return 3;
  }
  
  const middleWord = words[Math.floor(words.length / 2)];
  const cleanWord = middleWord.replace(/[^a-zA-Z]/g, '');
  
  if (cleanWord.length <= 1) return 0;
  if (cleanWord.length <= 5) return 0;
  if (cleanWord.length <= 9) return 1;
  if (cleanWord.length <= 13) return 2;
  return 3;
};

export const calculateChunkDuration = (
  chunk: Chunk,
  wpm: number
): number => {
  const wordsPerSecond = wpm / 60;
  const msPerWord = 1000 / wordsPerSecond;
  return msPerWord * chunk.words.length;
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


