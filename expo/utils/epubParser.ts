import JSZip from 'jszip';

export type EPUBChapterInfo = {
  id: string;
  title: string;
  startChar: number;
  endChar: number;
};

export type EPUBParseResult = {
  text: string;
  chapters: EPUBChapterInfo[];
  title?: string;
  author?: string;
  warnings: string[];
};

type SpineItem = {
  id: string;
  href: string;
  linear: boolean;
};

type ManifestItem = {
  id: string;
  href: string;
  mediaType: string;
};

type TOCItem = {
  title: string;
  href: string;
  order?: number;
};

type EPUBExtractionSettings = {
  skipNonLinear: boolean;
  includeImageAlt: boolean;
  respectAriaHidden: boolean;
};

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => {
      const codePoint = parseInt(hex as string, 16);
      if (Number.isNaN(codePoint)) return '';
      return String.fromCodePoint(codePoint);
    })
    .replace(/&#(\d+);/g, (_match, decimal) => {
      const codePoint = parseInt(decimal as string, 10);
      if (Number.isNaN(codePoint)) return '';
      return String.fromCodePoint(codePoint);
    });
}

function extractSvgText(svgContent: string): string {
  const textParts: string[] = [];
  
  const textMatches = svgContent.match(/<text[^>]*>([\s\S]*?)<\/text>/gi);
  if (textMatches) {
    for (const match of textMatches) {
      const tspanMatches = match.match(/<tspan[^>]*>([\s\S]*?)<\/tspan>/gi);
      if (tspanMatches) {
        for (const tspan of tspanMatches) {
          const content = tspan.replace(/<[^>]+>/g, '').trim();
          if (content) textParts.push(content);
        }
      }
      const directText = match.replace(/<tspan[^>]*>[\s\S]*?<\/tspan>/gi, '').replace(/<[^>]+>/g, '').trim();
      if (directText) textParts.push(directText);
    }
  }
  
  const foreignObjectMatches = svgContent.match(/<foreignObject[^>]*>([\s\S]*?)<\/foreignObject>/gi);
  if (foreignObjectMatches) {
    for (const match of foreignObjectMatches) {
      const innerText = stripHtmlTags(match);
      if (innerText.trim()) textParts.push(innerText);
    }
  }
  
  return textParts.join(' ');
}

function stripHtmlTags(html: string, includeImageAlt: boolean = true, respectAriaHidden: boolean = false): string {
  let text = html;
  
  if (respectAriaHidden) {
    text = text.replace(/<[^>]*aria-hidden=["']true["'][^>]*>[\s\S]*?<\/[^>]+>/gi, '');
  }
  
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  text = text.replace(/<head[\s\S]*?<\/head>/gi, '');
  
  const svgMatches = text.match(/<svg[\s\S]*?<\/svg>/gi);
  if (svgMatches) {
    for (const svg of svgMatches) {
      const svgText = extractSvgText(svg);
      text = text.replace(svg, svgText ? ` ${svgText} ` : ' ');
    }
  }
  
  text = text.replace(/<\s*br\s*\/?\s*>/gi, '\n');
  text = text.replace(/<\/?(p|div|section|article|h[1-6]|blockquote|pre|dd|dt|td|th|caption|figcaption)[^>]*>/gi, '\n\n');
  text = text.replace(/<\s*li[^>]*>/gi, '\n• ');
  text = text.replace(/<\/(li|ul|ol)\s*>/gi, '\n');
  text = text.replace(/<hr[^>]*>/gi, '\n---\n');
  
  if (includeImageAlt) {
    const imgAltRegex = /<img[^>]*alt=["']([^"']*)["'][^>]*>/gi;
    text = text.replace(imgAltRegex, (_match, alt) => {
      return alt ? `[Image: ${alt}]` : '';
    });
  }
  text = text.replace(/<img[^>]*>/gi, '');
  
  text = text.replace(/<[^>]+>/g, ' ');
  
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\n\s+/g, '\n');
  text = text.replace(/\s+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return decodeXmlEntities(text).trim();
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00AD/g, '')
    .replace(/\u00AC\u00AD/g, '')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .normalize('NFC')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{4,}/g, '\\n\n')
    .trim();
}

