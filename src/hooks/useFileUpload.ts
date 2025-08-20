import { useState, useCallback } from 'react';
import { DocumentData } from '../types';
import { parseWordDocument, validateFile } from '../utils/documentParser';
import { APP_CONFIG } from '../config/constants';

export const useFileUpload = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');

  const processFile = useCallback(async (file: File): Promise<DocumentData> => {
    if (!validateFile(file)) {
      throw new Error('Please upload a valid Word document (.docx or .doc)');
    }

    setError('');
    setIsProcessing(true);

    try {
      const { content, htmlContent } = await parseWordDocument(file);
      
      const documentData: DocumentData = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        content,
        htmlContent,
        originalHtmlContent: htmlContent,
        file
      };

      return documentData;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process document';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError('');
  }, []);

  return {
    processFile,
    isProcessing,
    error,
    clearError
  };
};