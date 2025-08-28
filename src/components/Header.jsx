
import { GitCompare } from 'lucide-react';

const Header = () => {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <GitCompare className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Document Comparison Tool</h1>
            <p className="text-sm text-gray-600">Compare Word documents and highlight differences</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header; 