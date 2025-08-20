export const APP_CONFIG = {
  name: 'Word Document Comparison Tool',
  version: '1.0.0',
  maxFileSize: Infinity, // No file size limit
  allowedExtensions: ['.docx', '.doc'],
  supportedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
};

export const UI_CONFIG = {
  colors: {
    primary: '#2563eb',
    secondary: '#64748b',
    success: '#059669',
    warning: '#d97706',
    error: '#dc2626',
    info: '#0891b2'
  },
  animations: {
    duration: 200,
    easing: 'ease-in-out'
  }
};