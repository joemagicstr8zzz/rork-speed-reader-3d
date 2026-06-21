import '@/polyfills/domMatrix';
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import JSZip from 'jszip';
import { DocumentFormat } from '@/types/document';
import { extractTextFromPDF } from './pdfTextExtractor';
import { parseEPUB } from './epubParser';

type DocumentSource = {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number;
  lastModified?: number;
  base64?: string | null;
};

type FileConstructorArg = ConstructorParameters<typeof File>[0];

type SupportedTextEncoding = 'utf-8' | 'windows-1252' | 'utf-16le' | 'utf-16be';

type MobiDecodedResult = {
  text: string;
  encodingUsed: SupportedTextEncoding;
  readabilityScore: number;
  transform: 'direct' | 'utf8-repair';
};

type MobiRecordOffsets = {
  offsets: number[];
  recordCount: number;
};

const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const base64Index = new Int16Array(123).fill(-1);
for (let index = 0; index < base64Alphabet.length; index += 1) {
  base64Index[base64Alphabet.charCodeAt(index)] = index;
}

function base64CharToIndex(code: number): number {
  if (code >= base64Index.length) {
    return -1;
  }
  return base64Index[code];
}

function normalizeBase64Input(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('data:')) {
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex >= 0) {
      return trimmed.slice(commaIndex + 1);
    }
    return trimmed;
  }
  return trimmed;
}

const WINDOWS_1252_MAP: Record<number, string> = {
  0x80: '€',
  0x82: '‚',
  0x83: 'ƒ',
  0x84: '„',
  0x85: '…',
  0x86: '†',
  0x87: '‡',
  0x88: 'ˆ',
  0x89: '‰',
  0x8a: 'Š',
  0x8b: '‹',
  0x8c: 'Œ',
  0x8e: 'Ž',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x98: '˜',
  0x99: '™',
  0x9a: 'š',
  0x9b: '›',
  0x9c: 'œ',
  0x9e: 'ž',
  0x9f: 'Ÿ',
};

function decodeBase64(input: string): Uint8Array {
  const sanitized = normalizeBase64Input(input).replace(/\s/g, '');
  if (sanitized.length === 0) {
    return new Uint8Array(0);
  }
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(sanitized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  const estimatedLength = Math.floor((sanitized.length * 3) / 4);
  const bytes = new Uint8Array(estimatedLength);
  let buffer = 0;
  let bitsInBuffer = 0;
  let pointer = 0;
  for (let i = 0; i < sanitized.length; i += 1) {
    const code = sanitized.charCodeAt(i);
    if (code === 61) {
      break;
    }
    const value = base64CharToIndex(code);
    if (value < 0) {
      continue;
    }
    buffer = (buffer << 6) | value;
    bitsInBuffer += 6;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes[pointer] = (buffer >> bitsInBuffer) & 0xff;
      pointer += 1;
    }
  }
  return bytes.slice(0, pointer);
}

function decodeUtf8(bytes: Uint8Array): string {
  let result = '';
  let index = 0;
  while (index < bytes.length) {
    const byte1 = bytes[index];
    if (byte1 < 0x80) {
      result += String.fromCharCode(byte1);
      index += 1;
      continue;
    }
    if (byte1 >= 0xc0 && byte1 < 0xe0 && index + 1 < bytes.length) {
      const byte2 = bytes[index + 1];
      result += String.fromCharCode(((byte1 & 0x1f) << 6) | (byte2 & 0x3f));
      index += 2;
      continue;
    }
    if (byte1 >= 0xe0 && byte1 < 0xf0 && index + 2 < bytes.length) {
      const byte2 = bytes[index + 1];
      const byte3 = bytes[index + 2];
      const codePoint = ((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f);
      result += String.fromCharCode(codePoint);
      index += 3;
      continue;
    }
    if (byte1 >= 0xf0 && byte1 < 0xf8 && index + 3 < bytes.length) {
      const byte2 = bytes[index + 1];
      const byte3 = bytes[index + 2];
      const byte4 = bytes[index + 3];
      let codePoint = ((byte1 & 0x07) << 18) | ((byte2 & 0x3f) << 12) | ((byte3 & 0x3f) << 6) | (byte4 & 0x3f);
      codePoint -= 0x10000;
      result += String.fromCharCode((codePoint >> 10) + 0xd800, (codePoint & 0x3ff) + 0xdc00);
      index += 4;
      continue;
    }
    index += 1;
  }
  return result;
}

function decodeWindows1252(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte <= 0x7f || byte >= 0xa0) {
      result += String.fromCharCode(byte);
      continue;
    }
    const mapped = WINDOWS_1252_MAP[byte];
    if (mapped) {
      result += mapped;
    }
  }
  return result;
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const usableLength = bytes.length - (bytes.length % 2);
  if (usableLength <= 0) {
    return '';
  }
  let result = '';
  for (let offset = 0; offset < usableLength; offset += 2) {
    const first = bytes[offset];
    const second = bytes[offset + 1];
    const codeUnit = littleEndian ? (first | (second << 8)) : ((first << 8) | second);
    if (codeUnit === 0) {
      continue;
    }
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && offset + 3 < usableLength) {
      const nextFirst = bytes[offset + 2];
      const nextSecond = bytes[offset + 3];
      const nextUnit = littleEndian ? (nextFirst | (nextSecond << 8)) : ((nextFirst << 8) | nextSecond);
      if (nextUnit >= 0xdc00 && nextUnit <= 0xdfff) {
        const high = codeUnit - 0xd800;
        const low = nextUnit - 0xdc00;
        const codePoint = (high << 10) + low + 0x10000;
        result += String.fromCodePoint(codePoint);
        offset += 2;
        continue;
      }
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      result += '\uFFFD';
      continue;
    }
    result += String.fromCharCode(codeUnit);
  }
  return result;
}