function resolvePath(basePath: string, relativePath: string): string {
  if (relativePath.startsWith('/')) {
    return relativePath.slice(1);
  }
  
  const baseDir = basePath.substring(0, basePath.lastIndexOf('/'));
  if (baseDir === '') {
    return relativePath;
  }
  
  const parts = baseDir.split('/');
  const relParts = relativePath.split('/');
  
  for (const part of relParts) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.' && part !== '') {
      parts.push(part);
    }
  }
  
  return parts.join('/') + '/' + relParts[relParts.length - 1];
}

async function findContainerXml(zip: JSZip): Promise<string> {
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) {
    throw new Error('Invalid EPUB: missing META-INF/container.xml');
  }
  return await containerFile.async('string');
}

function parseContainerXml(xml: string): string {
  const rootfileMatch = xml.match(/<rootfile[^>]*full-path=["']([^"']+)["']/i);
  if (!rootfileMatch || !rootfileMatch[1]) {
    throw new Error('Invalid EPUB: cannot locate package document in container.xml');
  }
  return rootfileMatch[1];
}

async function checkForDRM(zip: JSZip): Promise<{ isDRM: boolean; isFontObfuscationOnly: boolean }> {
  const encryptionFile = zip.file('META-INF/encryption.xml');
  if (!encryptionFile) {
    return { isDRM: false, isFontObfuscationOnly: false };
  }
  
  const encryptionXml = await encryptionFile.async('string');
  
  const fontObfuscationPatterns = [
    'http://www.idpf.org/2008/embedding',
    'http://ns.adobe.com/pdf/enc#RC',
  ];
  
  const hasFontObfuscation = fontObfuscationPatterns.some(pattern => encryptionXml.includes(pattern));
  
  const drmPatterns = [
    'http://ns.adobe.com/adept',
    'adobe:EncryptedKey',
    'http://www.w3.org/2001/04/xmlenc#aes',
    'readium',
    'lcpl',
  ];
  
  const hasDRM = drmPatterns.some(pattern => encryptionXml.toLowerCase().includes(pattern.toLowerCase()));
  
  if (hasDRM) {
    return { isDRM: true, isFontObfuscationOnly: false };
  }
  
  if (hasFontObfuscation && !encryptionXml.includes('EncryptedData')) {
    return { isDRM: false, isFontObfuscationOnly: true };
  }
  
  const hasEncryptedContent = encryptionXml.includes('EncryptedData') && !hasFontObfuscation;
  
  return { isDRM: hasEncryptedContent, isFontObfuscationOnly: hasFontObfuscation };
}

function parseOpfMetadata(opfContent: string): { title?: string; author?: string } {
  const metadata: { title?: string; author?: string } = {};
  
  const titleMatch = opfContent.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
  if (titleMatch && titleMatch[1]) {
    metadata.title = decodeXmlEntities(titleMatch[1].trim());
  }
  
  const creatorMatch = opfContent.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
  if (creatorMatch && creatorMatch[1]) {
    metadata.author = decodeXmlEntities(creatorMatch[1].trim());
  }
  
  return metadata;
}

function parseManifest(opfContent: string): Map<string, ManifestItem> {
  const manifest = new Map<string, ManifestItem>();
  const manifestSection = opfContent.match(/<manifest[^>]*>([\s\S]*?)<\/manifest>/i);
  
  if (!manifestSection || !manifestSection[1]) {
    return manifest;
  }
  
  const itemRegex = /<item\s+([^>]+)>/gi;
  let match;
  
  while ((match = itemRegex.exec(manifestSection[1])) !== null) {
    const attrs = match[1];
    const idMatch = attrs.match(/id=["']([^"']+)["']/i);
    const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
    const mediaTypeMatch = attrs.match(/media-type=["']([^"']+)["']/i);
    
    if (idMatch && hrefMatch && mediaTypeMatch) {
      manifest.set(idMatch[1], {
        id: idMatch[1],
        href: decodeXmlEntities(hrefMatch[1]),
        mediaType: mediaTypeMatch[1],
      });
    }
  }
  
  return manifest;
}

