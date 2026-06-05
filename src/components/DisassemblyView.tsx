import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { UIEvent } from 'react';
import type { BinarySymbol } from '../parser/types';
import { Search, Navigation } from 'lucide-react';

interface Insn {
  id: number;
  address: number;
  size: number;
  bytes: Uint8Array;
  mnemonic: string;
  opStr: string;
}

interface DisassemblyViewProps {
  instructions: Insn[];
  symbols: BinarySymbol[];
  entryPoint: number;
  bitness: 32 | 64;
  jumpAddressTrigger?: number | null; // Trigger to jump to an address from parent
  onJumpExecuted?: () => void;
}

const ROW_HEIGHT = 24; // row height in px

export const DisassemblyView: React.FC<DisassemblyViewProps> = ({
  instructions,
  symbols,
  entryPoint,
  bitness,
  jumpAddressTrigger,
  onJumpExecuted,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [clientHeight, setClientHeight] = useState(400);

  // Search and Jump States
  const [filterText, setFilterText] = useState('');
  const [gotoInput, setGotoInput] = useState('');
  const [gotoError, setGotoError] = useState('');
  const [highlightedAddress, setHighlightedAddress] = useState<number | null>(null);

  // Measure container height
  useEffect(() => {
    if (containerRef.current) {
      setClientHeight(containerRef.current.clientHeight);
      
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setClientHeight(entry.contentRect.height);
        }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  // Map symbols by address for fast lookups
  const symbolMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const sym of symbols) {
      map.set(sym.address, sym.name);
    }
    return map;
  }, [symbols]);

  // Map instructions by address for binary searching when jumping
  const addressToIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < instructions.length; i++) {
      map.set(instructions[i].address, i);
    }
    return map;
  }, [instructions]);

  // Apply search filtering
  const filteredInstructions = useMemo(() => {
    if (!filterText) return instructions;
    const query = filterText.toLowerCase();
    return instructions.filter(
      (insn) =>
        insn.address.toString(16).toLowerCase().includes(query) ||
        insn.mnemonic.toLowerCase().includes(query) ||
        insn.opStr.toLowerCase().includes(query)
    );
  }, [instructions, filterText]);

  // Handle jump logic
  const performJump = (addr: number) => {
    let index = addressToIndexMap.get(addr);
    
    // If exact address not found, find the closest one
    if (index === undefined) {
      // Binary search closest instruction address
      let low = 0;
      let high = instructions.length - 1;
      let closestIdx = -1;
      let minDiff = Infinity;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midAddr = instructions[mid].address;
        const diff = Math.abs(midAddr - addr);

        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = mid;
        }

        if (midAddr === addr) {
          closestIdx = mid;
          break;
        } else if (midAddr < addr) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (closestIdx !== -1) {
        index = closestIdx;
      }
    }

    if (index !== undefined && index !== -1) {
      const scrollPos = index * ROW_HEIGHT;
      if (containerRef.current) {
        // Center the instruction in the viewport
        containerRef.current.scrollTop = scrollPos - Math.floor(clientHeight / 2) + ROW_HEIGHT;
        setScrollTop(containerRef.current.scrollTop);
      }
      setHighlightedAddress(instructions[index].address);
      setGotoError('');
      return true;
    }
    return false;
  };

  // Listen to jumps from the parent (e.g. clicking a symbol in Sidebar)
  useEffect(() => {
    if (jumpAddressTrigger !== undefined && jumpAddressTrigger !== null) {
      const success = performJump(jumpAddressTrigger);
      if (success && onJumpExecuted) {
        onJumpExecuted();
      }
    }
  }, [jumpAddressTrigger, addressToIndexMap, clientHeight]);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // Handle Go-to-Address Input Submit
  const handleGotoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gotoInput) return;

    let targetAddr = 0;
    const cleanedInput = gotoInput.trim().toLowerCase();

    if (cleanedInput.startsWith('0x')) {
      targetAddr = parseInt(cleanedInput, 16);
    } else {
      targetAddr = parseInt(cleanedInput, 10);
    }

    if (isNaN(targetAddr)) {
      setGotoError('Invalid address format. Use decimal or hex (e.g., 0x401000).');
      return;
    }

    const jumped = performJump(targetAddr);
    if (!jumped) {
      setGotoError('Address lies outside disassembled section range.');
    } else {
      setGotoInput('');
    }
  };

  // Formatter for address
  const formatAddress = (addr: number) => {
    const padLen = bitness === 64 ? 16 : 8;
    return addr.toString(16).toUpperCase().padStart(padLen, '0');
  };

  // Formatter for raw bytes
  const formatBytes = (bytes: Uint8Array) => {
    return Array.from(bytes)
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
  };

  // Render instruction operands with interactive jump links
  const renderOperands = (opStr: string) => {
    // Matches hex address like 0x140001050 or similar
    const hexMatch = opStr.match(/0x[0-9a-fA-F]+/);
    if (hexMatch) {
      const hexAddrStr = hexMatch[0];
      const parsedAddr = parseInt(hexAddrStr, 16);
      const symbolInlineName = symbolMap.get(parsedAddr);

      const beforeIdx = opStr.indexOf(hexAddrStr);
      const afterIdx = beforeIdx + hexAddrStr.length;
      
      const beforeStr = opStr.substring(0, beforeIdx);
      const afterStr = opStr.substring(afterIdx);

      return (
        <span className="select-text">
          {beforeStr}
          <button
            onClick={() => performJump(parsedAddr)}
            className="text-purple-400 hover:text-purple-300 font-bold hover:underline font-mono focus:outline-none cursor-pointer"
            title={`Jump to ${hexAddrStr}`}
          >
            {hexAddrStr}
          </button>
          {afterStr}
          {symbolInlineName && (
            <span className="text-emerald-400 font-semibold ml-2 select-none">
              &lt;{symbolInlineName}&gt;
            </span>
          )}
        </span>
      );
    }

    return <span className="select-text">{opStr}</span>;
  };

  // Virtualization calculations
  const totalRows = filteredInstructions.length;
  const totalHeight = totalRows * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
  const endIndex = Math.min(totalRows, Math.ceil((scrollTop + clientHeight) / ROW_HEIGHT) + 5);

  const visibleRows = useMemo(() => {
    const rows: React.ReactNode[] = [];

    for (let i = startIndex; i < endIndex; i++) {
      const insn = filteredInstructions[i];
      if (!insn) continue;

      const isEntry = insn.address === entryPoint;
      const isHighlighted = insn.address === highlightedAddress;
      const rowSymbol = symbolMap.get(insn.address);

      rows.push(
        <div
          key={insn.address}
          style={{
            position: 'absolute',
            top: i * ROW_HEIGHT,
            left: 0,
            right: 0,
            height: ROW_HEIGHT,
          }}
          onClick={() => setHighlightedAddress(insn.address)}
          className={`flex items-center text-xs font-mono border-b border-[#13151c]/40 px-4 transition-colors cursor-pointer select-none hover:bg-slate-900/30 ${
            isHighlighted 
              ? 'bg-purple-950/30 border-l-4 border-l-purple-500' 
              : isEntry 
                ? 'bg-emerald-950/10 border-l-4 border-l-emerald-500' 
                : 'border-l-4 border-l-transparent'
          }`}
        >
          {/* Address */}
          <div className="w-[120px] lg:w-[150px] font-semibold text-slate-500 flex items-center gap-1.5 select-all">
            {isEntry && (
              <span className="text-[10px] px-1 bg-emerald-900/40 text-emerald-400 border border-emerald-900/60 rounded flex-shrink-0 select-none">
                Entry
              </span>
            )}
            <span className={isEntry ? 'text-emerald-400 font-bold' : isHighlighted ? 'text-purple-300' : 'text-slate-400'}>
              {formatAddress(insn.address)}
            </span>
          </div>

          {/* Raw Bytes */}
          <div className="w-[130px] lg:w-[160px] text-slate-600 select-all truncate pr-4" title={formatBytes(insn.bytes)}>
            {formatBytes(insn.bytes)}
          </div>

          {/* Mnemonic */}
          <div className="w-20 text-purple-400 font-bold select-all pr-2">
            {insn.mnemonic}
          </div>

          {/* Operands */}
          <div className="flex-1 text-slate-200 select-all truncate pr-4">
            {renderOperands(insn.opStr)}
          </div>

          {/* Symbol comment (if any) */}
          <div className="w-44 text-right text-emerald-500/80 truncate font-semibold select-none">
            {rowSymbol ? `; <${rowSymbol}>` : ''}
          </div>
        </div>
      );
    }

    return rows;
  }, [filteredInstructions, startIndex, endIndex, entryPoint, highlightedAddress, symbolMap, bitness]);

  return (
    <div className="flex-grow flex flex-col h-full bg-[#0d0e12]">
      {/* Control panel / Toolbar */}
      <div className="px-4 py-2 bg-[#13151c] border-b border-[#1e2230] flex flex-col sm:flex-row gap-3 justify-between items-center select-none">
        
        {/* Filter Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter instructions..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full bg-[#090a0f] border border-[#1e2230] rounded-lg py-1.5 pl-8 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Go to Address Form */}
        <form onSubmit={handleGotoSubmit} className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-grow sm:flex-grow-0">
            <input
              type="text"
              placeholder="Go to address (e.g. 0x401000)"
              value={gotoInput}
              onChange={(e) => setGotoInput(e.target.value)}
              className={`bg-[#090a0f] border rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-500 focus:outline-none w-full sm:w-56 ${
                gotoError ? 'border-rose-500 focus:border-rose-500' : 'border-[#1e2230] focus:border-purple-500'
              }`}
            />
            {gotoError && (
              <span className="absolute left-0 -bottom-4 text-[9px] text-rose-500 truncate max-w-[220px]">
                {gotoError}
              </span>
            )}
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5" />
            Go
          </button>
        </form>

      </div>

      {/* Table Headers */}
      <div className="flex items-center px-4 py-2 bg-[#13151c] border-b border-[#1e2230] text-xs font-mono text-slate-400 select-none">
        <span className="w-[120px] lg:w-[150px] font-semibold">ADDRESS</span>
        <span className="w-[130px] lg:w-[160px] font-semibold">BYTES</span>
        <span className="w-20 font-semibold">MNEMONIC</span>
        <span className="flex-1 font-semibold">OPERANDS</span>
        <span className="w-44 text-right font-semibold">SYMBOL</span>
      </div>

      {/* Scrollable Instruction Area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto relative bg-[#090a0f]"
      >
        {filteredInstructions.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
            No matching instructions found.
          </div>
        ) : (
          <>
            <div style={{ height: totalHeight, width: '100%' }} />
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
              }}
            >
              {visibleRows}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