function stripBomForEncoding(bytes: Uint8Array, encoding: SupportedTextEncoding): Uint8Array {
  if (encoding === 'utf-16le' && bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2);
  }
  if (encoding === 'utf-16be' && bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return bytes.subarray(2);
  }
  if (encoding === 'utf-8' && bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  const view = new Uint8Array(buffer);
  view.set(bytes);
  return buffer;
}

function deriveNameFromUri(uri: string): string {
  const sanitized = uri.split('?')[0]?.split('#')[0] ?? uri;
  const segments = sanitized.split('/').filter(segment => segment.length > 0);
  if (segments.length === 0) {
    return 'document';
  }
  const candidate = segments[segments.length - 1];
  return candidate || 'document';
}

function normalizeSource(input: DocumentSource | string, defaults?: Partial<DocumentSource>): DocumentSource {
  if (typeof input === 'string') {
    return {
      uri: input,
      name: defaults?.name ?? deriveNameFromUri(input),
      mimeType: defaults?.mimeType ?? null,
      size: defaults?.size,
      lastModified: defaults?.lastModified,
      base64: defaults?.base64 ?? null,
    };
  }
  return {
    uri: input.uri,
    name: input.name ?? deriveNameFromUri(input.uri),
    mimeType: input.mimeType ?? null,
    size: input.size,
    lastModified: input.lastModified,
    base64: input.base64 ?? null,
  };
}

function shouldFetchOverNetwork(uri: string): boolean {
  if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('blob:')) {
    return true;
  }
  return Platform.OS === 'web';
}

function createFileHandle(source: DocumentSource): File | null {
  const attempts: (() => File)[] = [
    () => new File(source.uri as FileConstructorArg),
  ];

  if (source.uri.startsWith('file://')) {
    const stripped = source.uri.replace('file://', '');
    attempts.push(() => new File(stripped as FileConstructorArg));
  }
  
  if (Platform.OS === 'ios' && source.uri.includes('://')) {
    attempts.push(() => new File(source.uri as FileConstructorArg));
  }

  for (const attempt of attempts) {
    try {
      const file = attempt();
      if (file.exists) {
        console.log('[DocumentParser] File handle created successfully for:', source.uri);
        return file;
      }
      console.warn('File handle created but target does not exist yet', file.uri);
    } catch (error) {
      console.warn('File handle creation attempt failed', error);
    }
  }
  console.warn('[DocumentParser] All file handle creation attempts failed for:', source.uri);
  return null;
}

async function loadArrayBuffer(sourceInput: DocumentSource | string, defaults?: Partial<DocumentSource>): Promise<ArrayBuffer> {
  const source = normalizeSource(sourceInput, defaults);
  const { uri, base64 } = source;

  if (base64 && base64.length > 0) {
    const bytes = decodeBase64(base64);
    return toArrayBuffer(bytes);
  }

  if (uri.startsWith('data:')) {
    const bytes = decodeBase64(uri);
    return toArrayBuffer(bytes);
  }

  if (shouldFetchOverNetwork(uri)) {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Unable to fetch resource (${response.status})`);
    }
    return response.arrayBuffer();
  }

  const fileHandle = createFileHandle(source);
  if (!fileHandle) {
    throw new Error('File could not be accessed');
  }

  try {
    return await fileHandle.arrayBuffer();
  } catch (arrayBufferError) {
    console.warn('File.arrayBuffer failed, attempting bytes()', arrayBufferError);
  }

  try {
    const bytes = await fileHandle.bytes();
    const arrayBuffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return arrayBuffer;
  } catch (bytesError) {
    console.warn('File.bytes failed, attempting base64()', bytesError);
  }

  try {
    const base64Content = await fileHandle.base64();
    const bytes = decodeBase64(base64Content);
    return toArrayBuffer(bytes);
  } catch (base64Error) {
    console.error('File.base64 failed', base64Error);
  }

  throw new Error('Unable to read file contents as binary data');
}

async function loadText(sourceInput: DocumentSource | string, defaults?: Partial<DocumentSource>): Promise<string> {
  const source = normalizeSource(sourceInput, defaults);
  const { uri, base64 } = source;

  if (base64 && base64.length > 0) {
    const bytes = decodeBase64(base64);
    return decodeUtf8(bytes);
  }

  if (uri.startsWith('data:')) {
    const bytes = decodeBase64(uri);
    return decodeUtf8(bytes);
  }

  if (shouldFetchOverNetwork(uri)) {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Unable to fetch resource (${response.status})`);
    }
    return response.text();
  }

  const fileHandle = createFileHandle(source);
  if (!fileHandle) {
    throw new Error('File could not be accessed');
  }

  try {
    return await fileHandle.text();
  } catch (textError) {
    console.warn('File.text failed, attempting bytes()', textError);
  }

  try {
    const bytes = await fileHandle.bytes();
    return decodeUtf8(bytes);
  } catch (bytesError) {
    console.warn('File.bytes failed while reading text, attempting base64()', bytesError);
  }

  try {
    const base64Content = await fileHandle.base64();
    const bytes = decodeBase64(base64Content);
    return decodeUtf8(bytes);
  } catch (base64Error) {
    console.error('File.base64 failed while reading text', base64Error);
  }

  throw new Error('Unable to read file contents as text');
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\u00AD/g, '')
    .replace(/[\"\"]/g, '"')
    .replace(/[\'\']/g, "'")
    .trim();
}

async function parsePlainText(sourceInput: DocumentSource | string): Promise<string> {
  const text = await loadText(sourceInput);
  return cleanText(text);
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => {
      const codePoint = parseInt(hex as string, 16);
      if (Number.isNaN(codePoint)) {
        return '';
      }
      return String.fromCodePoint(codePoint);
    })
    .replace(/&#(\d+);/g, (_match, decimal) => {
      const codePoint = parseInt(decimal as string, 10);
      if (Number.isNaN(codePoint)) {
        return '';
      }
      return String.fromCodePoint(codePoint);
    });
}

function convertMarkupToPlain(input: string): string {
  let normalized = input;
  
  normalized = normalized.replace(/<style[\s\S]*?<\/style>/gi, '');
  normalized = normalized.replace(/<script[\s\S]*?<\/script>/gi, '');
  normalized = normalized.replace(/<\s*br\s*\/?\s*>/gi, '\n');
  normalized = normalized.replace(/<\/?(p|div|section|article|h[1-6])[^>]*>/gi, '\n\n');
  normalized = normalized.replace(/<\s*li[^>]*>/gi, '\n• ');
  normalized = normalized.replace(/<\/(li|ul|ol)\s*>/gi, '\n');
  normalized = normalized.replace(/<hr[^>]*>/gi, '\n---\n');
  normalized = normalized.replace(/<[^>]+>/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ');
  
  const decoded = decodeXmlEntities(normalized);
  return cleanText(decoded);
}

function extractDocxText(xmlContent: string): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  const normalized = xmlContent
    .replace(/<w:tab\b[^>]*\/>/gi, '\t')
    .replace(/<w:br\b[^>]*\/>/gi, '\n');
  const paragraphMatches = normalized.match(/<w:p[\s\S]*?<\/w:p>/gi);
  if (!paragraphMatches || paragraphMatches.length === 0) {
    warnings.push('No paragraphs detected in Word document.');
    return { text: '', warnings };
  }

  const paragraphs: string[] = paragraphMatches.map((paragraph) => {
    const runMatches = Array.from(paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi));
    if (runMatches.length === 0) {
      return '';
    }
    const combined = runMatches
      .map((match) => decodeXmlEntities(match[1] ?? ''))
      .join('');
    return combined;
  });

  const populatedParagraphs = paragraphs.filter((paragraph) => paragraph.trim().length > 0);
  if (populatedParagraphs.length === 0) {
    warnings.push('The Word document contains no readable text runs.');
  }

  const rawText = populatedParagraphs.join('\n\n');
  const cleaned = cleanText(rawText);
  return { text: cleaned, warnings };
}