function parseSpine(opfContent: string): SpineItem[] {
  const spine: SpineItem[] = [];
  const spineSection = opfContent.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i);
  
  if (!spineSection || !spineSection[1]) {
    return spine;
  }
  
  const itemrefRegex = /<itemref\s+([^>]+)\/?\s*>/gi;
  let match;
  
  while ((match = itemrefRegex.exec(spineSection[1])) !== null) {
    const attrs = match[1];
    const idrefMatch = attrs.match(/idref=["']([^"']+)["']/i);
    const linearMatch = attrs.match(/linear=["']([^"']+)["']/i);
    
    if (idrefMatch) {
      spine.push({
        id: idrefMatch[1],
        href: '',
        linear: linearMatch ? linearMatch[1].toLowerCase() !== 'no' : true,
      });
    }
  }
  
  return spine;
}

function parseNCXToc(ncxContent: string): TOCItem[] {
  const toc: TOCItem[] = [];
  const navPointRegex = /<navPoint[^>]*>([\s\S]*?)<\/navPoint>/gi;
  let match;
  let order = 0;
  
  while ((match = navPointRegex.exec(ncxContent)) !== null) {
    const navPoint = match[1];
    const labelMatch = navPoint.match(/<text[^>]*>([\s\S]*?)<\/text>/i);
    const contentMatch = navPoint.match(/<content\s+src=["']([^"']+)["']/i);
    
    if (labelMatch && contentMatch) {
      toc.push({
        title: decodeXmlEntities(labelMatch[1].trim()),
        href: decodeXmlEntities(contentMatch[1]),
        order: order++,
      });
    }
  }
  
  return toc;
}

