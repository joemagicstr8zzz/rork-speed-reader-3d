import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Document, DocumentFormat } from '@/types/document';
import { SAMPLE_DOCUMENT_CONTENT } from '@/constants/sampleDocument';

const DOCUMENTS_KEY = '@fluxread_documents';
const SAMPLE_DOC_ID = 'sample-document';

const countWords = (content: string): number => {
  if (!content.trim()) {
    return 0;
  }
  return content.trim().split(/\s+/).length;
};

const normalizeDocument = (doc: Partial<Document>): Document => {
  const content = typeof doc.content === 'string' ? doc.content : '';
  const sourceFormat: DocumentFormat = (doc.sourceFormat ?? doc.format ?? 'TXT') as DocumentFormat;
  const format: DocumentFormat = (doc.format ?? sourceFormat ?? 'TXT') as DocumentFormat;
  const conversionWarnings = Array.isArray(doc.conversionWarnings) ? doc.conversionWarnings : [];
  const isReadable = typeof doc.isReadable === 'boolean' ? doc.isReadable : content.trim().length > 0;
  const unreadableReason = typeof doc.unreadableReason === 'string' ? doc.unreadableReason : null;
  return {
    id: doc.id ?? Date.now().toString(),
    title: doc.title ?? 'Untitled Document',
    format,
    sourceFormat,
    content,
    createdAt: doc.createdAt ?? Date.now(),
    updatedAt: doc.updatedAt ?? Date.now(),
    progress: {
      chunkIndex: doc.progress?.chunkIndex ?? 0,
      bookmarks: Array.isArray(doc.progress?.bookmarks) ? doc.progress.bookmarks : [],
    },
    lastMode: doc.lastMode ?? '2D',
    wordCount: isReadable ? countWords(content) : 0,
    isReadable,
    unreadableReason,
    conversionWarnings,
  };
};

const createSampleDocument = (): Document => ({
  id: SAMPLE_DOC_ID,
  title: 'Welcome to FluxRead 3D',
  format: 'TXT',
  sourceFormat: 'TXT',
  content: SAMPLE_DOCUMENT_CONTENT,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  progress: {
    chunkIndex: 0,
    bookmarks: [],
  },
  lastMode: '2D',
  wordCount: countWords(SAMPLE_DOCUMENT_CONTENT),
  isReadable: true,
  unreadableReason: null,
  conversionWarnings: [],
});

export type AddDocumentPayload = {
  title: string;
  sourceFormat: DocumentFormat;
  content: string;
  isReadable: boolean;
  unreadableReason?: string | null;
  conversionWarnings?: string[];
};

export const [DocumentProvider, useDocuments] = createContextHook(() => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadDocuments = useCallback(async () => {
    console.log('[DocumentContext] Loading documents from storage');
    try {
      const stored = await AsyncStorage.getItem(DOCUMENTS_KEY);
      const rawDocs: Partial<Document>[] = stored ? JSON.parse(stored) : [];

      const normalizedDocs = rawDocs.map((doc) => normalizeDocument(doc));
      const hasSample = normalizedDocs.some(doc => doc.id === SAMPLE_DOC_ID);

      if (!hasSample) {
        const sampleDoc = createSampleDocument();
        normalizedDocs.unshift(sampleDoc);
        await AsyncStorage.setItem(DOCUMENTS_KEY, JSON.stringify(normalizedDocs));
        console.log('[DocumentContext] Injected sample document into storage');
      }

      setDocuments(normalizedDocs);
      console.log('[DocumentContext] Loaded', normalizedDocs.length, 'documents');
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveDocuments = useCallback(async (docs: Document[]) => {
    console.log('[DocumentContext] Saving', docs.length, 'documents to storage');
    try {
      const normalized = docs.map((doc) => normalizeDocument(doc));
      await AsyncStorage.setItem(DOCUMENTS_KEY, JSON.stringify(normalized));
      setDocuments(normalized);
      console.log('[DocumentContext] Saved documents successfully');
    } catch (error) {
      console.error('Failed to save documents:', error);
    }
  }, []);

  const addDocument = useCallback(async ({ title, sourceFormat, content, isReadable, unreadableReason, conversionWarnings }: AddDocumentPayload) => {
    const sanitizedContent = typeof content === 'string' ? content : '';
    const readable = isReadable && sanitizedContent.trim().length > 0;
    const newDoc: Document = {
      id: Date.now().toString(),
      title,
      format: sourceFormat,
      sourceFormat,
      content: sanitizedContent,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      progress: {
        chunkIndex: 0,
        bookmarks: [],
      },
      lastMode: '2D',
      wordCount: readable ? countWords(sanitizedContent) : 0,
      isReadable: readable,
      unreadableReason: readable ? null : unreadableReason ?? null,
      conversionWarnings: conversionWarnings ?? [],
    };
    console.log('[DocumentContext] Adding document', newDoc.id, newDoc.title, 'format:', newDoc.format, 'readable:', readable);
    await saveDocuments([newDoc, ...documents]);
  }, [documents, saveDocuments]);

  const updateDocument = useCallback(async (id: string, updates: Partial<Document>) => {
    console.log('[DocumentContext] Updating document', id);
    const updated = documents.map(doc =>
      doc.id === id
        ? normalizeDocument({ ...doc, ...updates, updatedAt: Date.now() })
        : doc
    );
    await saveDocuments(updated);
  }, [documents, saveDocuments]);

  const deleteDocument = useCallback(async (id: string) => {
    console.log('[DocumentContext] Deleting document', id);
    const filtered = documents.filter(doc => doc.id !== id);
    await saveDocuments(filtered);
  }, [documents, saveDocuments]);

  const restoreSampleDocument = useCallback(async () => {
    const hasSample = documents.some(d => d.id === SAMPLE_DOC_ID);
    if (!hasSample) {
      console.log('[DocumentContext] Restoring sample document');
      const sampleDoc = createSampleDocument();
      await saveDocuments([sampleDoc, ...documents]);
    }
  }, [documents, saveDocuments]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  return useMemo(() => ({
    documents,
    isLoading,
    addDocument,
    updateDocument,
    deleteDocument,
    restoreSampleDocument,
  }), [documents, isLoading, addDocument, updateDocument, deleteDocument, restoreSampleDocument]);
});