async function parseDOCX(sourceInput: DocumentSource | string): Promise<{ text: string; warnings: string[] }> {
  const arrayBuffer = await loadArrayBuffer(sourceInput);
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new Error('DOCX archive is missing word/document.xml');
  }
  const xmlContent = await documentFile.async('string');
  const { text, warnings } = extractDocxText(xmlContent);
  return { text, warnings };
}

async function attemptDocxExtractionFromUnknown(source: DocumentSource): Promise<{ text: string; warnings: string[] } | null> {
  try {
    console.log('Attempting DOCX fallback extraction for', source.name, source.mimeType ?? 'unknown type');
    const { text, warnings } = await parseDOCX(source);
    return { text, warnings };
  } catch (error) {
    console.warn('DOCX fallback extraction failed', error);
    return null;
  }
}

function readUint16BE(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

function readUint32BE(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function collectMobiOffsets(view: DataView, recordCount: number): MobiRecordOffsets {
  const offsets: number[] = [];
  const baseOffset = 78;
  for (let index = 0; index < recordCount; index += 1) {
    const pointerOffset = baseOffset + index * 8;
    if (pointerOffset + 4 > view.byteLength) {
      break;
    }
    const recordOffset = readUint32BE(view, pointerOffset);
    offsets.push(recordOffset);
  }
  return { offsets, recordCount: offsets.length };
}

function sliceRecord(buffer: ArrayBuffer, offsets: number[], index: number): Uint8Array {
  const start = offsets[index];
  if (typeof start !== 'number' || Number.isNaN(start) || start >= buffer.byteLength) {
    return new Uint8Array(0);
  }
  const nextOffset = index + 1 < offsets.length ? offsets[index + 1] : buffer.byteLength;
  const end = Math.min(buffer.byteLength, Math.max(start, nextOffset));
  if (end <= start) {
    return new Uint8Array(0);
  }
  return new Uint8Array(buffer.slice(start, end));
}

function decompressPalmDoc(data: Uint8Array): Uint8Array {
  const output: number[] = [];
  let cursor = 0;

  while (cursor < data.length) {
    const control = data[cursor];
    cursor += 1;

    if (control === 0) {
      output.push(control);
      continue;
    }

    if (control >= 1 && control <= 8) {
      const length = control;
      for (let index = 0; index < length && cursor < data.length; index += 1) {
        output.push(data[cursor]);
        cursor += 1;
      }
      continue;
    }

    if (control >= 0x09 && control <= 0x7f) {
      output.push(control);
      continue;
    }

    if (control >= 0x80 && control <= 0xbf) {
      if (cursor >= data.length) {
        break;
      }
      const next = data[cursor];
      cursor += 1;

      const combined = (control << 8) | next;
      const distance = (combined >> 3) & 0x07FF;
      const length = (combined & 0x07) + 3;
      
      if (distance === 0 || distance > output.length) {
        for (let i = 0; i < length; i += 1) {
          output.push(0x20);
        }
        continue;
      }

      const start = output.length - distance;
      for (let index = 0; index < length; index += 1) {
        output.push(output[start + index]);
      }
      continue;
    }

    if (control >= 0xc0) {
      output.push(0x20);
      output.push(control ^ 0x80);
      continue;
    }
  }

  return Uint8Array.from(output);
}

function isValidContinuationByte(byte: number): boolean {
  return (byte & 0xc0) === 0x80;
}

function isValidUtf8(bytes: Uint8Array): boolean {
  let index = 0;
  while (index < bytes.length) {
    const byte1 = bytes[index];
    if (byte1 <= 0x7f) {
      index += 1;
      continue;
    }
    if (byte1 === 0xc0 || byte1 === 0xc1 || byte1 >= 0xf5) {
      return false;
    }
    if (byte1 >= 0xc2 && byte1 <= 0xdf) {
      if (index + 1 >= bytes.length) {
        return false;
      }
      const byte2 = bytes[index + 1];
      if (!isValidContinuationByte(byte2)) {
        return false;
      }
      index += 2;
      continue;
    }
    if (byte1 >= 0xe0 && byte1 <= 0xef) {
      if (index + 2 >= bytes.length) {
        return false;
      }
      const byte2 = bytes[index + 1];
      const byte3 = bytes[index + 2];
      if (!isValidContinuationByte(byte2) || !isValidContinuationByte(byte3)) {
        return false;
      }
      if (byte1 === 0xe0 && byte2 < 0xa0) {
        return false;
      }
      if (byte1 === 0xed && byte2 >= 0xa0) {
        return false;
      }
      index += 3;
      continue;
    }
    if (byte1 >= 0xf0 && byte1 <= 0xf4) {
      if (index + 3 >= bytes.length) {
        return false;
      }
      const byte2 = bytes[index + 1];
      const byte3 = bytes[index + 2];
      const byte4 = bytes[index + 3];
      if (
        !isValidContinuationByte(byte2) ||
        !isValidContinuationByte(byte3) ||
        !isValidContinuationByte(byte4)
      ) {
        return false;
      }
      if (byte1 === 0xf0 && byte2 < 0x90) {
        return false;
      }
      if (byte1 === 0xf4 && byte2 >= 0x90) {
        return false;
      }
      index += 4;
      continue;
    }
    return false;
  }
  return true;
}

function countWindows1252LeadBytes(bytes: Uint8Array): number {
  let total = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte >= 0x80 && byte <= 0x9f && typeof WINDOWS_1252_MAP[byte] === 'string') {
      total += 1;
    }
  }
  return total;
}

