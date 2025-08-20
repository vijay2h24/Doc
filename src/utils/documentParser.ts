import mammoth from 'mammoth';

export const parseWordDocument = async (file: File): Promise<{ content: string; htmlContent: string }> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Configure mammoth to preserve more formatting
    const options = {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Heading 5'] => h5:fresh",
        "p[style-name='Heading 6'] => h6:fresh",
        "p[style-name='Title'] => h1.title:fresh",
        "p[style-name='Subtitle'] => h2.subtitle:fresh",
        "p[style-name='Quote'] => blockquote:fresh",
        "p[style-name='Intense Quote'] => blockquote.intense:fresh",
        "p[style-name='List Paragraph'] => p.list-paragraph:fresh",
        "p[style-name='Normal'] => p:fresh",
        "p[style-name='Body Text'] => p:fresh",
        "r[style-name='Strong'] => strong",
        "r[style-name='Emphasis'] => em",
        "r[style-name='Subtle Emphasis'] => em.subtle",
        "r[style-name='Intense Emphasis'] => strong.intense",
        "r[style-name='Hyperlink'] => a",
        "table => table.word-table",
        "tr => tr",
        "td => td",
        "th => th",
        "b => strong",
        "i => em",
        "u => u"
      ],
      includeDefaultStyleMap: true,
      convertImage: mammoth.images.imgElement(function(image) {
        return image.read("base64").then(function(imageBuffer) {
          return {
            src: "data:" + image.contentType + ";base64," + imageBuffer
          };
        });
      }),
      ignoreEmptyParagraphs: false,
      preserveEmptyParagraphs: true,
      transformDocument: mammoth.transforms.paragraph(function(element) {
        // Preserve paragraph spacing and alignment
        return element;
      })
    };
    
    const result = await mammoth.convertToHtml({ arrayBuffer }, options);
    
    // Extract plain text while preserving paragraph structure
    const plainText = extractPlainTextWithStructure(result.value);
    
    // Enhanced HTML with better styling
    const enhancedHtml = enhanceWordHtml(result.value);
    
    return {
      content: plainText,
      htmlContent: enhancedHtml
    };
  } catch (error) {
    console.error('Error parsing document:', error);
    throw new Error('Failed to parse document. Please ensure it\'s a valid Word document.');
  }
};

const extractPlainTextWithStructure = (html: string): string => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Process elements to preserve structure
  const processElement = (element: Element): string => {
    const tagName = element.tagName.toLowerCase();
    const text = element.textContent?.trim() || '';
    
    // Add appropriate spacing based on element type
    switch (tagName) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return text ? `\n\n${text}\n` : '';
      case 'p':
        return text ? `${text}\n\n` : '\n';
      case 'li':
        return text ? `• ${text}\n` : '';
      case 'br':
        return '\n';
      case 'td':
      case 'th':
        return text ? `${text}\t` : '';
      case 'tr':
        return '\n';
      default:
        return text;
    }
  };
  
  const elements = Array.from(tempDiv.querySelectorAll('*'));
  let result = '';
  
  elements.forEach(element => {
    if (!element.children.length) { // Only process leaf elements
      result += processElement(element);
    }
  });
  
  return result.trim();
};

const enhanceWordHtml = (html: string): string => {
  // Clean up and enhance HTML for better Word-like appearance
  let cleanedHtml = html
    // Preserve all original formatting and spacing
    .replace(/<p><\/p>/g, '<p>&nbsp;</p>') // Only fix completely empty paragraphs
    .replace(/<p>\s*<\/p>/g, '<p>&nbsp;</p>'); // Fix paragraphs with only whitespace
  
  // Return the HTML with minimal modifications to preserve original formatting
  return cleanedHtml;
};

export const validateFile = (file: File): boolean => {
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];
  
  const validExtensions = ['.docx', '.doc'];
  const hasValidType = validTypes.includes(file.type);
  const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
  
  return hasValidType || hasValidExtension;
};