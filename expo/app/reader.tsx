import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Eye, Glasses, Pause, Play } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { appTheme } from '@/constants/colors';
import { useDocuments } from '@/contexts/DocumentContext';
import { useSettings } from '@/contexts/SettingsContext';
import { ReadingMode } from '@/types/document';
import { createChunks, getBackgroundStyle, getFontFamily, getContrastColor } from '@/utils/rsvpEngine';
import { getBackgroundComponent } from '@/utils/backgroundRenderer';
import { meetsContrastThreshold } from '@/utils/colorUtils';

export default function ReaderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { documents, updateDocument } = useDocuments();
  const { settings, updateSettings } = useSettings();

  const documentId = params.documentId as string;
  const document = useMemo(() => documents.find(d => d.id === documentId), [documents, documentId]);

  const [mode, setMode] = useState<ReadingMode>(document?.lastMode || '2D');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(document?.progress.chunkIndex || 0);
  const [showControls, setShowControls] = useState<boolean>(true);

  const chunks = useMemo(() => {
    if (!document || !document.isReadable) {
      return [];
    }
    return createChunks(document.content, settings.chunkSize);
  }, [document, settings.chunkSize]);

  const rafIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedIndexRef = useRef<number>(0);
  const latestPersistedIndexRef = useRef<number>(document?.progress.chunkIndex ?? 0);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bgStyle = useMemo(() => {
    console.log('[Reader] Computing bgStyle:', {
      theme: settings.backgroundTheme,
      bgType: settings.background.type,
      customBg: settings.customBackgroundColor,
      gradientColors: settings.background.gradientColors,
      patternColor: settings.background.patternColor,
    });

    if (settings.backgroundTheme === 'custom' && settings.background.type === 'gradient') {
      const firstColor = settings.background.gradientColors[0] || '#000000';
      return {
        backgroundColor: 'transparent',
        textColor: getContrastColor(firstColor)
      };
    }
    if (settings.backgroundTheme === 'custom' && settings.background.type === 'pattern') {
      return {
        backgroundColor: settings.customBackgroundColor,
        textColor: getContrastColor(settings.customBackgroundColor)
      };
    }
    return getBackgroundStyle(settings.backgroundTheme, settings.customBackgroundColor);
  }, [settings.backgroundTheme, settings.customBackgroundColor, settings.background]);

  const backgroundComponent = useMemo(() => getBackgroundComponent(settings), [settings]);

  const containerBgColor = useMemo(() => {
    if (backgroundComponent) {
      if (settings.background.type === 'pattern') {
        return settings.customBackgroundColor;
      }
      return 'transparent';
    }
    return bgStyle.backgroundColor;
  }, [backgroundComponent, bgStyle.backgroundColor, settings.background.type, settings.customBackgroundColor]);



  const contrastWarning = useMemo(() => {
    if (settings.backgroundTheme === 'custom') {
      return !meetsContrastThreshold(settings.customBackgroundColor, bgStyle.textColor);
    }
    return false;
  }, [settings.backgroundTheme, settings.customBackgroundColor, bgStyle.textColor]);

  const triggerReaderFeedback = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
  }, []);

  const conversionSummary = useMemo(() => {
    if (!document) return null;
    if (!document.isReadable) {
      return document.unreadableReason ?? `This ${document.format} document does not contain readable text.`;
    }
    if (document.conversionWarnings && document.conversionWarnings.length > 0) {
      return document.conversionWarnings[0];
    }
    return null;
  }, [document]);

  useEffect(() => {
    if (!document) {
      setIsPlaying(false);
      return;
    }
    setMode(document.lastMode);
    if (document.isReadable) {
      setCurrentChunkIndex(document.progress.chunkIndex);
      pausedIndexRef.current = document.progress.chunkIndex;
    } else {
      setCurrentChunkIndex(0);
      pausedIndexRef.current = 0;
      setIsPlaying(false);
    }
  }, [document]);

  const persistProgress = useCallback(async (index: number) => {
    if (!document || !document.isReadable || index === latestPersistedIndexRef.current) return;
    latestPersistedIndexRef.current = index;
    try {
      await updateDocument(document.id, {
        progress: { ...document.progress, chunkIndex: index },
        lastMode: mode,
      });
    } catch (error) {
      console.error('[Reader] Failed to persist progress', error);
    }
  }, [document, updateDocument, mode]);

  const stopPlayback = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    startTimeRef.current = 0;
  }, []);

  const playbackLoop = useCallback((timestamp: number) => {
    if (startTimeRef.current === 0) {
      startTimeRef.current = timestamp;
    }

    const elapsed = timestamp - startTimeRef.current;
    const msPerWord = (60 / settings.wpm) * 1000;
    const targetIndex = pausedIndexRef.current + Math.floor(elapsed / (msPerWord * settings.chunkSize));

    if (targetIndex >= chunks.length) {
      console.log('[Reader] Reached end of document');
      setIsPlaying(false);
      setCurrentChunkIndex(chunks.length - 1);
      void persistProgress(chunks.length - 1);
      stopPlayback();
      return;
    }

    setCurrentChunkIndex(targetIndex);

    if (targetIndex % 20 === 0 && targetIndex !== pausedIndexRef.current) {
      void persistProgress(targetIndex);
    }

    rafIdRef.current = requestAnimationFrame(playbackLoop);
  }, [settings.wpm, settings.chunkSize, chunks.length, stopPlayback, persistProgress]);

  useEffect(() => {
    if (isPlaying) {
      console.log('[Reader] Starting playback at chunk', pausedIndexRef.current, 'WPM', settings.wpm);
      startTimeRef.current = 0;
      rafIdRef.current = requestAnimationFrame(playbackLoop);
    } else {
      stopPlayback();
      void persistProgress(currentChunkIndex);
      pausedIndexRef.current = currentChunkIndex;
    }

    return () => {
      stopPlayback();
    };
  }, [isPlaying, playbackLoop, stopPlayback, persistProgress, currentChunkIndex]);

  useEffect(() => {
    if (isPlaying) {
      stopPlayback();
      pausedIndexRef.current = currentChunkIndex;
      startTimeRef.current = 0;
      rafIdRef.current = requestAnimationFrame(playbackLoop);
    }
  }, [settings.wpm, isPlaying, stopPlayback, currentChunkIndex, playbackLoop]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  const handlePlayPause = useCallback(() => {
    triggerReaderFeedback();
    setIsPlaying(!isPlaying);
  }, [isPlaying, triggerReaderFeedback]);

  const handleJump = useCallback((amount: number) => {
    triggerReaderFeedback();
    const newIndex = Math.max(0, Math.min(currentChunkIndex + amount, chunks.length - 1));
    setCurrentChunkIndex(newIndex);
    pausedIndexRef.current = newIndex;
    void persistProgress(newIndex);
  }, [currentChunkIndex, chunks.length, persistProgress, triggerReaderFeedback]);

  const adjustWPM = useCallback((delta: number) => {
    triggerReaderFeedback();
    const newWPM = Math.max(50, Math.min(1200, settings.wpm + delta));
    updateSettings({ wpm: newWPM });
  }, [settings.wpm, updateSettings, triggerReaderFeedback]);

  const adjustWordSpacing = useCallback((delta: number) => {
    triggerReaderFeedback();
    const newSpacing = Math.max(0, Math.min(50, settings.threeD.wordSpacing + delta));
    updateSettings({ threeD: { ...settings.threeD, wordSpacing: newSpacing } });
  }, [settings.threeD, updateSettings, triggerReaderFeedback]);



  const toggleMode = useCallback(() => {
    triggerReaderFeedback();
    const newMode: ReadingMode = mode === '2D' ? '3D' : '2D';
    setMode(newMode);
    if (document) {
      void updateDocument(document.id, { lastMode: newMode });
    }
  }, [mode, document, updateDocument, triggerReaderFeedback]);

  const handleScreenPress = useCallback(() => {
    setShowControls(prev => !prev);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  if (!document) {
    return (
      <View style={[styles.container, { backgroundColor: containerBgColor }]} testID="reader-document-missing">
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={bgStyle.textColor} />
          </Pressable>
        </View>
        <View style={styles.centerMessage}>
          <Text style={[styles.messageHeading, { color: bgStyle.textColor }]}>Document not found</Text>
          <Text style={[styles.messageBody, { color: bgStyle.textColor }]}>Return to your library and pick another file</Text>
        </View>
      </View>
    );
  }

  if (!document.isReadable) {
    return (
      <View style={[styles.container, { backgroundColor: containerBgColor }]} testID="reader-document-unreadable">
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={bgStyle.textColor} />
          </Pressable>
        </View>
        <View style={styles.centerMessage}>
          <Text style={[styles.formatBadge, { color: bgStyle.textColor }]}>{document.format}</Text>
          <Text style={[styles.messageHeading, { color: bgStyle.textColor }]} testID="unreadable-message">
            {document.unreadableReason ?? 'No readable text found in this document.'}
          </Text>
          {conversionSummary && (
            <Text style={[styles.messageBody, { color: bgStyle.textColor }]}>{conversionSummary}</Text>
          )}
        </View>
      </View>
    );
  }

  if (chunks.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: containerBgColor }]} testID="reader-document-empty">
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={bgStyle.textColor} />
          </Pressable>
        </View>
        <View style={styles.centerMessage}>
          <Text style={[styles.messageHeading, { color: bgStyle.textColor }]}>Nothing to read</Text>
          <Text style={[styles.messageBody, { color: bgStyle.textColor }]}>This document does not contain readable text</Text>
        </View>
      </View>
    );
  }

  const currentChunk = chunks[Math.min(currentChunkIndex, chunks.length - 1)] || chunks[0];
  const progress = chunks.length > 0 ? (currentChunkIndex / chunks.length) * 100 : 0;
  const progressLabel = `${Math.round(progress)}%`;
  const isLandscape = width > height;
  const scaleFactor = isLandscape ? 0.7 : 1;

  return (
    <Pressable style={[styles.container, { backgroundColor: containerBgColor }]} onPress={handleScreenPress}>
      {backgroundComponent}
      {showControls && (
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={bgStyle.textColor} />
          </Pressable>
          <View style={styles.readerHeaderMeta}>
            <Text style={[styles.readerHeaderEyebrow, { color: bgStyle.textColor }]}>Now reading</Text>
            <Text style={[styles.readerHeaderTitle, { color: bgStyle.textColor }]} numberOfLines={1}>{document.title}</Text>
          </View>
          <View style={styles.modeToggle}>
            <Pressable
              onPress={toggleMode}
              style={[styles.modeButton, mode === '2D' && styles.modeButtonActive]}
            >
              <Eye size={18} color={mode === '2D' ? '#FFFFFF' : bgStyle.textColor} />
            </Pressable>
            <Pressable
              onPress={toggleMode}
              style={[styles.modeButton, mode === '3D' && styles.modeButtonActive]}
            >
              <Glasses size={18} color={mode === '3D' ? '#FFFFFF' : bgStyle.textColor} />
            </Pressable>
          </View>
        </View>
      )}

      <View style={[styles.readerArea, isLandscape && { paddingHorizontal: 16 }]}>
        {mode === '2D' ? (
          <View style={styles.textContainer}>
            <View style={styles.focusHalo} />
            <Text
              style={[
                styles.textDisplay,
                {
                  color: bgStyle.textColor,
                  fontSize: settings.fontSize * scaleFactor,
                  fontFamily: getFontFamily(settings.fontFamily),
                }
              ]}
            >
              {currentChunk.words.map((word, index) => {
                const isORP = index === Math.floor(currentChunk.words.length / 2) && currentChunk.orpIndex < word.length;

                if (isORP) {
                  const orpPos = currentChunk.orpIndex;
                  return (
                    <Text key={index}>
                      {word.substring(0, orpPos)}
                      <Text style={styles.orpHighlight}>{word[orpPos]}</Text>
                      {word.substring(orpPos + 1)}
                      {index < currentChunk.words.length - 1 ? ' ' : ''}
                    </Text>
                  );
                }

                return <Text key={index}>{word}{index < currentChunk.words.length - 1 ? ' ' : ''}</Text>;
              })}
            </Text>
          </View>
        ) : (
          <View style={styles.stereoContainer}>
            <View style={[styles.stereoEye, { marginRight: (settings.threeD.depth / 2) * scaleFactor }]}>
              <Text
                style={[
                  styles.textDisplay,
                  {
                    color: bgStyle.textColor,
                    fontSize: settings.fontSize * scaleFactor,
                    fontFamily: getFontFamily(settings.fontFamily),
                    opacity: settings.threeD.ghostAlpha,
                  }
                ]}
              >
                {currentChunk.words.map((word, idx) => (
                  <Text key={idx}>
                    {word}
                    {idx < currentChunk.words.length - 1 ? ' '.repeat(Math.floor(settings.threeD.wordSpacing / 2) + 1) : ''}
                  </Text>
                ))}
              </Text>
            </View>
            <View style={[styles.stereoEye, { marginLeft: (settings.threeD.depth / 2) * scaleFactor }]}>
              <Text
                style={[
                  styles.textDisplay,
                  {
                    color: bgStyle.textColor,
                    fontSize: settings.fontSize * scaleFactor,
                    fontFamily: getFontFamily(settings.fontFamily),
                  }
                ]}
              >
                {currentChunk.words.map((word, idx) => (
                  <Text key={idx}>
                    {word}
                    {idx < currentChunk.words.length - 1 ? ' '.repeat(Math.floor(settings.threeD.wordSpacing / 2) + 1) : ''}
                  </Text>
                ))}
              </Text>
            </View>
          </View>
        )}
      </View>

      {showControls && (
        <View style={[styles.controls, { marginBottom: insets.bottom + (isLandscape ? 8 : 16), marginHorizontal: isLandscape ? 16 : 20 }]}>
          {contrastWarning && (
            <View style={styles.contrastWarning}>
              <Text style={styles.contrastWarningText}>⚠️ Low contrast detected</Text>
            </View>
          )}
          <View style={styles.progressInfo}>
            <View>
              <Text style={styles.progressKicker}>Session progress</Text>
              <Text style={styles.progressText}>{currentChunkIndex + 1} / {chunks.length} chunks</Text>
            </View>
            <View style={styles.speedPill}>
              <Text style={styles.speedPillText}>{settings.wpm} WPM</Text>
            </View>
          </View>

          <View style={styles.progressBarContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressPercent}>{progressLabel}</Text>
          </View>

          <View style={styles.playbackControls}>
            <Pressable onPress={() => handleJump(-10)} style={[styles.jumpButton, isLandscape && { width: 40, height: 40 }]}>
              <Text style={[styles.jumpText, { color: bgStyle.textColor, fontSize: isLandscape ? 12 : 15 }]}>-10</Text>
            </Pressable>

            <Pressable onPress={handlePlayPause} style={[styles.playButton, isLandscape && { width: 48, height: 48 }]}>
              {isPlaying ? (
                <Pause size={isLandscape ? 20 : 28} color="#FFFFFF" fill="#FFFFFF" />
              ) : (
                <Play size={isLandscape ? 20 : 28} color="#FFFFFF" fill="#FFFFFF" />
              )}
            </Pressable>

            <Pressable onPress={() => handleJump(10)} style={[styles.jumpButton, isLandscape && { width: 40, height: 40 }]}>
              <Text style={[styles.jumpText, { color: bgStyle.textColor, fontSize: isLandscape ? 12 : 15 }]}>+10</Text>
            </Pressable>
          </View>

          <View style={styles.settingsControls}>
            <Pressable onPress={() => adjustWPM(-50)} style={[styles.adjButton, isLandscape && { paddingHorizontal: 16, paddingVertical: 8 }]}>
              <Text style={[styles.adjText, { color: bgStyle.textColor, fontSize: isLandscape ? 12 : 14 }]}>-50</Text>
            </Pressable>
            <Pressable onPress={() => adjustWPM(50)} style={[styles.adjButton, isLandscape && { paddingHorizontal: 16, paddingVertical: 8 }]}>
              <Text style={[styles.adjText, { color: bgStyle.textColor, fontSize: isLandscape ? 12 : 14 }]}>+50</Text>
            </Pressable>
          </View>

          {mode === '3D' && (
            <View style={styles.spacingControls}>
              <Text style={[styles.spacingLabel, { color: bgStyle.textColor, fontSize: isLandscape ? 10 : 12 }]}>Word Spacing</Text>
              <View style={styles.spacingButtons}>
                <Pressable onPress={() => adjustWordSpacing(-5)} style={[styles.adjButton, isLandscape && { paddingHorizontal: 16, paddingVertical: 8 }]}>
                  <Text style={[styles.adjText, { color: bgStyle.textColor, fontSize: isLandscape ? 12 : 14 }]}>-5</Text>
                </Pressable>
                <Text style={[styles.spacingValue, { color: bgStyle.textColor, fontSize: isLandscape ? 13 : 16 }]}>{settings.threeD.wordSpacing}</Text>
                <Pressable onPress={() => adjustWordSpacing(5)} style={[styles.adjButton, isLandscape && { paddingHorizontal: 16, paddingVertical: 8 }]}>
                  <Text style={[styles.adjText, { color: bgStyle.textColor, fontSize: isLandscape ? 12 : 14 }]}>+5</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 16,
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  readerHeaderMeta: {
    flex: 1,
    minWidth: 0,
  },
  readerHeaderEyebrow: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.4,
    opacity: 0.55,
    textTransform: 'uppercase',
  },
  readerHeaderTitle: {
    fontSize: 15,
    fontWeight: '800' as const,
    marginTop: 2,
    opacity: 0.92,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  modeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  modeButtonActive: {
    backgroundColor: appTheme.colors.blueDeep,
  },
  centerMessage: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  formatBadge: {
    fontSize: 11,
    fontWeight: '600' as const,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  messageHeading: {
    fontSize: 20,
    fontWeight: '700' as const,
    textAlign: 'center',
    lineHeight: 28,
  },
  messageBody: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.75,
    maxWidth: 300,
  },
  readerArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  textContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 220,
    minHeight: 160,
  },
  focusHalo: {
    position: 'absolute',
    width: 240,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(84, 168, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.08)',
  },
  stereoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stereoEye: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textDisplay: {
    textAlign: 'center',
    fontWeight: '600' as const,
    letterSpacing: 0.3,
  },
  orpHighlight: {
    fontWeight: '800' as const,
    textDecorationLine: 'underline',
  },
  controls: {
    gap: 14,
    padding: 16,
    borderRadius: 28,
    backgroundColor: 'rgba(6, 17, 31, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.13)',
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressKicker: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: appTheme.colors.cyan,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: appTheme.colors.text,
  },
  speedPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(94, 234, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.24)',
  },
  speedPillText: {
    fontSize: 12,
    fontWeight: '900' as const,
    color: appTheme.colors.cyan,
  },
  progressBarContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressBar: {
    flex: 1,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: appTheme.colors.cyan,
    borderRadius: 999,
  },
  progressPercent: {
    width: 42,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '900' as const,
    color: appTheme.colors.cyan,
  },
  playbackControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  playButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: appTheme.colors.blueDeep,
    shadowColor: appTheme.shadows.glowBlue,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 10,
  },
  jumpButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  jumpText: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  settingsControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  adjButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    minWidth: 80,
    alignItems: 'center',
  },
  adjText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  contrastWarning: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 153, 0, 0.2)',
    borderRadius: 8,
    marginBottom: 12,
  },
  contrastWarningText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#FF9900',
    textAlign: 'center',
  },
  spacingControls: {
    paddingTop: 4,
    gap: 6,
    alignItems: 'center',
  },
  spacingLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    opacity: 0.7,
  },
  spacingButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  spacingValue: {
    fontSize: 16,
    fontWeight: '700' as const,
    minWidth: 40,
    textAlign: 'center',
  },
});
