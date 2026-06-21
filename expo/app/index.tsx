import { useRouter, Href } from 'expo-router';
import { Book, Clock3, FileText, Gauge, Paperclip, Plus, PlusCircle, Settings, Sparkles, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { appTheme } from '@/constants/colors';
import { useDocuments } from '@/contexts/DocumentContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Document } from '@/types/document';
import { extractPlainTextFromFile } from '@/utils/documentParser';

type DocumentPickerAsset = DocumentPicker.DocumentPickerAsset;

type ProgressLabel = string;

type ImportResult = {
  text: string;
  sourceFormat: Document['format'];
  warnings: string[];
  isReadable: boolean;
  unreadableReason?: string | null;
};

export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { documents, isLoading, addDocument, deleteDocument } = useDocuments();
  const { settings } = useSettings();

  const [isAttachmentsVisible, setIsAttachmentsVisible] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importingFileName, setImportingFileName] = useState<string>('');

  const readableDocuments = useMemo<Document[]>(() => documents.filter((doc) => doc.isReadable), [documents]);
  const totalWords = useMemo<number>(() => readableDocuments.reduce((sum, doc) => sum + doc.wordCount, 0), [readableDocuments]);
  const nextDocument = useMemo<Document | null>(() => {
    const candidates = readableDocuments
      .filter((doc) => doc.progress.chunkIndex < doc.wordCount)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return candidates[0] ?? readableDocuments[0] ?? null;
  }, [readableDocuments]);

  const attachmentsOpacity = useRef(new Animated.Value(0)).current;
  const attachmentsTranslateY = useRef(new Animated.Value(32)).current;

  const animateAttachmentsIn = useCallback(() => {
    attachmentsOpacity.setValue(0);
    attachmentsTranslateY.setValue(32);
    Animated.parallel([
      Animated.timing(attachmentsOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(attachmentsTranslateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [attachmentsOpacity, attachmentsTranslateY]);

  const animateAttachmentsOut = useCallback((onComplete?: () => void) => {
    Animated.parallel([
      Animated.timing(attachmentsOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(attachmentsTranslateY, {
        toValue: 32,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        onComplete?.();
      }
    });
  }, [attachmentsOpacity, attachmentsTranslateY]);

  useEffect(() => {
    if (isAttachmentsVisible) {
      console.log('[LibraryScreen] Animating attachments panel in');
      animateAttachmentsIn();
    }
  }, [animateAttachmentsIn, isAttachmentsVisible]);

  const triggerLightFeedback = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
  }, []);

  const openAttachments = useCallback(() => {
    if (isAttachmentsVisible) {
      return;
    }
    triggerLightFeedback();
    console.log('[LibraryScreen] Opening attachments panel');
    setIsAttachmentsVisible(true);
  }, [isAttachmentsVisible, triggerLightFeedback]);

  const closeAttachments = useCallback(() => {
    if (!isAttachmentsVisible) {
      return;
    }
    triggerLightFeedback();
    console.log('[LibraryScreen] Closing attachments panel');
    animateAttachmentsOut(() => {
      setIsAttachmentsVisible(false);
    });
  }, [animateAttachmentsOut, isAttachmentsVisible, triggerLightFeedback]);

  const handleAttachmentsToggle = useCallback(() => {
    if (isAttachmentsVisible) {
      closeAttachments();
      return;
    }
    openAttachments();
  }, [closeAttachments, isAttachmentsVisible, openAttachments]);

  const getProgressPercent = useCallback((doc: Document): number => {
    if (doc.wordCount === 0) {
      return 0;
    }
    const totalWordCount = doc.wordCount <= 0 ? 1 : doc.wordCount;
    return Math.max(0, Math.min(100, Math.round((doc.progress.chunkIndex / totalWordCount) * 100)));
  }, []);

  const formatProgress = useCallback((doc: Document): ProgressLabel => `${getProgressPercent(doc)}%`, [getProgressPercent]);

  const formatWordCount = useCallback((count: number): string => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return `${count}`;
  }, []);

  const estimateTimeRemaining = useCallback((doc: Document): string => {
    if (doc.wordCount === 0) {
      return 'N/A';
    }
    const wordsRemaining = Math.max(doc.wordCount - doc.progress.chunkIndex, 0);
    const minutesRemaining = Math.ceil(wordsRemaining / 300);

    if (minutesRemaining < 1) return '<1 min';
    if (minutesRemaining < 60) return `${minutesRemaining} min`;

    const hours = Math.floor(minutesRemaining / 60);
    const mins = minutesRemaining % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }, []);

  const processImportedAsset = useCallback(async (file: DocumentPickerAsset) => {
    let sourceUri: string;
    
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      sourceUri = file.uri;
    } else {
      sourceUri = (file as { fileCopyUri?: string }).fileCopyUri ?? file.uri;
    }
    
    if (!sourceUri) {
      const message = 'File path unavailable. Please try selecting the document again.';
      console.warn('[LibraryScreen] Missing source URI for file', file.name);
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
      return;
    }
    
    console.log('[LibraryScreen] Processing file on', Platform.OS, 'URI:', sourceUri);

    try {
      setIsImporting(true);
      setImportingFileName(file.name);
      console.log('[LibraryScreen] Extracting text from asset', file.name, 'MIME type:', file.mimeType, 'Platform:', Platform.OS);
      const { text, sourceFormat, warnings, isReadable, unreadableReason } = await extractPlainTextFromFile({
        uri: sourceUri,
        fileName: file.name,
        mimeType: file.mimeType,
        size: file.size ?? null,
        lastModified: file.lastModified ?? null,
        base64: file.base64 ?? null,
        pdfOptions: settings.pdf,
      }) as ImportResult;

      const cleanTitle = (file.name ?? 'Untitled Document')
        .replace(/\.(txt|pdf|docx?|epub|mobi|rtf|html?)$/i, '')
        .trim() || 'Untitled Document';

      await addDocument({
        title: cleanTitle,
        sourceFormat,
        content: text,
        isReadable,
        unreadableReason,
        conversionWarnings: warnings,
      });
      console.log('[LibraryScreen] Imported document', cleanTitle, 'format:', sourceFormat, 'readable:', isReadable);

      if (!isReadable) {
        const message = unreadableReason ?? 'This document does not contain readable text.';
        if (Platform.OS === 'web') {
          alert(message);
        } else {
          Alert.alert('Unreadable Document', message);
        }
        return;
      }

      if (warnings.length > 0) {
        const message = warnings.join('\n');
        if (Platform.OS === 'web') {
          alert(message);
        } else {
          Alert.alert('Notice', message);
        }
      }
    } catch (error) {
      console.error('[LibraryScreen] Document conversion error for', file.name, error);
      const message = `Failed to convert document: ${error instanceof Error ? error.message : 'Unknown error'}`;
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setIsImporting(false);
      setImportingFileName('');
    }
  }, [addDocument, settings.pdf]);

  const handleImport = useCallback(async () => {
    triggerLightFeedback();
    console.log('[LibraryScreen] Launching document picker');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/plain',
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
          'application/epub+zip',
          'application/x-mobipocket-ebook',
          'application/rtf',
          'text/rtf',
          'text/html',
        ],
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled) {
        console.log('[LibraryScreen] Document import canceled by user');
        return;
      }

      const assets = result.assets ?? [];
      console.log('[LibraryScreen] Processing', assets.length, 'selected asset(s)');

      if (assets.length === 0) {
        const message = 'No files were selected. Please choose at least one document.';
        if (Platform.OS === 'web') {
          alert(message);
        } else {
          Alert.alert('Import', message);
        }
        return;
      }

      for (const asset of assets) {
        await processImportedAsset(asset);
      }
      closeAttachments();
    } catch (error) {
      console.error('Failed to import document:', error);
      const message = `Failed to import document: ${error instanceof Error ? error.message : 'Unknown error'}`;
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
    }
  }, [processImportedAsset, closeAttachments, triggerLightFeedback]);

  const handleDeleteDocument = useCallback((doc: Document) => {
    console.log('[LibraryScreen] Request to delete document', doc.id);
    const executeDeletion = async () => {
      try {
        await deleteDocument(doc.id);
        console.log('[LibraryScreen] Deleted document', doc.id);
      } catch (error) {
        console.error('[LibraryScreen] Failed to delete document', doc.id, error);
        const message = `Failed to remove "${doc.title}". Please try again.`;
        if (Platform.OS === 'web') {
          alert(message);
        } else {
          Alert.alert('Error', message);
        }
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm(`Remove "${doc.title}" from attachments?`) : true;
      if (confirmed) {
        void executeDeletion();
      }
      return;
    }

    Alert.alert(
      'Remove Book',
      `Remove "${doc.title}" from attachments?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => { void executeDeletion(); } },
      ],
    );
  }, [deleteDocument]);

  const handleOpenDocument = useCallback((doc: Document) => {
    triggerLightFeedback();
    console.log('[LibraryScreen] Opening document', doc.id);
    router.push({
      pathname: '/reader' as Href,
      params: { documentId: doc.id },
    } as never);
  }, [router, triggerLightFeedback]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer} testID="library-loading">
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (isImporting) {
    const fileExtension = importingFileName.split('.').pop()?.toUpperCase() ?? 'FILE';
    return (
      <View style={styles.loadingContainer} testID="library-importing">
        <View style={styles.importingCard}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.importingTitle}>Converting {fileExtension}</Text>
          <Text style={styles.importingSubtitle}>{importingFileName}</Text>
          <Text style={styles.importingNote}>This may take a moment...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[appTheme.colors.ink, '#0B1220', '#111827']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        <View style={styles.auraOne} />
        <View style={styles.auraTwo} />
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <View style={styles.logoMark}>
              <Book size={22} color="#06111F" strokeWidth={2.7} />
            </View>
            <View>
              <Text style={styles.headerKicker}>FluxRead 3D</Text>
              <Text style={styles.headerTitle}>Reading cockpit</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={handleAttachmentsToggle}
              style={({ pressed }) => [
                styles.settingsButton,
                pressed && styles.buttonPressed,
                isAttachmentsVisible && styles.attachmentsButtonActive,
              ]}
              testID="attachments-trigger"
            >
              <View style={styles.attachmentsIconWrapper}>
                <Paperclip size={20} color="#FFFFFF" strokeWidth={2.4} />
                <View style={styles.attachmentsBadge}>
                  <Text style={styles.attachmentsBadgeText}>{documents.length}</Text>
                </View>
              </View>
            </Pressable>
            <Pressable
              onPress={() => {
                triggerLightFeedback();
                router.push('/settings' as Href);
              }}
              style={({ pressed }) => [
                styles.settingsButton,
                pressed && styles.buttonPressed,
              ]}
              testID="settings-button"
            >
              <Settings size={24} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={['rgba(94, 234, 212, 0.18)', 'rgba(84, 168, 255, 0.16)', 'rgba(255, 255, 255, 0.04)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.heroCopy}>
                <View style={styles.heroBadge}>
                  <Sparkles size={14} color={appTheme.colors.cyan} strokeWidth={2.5} />
                  <Text style={styles.heroBadgeText}>Focus engine online</Text>
                </View>
                <Text style={styles.heroTitle}>Read faster without losing the thread.</Text>
                <Text style={styles.heroSubtitle}>Import long documents, then glide through them in 2D or depth-tuned 3D mode.</Text>
              </View>
              <Pressable
                onPress={() => { void handleImport(); }}
                style={({ pressed }) => [styles.heroAction, pressed && styles.heroActionPressed]}
                testID="hero-import-button"
              >
                <Plus size={24} color="#06111F" strokeWidth={3} />
              </Pressable>
            </View>

            <View style={styles.statsRibbon}>
              <View style={styles.statPuck}>
                <FileText size={16} color={appTheme.colors.blue} strokeWidth={2.4} />
                <Text style={styles.statPuckValue}>{documents.length}</Text>
                <Text style={styles.statPuckLabel}>Files</Text>
              </View>
              <View style={styles.statPuck}>
                <Gauge size={16} color={appTheme.colors.cyan} strokeWidth={2.4} />
                <Text style={styles.statPuckValue}>{settings.wpm}</Text>
                <Text style={styles.statPuckLabel}>WPM</Text>
              </View>
              <View style={styles.statPuck}>
                <Clock3 size={16} color={appTheme.colors.amber} strokeWidth={2.4} />
                <Text style={styles.statPuckValue}>{formatWordCount(totalWords)}</Text>
                <Text style={styles.statPuckLabel}>Words</Text>
              </View>
            </View>
          </LinearGradient>

          {nextDocument ? (
            <Pressable
              onPress={() => handleOpenDocument(nextDocument)}
              style={({ pressed }) => [styles.continueCard, pressed && styles.documentCardPressed]}
              testID="continue-reading-card"
            >
              <View style={styles.continueTextWrap}>
                <Text style={styles.continueEyebrow}>Continue reading</Text>
                <Text style={styles.continueTitle} numberOfLines={1}>{nextDocument.title}</Text>
                <Text style={styles.continueMeta}>{formatProgress(nextDocument)} complete · {estimateTimeRemaining(nextDocument)} left</Text>
              </View>
              <View style={styles.continueMeter}>
                <Text style={styles.continuePercent}>{formatProgress(nextDocument)}</Text>
              </View>
            </Pressable>
          ) : null}

          {documents.length === 0 ? (
            <View style={styles.emptyState} testID="library-empty-state">
              <View style={styles.emptyIconShell}>
                <FileText size={46} color={appTheme.colors.cyan} strokeWidth={1.7} />
              </View>
              <Text style={styles.emptyTitle}>Build your reading stack</Text>
              <Text style={styles.emptyText}>
                Add a PDF, EPUB, DOCX, TXT, RTF, or HTML file and FluxRead will prep it for speed reading.
              </Text>
              <Pressable
                onPress={() => { void handleImport(); }}
                style={({ pressed }) => [styles.emptyImportButton, pressed && styles.heroActionPressed]}
              >
                <PlusCircle size={18} color="#06111F" strokeWidth={2.7} />
                <Text style={styles.emptyImportText}>Import first document</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.documentGrid}>
              <View style={styles.sectionHeadingRow}>
                <Text style={styles.sectionHeading}>Library</Text>
                <Text style={styles.sectionCount}>{documents.length} total</Text>
              </View>
              {documents.map((doc) => {
                const progressPercent = getProgressPercent(doc);
                return (
                  <Pressable
                    key={doc.id}
                    testID={`document-card-${doc.id}`}
                    onPress={() => handleOpenDocument(doc)}
                    onLongPress={() => handleDeleteDocument(doc)}
                    style={({ pressed }) => [
                      styles.documentCard,
                      pressed && styles.documentCardPressed,
                    ]}
                  >
                    <LinearGradient
                      colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardSheen}
                      pointerEvents="none"
                    />
                    <View style={styles.cardHeader}>
                      <View style={styles.fileIconShell}>
                        <FileText size={19} color={appTheme.colors.cyan} strokeWidth={2.2} />
                      </View>
                      <Text
                        style={[
                          styles.formatBadge,
                          doc.format === 'TXT' && styles.formatBadgeTxt,
                          doc.format === 'DOCX' && styles.formatBadgeDocx,
                          doc.format === 'MOBI' && styles.formatBadgeMobi,
                          !doc.isReadable && styles.formatBadgeUnreadable,
                        ]}
                        testID={`document-format-${doc.id}`}
                      >
                        {doc.format}
                      </Text>
                    </View>
                    {(() => {
                      const message = !doc.isReadable
                        ? doc.unreadableReason ?? 'No readable text detected.'
                        : doc.conversionWarnings && doc.conversionWarnings.length > 0
                          ? doc.conversionWarnings[0]
                          : null;
                      if (!message) {
                        return null;
                      }
                      return (
                        <View
                          style={[
                            styles.warningPill,
                            !doc.isReadable && styles.unreadablePill,
                          ]}
                          testID={`document-warning-${doc.id}`}
                        >
                          <Text
                            style={[
                              styles.warningText,
                              !doc.isReadable && styles.unreadableText,
                            ]}
                            numberOfLines={2}
                          >
                            {message}
                          </Text>
                        </View>
                      );
                    })()}

                    <Text style={styles.documentTitle} numberOfLines={2}>
                      {doc.title}
                    </Text>

                    <View style={styles.cardFooter}>
                      <View style={styles.statsRow}>
                        <Text style={styles.statLabel}>Progress</Text>
                        <Text style={styles.statValue}>{progressPercent}%</Text>
                      </View>
                      <View style={styles.statsRow}>
                        <Text style={styles.statLabel}>Remaining</Text>
                        <Text style={styles.statValue}>{estimateTimeRemaining(doc)}</Text>
                      </View>
                      <View style={styles.statsRow}>
                        <Text style={styles.statLabel}>Words</Text>
                        <Text style={styles.statValue}>{formatWordCount(doc.wordCount)}</Text>
                      </View>
                    </View>

                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${progressPercent}%` },
                        ]}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>

        <View style={styles.fabContainer}>
          <Pressable
            onPress={() => { void handleImport(); }}
            style={({ pressed }) => [
              styles.fab,
              pressed && styles.fabPressed,
            ]}
            testID="import-fab"
          >
            <LinearGradient
              colors={[appTheme.colors.cyan, appTheme.colors.blue]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fabGradient}
            >
              <Plus size={28} color="#06111F" strokeWidth={3} />
            </LinearGradient>
          </Pressable>
        </View>
      </LinearGradient>

      {isAttachmentsVisible ? (
        <View style={styles.attachmentsOverlay} pointerEvents="box-none">
          <Pressable
            style={styles.attachmentsBackdrop}
            onPress={closeAttachments}
            testID="attachments-backdrop"
          />
          <Animated.View
            style={[
              styles.attachmentsSheet,
              {
                opacity: attachmentsOpacity,
                transform: [{ translateY: attachmentsTranslateY }],
              },
            ]}
            testID="attachments-panel"
          >
            <View style={styles.attachmentsHeader}>
              <View style={styles.attachmentsTitleRow}>
                <Paperclip size={22} color="#FFFFFF" strokeWidth={2.2} />
                <View>
                  <Text style={styles.attachmentsTitle}>Attachments</Text>
                  <Text style={styles.attachmentsSubtitle}>
                    {documents.length} {documents.length === 1 ? 'book' : 'books'} loaded
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={closeAttachments}
                style={({ pressed }) => [
                  styles.attachmentsCloseButton,
                  pressed && styles.attachmentsCloseButtonPressed,
                ]}
                testID="attachments-close"
              >
                <X size={18} color="#FFFFFF" strokeWidth={2.4} />
              </Pressable>
            </View>

            <Pressable
              onPress={() => { void handleImport(); }}
              style={({ pressed }) => [
                styles.attachmentsAddButton,
                pressed && styles.attachmentsAddButtonPressed,
              ]}
              testID="attachments-add-button"
            >
              <PlusCircle size={20} color="#0A84FF" strokeWidth={2.4} />
              <Text style={styles.attachmentsAddButtonText}>Add book</Text>
            </Pressable>

            {documents.length === 0 ? (
              <View style={styles.attachmentsEmpty} testID="attachments-empty-state">
                <FileText size={40} color="#5E5E60" strokeWidth={1.25} />
                <Text style={styles.attachmentsEmptyTitle}>No books yet</Text>
                <Text style={styles.attachmentsEmptyText}>
                  Import a document to populate your library.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.attachmentsList}
                contentContainerStyle={styles.attachmentsListContent}
                showsVerticalScrollIndicator={false}
              >
                {documents.map((doc) => (
                  <View key={doc.id} style={styles.attachmentItem} testID={`attachment-item-${doc.id}`}>
                    <View style={styles.attachmentInfo}>
                      <Text style={styles.attachmentTitle} numberOfLines={1}>
                        {doc.title}
                      </Text>
                      <Text style={styles.attachmentMeta}>
                        {doc.format}
                        {' · '}
                        {doc.isReadable ? 'Readable' : 'Unreadable'}
                      </Text>
                      {doc.conversionWarnings && doc.conversionWarnings.length > 0 ? (
                        <Text style={styles.attachmentWarning} numberOfLines={2}>
                          {doc.conversionWarnings[0]}
                        </Text>
                      ) : doc.unreadableReason ? (
                        <Text style={styles.attachmentWarning} numberOfLines={2}>
                          {doc.unreadableReason}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => handleDeleteDocument(doc)}
                      style={({ pressed }) => [
                        styles.attachmentRemoveButton,
                        pressed && styles.attachmentRemoveButtonPressed,
                      ]}
                      testID={`attachment-remove-${doc.id}`}
                    >
                      <Trash2 size={18} color="#FF453A" strokeWidth={2.2} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: appTheme.colors.ink,
  },
  container: {
    flex: 1,
    backgroundColor: appTheme.colors.ink,
  },
  auraOne: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(94, 234, 212, 0.16)',
  },
  auraTwo: {
    position: 'absolute',
    top: 180,
    left: -110,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(84, 168, 255, 0.12)',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: appTheme.colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  logoMark: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: appTheme.colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: appTheme.shadows.glowCyan,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 8,
  },
  headerKicker: {
    fontSize: 12,
    fontWeight: '800',
    color: appTheme.colors.cyan,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: appTheme.colors.text,
    letterSpacing: -0.4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderWidth: 1,
    borderColor: appTheme.colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.6,
  },
  attachmentsButtonActive: {
    backgroundColor: 'rgba(84, 168, 255, 0.24)',
    borderColor: 'rgba(84, 168, 255, 0.5)',
  },
  attachmentsIconWrapper: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentsBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentsBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
    gap: 18,
  },
  heroCard: {
    borderRadius: 32,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    overflow: 'hidden',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  heroCopy: {
    flex: 1,
    gap: 10,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(6, 17, 31, 0.52)',
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.24)',
  },
  heroBadgeText: {
    color: appTheme.colors.cyan,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  heroTitle: {
    color: appTheme.colors.text,
    fontSize: 29,
    lineHeight: 33,
    fontWeight: '900',
    letterSpacing: -1.1,
  },
  heroSubtitle: {
    color: '#C7D2E4',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 280,
  },
  heroAction: {
    width: 52,
    height: 52,
    borderRadius: 20,
    backgroundColor: appTheme.colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: appTheme.shadows.glowCyan,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 10,
  },
  heroActionPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  statsRibbon: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  statPuck: {
    flex: 1,
    borderRadius: 20,
    padding: 12,
    backgroundColor: 'rgba(6, 17, 31, 0.48)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 5,
  },
  statPuckValue: {
    color: appTheme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  statPuckLabel: {
    color: appTheme.colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    borderRadius: 24,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: appTheme.colors.stroke,
  },
  continueTextWrap: {
    flex: 1,
  },
  continueEyebrow: {
    color: appTheme.colors.cyan,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  continueTitle: {
    color: appTheme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  continueMeta: {
    color: appTheme.colors.muted,
    fontSize: 13,
    marginTop: 5,
  },
  continueMeter: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(94, 234, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.28)',
  },
  continuePercent: {
    color: appTheme.colors.cyan,
    fontSize: 14,
    fontWeight: '900',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 42,
    paddingHorizontal: 20,
    gap: 16,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: appTheme.colors.stroke,
  },
  emptyIconShell: {
    width: 88,
    height: 88,
    borderRadius: 32,
    backgroundColor: 'rgba(94, 234, 212, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.22)',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: appTheme.colors.text,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 21,
    color: appTheme.colors.muted,
    textAlign: 'center',
    maxWidth: 310,
  },
  emptyImportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: appTheme.colors.cyan,
  },
  emptyImportText: {
    color: '#06111F',
    fontSize: 15,
    fontWeight: '900',
  },
  documentGrid: {
    gap: 14,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sectionHeading: {
    color: appTheme.colors.text,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  sectionCount: {
    color: appTheme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  documentCard: {
    backgroundColor: 'rgba(18, 24, 38, 0.82)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: appTheme.colors.stroke,
    gap: 13,
    overflow: 'hidden',
  },
  cardSheen: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 80,
  },
  documentCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fileIconShell: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: 'rgba(94, 234, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#007AFF',
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.25)',
  },
  formatBadgeTxt: {
    color: '#34C759',
    backgroundColor: 'rgba(52, 199, 89, 0.18)',
    borderColor: 'rgba(52, 199, 89, 0.3)',
  },
  formatBadgeDocx: {
    color: '#0A84FF',
    backgroundColor: 'rgba(10, 132, 255, 0.18)',
    borderColor: 'rgba(10, 132, 255, 0.35)',
  },
  formatBadgeMobi: {
    color: '#BF5AF2',
    backgroundColor: 'rgba(191, 90, 242, 0.18)',
    borderColor: 'rgba(191, 90, 242, 0.35)',
  },
  formatBadgeUnreadable: {
    color: '#FF453A',
    backgroundColor: 'rgba(255, 69, 58, 0.16)',
    borderColor: 'rgba(255, 69, 58, 0.4)',
  },
  warningPill: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 149, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.35)',
  },
  unreadablePill: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderColor: 'rgba(255, 69, 58, 0.4)',
  },
  warningText: {
    fontSize: 12,
    color: '#FFA94D',
    fontWeight: '500',
  },
  unreadableText: {
    color: '#FF6961',
  },
  documentTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: appTheme.colors.text,
    lineHeight: 25,
    letterSpacing: -0.25,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  statsRow: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: appTheme.colors.muted,
    marginBottom: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.55,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: appTheme.colors.text,
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: appTheme.colors.cyan,
    borderRadius: 999,
  },
  fabContainer: {
    position: 'absolute',
    right: 20,
    bottom: 20,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: appTheme.shadows.glowCyan,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.34,
    shadowRadius: 18,
    elevation: 12,
  },
  fabGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
  attachmentsOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'flex-end',
    zIndex: 30,
  },
  attachmentsBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  attachmentsSheet: {
    backgroundColor: '#0B101A',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 16,
    borderWidth: 1,
    borderColor: appTheme.colors.stroke,
  },
  attachmentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attachmentsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  attachmentsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  attachmentsSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  attachmentsCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentsCloseButtonPressed: {
    opacity: 0.7,
  },
  attachmentsAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(94, 234, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.28)',
  },
  attachmentsAddButtonPressed: {
    opacity: 0.85,
  },
  attachmentsAddButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: appTheme.colors.cyan,
  },
  attachmentsEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  attachmentsEmptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  attachmentsEmptyText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    maxWidth: 240,
  },
  attachmentsList: {
    maxHeight: 420,
  },
  attachmentsListContent: {
    gap: 12,
    paddingBottom: 12,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: appTheme.colors.stroke,
    gap: 16,
  },
  attachmentInfo: {
    flex: 1,
    gap: 4,
  },
  attachmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  attachmentMeta: {
    fontSize: 12,
    color: '#8E8E93',
  },
  attachmentWarning: {
    fontSize: 12,
    color: '#FF9F0A',
  },
  attachmentRemoveButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.32)',
  },
  attachmentRemoveButtonPressed: {
    opacity: 0.7,
  },
  importingCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    marginHorizontal: 40,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  importingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 8,
  },
  importingSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  importingNote: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 4,
  },
});