function computeReadabilityScore(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  let readable = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0xfffd) {
      continue;
    }
    if (
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code !== 0x7f) ||
      code >= 0xa0
    ) {
      readable += 1;
    }
  }
  return readable / text.length;
}

const COMMON_ENGLISH_WORDS = [
  'the',
  'and',
  'that',
  'with',
  'this',
  'have',
  'from',
  'your',
  'for',
  'you',
  'was',
  'are',
  'book',
  'chapter',
  'said',
  'there',
  'when',
  'into',
  'more',
  'than',
] as const;

const COMMON_ENGLISH_WORDS_SET = new Set<string>(COMMON_ENGLISH_WORDS);
const COMMON_WORD_PATTERN = /\s+/;

const MOJIBAKE_PATTERNS: RegExp[] = [
  /Ã[\u0080-\u00BF]/gu,
  /Â[\u0080-\u00BF]/gu,
  /â[\u0080-\u00BF]{1,2}/gu,
  /Ð[\u0080-\u00BF]/gu,
  /Ñ[\u0080-\u00BF]/gu,
];

type DecodingEvaluation = {
  text: string;
  encoding: SupportedTextEncoding;
  label: string;
  transform: 'direct' | 'utf8-repair';
  readability: number;
  asciiLetterRatio: number;
  spaceRatio: number;
  englishDensity: number;
  mojibakeCount: number;
  mojibakePenalty: number;
  score: number;
};

function calculateAsciiLetterRatio(input: string): number {
  if (input.length === 0) {
    return 0;
  }
  let asciiLetters = 0;
  let considered = 0;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      continue;
    }
    considered += 1;
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      asciiLetters += 1;
    }
  }
  if (considered === 0) {
    return 0;
  }
  return asciiLetters / considered;
}

function calculateSpaceRatio(input: string): number {
  if (input.length === 0) {
    return 0;
  }
  let spaces = 0;
  for (let index = 0; index < input.length; index += 1) {
    if (input.charCodeAt(index) === 0x20) {
      spaces += 1;
    }
  }
  return spaces / input.length;
}

function calculateEnglishDensity(input: string): number {
  if (input.length === 0) {
    return 0;
  }
  const normalized = input.toLowerCase();
  const words = normalized.split(COMMON_WORD_PATTERN).filter(Boolean).slice(0, 500);
  if (words.length === 0) {
    return 0;
  }
  let commonCount = 0;
  for (const word of words) {
    if (COMMON_ENGLISH_WORDS_SET.has(word)) {
      commonCount += 1;
    }
  }
  return Math.min(1, (commonCount * 3) / words.length);
}

function countMojibakeSequences(input: string): number {
  if (input.length === 0) {
    return 0;
  }
  let total = 0;
  for (const pattern of MOJIBAKE_PATTERNS) {
    const matcher = new RegExp(pattern.source, pattern.flags);
    const matches = input.match(matcher);
    if (matches) {
      total += matches.length;
    }
  }
  const replacementMatches = input.match(/\uFFFD/g);
  if (replacementMatches) {
    total += replacementMatches.length;
  }
  return total;
}

function attemptUtf8MojibakeRepair(input: string): string | null {
  if (input.length === 0) {
    return null;
  }
  const bytes = new Uint8Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code > 0xff) {
      return null;
    }
    bytes[index] = code & 0xff;
  }
  const decoded = decodeUtf8(bytes);
  if (!decoded || decoded === input) {
    return null;
  }
  return decoded;
}

