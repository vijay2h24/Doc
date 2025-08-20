# Word Document Comparison Tool

A professional web application for comparing Word documents side by side with exact formatting preservation and detailed difference highlighting.

## Features

- **Exact Word Document Preview** - View documents with original formatting, fonts, and styles
- **Side-by-Side Comparison** - Compare two documents with highlighted differences
- **Drag & Drop Upload** - Easy file upload with validation
- **Export Results** - Export comparison results for reporting
- **Responsive Design** - Works on desktop and mobile devices
- **Professional UI** - Clean, modern interface with smooth animations

## Supported Formats

- Microsoft Word (.docx)
- Legacy Word (.doc)
- Maximum file size: 10MB

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to the local server URL

## Usage

1. Upload your original document using the left upload area
2. Upload the modified document using the right upload area
3. Click "Compare Documents" to see the differences
4. Switch between Preview and Comparison modes
5. Export results if needed

## Technology Stack

- React 18 with TypeScript
- Vite for fast development
- Tailwind CSS for styling
- Mammoth.js for Word document parsing
- Diff library for text comparison
- Lucide React for icons

## Project Structure

```
src/
├── components/          # React components
│   ├── Header.tsx      # Application header
│   ├── FileUpload.tsx  # File upload component
│   ├── DocumentPreview.tsx  # Document preview component
│   └── ComparisonSummary.tsx  # Comparison results summary
├── utils/              # Utility functions
│   ├── documentParser.ts    # Word document parsing
│   └── textComparison.ts    # Text comparison logic
├── types/              # TypeScript type definitions
│   └── index.ts        # Main type definitions
├── App.tsx             # Main application component
├── main.tsx            # Application entry point
└── index.css           # Global styles and Word document styling
```

## License

MIT License