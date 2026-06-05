import React, { useState, useRef, useEffect } from 'react';
import type { UIEvent } from 'react';
import type { BinarySection } from '../parser/types';

interface HexViewProps {
  section: BinarySection | null;
  fileData: ArrayBuffer | null;
  bitness: 32 | 64;
}

const ROW_HEIGHT = 22; // Height of each row in px
const BYTES_PER_ROW = 16;

export const HexView: React.FC<HexViewProps> = ({ section, fileData, bitness }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [clientHeight, setClientHeight] = useState(400);

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

  // Reset scroll when section changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [section]);

  if (!section || !fileData) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 bg-[#0d0e12] h-full">
        Select a section to view its hex dump
      </div>
    );
  }

  const bytes = new Uint8Array(fileData);
  const sectionStart = section.fileOffset;
  const sectionSize = section.fileSize;
  const sectionVirtualStart = section.virtualAddress;

  const totalRows = Math.ceil(sectionSize / BYTES_PER_ROW);
  const totalHeight = totalRows * ROW_HEIGHT;

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // Calculate indices for virtualization
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
  const endIndex = Math.min(totalRows, Math.ceil((scrollTop + clientHeight) / ROW_HEIGHT) + 5);

  const formatOffset = (offset: number) => {
    const padLen = bitness === 64 ? 16 : 8;
    return offset.toString(16).toUpperCase().padStart(padLen, '0');
  };

  const getByteClass = (byte: number) => {
    if (byte === 0) return 'text-slate-700'; // Dim zero bytes
    if (byte >= 32 && byte <= 126) return 'text-purple-300'; // Printable ASCII is brighter
    return 'text-slate-400';
  };

  const renderHexRow = (rowIndex: number) => {
    const rowFileOffset = sectionStart + rowIndex * BYTES_PER_ROW;
    const rowVirtualAddr = sectionVirtualStart + rowIndex * BYTES_PER_ROW;
    
    const rowBytes: number[] = [];
    for (let i = 0; i < BYTES_PER_ROW; i++) {
      const byteIdx = rowIndex * BYTES_PER_ROW + i;
      if (byteIdx < sectionSize) {
        rowBytes.push(bytes[rowFileOffset + i]);
      } else {
        break;
      }
    }

    // Format hex values
    const hexParts: string[] = [];
    for (let i = 0; i < BYTES_PER_ROW; i++) {
      if (i < rowBytes.length) {
        const byte = rowBytes[i];
        const hexStr = byte.toString(16).toUpperCase().padStart(2, '0');
        hexParts.push(`<span class="${getByteClass(byte)}">${hexStr}</span>`);
      } else {
        hexParts.push('<span class="text-transparent">..</span>');
      }
    }

    // Split into 8-byte halves for readability (standard hex editor gap)
    const firstHalf = hexParts.slice(0, 8).join(' ');
    const secondHalf = hexParts.slice(8, 16).join(' ');

    // Format ASCII values
    const asciiChars = rowBytes.map((byte) => {
      if (byte >= 32 && byte <= 126) {
        return `<span class="text-purple-300">${String.fromCharCode(byte)}</span>`;
      }
      return '<span class="text-slate-700">.</span>';
    }).join('');

    return (
      <div
        key={rowIndex}
        style={{
          position: 'absolute',
          top: rowIndex * ROW_HEIGHT,
          left: 0,
          right: 0,
          height: ROW_HEIGHT,
        }}
        className="flex items-center text-xs font-mono border-b border-slate-900/20 hover:bg-slate-900/30 px-4"
      >
        {/* Offset */}
        <span className="text-slate-500 select-none mr-8 font-semibold">
          {formatOffset(rowVirtualAddr)}
        </span>

        {/* Hex representation */}
        <span className="flex-1 flex gap-4 mr-8 select-all">
          <span dangerouslySetInnerHTML={{ __html: firstHalf }} />
          <span dangerouslySetInnerHTML={{ __html: secondHalf }} />
        </span>

        {/* ASCII representation */}
        <span 
          className="w-40 border-l border-slate-800/80 pl-6 select-all font-mono tracking-wide"
          dangerouslySetInnerHTML={{ __html: asciiChars }}
        />
      </div>
    );
  };

  const visibleRows: React.ReactNode[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    visibleRows.push(renderHexRow(i));
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0d0e12]">
      {/* Header bar */}
      <div className="flex items-center px-4 py-2 bg-[#13151c] border-b border-[#1e2230] text-xs font-mono text-slate-400 select-none">
        <span className="w-[120px] lg:w-[150px] font-semibold">OFFSET</span>
        <span className="flex-grow flex gap-4 pl-4 font-semibold">
          <span>00 01 02 03 04 05 06 07</span>
          <span className="pl-4">08 09 0A 0B 0C 0D 0E 0F</span>
        </span>
        <span className="w-40 border-l border-slate-800 pl-6 font-semibold">ASCII</span>
      </div>

      {/* Scrollable Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-grow overflow-y-auto relative bg-[#090a0f]"
      >
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
      </div>
    </div>
  );
};