function resolveEncodingFromCode(code: number): SupportedTextEncoding | null {
  if (code === 65001) {
    return 'utf-8';
  }
  if (code === 1252) {
    return 'windows-1252';
  }
  if (code === 1200) {
    return 'utf-16le';
  }
  if (code === 1201) {
    return 'utf-16be';
  }
  return null;
}

function decodeUsingEncoding(bytes: Uint8Array, encoding: SupportedTextEncoding): string {
  const prepared = stripBomForEncoding(bytes, encoding);
  if (encoding === 'utf-8') {
    if (typeof TextDecoder !== 'undefined') {
      try {
        return new TextDecoder('utf-8', { fatal: false }).decode(prepared);
      } catch (error) {
        console.warn('TextDecoder utf-8 failed for MOBI content', error);
      }
    }
    return decodeUtf8(prepared);
  }
  if (encoding === 'windows-1252') {
    return decodeWindows1252(prepared);
  }
  if (encoding === 'utf-16le') {
    return decodeUtf16(prepared, true);
  }
  if (encoding === 'utf-16be') {
    return decodeUtf16(prepared, false);
  }
  return decodeUtf8(prepared);
}

function evaluateDecodedText(
  text: string,
  encoding: SupportedTextEncoding,
  label: string,
  transform: 'direct' | 'utf8-repair',
): DecodingEvaluation {
  const sample = text.length > 24000 ? text.slice(0, 24000) : text;
  const readability = computeReadabilityScore(sample);
  const asciiLetterRatio = calculateAsciiLetterRatio(sample);
  const spaceRatio = calculateSpaceRatio(sample);
  const englishDensity = calculateEnglishDensity(sample);
  const mojibakeCount = countMojibakeSequences(sample);
  const mojibakePenalty = Math.min(0.6, (mojibakeCount / Math.max(1, sample.length)) * 40);
  const score = (readability * 0.45)
    + (asciiLetterRatio * 0.2)
    + (spaceRatio * 0.05)
    + (englishDensity * 0.3)
    - mojibakePenalty;

  return {
    text,
    encoding,
    label,
    transform,
    readability,
    asciiLetterRatio,
    spaceRatio,
    englishDensity,
    mojibakeCount,
    mojibakePenalty,
    score,
  };
}

function decodeMobiText(bytes: Uint8Array, encodingCode: number): MobiDecodedResult {
  const declaredEncoding = resolveEncodingFromCode(encodingCode);
  const defaultPriority: SupportedTextEncoding[] = ['utf-8', 'windows-1252', 'utf-16le', 'utf-16be'];
  const orderedEncodings = declaredEncoding
    ? [declaredEncoding, ...defaultPriority.filter(encoding => encoding !== declaredEncoding)]
    : defaultPriority;

  const looksUtf8 = isValidUtf8(bytes);
  const windowsLeadCount = countWindows1252LeadBytes(bytes);

  const prioritizedEncodings = [...orderedEncodings];
  if (!declaredEncoding) {
    const moveToFront = (encoding: SupportedTextEncoding) => {
      const currentIndex = prioritizedEncodings.indexOf(encoding);
      if (currentIndex === 0) {
        return;
      }
      if (currentIndex > 0) {
        prioritizedEncodings.splice(currentIndex, 1);
      }
      prioritizedEncodings.unshift(encoding);
    };

    if (looksUtf8) {
      moveToFront('utf-8');
    } else if (windowsLeadCount > 0) {
      moveToFront('windows-1252');
    }
  } else {
    if (looksUtf8 && declaredEncoding !== 'utf-8') {
      console.log('decodeMOBI: File declares', declaredEncoding, 'but data looks like UTF-8, prioritizing UTF-8');
      const idx = prioritizedEncodings.indexOf('utf-8');
      if (idx > 0) {
        prioritizedEncodings.splice(idx, 1);
        prioritizedEncodings.unshift('utf-8');
      }
    }
  }

  const evaluations: DecodingEvaluation[] = [];
  const signatures = new Set<string>();

  for (const encoding of prioritizedEncodings) {
    const raw = decodeUsingEncoding(bytes, encoding);
    if (raw.length === 0) {
      continue;
    }

    const sanitized = sanitizeDecodedMobiText(raw);
    const directSignature = `${encoding}:direct:${sanitized.slice(0, 4096)}`;
    if (!signatures.has(directSignature)) {
      signatures.add(directSignature);
      evaluations.push(evaluateDecodedText(sanitized, encoding, encoding, 'direct'));
    }

    const repairedRaw = attemptUtf8MojibakeRepair(raw);
    if (repairedRaw) {
      const repairedSanitized = sanitizeDecodedMobiText(repairedRaw);
      const repairedSignature = `${encoding}:utf8:${repairedSanitized.slice(0, 4096)}`;
      if (!signatures.has(repairedSignature)) {
        signatures.add(repairedSignature);
        evaluations.push(evaluateDecodedText(repairedSanitized, encoding, `${encoding}->utf8`, 'utf8-repair'));
      }
    }
  }

  if (evaluations.length === 0) {
    console.warn('decodeMOBI produced no viable decoding candidates');
    return {
      text: '',
      encodingUsed: declaredEncoding ?? 'utf-8',
      readabilityScore: 0,
      transform: 'direct',
    };
  }

  evaluations.sort((a, b) => b.score - a.score);
  const topCandidate = evaluations[0];
  const finalReadability = computeReadabilityScore(topCandidate.text);

  console.log('decodeMOBI candidate summary', {
    encodingCode,
    declaredEncoding,
    looksUtf8,
    windowsLeadCount,
    priorityOrder: prioritizedEncodings,
    totalCandidates: evaluations.length,
    topCandidates: evaluations.slice(0, 5).map(candidate => ({
      encoding: candidate.label,
      transform: candidate.transform,
      score: Number(candidate.score.toFixed(4)),
      readability: Number(candidate.readability.toFixed(4)),
      ascii: Number(candidate.asciiLetterRatio.toFixed(4)),
      spaces: Number(candidate.spaceRatio.toFixed(4)),
      english: Number(candidate.englishDensity.toFixed(4)),
      mojibake: candidate.mojibakeCount,
    })),
  });

  return {
    text: topCandidate.text,
    encodingUsed: topCandidate.encoding,
    readabilityScore: finalReadability,
    transform: topCandidate.transform,
  };
}

