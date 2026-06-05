import { useState, useEffect, useRef } from 'react';
import { FileDropzone } from './components/FileDropzone';
import { MetadataView } from './components/MetadataView';
import { DisassemblyView } from './components/DisassemblyView';
import { HexView } from './components/HexView';
import type { ParsedBinary, BinarySection, BinarySymbol } from './parser/types';
import { Cpu, FileCode, AlertCircle, RefreshCw } from 'lucide-react';

function App() {
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null);
  const [binary, setBinary] = useState<ParsedBinary | null>(null);
  
  // Loading & Error States
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [disassembling, setDisassembling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab & Customization Options
  const [viewMode, setViewMode] = useState<'disasm' | 'hex'>('disasm');
  const [selectedSection, setSelectedSection] = useState<BinarySection | null>(null);
  const [syntax, setSyntax] = useState<'intel' | 'att'>('intel');
  const [modeType, setModeType] = useState<'linear' | 'recursive'>('recursive');
  const [instructions, setInstructions] = useState<any[]>([]);

  // Navigation jumps
  const [jumpAddress, setJumpAddress] = useState<number | null>(null);

  const workerRef = useRef<Worker | null>(null);

  // Initialize Web Worker on Mount
  useEffect(() => {
    // Create background worker
    const worker = new Worker(
      new URL('./worker/disassembler.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    // Handle messages from Web Worker
    worker.onmessage = (e: MessageEvent) => {
      const { type, payload } = e.data;

      switch (type) {
        case 'INIT_SUCCESS':
          setIsInitializing(false);
          break;
        
        case 'PARSE_SUCCESS':
          setBinary(payload);
          setIsLoading(false);
          setError(null);
          
          // Auto-select the first executable section (.text usually)
          const firstExecSection = payload.sections.find((s: BinarySection) => s.isExecutable);
          if (firstExecSection) {
            setSelectedSection(firstExecSection);
          } else if (payload.sections.length > 0) {
            // Fallback to first section
            setSelectedSection(payload.sections[0]);
          }
          break;

        case 'DISASSEMBLE_SUCCESS':
          setInstructions(payload);
          setDisassembling(false);
          setError(null);
          break;

        case 'ERROR':
          setError(payload);
          setIsLoading(false);
          setDisassembling(false);
          break;
      }
    };

    // Resolve absolute path to capstone.wasm relative to site origin and base path
    // Vite BASE_URL handles subpaths like /Online-Disassembler/ or ./
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);
    const wasmUrl = new URL('capstone.wasm', baseUrl).href;

    console.log('Resolving WASM URL:', wasmUrl);

    // Send initialization signal
    worker.postMessage({
      action: 'INIT',
      payload: { wasmUrl }
    });

    return () => {
      worker.terminate();
    };
  }, []);

  // React to section or disassembly parameter changes
  useEffect(() => {
    if (selectedSection && fileData && workerRef.current && binary) {
      setDisassembling(true);
      workerRef.current.postMessage({
        action: 'DISASSEMBLE_SECTION',
        payload: {
          section: selectedSection,
          fileData,
          architecture: binary.architecture,
          bitness: binary.bitness,
          endianness: binary.endianness,
          syntax,
          modeType,
          entryPoint: binary.entryPoint,
          symbols: binary.symbols
        }
      });
    }
  }, [selectedSection, fileData, syntax, modeType, binary]);

  // Handle binary upload
  const handleFileSelect = (selectedFile: File) => {
    setIsLoading(true);
    setError(null);
    setBinary(null);
    setSelectedSection(null);
    setInstructions([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result instanceof ArrayBuffer) {
        const arrayBuffer = e.target.result;
        setFileData(arrayBuffer);

        // Request parser inside worker
        if (workerRef.current) {
          workerRef.current.postMessage({
            action: 'PARSE_FILE',
            payload: {
              fileName: selectedFile.name,
              fileData: arrayBuffer
            }
          });
        }
      }
    };
    reader.onerror = () => {
      setError('Failed to read file contents.');
      setIsLoading(false);
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleReset = () => {
    setFileData(null);
    setBinary(null);
    setSelectedSection(null);
    setInstructions([]);
    setError(null);
  };

  const handleSymbolClick = (symbol: BinarySymbol) => {
    setViewMode('disasm');
    setJumpAddress(symbol.address);
  };

  return (
    <div className="min-h-screen bg-[#090a0f] flex flex-col font-sans text-slate-100 antialiased selection:bg-purple-900/40 selection:text-white">
      {/* Top Navbar */}
      <header className="h-14 bg-[#13151c] border-b border-[#1e2230] px-6 flex items-center justify-between select-none shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-purple-600/10 border border-purple-500/20 rounded-lg">
            <Cpu className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <span className="font-extrabold text-sm tracking-tight text-white">
              Online <span className="text-purple-400">Disassembler</span>
            </span>
          </div>
        </div>

        {binary && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-lg">
              <FileCode className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-bold text-slate-300 truncate max-w-[150px]" title={binary.fileName}>
                {binary.fileName}
              </span>
              <span className="text-[10px] px-1 bg-purple-900/40 text-purple-300 border border-purple-900/40 rounded uppercase font-semibold">
                {binary.format}
              </span>
            </div>

            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs font-semibold bg-[#1a1d26] hover:bg-[#232733] border border-[#1e2230] text-slate-300 hover:text-white rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        )}
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden relative">
        {isInitializing ? (
          /* Capstone Loading State */
          <div className="flex-1 flex flex-col items-center justify-center bg-[#090a0f] gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
            <p className="text-xs text-slate-500 font-mono">Initializing Capstone WASM Engine...</p>
          </div>
        ) : !binary ? (
          /* File Uploader view */
          <div className="flex-grow overflow-y-auto">
            {isLoading ? (
              <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
                <p className="text-sm text-slate-400">Parsing PE/ELF headers...</p>
              </div>
            ) : error ? (
              <div className="min-h-[70vh] flex flex-col items-center justify-center max-w-md mx-auto px-4 text-center">
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-full text-rose-500 mb-4">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Failed to load binary</h3>
                <p className="text-slate-400 text-sm mb-6">{error}</p>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <FileDropzone onFileSelect={handleFileSelect} isLoading={isLoading} />
            )}
          </div>
        ) : (
          /* Disassembled Workspace View */
          <div className="flex-1 flex overflow-hidden">
            
            {/* Sidebar with Metadata */}
            <div className="w-[280px] lg:w-[320px] shrink-0 h-full flex flex-col">
              <MetadataView
                binary={binary}
                selectedSection={selectedSection}
                onSectionSelect={setSelectedSection}
                onSymbolClick={handleSymbolClick}
              />
            </div>

            {/* Code / Hex Editor Panel */}
            <div className="flex-grow flex flex-col h-full overflow-hidden bg-[#0d0e12]">
              
              {/* Workspace Navigation Bar */}
              <div className="px-6 h-12 border-b border-[#1e2230] bg-[#13151c] flex items-center justify-between shrink-0 select-none">
                
                {/* View Toggles */}
                <div className="flex bg-[#090a0f] p-0.5 rounded-lg border border-[#1e2230]">
                  <button
                    onClick={() => setViewMode('disasm')}
                    className={`px-4 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      viewMode === 'disasm'
                        ? 'bg-purple-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Disassembly
                  </button>
                  <button
                    onClick={() => setViewMode('hex')}
                    className={`px-4 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      viewMode === 'hex'
                        ? 'bg-purple-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Hex Dump
                  </button>
                </div>

                {/* Engine customization controls */}
                {viewMode === 'disasm' && (
                  <div className="flex items-center gap-4 text-xs">
                    
                    {/* Linear sweep vs recursive descent */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 font-semibold uppercase text-[10px]">Sweep Mode:</span>
                      <select
                        value={modeType}
                        onChange={(e) => setModeType(e.target.value as 'linear' | 'recursive')}
                        className="bg-[#090a0f] border border-[#1e2230] rounded-lg px-2.5 py-1 text-slate-300 font-medium focus:outline-none focus:border-purple-500 cursor-pointer"
                      >
                        <option value="recursive">Recursive Descent</option>
                        <option value="linear">Linear Sweep</option>
                      </select>
                    </div>

                    {/* Syntax picker (Intel vs ATT) - Only for x86/x64 */}
                    {(binary.architecture === 'x86' || binary.architecture === 'x86_64') && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-semibold uppercase text-[10px]">Syntax:</span>
                        <select
                          value={syntax}
                          onChange={(e) => setSyntax(e.target.value as 'intel' | 'att')}
                          className="bg-[#090a0f] border border-[#1e2230] rounded-lg px-2.5 py-1 text-slate-300 font-medium focus:outline-none focus:border-purple-500 cursor-pointer"
                        >
                          <option value="intel">Intel</option>
                          <option value="att">AT&T</option>
                        </select>
                      </div>
                    )}

                  </div>
                )}
              </div>

              {/* View Panel Wrapper */}
              <div className="flex-1 flex overflow-hidden relative">
                {error && (
                  <div className="absolute inset-0 z-20 bg-[#0d0e12]/95 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
                    <AlertCircle className="w-8 h-8 text-rose-500 mb-3" />
                    <h4 className="text-md font-bold text-white mb-1">Disassembly Error</h4>
                    <p className="text-xs text-slate-400 mb-4">{error}</p>
                    <button
                      onClick={() => setError(null)}
                      className="px-3.5 py-1.5 bg-[#1a1d26] border border-[#1e2230] hover:bg-[#232733] text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {disassembling ? (
                  <div className="flex-grow flex flex-col items-center justify-center bg-[#090a0f] gap-3">
                    <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-b-2 border-purple-500"></div>
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                      Disassembling {selectedSection?.name || 'section'}...
                    </p>
                  </div>
                ) : viewMode === 'disasm' ? (
                  <DisassemblyView
                    instructions={instructions}
                    symbols={binary.symbols}
                    entryPoint={binary.entryPoint}
                    bitness={binary.bitness}
                    jumpAddressTrigger={jumpAddress}
                    onJumpExecuted={() => setJumpAddress(null)}
                  />
                ) : (
                  <HexView
                    section={selectedSection}
                    fileData={fileData}
                    bitness={binary.bitness}
                  />
                )}
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

export default App;
