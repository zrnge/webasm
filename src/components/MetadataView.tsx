import React, { useState, useMemo } from 'react';
import type { ParsedBinary, BinarySection, BinarySymbol } from '../parser/types';
import { Layers, Hash, Search, Info } from 'lucide-react';

interface MetadataViewProps {
  binary: ParsedBinary;
  selectedSection: BinarySection | null;
  onSectionSelect: (section: BinarySection) => void;
  onSymbolClick: (symbol: BinarySymbol) => void;
}

export const MetadataView: React.FC<MetadataViewProps> = ({
  binary,
  selectedSection,
  onSectionSelect,
  onSymbolClick,
}) => {
  const [activeTab, setActiveTab] = useState<'sections' | 'symbols'>('sections');
  const [symbolSearch, setSymbolSearch] = useState('');

  // Format helper
  const formatHex = (val: number, bits: 32 | 64 = 64) => {
    const padLen = bits === 64 ? 16 : 8;
    return '0x' + val.toString(16).toUpperCase().padStart(padLen, '0');
  };

  // Human-readable size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Filter symbols based on search query
  const filteredSymbols = useMemo(() => {
    if (!symbolSearch) return binary.symbols.slice(0, 1000); // Limit display to 1000 for DOM speed
    const searchLower = symbolSearch.toLowerCase();
    return binary.symbols
      .filter((sym) => sym.name.toLowerCase().includes(searchLower))
      .slice(0, 1000);
  }, [binary.symbols, symbolSearch]);

  return (
    <div className="w-full flex flex-col h-full bg-[#13151c] border-r border-[#1e2230] text-slate-300">
      {/* File Stats Summary */}
      <div className="p-4 border-b border-[#1e2230] bg-[#0d0e12]/50">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">File Information</h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[#1a1d26] p-2 rounded border border-[#1e2230]/50">
            <span className="text-slate-500 block">Name</span>
            <span className="font-semibold text-slate-200 truncate block" title={binary.fileName}>
              {binary.fileName}
            </span>
          </div>
          <div className="bg-[#1a1d26] p-2 rounded border border-[#1e2230]/50">
            <span className="text-slate-500 block">Size</span>
            <span className="font-semibold text-slate-200 block">{formatSize(binary.fileSize)}</span>
          </div>
          <div className="bg-[#1a1d26] p-2 rounded border border-[#1e2230]/50">
            <span className="text-slate-500 block">Format</span>
            <span className="font-semibold text-purple-400 block">{binary.format}</span>
          </div>
          <div className="bg-[#1a1d26] p-2 rounded border border-[#1e2230]/50">
            <span className="text-slate-500 block">Arch</span>
            <span className="font-semibold text-slate-200 block uppercase">
              {binary.architecture} ({binary.bitness}-bit)
            </span>
          </div>
        </div>

        <div className="mt-3 bg-[#1a1d26] p-2 rounded border border-[#1e2230]/50 text-xs">
          <div className="flex justify-between py-0.5">
            <span className="text-slate-500">Image Base:</span>
            <span className="font-mono font-semibold text-slate-300">{formatHex(binary.imageBase, binary.bitness)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-slate-500">Entry Point:</span>
            <span className="font-mono font-semibold text-emerald-400">{formatHex(binary.entryPoint, binary.bitness)}</span>
          </div>
        </div>
      </div>

      {/* Tabs selectors */}
      <div className="flex border-b border-[#1e2230] text-sm bg-[#13151c]">
        <button
          onClick={() => setActiveTab('sections')}
          className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 border-b-2 font-medium transition-all ${
            activeTab === 'sections'
              ? 'border-purple-500 text-white bg-slate-900/20'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/10'
          }`}
        >
          <Layers className="w-4 h-4" />
          Sections ({binary.sections.length})
        </button>
        <button
          onClick={() => setActiveTab('symbols')}
          className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 border-b-2 font-medium transition-all ${
            activeTab === 'symbols'
              ? 'border-purple-500 text-white bg-slate-900/20'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/10'
          }`}
        >
          <Hash className="w-4 h-4" />
          Symbols ({binary.symbols.length})
        </button>
      </div>

      {/* Tabs Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'sections' ? (
          <div className="p-2 space-y-1">
            {binary.sections.map((section, idx) => {
              const isSelected = selectedSection?.name === section.name && selectedSection?.virtualAddress === section.virtualAddress;
              return (
                <button
                  key={`${section.name}-${idx}`}
                  onClick={() => onSectionSelect(section)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-purple-950/20 border-purple-500/50 text-white'
                      : 'bg-[#1a1d26]/40 border-transparent hover:bg-[#1a1d26] text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-sm font-mono truncate max-w-[150px]">{section.name || 'Unnamed'}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide uppercase ${
                        section.isExecutable
                          ? 'bg-purple-900/30 text-purple-400 border border-purple-900/50'
                          : 'bg-slate-900 text-slate-500 border border-slate-800'
                      }`}
                    >
                      {section.isExecutable ? 'Executable' : 'Read-only'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-0.5 gap-x-2 text-[10px] text-slate-500 font-mono">
                    <div>
                      <span>Addr: </span>
                      <span className="text-slate-400">{formatHex(section.virtualAddress, binary.bitness)}</span>
                    </div>
                    <div>
                      <span>Size: </span>
                      <span className="text-slate-400">{formatSize(section.virtualSize)}</span>
                    </div>
                    <div>
                      <span>Offset: </span>
                      <span className="text-slate-400">0x{section.fileOffset.toString(16).toUpperCase()}</span>
                    </div>
                    <div>
                      <span>Raw Size: </span>
                      <span className="text-slate-400">{formatSize(section.fileSize)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Symbol Search Bar */}
            <div className="p-2 sticky top-0 bg-[#13151c] z-10 border-b border-[#1e2230]/50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search symbols..."
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  className="w-full bg-[#1a1d26] border border-[#1e2230] rounded-lg py-1.5 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Symbols scroll list */}
            <div className="flex-1 p-2 space-y-0.5 overflow-y-auto max-h-[50vh]">
              {filteredSymbols.length > 0 ? (
                filteredSymbols.map((sym, idx) => (
                  <button
                    key={`${sym.name}-${idx}`}
                    onClick={() => onSymbolClick(sym)}
                    className="w-full text-left py-1.5 px-3 rounded hover:bg-[#1a1d26] hover:text-white transition-colors flex items-center justify-between text-xs border border-transparent active:bg-[#1e2230]"
                  >
                    <span className="font-mono text-purple-300 truncate max-w-[200px]" title={sym.name}>
                      {sym.name}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 flex-shrink-0">
                      {formatHex(sym.address, binary.bitness)}
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-slate-500 flex flex-col items-center justify-center gap-1">
                  <Info className="w-4 h-4" />
                  No symbols found.
                </div>
              )}
              {binary.symbols.length > 1000 && !symbolSearch && (
                <div className="text-center py-2 text-[10px] text-slate-600 italic">
                  Showing first 1000 of {binary.symbols.length} symbols. Use search to find others.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Subtle Author Credit */}
      <div className="p-2.5 border-t border-[#1e2230] text-center text-[10px] text-slate-500 bg-[#0d0e12]/30 select-none shrink-0">
        Developed by{' '}
        <a
          href="https://zrnge.github.io"
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-400 hover:text-purple-300 font-semibold transition-colors"
        >
          Zrnge
        </a>
      </div>
    </div>
  );
};