function sanitizeDecodedMobiText(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, ' ')
    .replace(/\uFFFD/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n')
    .replace(/^\s+|\s+$/gm, '');
}

function readPDBHeader(view: DataView): { name: string; type: string; creator: string; recordCount: number } {
  const nameBytes = new Uint8Array(view.buffer, 0, 32);
  let nameLength = 0;
  for (let i = 0; i < 32; i += 1) {
    if (nameBytes[i] === 0) {
      break;
    }
    nameLength += 1;
  }
  const name = decodeUtf8(nameBytes.subarray(0, nameLength));
  
  const typeBytes = new Uint8Array(view.buffer, 60, 4);
  const type = String.fromCharCode(typeBytes[0], typeBytes[1], typeBytes[2], typeBytes[3]);
  
  const creatorBytes = new Uint8Array(view.buffer, 64, 4);
  const creator = String.fromCharCode(creatorBytes[0], creatorBytes[1], creatorBytes[2], creatorBytes[3]);
  
  const recordCount = readUint16BE(view, 76);
  
  return { name, type, creator, recordCount };
}

function readEXTHHeader(view: DataView, mobiHeaderOffset: number, mobiHeaderLength: number): { title?: string; author?: string } | null {
  const exthFlagOffset = mobiHeaderOffset + 128;
  if (exthFlagOffset + 4 > view.byteLength) {
    return null;
  }
  const exthFlag = readUint32BE(view, exthFlagOffset);
  const hasEXTH = (exthFlag & 0x40) !== 0;
  
  if (!hasEXTH) {
    return null;
  }
  
  const exthOffset = mobiHeaderOffset + mobiHeaderLength;
  if (exthOffset + 12 > view.byteLength) {
    return null;
  }
  
  const exthIdentifier = readUint32BE(view, exthOffset);
  if (exthIdentifier !== 0x45585448) {
    return null;
  }
  
  const exthHeaderLength = readUint32BE(view, exthOffset + 4);
  const exthRecordCount = readUint32BE(view, exthOffset + 8);
  
  let offset = exthOffset + 12;
  const metadata: { title?: string; author?: string } = {};
  
  for (let i = 0; i < exthRecordCount; i += 1) {
    if (offset + 8 > view.byteLength) {
      break;
    }
    const recordType = readUint32BE(view, offset);
    const recordLength = readUint32BE(view, offset + 4);
    
    if (recordLength < 8 || offset + recordLength > view.byteLength) {
      break;
    }
    
    const dataLength = recordLength - 8;
    if (dataLength > 0) {
      const dataBytes = new Uint8Array(view.buffer, offset + 8, dataLength);
      
      if (recordType === 100) {
        metadata.author = decodeUtf8(dataBytes);
      } else if (recordType === 503) {
        metadata.title = decodeUtf8(dataBytes);
      }
    }
    
    offset += recordLength;
  }
  
  return metadata;
}

