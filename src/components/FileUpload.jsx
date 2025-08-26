import React, { useCallback } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { parseWordDocument, validateFile } from '../utils/documentParser';

const FileUpload = ({ onFileUpload, label, uploadedFile, disabled }) => {
  const [isDragging, setIsDragging] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleFile = useCallback(async (file) => {
    if (!validateFile(file)) {
      setError('Please upload a valid Word document (.docx or .doc)');
      return;
    }

    setError('');
    setIsProcessing(true);

    try {
      const { content, htmlContent } = await parseWordDocument(file);
      
      const documentData = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        content,
        htmlContent,
        originalHtmlContent: htmlContent,
        file
      };

      onFileUpload(documentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process document');
    } finally {
      setIsProcessing(false);
    }
  }, [onFileUpload]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile, disabled]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-gray-700">{label}</label>
      
      <div
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200
          ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400 hover:bg-blue-50 cursor-pointer'}
          ${uploadedFile ? 'border-green-400 bg-green-50' : ''}
          ${error ? 'border-red-400 bg-red-50' : ''}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isProcessing ? (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
            <p className="text-sm text-gray-600">Processing document...</p>
          </div>
        ) : uploadedFile ? (
          <div className="flex flex-col items-center">
            <FileText className="h-8 w-8 text-green-600 mb-3" />
            <p className="text-sm font-medium text-green-800">{uploadedFile.name}</p>
            <p className="text-xs text-green-600">Document uploaded successfully</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <Upload className="h-8 w-8 text-gray-400 mb-3" />
            <p className="text-sm text-gray-600 mb-1">
              Drag and drop your Word document here, or click to browse
            </p>
            <p className="text-xs text-gray-400">Supports .docx and .doc files (no size limit)</p>
          </div>
        )}

        <input
          type="file"
          accept=".docx,.doc"
          onChange={handleFileSelect}
          disabled={disabled || isProcessing}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default FileUpload; 