import React, { useState, useCallback } from 'react';
import { Upload, ShieldAlert } from 'lucide-react';

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({ onFileSelect, isLoading }) => {
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  }, [onFileSelect]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="max-w-xl w-full text-center mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
          WEB<span className="text-purple-400">ASM</span>
        </h1>
        <p className="text-gray-400 text-lg">
          An industry-standard multi-architecture static disassembler running entirely in your browser.
        </p>
      </div>

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`w-full max-w-2xl aspect-[16/9] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 transition-all relative overflow-hidden bg-[#13151c] ${
          isDragActive 
            ? 'border-purple-500 bg-purple-500/5 scale-[1.01] animate-pulse-border' 
            : 'border-slate-800 hover:border-slate-700 hover:bg-slate-900/20'
        } ${isLoading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
      >
        <input
          type="file"
          id="file-upload"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleFileInput}
          disabled={isLoading}
        />

        <div className="p-4 bg-slate-900/50 rounded-full mb-4 border border-slate-800">
          <Upload className={`w-10 h-10 ${isDragActive ? 'text-purple-400' : 'text-slate-400'}`} />
        </div>

        <h3 className="text-xl font-bold text-white mb-2">
          {isDragActive ? 'Drop your binary here' : 'Upload executable or library'}
        </h3>
        <p className="text-slate-400 text-sm text-center mb-4 max-w-sm">
          Drag and drop your executable, or click to browse.
          Supports <span className="text-slate-200 font-semibold">PE (.exe, .dll)</span> and <span className="text-slate-200 font-semibold">ELF</span> formats.
        </p>

        <div className="flex flex-wrap gap-2 justify-center text-xs text-slate-500">
          <span className="px-2 py-1 bg-slate-900 rounded border border-slate-800">x86 / x86-64</span>
          <span className="px-2 py-1 bg-slate-900 rounded border border-slate-800">ARM / ARM64</span>
          <span className="px-2 py-1 bg-slate-900 rounded border border-slate-800">Capstone Engine</span>
        </div>
      </div>

      {/* Trust Badge */}
      <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 max-w-2xl px-6 py-4 bg-emerald-950/20 border border-emerald-900/40 rounded-xl text-emerald-400 text-sm">
        <ShieldAlert className="w-6 h-6 flex-shrink-0" />
        <div className="text-center sm:text-left">
          <span className="font-bold">100% Client-Side execution.</span> Your binary never leaves your computer. All parsing, headers decoding, and disassembly are performed locally using WebAssembly inside your browser. Safe for confidential or sensitive samples.
        </div>
      </div>
    </div>
  );
};