async function parseMOBI(sourceInput: DocumentSource | string): Promise<{ text: string; warnings: string[] }> {
  const buffer = await loadArrayBuffer(sourceInput);
  if (buffer.byteLength < 84) {
    throw new Error('This file is too small to be a valid MOBI document.');
  }
  const view = new DataView(buffer);
  
  const pdbHeader = readPDBHeader(view);
  console.log('parseMOBI PDB header', pdbHeader);
  
  if (pdbHeader.type !== 'BOOK' || pdbHeader.creator !== 'MOBI') {
    throw new Error(`Invalid MOBI file format (type: ${pdbHeader.type}, creator: ${pdbHeader.creator}). Expected BOOK/MOBI.`);
  }
  
  const { offsets, recordCount } = collectMobiOffsets(view, pdbHeader.recordCount);
  if (recordCount === 0) {
    throw new Error('This MOBI file does not contain any records.');
  }
  const firstRecord = sliceRecord(buffer, offsets, 0);
  if (firstRecord.byteLength < 16) {
    throw new Error('PalmDOC header missing or truncated');
  }
  const palmDocView = new DataView(firstRecord.buffer, firstRecord.byteOffset, firstRecord.byteLength);
  const compression = readUint16BE(palmDocView, 0);
  const declaredTextLength = readUint32BE(palmDocView, 4);
  const textRecordCount = readUint16BE(palmDocView, 8);
  const encryptionType = readUint16BE(palmDocView, 12);
  console.log('parseMOBI header', {
    compression,
    declaredTextLength,
    textRecordCount,
    encryptionType,
  });
  if (encryptionType !== 0) {
    throw new Error('This book is DRM-protected and cannot be read. Please use a DRM-free version.');
  }
  if (compression === 17480 || (compression > 2 && compression !== 17480)) {
    throw new Error('This MOBI uses Huff/CDIC compression which is not supported yet. Please try a different version of the book.');
  }
  if (compression !== 1 && compression !== 2) {
    throw new Error(`This MOBI uses an unsupported compression method (${compression}). Only uncompressed and PalmDOC compression are supported.`);
  }
  const mobiHeaderOffset = offsets[0] + 16;
  if (mobiHeaderOffset + 20 > buffer.byteLength) {
    throw new Error('MOBI header is truncated');
  }
  const mobiIdentifier = readUint32BE(view, mobiHeaderOffset);
  if (mobiIdentifier !== 0x4d4f4249) {
    throw new Error('Invalid MOBI header signature');
  }
  const mobiHeaderLength = readUint32BE(view, mobiHeaderOffset + 4);
  const textEncoding = readUint32BE(view, mobiHeaderOffset + 12);
  let firstNonBookIndex = 0;
  if (mobiHeaderOffset + 116 <= buffer.byteLength) {
    firstNonBookIndex = readUint32BE(view, mobiHeaderOffset + 108);
  }
  
  const exthMetadata = readEXTHHeader(view, mobiHeaderOffset, mobiHeaderLength);
  
  console.log('parseMOBI mobiHeader', {
    mobiHeaderLength,
    textEncoding,
    firstNonBookIndex,
    exthMetadata,
  });
  const maxTextRecords = Math.max(0, Math.min(recordCount - 1, textRecordCount > 0 ? textRecordCount : recordCount - 1));
  const upperRecordBound = firstNonBookIndex > 0 && firstNonBookIndex < recordCount ? firstNonBookIndex : maxTextRecords + 1;
  const chunks: Uint8Array[] = [];
  let accumulatedLength = 0;
  console.log('parseMOBI extracting text records', {
    recordCount,
    upperRecordBound,
    compression: compression === 1 ? 'none' : 'PalmDOC',
  });
  for (let index = 1; index < recordCount; index += 1) {
    if (upperRecordBound > 0 && index >= upperRecordBound) {
      break;
    }
    const recordBytes = sliceRecord(buffer, offsets, index);
    if (recordBytes.length === 0) {
      continue;
    }
    const segment = compression === 1 ? recordBytes : decompressPalmDoc(recordBytes);
    console.log(`parseMOBI record ${index}:`, {
      compressed: recordBytes.length,
      decompressed: segment.length,
      firstBytes: Array.from(segment.slice(0, 20)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '),
    });
    chunks.push(segment);
    accumulatedLength += segment.length;
    if (declaredTextLength > 0 && accumulatedLength >= declaredTextLength) {
      break;
    }
  }
  if (chunks.length === 0) {
    throw new Error('No text records could be extracted from MOBI file');
  }
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const targetLength = declaredTextLength > 0 && declaredTextLength < totalLength ? declaredTextLength : totalLength;
  const merged = new Uint8Array(targetLength);
  let pointer = 0;
  for (const chunk of chunks) {
    if (pointer >= targetLength) {
      break;
    }
    const remaining = targetLength - pointer;
    merged.set(chunk.subarray(0, remaining), pointer);
    pointer += Math.min(chunk.length, remaining);
  }
  let trimmedLength = merged.length;
  while (trimmedLength > 0 && merged[trimmedLength - 1] === 0) {
    trimmedLength -= 1;
  }
  const finalBytes = merged.subarray(0, trimmedLength);
  const warnings: string[] = [];
  const decoded = decodeMobiText(finalBytes, textEncoding);
  const sanitized = sanitizeDecodedMobiText(decoded.text);
  let finalText = convertMarkupToPlain(sanitized);
  if (decoded.transform === 'utf8-repair') {
    warnings.push('Detected mojibake in MOBI file. Text encoding repaired automatically.');
  }
  const finalReadability = computeReadabilityScore(finalText);
  console.log('parseMOBI decode summary', {
    selectedEncoding: decoded.encodingUsed,
    transform: decoded.transform,
    decodedReadability: Number(decoded.readabilityScore.toFixed(3)),
    finalReadability: Number(finalReadability.toFixed(3)),
    decodedLength: decoded.text.length,
    finalLength: finalText.length,
  });
  if (decoded.readabilityScore < 0.4) {
    warnings.push('MOBI document contains a large amount of unreadable characters. Display may be degraded.');
  }
  if (decoded.encodingUsed === 'utf-8' && textEncoding !== 65001) {
    warnings.push('MOBI metadata indicated Windows-1252 but UTF-8 content was detected. Text decoded automatically.');
  }
  if (decoded.encodingUsed === 'windows-1252' && textEncoding === 65001) {
    warnings.push('MOBI metadata indicated UTF-8 but Windows-1252 content was detected. Text decoded automatically.');
  }
  if (finalReadability < 0.2) {
    warnings.push('Decoded MOBI text still contains noticeable unreadable characters after cleanup.');
  }
  if (finalReadability < 0.03) {
    warnings.push('Decoded MOBI text appears corrupted or uses an unsupported encoding. Display has been suppressed.');
    finalText = '';
  }
  if (finalText.length === 0) {
    warnings.push('MOBI document did not expose readable text content.');
  }
  return { text: finalText, warnings };
}

const MINIMUM_READABLE_LENGTH = 24;

export type PlainTextExtractionResult = {
  text: string;
  sourceFormat: DocumentFormat;
  warnings: string[];
  isReadable: boolean;
  unreadableReason?: string | null;
};

export type ExtractPlainTextParams = {
  uri: string;
  fileName: string;
  mimeType?: string | null;
  size?: number | null;
  lastModified?: number | null;
  base64?: string | null;
  pdfOptions?: {
    perPageOcrFallback?: boolean;
    minCharsPerPage?: number;
    ocrLanguage?: string;
    ocrEnhanceText?: boolean;
  };
};

const mimeFormatMap: Record<string, DocumentFormat> = {
  'text/plain': 'TXT',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/msword': 'DOC',
  'application/pdf': 'PDF',
  'application/epub+zip': 'EPUB',
  'application/x-mobipocket-ebook': 'MOBI',
  'application/rtf': 'RTF',
  'text/rtf': 'RTF',
  'text/html': 'HTML',
};

function determineDocumentFormat(fileName: string, mimeType?: string | null): DocumentFormat {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  const normalizedMime = mimeType?.toLowerCase() ?? '';

  switch (extension) {
    case 'docx':
      return 'DOCX';
    case 'doc':
      return 'DOC';
    case 'pdf':
      return 'PDF';
    case 'epub':
      return 'EPUB';
    case 'mobi':
      return 'MOBI';
    case 'rtf':
      return 'RTF';
    case 'html':
    case 'htm':
      return 'HTML';
    case 'txt':
      return 'TXT';
    default:
      break;
  }

  if (normalizedMime in mimeFormatMap) {
    return mimeFormatMap[normalizedMime];
  }

  if (normalizedMime.includes('word') || normalizedMime.includes('officedocument')) {
    return 'DOCX';
  }

  if (normalizedMime.includes('pdf')) {
    return 'PDF';
  }

  return 'TXT';
}

export async function extractPlainTextFromFile({
  uri,
  fileName,
  mimeType,
  size,
  lastModified,
  base64,
  pdfOptions,
}: ExtractPlainTextParams): Promise<PlainTextExtractionResult> {
  const detectedFormat = determineDocumentFormat(fileName, mimeType);
  let resolvedFormat = detectedFormat;
  const source: DocumentSource = {
    uri,
    name: fileName,
    mimeType: mimeType ?? null,
    size: typeof size === 'number' ? size : undefined,
    lastModified: typeof lastModified === 'number' ? lastModified : undefined,
    base64: base64 ?? null,
  };

  const warnings: string[] = [];
  let text = '';
  let isReadable = false;
  let unreadableReason: string | null = null;

  if (resolvedFormat === 'TXT') {
    try {
      const parsed = await parsePlainText(source);
      if (parsed.trim().length >= MINIMUM_READABLE_LENGTH) {
        text = parsed;
        isReadable = true;
      } else {
        unreadableReason = 'This TXT file does not contain readable text content.';
      }
    } catch (error) {
      unreadableReason = `Failed to read TXT file: ${error instanceof Error ? error.message : 'Unknown error'}`;
      warnings.push(unreadableReason);
    }
  } else if (resolvedFormat === 'DOCX') {
    try {
      const result = await parseDOCX(source);
      warnings.push(...result.warnings);
      if (result.text.trim().length >= MINIMUM_READABLE_LENGTH) {
        text = result.text;
        isReadable = true;
      } else {
        unreadableReason = 'This Word document does not contain readable text content.';
      }
    } catch (error) {
      unreadableReason = `Failed to read Word document: ${error instanceof Error ? error.message : 'Unknown error'}`;
      warnings.push(unreadableReason);
    }
  } else if (resolvedFormat === 'MOBI') {
    try {
      const result = await parseMOBI(source);
      warnings.push(...result.warnings);
      if (result.text.trim().length >= MINIMUM_READABLE_LENGTH) {
        text = result.text;
        isReadable = true;
      } else {
        unreadableReason = 'This MOBI file does not contain readable text content.';
      }
    } catch (error) {
      unreadableReason = `Failed to read MOBI document: ${error instanceof Error ? error.message : 'Unknown error'}`;
      warnings.push(unreadableReason);
    }
  } else if (resolvedFormat === 'PDF') {
    try {
      const arrayBuffer = await loadArrayBuffer(source);
      const result = await extractTextFromPDF(arrayBuffer, pdfOptions);
      warnings.push(...result.warnings);
      if (result.text.trim().length >= MINIMUM_READABLE_LENGTH) {
        text = result.text;
        isReadable = true;
      } else {
        unreadableReason = 'This PDF does not contain readable text content.';
      }
    } catch (error) {
      unreadableReason = `Failed to read PDF: ${error instanceof Error ? error.message : 'Unknown error'}`;
      warnings.push(unreadableReason);
    }
  } else if (resolvedFormat === 'EPUB') {
    try {
      const arrayBuffer = await loadArrayBuffer(source);
      const result = await parseEPUB(arrayBuffer);
      warnings.push(...result.warnings);
      if (result.text.trim().length >= MINIMUM_READABLE_LENGTH) {
        text = result.text;
        isReadable = true;
      } else {
        unreadableReason = 'This EPUB does not contain readable text content.';
      }
    } catch (error) {
      unreadableReason = `Failed to read EPUB: ${error instanceof Error ? error.message : 'Unknown error'}`;
      warnings.push(unreadableReason);
    }
  } else {
    const fallback = await attemptDocxExtractionFromUnknown(source);
    if (fallback && fallback.text.trim().length >= MINIMUM_READABLE_LENGTH) {
      console.log('Recovered DOCX content from mislabeled file', fileName, resolvedFormat);
      text = fallback.text;
      isReadable = true;
      resolvedFormat = 'DOCX';
      warnings.push(...fallback.warnings);
      if (resolvedFormat !== detectedFormat) {
        warnings.push('Detected Word document content despite mismatched file metadata.');
      }
    } else {
      const unsupportedMessages: Partial<Record<DocumentFormat, string>> = {
        DOC: 'Legacy Word documents (.doc) are not supported. Please save as DOCX and try again.',
        RTF: 'RTF support is not available. Convert your file to DOCX, MOBI, or TXT to continue.',
        HTML: 'HTML documents are not supported. Please provide a TXT, DOCX, MOBI, or EPUB document.',
      };
      const defaultUnsupportedMessage = `Reading ${resolvedFormat} files is not supported. Please provide a TXT, DOCX, or MOBI document.`;
      unreadableReason = unsupportedMessages[resolvedFormat] ?? defaultUnsupportedMessage;
      warnings.push(unreadableReason);
    }
  }

  return {
    text: isReadable ? text : '',
    sourceFormat: resolvedFormat,
    warnings,
    isReadable,
    unreadableReason,
  };
}
