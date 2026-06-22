import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Bookmark, BookmarkCheck, Eye, Glasses, Pause, Play } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { appTheme } from '@/constants/colors';
import { useDocuments } from '@/contexts/DocumentContext';
import { useSettings } from '@/contexts/SettingsContext';
import { ReadingMode } from '@/types/document';
import { createChunks, getBackgroundStyle, getFontFamily, getContrastColor, wordSpacingToLetterSpacing } from '@/utils/rsvpEngine';
import { getBackgroundComponent } from '@/utils/backgroundRenderer';
import { meetsContrastThreshold } from '@/utils/colorUtils';

const SWIPE_THRESHOLD = 30;
const TAP_THRESHOLD = 8;
const DOUBLE_TAP_DELAY = 350;

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
  const [isDraggingProgress, setIsDraggingProgress] = useState<boolean>(false);
  const [dragChunkIndex, setDragChunkIndex] = useState<number>(0);

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
  const isPlayingRef = useRef<boolean>(false);
  const lastTapTimeRef = useRef<number>(0);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const bookmarks = useMemo(() => document?.progress.bookmarks ?? [], [document]);

  const isLandscape = width > height;
  const scaleFactor = isLandscape ? 0.7 : 1;

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const bgStyle = useMemo(() => {
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

  const triggerMediumFeedback = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
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

  const initialChunkIndex = useMemo(() => {
    const raw = params.initialChunkIndex as string | undefined;
    if (raw !== undefined) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
    return undefined;
  }, [params.initialChunkIndex]);

  useEffect(() => {
    if (!document) {
      setIsPlaying(false);
      return;
    }
    setMode(document.lastMode);
    if (document.isReadable) {
      const startIndex = initialChunkIndex !== undefined
        ? Math.min(initialChunkIndex, Math.max(0, chunks.length - 1))
        : document.progress.chunkIndex;
      setCurrentChunkIndex(startIndex);
      pausedIndexRef.current = startIndex;
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
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if ((nextState === 'background' || nextState === 'inactive') && isPlayingRef.current) {
        setIsPlaying(false);
      }
    });
    return () => sub.remove();
  }, []);

  const handlePlayPause = useCallback(() => {
    triggerMediumFeedback();
    setIsPlaying(!isPlaying);
  }, [isPlaying, triggerMediumFeedback]);

  const handleJump = useCallback((amount: number) => {
    triggerReaderFeedback();
    const newIndex = Math.max(0, Math.min(currentChunkIndex + amount, chunks.length - 1));
    setCurrentChunkIndex(newIndex);
    pausedIndexRef.current = newIndex;
    void persistProgress(newIndex);
  }, [currentChunkIndex, chunks.length, persistProgress, triggerReaderFeedback]);

  const handleSeekTo = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, chunks.length - 1));
    setCurrentChunkIndex(clamped);
    pausedIndexRef.current = clamped;
    void persistProgress(clamped);
    if (isPlaying) {
      stopPlayback();
      startTimeRef.current = 0;
      rafIdRef.current = requestAnimationFrame(playbackLoop);
    }
  }, [chunks.length, isPlaying, persistProgress, stopPlayback, playbackLoop]);

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

  const toggleBookmark = useCallback(async () => {
    if (!document) return;
    triggerMediumFeedback();
    const currentBookmarks = [...bookmarks];
    const idx = currentBookmarks.indexOf(currentChunkIndex);
    if (idx === -1) {
      currentBookmarks.push(currentChunkIndex);
      currentBookmarks.sort((a, b) => a - b);
    } else {
      currentBookmarks.splice(idx, 1);
    }
    await updateDocument(document.id, {
      progress: { ...document.progress, bookmarks: currentBookmarks },
    });
  }, [document, bookmarks, currentChunkIndex, updateDocument, triggerMediumFeedback]);

  const isBookmarked = useMemo(() => bookmarks.includes(currentChunkIndex), [bookmarks, currentChunkIndex]);

  const showControlsWithTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = setTimeout(() => {
      if (isPlayingRef.current) setShowControls(false);
    }, 4000);
  }, []);

  const readerPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) => {
      return Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5;
    },
    onPanResponderGrant: (evt) => {
      touchStartPosRef.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
    },
    onPanResponderRelease: (evt, gs) => {
      const { dx, dy } = gs;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx < TAP_THRESHOLD && absDy < TAP_THRESHOLD) {
        const now = Date.now();
        const timeSinceLastTap = now - lastTapTimeRef.current;

        if (timeSinceLastTap < DOUBLE_TAP_DELAY) {
          if (tapTimeoutRef.current) {
            clearTimeout(tapTimeoutRef.current);
            tapTimeoutRef.current = null;
          }
          handlePlayPause();
          lastTapTimeRef.current = 0;
          return;
        }

        lastTapTimeRef.current = now;
        if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);

        tapTimeoutRef.current = setTimeout(() => {
          setShowControls(prev => {
            const next = !prev;
            if (next) {
              controlsTimerRef.current = setTimeout(() => {
                if (isPlayingRef.current) setShowControls(false);
              }, 4000);
            } else if (controlsTimerRef.current) {
              clearTimeout(controlsTimerRef.current);
            }
            return next;
          });
          tapTimeoutRef.current = null;
        }, DOUBLE_TAP_DELAY);
      } else if (absDx > absDy && absDx > SWIPE_THRESHOLD) {
        triggerReaderFeedback();
        const jump = dx > 0 ? -5 : 5;
        handleJump(jump);
      } else if (absDy > absDx && absDy > SWIPE_THRESHOLD) {
        triggerMediumFeedback();
        const delta = dy > 0 ? -50 : 50;
        adjustWPM(delta);
      }
    },
  }), [handlePlayPause, handleJump, adjustWPM, triggerReaderFeedback, triggerMediumFeedback]);

  const progressPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const progressBarWidth = width - (isLandscape ? 32 : 40) - 52;
      const touchX = evt.nativeEvent.locationX;
      const pct = Math.max(0, Math.min(1, (touchX - 8) / progressBarWidth));
      const idx = Math.round(pct * (chunks.length - 1));
      setDragChunkIndex(idx);
      setIsDraggingProgress(true);
      triggerReaderFeedback();
    },
    onPanResponderMove: (evt) => {
      const progressBarWidth = width - (isLandscape ? 32 : 40) - 52;
      const touchX = evt.nativeEvent.locationX;
      const pct = Math.max(0, Math.min(1, (touchX - 8) / progressBarWidth));
      const idx = Math.round(pct * (chunks.length - 1));
      setDragChunkIndex(idx);
    },
    onPanResponderRelease: () => {
      setIsDraggingProgress(false);
      triggerMediumFeedback();
      handleSeekTo(dragChunkIndex);
    },
  }), [chunks.length, width, isLandscape, dragChunkIndex, handleSeekTo, triggerReaderFeedback, triggerMediumFeedback]);

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
  const displayIndex = isDraggingProgress ? dragChunkIndex : currentChunkIndex;
  const dragProgress = chunks.length > 0 ? (dragChunkIndex / chunks.length) * 100 : 0;

  return (
    <View style={[styles.container, { backgroundColor: containerBgColor }]}>
      {backgroundComponent}

      <View
        style={styles.readerGestureArea}
        {...readerPanResponder.panHandlers}
      >
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
          {(() => {
            const ls = wordSpacingToLetterSpacing(settings.threeD.wordSpacing, settings.fontSize * scaleFactor);
            const displayFontSize = settings.fontSize * scaleFactor;
            const fontFamily = getFontFamily(settings.fontFamily);
            const depthPx = (settings.threeD.depth / 2) * scaleFactor;

            if (mode === '2D') {
              const orpWordIdx = Math.floor(currentChunk.words.length / 2);
              const orpWord = currentChunk.words[orpWordIdx] || '';
              const orpPos = currentChunk.orpIndex;
              const orpInBounds = orpPos < orpWord.length;

              return (
                <View style={styles.textContainer}>
                  <View style={styles.focusHalo} />
                  <View style={styles.textRow}>
                    <Text
                      style={[
                        styles.contextWordLeft,
                        { color: bgStyle.textColor, fontSize: displayFontSize * 0.5, fontFamily, letterSpacing: ls },
                      ]}
                      numberOfLines={1}
                    >
                      {(currentChunk.words[0] ?? '').substring(0, Math.floor((currentChunk.words[0] ?? '').length / 3))}
                    </Text>
                    <Text
                      style={[
                        styles.textDisplay,
                        { color: bgStyle.textColor, fontSize: displayFontSize, fontFamily, letterSpacing: ls },
                      ]}
                    >
                      {currentChunk.words.map((word, index) => {
                        const isORP = index === orpWordIdx && orpInBounds;

                        if (isORP) {
                          return (
                            <Text key={index}>
                              <Text style={[styles.orpPre, { color: bgStyle.textColor, opacity: 0.55 }]}>{word.substring(0, orpPos)}</Text>
                              <Text style={styles.orpHighlight}>{word[orpPos]}</Text>
                              <Text style={[styles.orpPost, { color: bgStyle.textColor, opacity: 0.65 }]}>{word.substring(orpPos + 1)}</Text>
                              {index < currentChunk.words.length - 1 ? ' ' : ''}
                            </Text>
                          );
                        }

                        return <Text key={index}>{word}{index < currentChunk.words.length - 1 ? ' ' : ''}</Text>;
                      })}
                    </Text>
                    <Text
                      style={[
                        styles.contextWordRight,
                        { color: bgStyle.textColor, fontSize: displayFontSize * 0.5, fontFamily, letterSpacing: ls },
                      ]}
                      numberOfLines={1}
                    >
                      {(currentChunk.words[currentChunk.words.length - 1] ?? '').substring(
                        Math.floor((currentChunk.words[currentChunk.words.length - 1] ?? '').length * 0.6)
                      )}
                    </Text>
                  </View>
                </View>
              );
            }

            // 3D Mode: two halves, text centered within each half
            return (
              <View style={styles.stereoContainer}>
                <View style={[styles.stereoHalf, { paddingRight: depthPx }]}>
                  <Text
                    style={[
                      styles.textDisplay,
                      styles.stereoHalfText,
                      { color: bgStyle.textColor, fontSize: displayFontSize, fontFamily, letterSpacing: ls, opacity: settings.threeD.ghostAlpha },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit={false}
                  >
                    {currentChunk.words.join(' ')}
                  </Text>
                </View>
                <View style={[styles.stereoHalf, { paddingLeft: depthPx }]}>
                  <Text
                    style={[
                      styles.textDisplay,
                      styles.stereoHalfText,
                      { color: bgStyle.textColor, fontSize: displayFontSize, fontFamily, letterSpacing: ls },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit={false}
                  >
                    {currentChunk.words.join(' ')}
                  </Text>
                </View>
              </View>
            );
          })()}

          {!showControls && isPlaying && (
            <View style={styles.minimalPlayIndicator}>
              <View style={styles.minimalPlayDot} />
            </View>
          )}
        </View>

        {!showControls && !isPlaying && (
          <View style={styles.tapHintContainer}>
            <Text style={[styles.tapHint, { color: bgStyle.textColor }]}>Tap anywhere to continue</Text>
          </View>
        )}

        {showControls && (
          <View style={[styles.controls, { marginBottom: insets.bottom + (isLandscape ? 8 : 16), marginHorizontal: isLandscape ? 16 : 20 }]}>
            {contrastWarning && (
              <View style={styles.contrastWarning}>
                <Text style={styles.contrastWarningText}>Low contrast detected</Text>
              </View>
            )}

            <View style={styles.progressInfo}>
              <View>
                <Text style={styles.progressKicker}>Session progress</Text>
                <Text style={styles.progressText}>
                  {isDraggingProgress ? dragChunkIndex + 1 : currentChunkIndex + 1} / {chunks.length} chunks
                </Text>
              </View>
              <View style={styles.speedPill}>
                <Text style={styles.speedPillText}>{settings.wpm} WPM</Text>
              </View>
            </View>

            <View
              style={[styles.progressBarContainer, isDraggingProgress && styles.progressBarContainerActive]}
              {...progressPanResponder.panHandlers}
            >
              <View style={[styles.progressBar, isDraggingProgress && styles.progressBarActive]}>
                <View style={[styles.progressFill, { width: `${isDraggingProgress ? dragProgress : progress}%` }]} />
                {bookmarks.map((bkIdx) => {
                  const bkPct = chunks.length > 1 ? (bkIdx / chunks.length) * 100 : 0;
                  return (
                    <View
                      key={`bk-${bkIdx}`}
                      style={[styles.bookmarkDot, { left: `${bkPct}%` }]}
                    />
                  );
                })}
                <View
                  style={[
                    styles.progressThumb,
                    { left: `${isDraggingProgress ? dragProgress : progress}%` },
                    isDraggingProgress && styles.progressThumbActive,
                  ]}
                />
              </View>
              <Text style={styles.progressPercent}>{isDraggingProgress ? `${Math.round(dragProgress)}%` : progressLabel}</Text>
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

            <View style={styles.secondaryControls}>
              <Pressable onPress={toggleBookmark} style={[styles.bookmarkButton, isBookmarked && styles.bookmarkButtonActive]}>
                {isBookmarked ? (
                  <BookmarkCheck size={18} color={appTheme.colors.cyan} />
                ) : (
                  <Bookmark size={18} color={bgStyle.textColor} />
                )}
              </Pressable>

              <View style={styles.wpmControls}>
                <Pressable onPress={() => adjustWPM(-50)} style={[styles.adjButton, isLandscape && { paddingHorizontal: 16, paddingVertical: 8 }]}>
                  <Text style={[styles.adjText, { color: bgStyle.textColor, fontSize: isLandscape ? 12 : 14 }]}>-50</Text>
                </Pressable>
                <Pressable onPress={() => adjustWPM(50)} style={[styles.adjButton, isLandscape && { paddingHorizontal: 16, paddingVertical: 8 }]}>
                  <Text style={[styles.adjText, { color: bgStyle.textColor, fontSize: isLandscape ? 12 : 14 }]}>+50</Text>
                </Pressable>
              </View>
            </View>

            {bookmarks.length > 0 && (
              <View style={styles.bookmarkChips}>
                {bookmarks.slice(0, 4).map((bkIdx) => (
                  <Pressable
                    key={`chip-${bkIdx}`}
                    onPress={() => {
                      triggerReaderFeedback();
                      handleSeekTo(bkIdx);
                    }}
                    style={styles.bookmarkChip}
                  >
                    <Bookmark size={10} color={appTheme.colors.cyan} />
                    <Text style={styles.bookmarkChipText}>Chunk {bkIdx + 1}</Text>
                  </Pressable>
                ))}
                {bookmarks.length > 4 && (
                  <View style={styles.bookmarkChip}>
                    <Text style={styles.bookmarkChipText}>+{bookmarks.length - 4} more</Text>
                  </View>
                )}
              </View>
            )}

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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  readerGestureArea: {
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
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  contextWordLeft: {
    opacity: 0.22,
    fontWeight: '400' as const,
    maxWidth: 60,
    textAlign: 'right',
  },
  contextWordRight: {
    opacity: 0.22,
    fontWeight: '400' as const,
    maxWidth: 60,
    textAlign: 'left',
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
    width: '100%',
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stereoHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stereoHalfText: {
    textAlign: 'center',
  },
  textDisplay: {
    textAlign: 'center',
    fontWeight: '600' as const,
    includeFontPadding: false,
  },
  orpPre: {
    fontWeight: '400' as const,
  },
  orpHighlight: {
    fontWeight: '800' as const,
    color: '#5EEAD4',
    backgroundColor: 'rgba(94, 234, 212, 0.12)',
    borderRadius: 3,
    overflow: 'visible',
    paddingHorizontal: 1,
  },
  orpPost: {
    fontWeight: '400' as const,
  },
  minimalPlayIndicator: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimalPlayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: appTheme.colors.cyan,
    opacity: 0.6,
    shadowColor: appTheme.colors.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  tapHintContainer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tapHint: {
    fontSize: 13,
    fontWeight: '600' as const,
    opacity: 0.5,
    letterSpacing: 0.3,
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
    paddingVertical: 8,
    marginVertical: -4,
  },
  progressBarContainerActive: {
    paddingVertical: 6,
  },
  progressBar: {
    flex: 1,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
    overflow: 'visible',
    justifyContent: 'center',
  },
  progressBarActive: {
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: appTheme.colors.cyan,
    borderRadius: 999,
  },
  bookmarkDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: appTheme.colors.amber,
    top: '50%',
    marginTop: -2.5,
    marginLeft: -2.5,
  },
  progressThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    top: '50%',
    marginTop: -7,
    marginLeft: -7,
    borderWidth: 2,
    borderColor: appTheme.colors.cyan,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  progressThumbActive: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginTop: -10,
    marginLeft: -10,
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
  secondaryControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  bookmarkButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  bookmarkButtonActive: {
    backgroundColor: 'rgba(94, 234, 212, 0.16)',
    borderColor: 'rgba(94, 234, 212, 0.32)',
  },
  wpmControls: {
    flexDirection: 'row',
    gap: 10,
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
  bookmarkChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    paddingTop: 2,
  },
  bookmarkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(94, 234, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.18)',
  },
  bookmarkChipText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: appTheme.colors.cyan,
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
