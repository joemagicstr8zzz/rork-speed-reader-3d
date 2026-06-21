export const calculateContrast = (hexColor1: string, hexColor2: string): number => {
  const getLuminance = (hex: string): number => {
    const rgb = hexToRgb(hex);
    const [r, g, b] = rgb.map(val => {
      const normalized = val / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const lum1 = getLuminance(hexColor1);
  const lum2 = getLuminance(hexColor2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
};

export const hexToRgb = (hex: string): [number, number, number] => {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return [r, g, b];
};

export const rgbToHex = (r: number, g: number, b: number): string => {
  const toHex = (n: number) => {
    const hex = Math.round(n).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const getContrastColor = (hexColor: string): string => {
  const [r, g, b] = hexToRgb(hexColor);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
};

export const adjustColorBrightness = (hex: string, percent: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const adjust = (val: number) => Math.min(255, Math.max(0, val + (val * percent) / 100));
  return rgbToHex(adjust(r), adjust(g), adjust(b));
};

export const meetsContrastThreshold = (
  bgColor: string,
  textColor: string,
  threshold = 4.5
): boolean => {
  return calculateContrast(bgColor, textColor) >= threshold;
};

export const getShadowColor = (
  baseColor: string,
  intensity: number
): string => {
  const alpha = (intensity / 100) * 0.8;
  const [r, g, b] = hexToRgb(baseColor);
  const darken = (val: number) => Math.max(0, val * 0.3);
  const shadowR = darken(r);
  const shadowG = darken(g);
  const shadowB = darken(b);
  
  return `rgba(${Math.round(shadowR)}, ${Math.round(shadowG)}, ${Math.round(shadowB)}, ${alpha})`;
};

export const getGlossColor = (baseColor: string): string => {
  return adjustColorBrightness(baseColor, 30);
};
