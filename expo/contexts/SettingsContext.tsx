import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Settings } from '@/types/document';

const SETTINGS_KEY = '@fluxread_settings';

const DEFAULT_SETTINGS: Settings = {
  wpm: 300,
  chunkSize: 1,
  fontFamily: 'sans',
  fontSize: 32,
  backgroundTheme: 'dark',
  customBackgroundColor: '#000000',
  customTextColor: '#FFFFFF',
  orpStrength: 0.3,
  threeD: {
    defaultStyle: 'cross',
    depth: 80,
    ghostAlpha: 0.3,
    fusionGuide: false,
    wordSpacing: 0,
  },
  background: {
    type: 'solid',
    gradientType: 'linear',
    gradientColors: ['#1a1a2e', '#16213e'],
    gradientAngle: 135,
    patternType: 'dots',
    patternScale: 100,
    patternOpacity: 30,
    patternColor: '#4A9EFF',
    customPatternUrl: '',
  },
  pdf: {
    perPageOcrFallback: true,
    minCharsPerPage: 20,
    ocrLanguage: 'en',
    ocrEnhanceText: true,
  },
  epub: {
    skipNonLinear: true,
    includeImageAlt: true,
    respectAriaHidden: false,
  },
};

export const [SettingsProvider, useSettings] = createContextHook(() => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const loadSettings = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({
          ...DEFAULT_SETTINGS,
          ...parsed,
          background: {
            ...DEFAULT_SETTINGS.background,
            ...(parsed.background || {}),
          },
          threeD: {
            ...DEFAULT_SETTINGS.threeD,
            ...(parsed.threeD || {}),
          },
          pdf: {
            ...DEFAULT_SETTINGS.pdf,
            ...(parsed.pdf || {}),
          },
          epub: {
            ...DEFAULT_SETTINGS.epub,
            ...(parsed.epub || {}),
          },
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, []);

  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    setSettings((prev) => {
      const newSettings = { 
        ...prev, 
        ...updates,
        background: {
          ...prev.background,
          ...(updates.background || {}),
        },
        threeD: {
          ...prev.threeD,
          ...(updates.threeD || {}),
        },
        pdf: {
          ...prev.pdf,
          ...(updates.pdf || {}),
        },
        epub: {
          ...prev.epub,
          ...(updates.epub || {}),
        },
      };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings))
        .catch((error) => console.error('Failed to save settings:', error));
      return newSettings;
    });
  }, []);

  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return useMemo(() => ({
    settings,
    updateSettings,
    resetSettings,
  }), [settings, updateSettings, resetSettings]);
});