function parseNavDocToc(navContent: string): TOCItem[] {
  const toc: TOCItem[] = [];
  const navMatch = navContent.match(/<nav[^>]*epub:type=["']toc["'][^>]*>([\s\S]*?)<\/nav>/i);
  
  if (!navMatch || !navMatch[1]) {
    return toc;
  }
  
  const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  let order = 0;
  
  while ((match = linkRegex.exec(navMatch[1])) !== null) {
    const href = decodeXmlEntities(match[1]);
    const title = stripHtmlTags(match[2]).trim();
    
    if (title && href) {
      toc.push({
        title,
        href,
        order: order++,
      });
    }
  }
  
  return toc;
}

async function extractTOC(
  zip: JSZip,
  opfContent: string,
  opfPath: string,
  manifest: Map<string, ManifestItem>
): Promise<TOCItem[]> {
  for (const item of manifest.values()) {
    if (item.mediaType === 'application/x-dtbncx+xml') {
      const ncxPath = resolvePath(opfPath, item.href);
      const ncxFile = zip.file(ncxPath);
      if (ncxFile) {
        const ncxContent = await ncxFile.async('string');
        const toc = parseNCXToc(ncxContent);
        if (toc.length > 0) {
          console.log('[EPUB] Found NCX TOC with', toc.length, 'entries');
          return toc;
        }
      }
    }
  }
  
  for (const item of manifest.values()) {
    if (item.mediaType === 'application/xhtml+xml' && item.href.includes('nav')) {
      const navPath = resolvePath(opfPath, item.href);
      const navFile = zip.file(navPath);
      if (navFile) {
        const navContent = await navFile.async('string');
        const toc = parseNavDocToc(navContent);
        if (toc.length > 0) {
          console.log('[EPUB] Found Nav Doc TOC with', toc.length, 'entries');
          return toc;
        }
      }
    }
  }
  
  return [];
}

async function extractTextFromSpine(
  zip: JSZip,
  spine: SpineItem[],
  manifest: Map<string, ManifestItem>,
  opfPath: string,
  toc: TOCItem[],
  settings: EPUBExtractionSettings
): Promise<{ text: string; chapters: EPUBChapterInfo[] }> {
  const chapters: EPUBChapterInfo[] = [];
  const textParts: string[] = [];
  let currentCharCount = 0;
  
  const tocMap = new Map<string, string>();
  for (const tocItem of toc) {
    const cleanHref = tocItem.href.split('#')[0];
    if (!tocMap.has(cleanHref)) {
      tocMap.set(cleanHref, tocItem.title);
    }
  }
  
  for (let i = 0; i < spine.length; i++) {
    const spineItem = spine[i];
    
    if (settings.skipNonLinear && !spineItem.linear) {
      console.log('[EPUB] Skipping non-linear spine item', spineItem.id);
      continue;
    }
    
    const manifestItem = manifest.get(spineItem.id);
    if (!manifestItem) {
      console.warn('[EPUB] Spine item not found in manifest:', spineItem.id);
      continue;
    }
    
    const contentPath = resolvePath(opfPath, manifestItem.href);
    const contentFile = zip.file(contentPath);
    
    if (!contentFile) {
      console.warn('[EPUB] Content file not found:', contentPath);
      continue;
    }
    
    const htmlContent = await contentFile.async('string');
    
    const isFXL = htmlContent.includes('pre-paginated') || 
                  htmlContent.includes('rendition:layout');
    
    const extractedText = stripHtmlTags(htmlContent, settings.includeImageAlt, settings.respectAriaHidden);
    const normalizedText = normalizeWhitespace(extractedText);
    
    if (normalizedText.trim().length === 0) {
      if (isFXL) {
        console.log('[EPUB] Skipping fixed-layout page with no text layer:', contentPath);
      } else {
        console.log('[EPUB] Skipping empty content:', contentPath);
      }
      continue;
    }
    
    const startChar = currentCharCount;
    textParts.push(normalizedText);
    currentCharCount += normalizedText.length + 2;
    const endChar = currentCharCount;
    
    const cleanHref = manifestItem.href.split('#')[0];
    const chapterTitle = tocMap.get(cleanHref) || `Chapter ${chapters.length + 1}`;
    
    chapters.push({
      id: spineItem.id,
      title: chapterTitle,
      startChar,
      endChar,
    });
    
    console.log(`[EPUB] Extracted chapter ${chapters.length}: "${chapterTitle}" (${normalizedText.length} chars)`);
  }
  
  const fullText = textParts.join('\n\n');
  
  return { text: fullText, chapters };
}

export async function parseEPUB(
  arrayBuffer: ArrayBuffer,
  options?: {
    skipNonLinear?: boolean;
    includeImageAlt?: boolean;
    respectAriaHidden?: boolean;
  }
): Promise<EPUBParseResult> {
  const warnings: string[] = [];
  const MIN_TEXT_CHARS = 500;
  
  console.log('[EPUB] Starting EPUB parsing, size:', arrayBuffer.byteLength, 'bytes');
  
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
    console.log('[EPUB] ZIP archive loaded successfully, file count:', Object.keys(zip.files).length);
  } catch (zipError) {
    console.error('[EPUB] Failed to load ZIP archive:', zipError);
    throw new Error(`This file doesn't appear to be a valid EPUB. The archive structure is corrupted or invalid. ${zipError instanceof Error ? zipError.message : ''}`);
  }
  
  let drmCheck: { isDRM: boolean; isFontObfuscationOnly: boolean };
  try {
    drmCheck = await checkForDRM(zip);
    if (drmCheck.isDRM) {
      throw new Error('This EPUB is DRM-protected and cannot be read. Please use a DRM-free version.');
    }
  } catch (drmError) {
    if (drmError instanceof Error && drmError.message.includes('DRM-protected')) {
      throw drmError;
    }
    console.warn('[EPUB] DRM check failed, continuing:', drmError);
    drmCheck = { isDRM: false, isFontObfuscationOnly: false };
  }
  
  if (drmCheck.isFontObfuscationOnly) {
    console.log('[EPUB] Font obfuscation detected (allowed)');
  }
  
  let containerXml: string;
  let opfPath: string;
  try {
    containerXml = await findContainerXml(zip);
    opfPath = parseContainerXml(containerXml);
    console.log('[EPUB] Found OPF path:', opfPath);
  } catch (containerError) {
    console.error('[EPUB] Container.xml parsing failed:', containerError);
    throw new Error(`Invalid EPUB structure: ${containerError instanceof Error ? containerError.message : 'Could not find or parse container.xml'}`);
  }
  
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error(`Invalid EPUB: package document not found at "${opfPath}". The EPUB structure may be corrupted.`);
  }
  
  let opfContent: string;
  try {
    opfContent = await opfFile.async('string');
    console.log('[EPUB] OPF content loaded, length:', opfContent.length);
  } catch (opfError) {
    console.error('[EPUB] Failed to read OPF file:', opfError);
    throw new Error(`Failed to read EPUB package document: ${opfError instanceof Error ? opfError.message : 'Unknown error'}`);
  }
  
  const metadata = parseOpfMetadata(opfContent);
  console.log('[EPUB] Metadata:', metadata);
  
  const manifest = parseManifest(opfContent);
  console.log('[EPUB] Manifest has', manifest.size, 'items');
  
  if (manifest.size === 0) {
    throw new Error('Invalid EPUB: manifest is empty or cannot be parsed');
  }
  
  const spine = parseSpine(opfContent);
  console.log('[EPUB] Spine has', spine.length, 'items');
  
  if (spine.length === 0) {
    throw new Error('Invalid EPUB: spine is empty or cannot be parsed - cannot determine reading order');
  }
  
  for (const spineItem of spine) {
    const manifestItem = manifest.get(spineItem.id);
    if (manifestItem) {
      spineItem.href = manifestItem.href;
    }
  }
  
  const toc = await extractTOC(zip, opfContent, opfPath, manifest);
  
  const settings: EPUBExtractionSettings = {
    skipNonLinear: options?.skipNonLinear ?? true,
    includeImageAlt: options?.includeImageAlt ?? true,
    respectAriaHidden: options?.respectAriaHidden ?? false,
  };
  
  let text: string;
  let chapters: EPUBChapterInfo[];
  try {
    const result = await extractTextFromSpine(
      zip,
      spine,
      manifest,
      opfPath,
      toc,
      settings
    );
    text = result.text;
    chapters = result.chapters;
  } catch (extractError) {
    console.error('[EPUB] Text extraction failed:', extractError);
    throw new Error(`Failed to extract text from EPUB: ${extractError instanceof Error ? extractError.message : 'Unknown error'}`);
  }
  
  if (text.trim().length < MIN_TEXT_CHARS) {
    const isFXL = opfContent.includes('rendition:layout') && 
                  (opfContent.includes('pre-paginated') || opfContent.includes('fixed-layout'));
    
    if (isFXL) {
      throw new Error('This EPUB appears to be fixed-layout with no text layer. Image-only pages aren\'t supported.');
    }
    
    throw new Error('This EPUB doesn\'t contain extractable text (may render text with scripts or images only).');
  }
  
  console.log('[EPUB] Extraction complete:', text.length, 'chars,', chapters.length, 'chapters');
  
  const hasRTL = opfContent.includes('page-progression-direction="rtl"') ||
                 opfContent.includes('rtl');
  if (hasRTL) {
    warnings.push('This EPUB contains right-to-left text. Display may not be fully optimized.');
  }
  
  return {
    text: text.trim(),
    chapters,
    title: metadata.title,
    author: metadata.author,
    warnings,
  };
}
