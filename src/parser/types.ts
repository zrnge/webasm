export interface BinarySection {
  name: string;
  virtualAddress: number; // Virtual address in memory (including image base)
  virtualSize: number;
  fileOffset: number;     // Raw offset in the binary file
  fileSize: number;
  isExecutable: boolean;
}

export interface BinarySymbol {
  name: string;
  address: number;        // Virtual address of the symbol
  size: number;
  type: 'function' | 'object' | 'other';
}

export interface ParsedBinary {
  format: 'PE' | 'ELF';
  architecture: 'x86' | 'x86_64' | 'arm' | 'arm64' | 'unknown';
  bitness: 32 | 64;
  endianness: 'little' | 'big';
  entryPoint: number;     // Entry point virtual address
  imageBase: number;      // Image base address
  sections: BinarySection[];
  symbols: BinarySymbol[];
  fileName: string;
  fileSize: number;
}
