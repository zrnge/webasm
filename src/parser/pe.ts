import type { ParsedBinary, BinarySection, BinarySymbol } from './types';

export function parsePE(data: Uint8Array, fileName: string): ParsedBinary {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // 1. Verify MZ signature
  if (data.length < 64) {
    throw new Error('File too small to be a PE binary (MZ header requires 64 bytes).');
  }
  const mzSig = view.getUint16(0, true);
  if (mzSig !== 0x5A4D) { // 'MZ'
    throw new Error('Invalid DOS signature (expected MZ).');
  }

  // 2. Read offset to PE header (e_lfanew)
  const e_lfanew = view.getUint32(0x3C, true);
  if (e_lfanew + 24 > data.length) {
    throw new Error('Invalid PE header offset (e_lfanew points out of bounds).');
  }

  // 3. Verify PE signature
  const peSig = view.getUint32(e_lfanew, true);
  if (peSig !== 0x00004550) { // 'PE\0\0'
    throw new Error('Invalid PE signature (expected PE\\0\\0).');
  }

  // 4. COFF File Header (starts at e_lfanew + 4)
  const coffHeaderOffset = e_lfanew + 4;
  const machine = view.getUint16(coffHeaderOffset, true);
  const numberOfSections = view.getUint16(coffHeaderOffset + 2, true);
  const sizeOfOptionalHeader = view.getUint16(coffHeaderOffset + 16, true);
  view.getUint16(coffHeaderOffset + 18, true); // characteristics (discarded)


  // Auto-detect architecture and bitness
  let architecture: ParsedBinary['architecture'] = 'unknown';
  let bitness: ParsedBinary['bitness'] = 32;

  switch (machine) {
    case 0x014c: // IMAGE_FILE_MACHINE_I386
      architecture = 'x86';
      bitness = 32;
      break;
    case 0x8664: // IMAGE_FILE_MACHINE_AMD64
      architecture = 'x86_64';
      bitness = 64;
      break;
    case 0x01c0: // IMAGE_FILE_MACHINE_ARM
    case 0x01c4: // IMAGE_FILE_MACHINE_ARMNT
      architecture = 'arm';
      bitness = 32;
      break;
    case 0xaa64: // IMAGE_FILE_MACHINE_ARM64
      architecture = 'arm64';
      bitness = 64;
      break;
  }

  // 5. Optional Header (starts at e_lfanew + 24)
  const optHeaderOffset = e_lfanew + 24;
  if (optHeaderOffset + sizeOfOptionalHeader > data.length) {
    throw new Error('Optional Header size exceeds file bounds.');
  }

  const magic = view.getUint16(optHeaderOffset, true);
  const isPE32Plus = magic === 0x20b; // PE32+ (64-bit)
  const isPE32 = magic === 0x10b;     // PE32 (32-bit)

  if (!isPE32 && !isPE32Plus) {
    throw new Error(`Invalid Optional Header magic (0x${magic.toString(16)}).`);
  }

  // Adjust bitness based on optional header magic (most reliable)
  bitness = isPE32Plus ? 64 : 32;

  const addressOfEntryPoint = view.getUint32(optHeaderOffset + 16, true);
  
  let imageBase = 0;
  let rvaAndSizesOffset = 0;

  if (isPE32Plus) {
    // PE32+ imageBase is 64-bit (offset 24, 8 bytes)
    const low = view.getUint32(optHeaderOffset + 24, true);
    const high = view.getUint32(optHeaderOffset + 28, true);
    imageBase = low + high * 0x100000000;
    rvaAndSizesOffset = optHeaderOffset + 108;
  } else {
    // PE32 imageBase is 32-bit (offset 28, 4 bytes)
    imageBase = view.getUint32(optHeaderOffset + 28, true);
    rvaAndSizesOffset = optHeaderOffset + 92;
  }

  const entryPoint = imageBase + addressOfEntryPoint;

  // 6. Parse Section Table (starts at optHeaderOffset + sizeOfOptionalHeader)
  const sectionTableOffset = optHeaderOffset + sizeOfOptionalHeader;
  const sections: BinarySection[] = [];

  for (let i = 0; i < numberOfSections; i++) {
    const offset = sectionTableOffset + i * 40;
    if (offset + 40 > data.length) break;

    // Read section name (8 bytes ASCII, null-padded)
    const nameBytes: number[] = [];
    for (let j = 0; j < 8; j++) {
      const char = data[offset + j];
      if (char === 0) break;
      nameBytes.push(char);
    }
    const name = String.fromCharCode(...nameBytes);

    const virtualSize = view.getUint32(offset + 8, true);
    const virtualAddress = view.getUint32(offset + 12, true); // RVA
    const fileSize = view.getUint32(offset + 16, true);
    const fileOffset = view.getUint32(offset + 20, true);
    const characteristicsVal = view.getUint32(offset + 36, true);

    // Section characteristics check: IMAGE_SCN_MEM_EXECUTE (0x20000000) or IMAGE_SCN_CNT_CODE (0x00000020)
    const isExecutable = (characteristicsVal & 0x20000000) !== 0;

    sections.push({
      name,
      virtualAddress: imageBase + virtualAddress, // Convert RVA to absolute virtual address
      virtualSize,
      fileOffset,
      fileSize,
      isExecutable
    });
  }

  // Helper function to map RVA to file offset
  const rvaToFileOffset = (rva: number): number => {
    for (const section of sections) {
      const sectionRVA = section.virtualAddress - imageBase;
      if (rva >= sectionRVA && rva < sectionRVA + section.virtualSize) {
        return section.fileOffset + (rva - sectionRVA);
      }
    }
    return -1;
  };

  // 7. Parse Exports for Symbols
  const symbols: BinarySymbol[] = [];
  const numberOfRvaAndSizes = view.getUint32(rvaAndSizesOffset, true);

  if (numberOfRvaAndSizes > 0) {
    // Export Data Directory is the first entry (8 bytes: VirtualAddress, Size)
    const exportTableRVA = view.getUint32(rvaAndSizesOffset + 4, true);
    const exportTableSize = view.getUint32(rvaAndSizesOffset + 8, true);

    if (exportTableRVA > 0 && exportTableSize > 0) {
      const exportFileOffset = rvaToFileOffset(exportTableRVA);
      if (exportFileOffset !== -1 && exportFileOffset + 40 <= data.length) {
        view.getUint32(exportFileOffset + 20, true); // numFunctions (discarded)
        const numNames = view.getUint32(exportFileOffset + 24, true);
        const addressOfFunctions = view.getUint32(exportFileOffset + 28, true);
        const addressOfNames = view.getUint32(exportFileOffset + 32, true);
        const addressOfNameOrdinals = view.getUint32(exportFileOffset + 36, true);

        const functionsOffset = rvaToFileOffset(addressOfFunctions);
        const namesOffset = rvaToFileOffset(addressOfNames);
        const ordinalsOffset = rvaToFileOffset(addressOfNameOrdinals);

        if (functionsOffset !== -1 && namesOffset !== -1 && ordinalsOffset !== -1) {
          for (let i = 0; i < numNames; i++) {
            // Read name RVA
            const nameRVAOffset = namesOffset + i * 4;
            if (nameRVAOffset + 4 > data.length) break;
            const nameRVA = view.getUint32(nameRVAOffset, true);
            const nameFileOffset = rvaToFileOffset(nameRVA);

            if (nameFileOffset !== -1) {
              // Read null-terminated string
              let symName = '';
              let offset = nameFileOffset;
              while (offset < data.length) {
                const char = data[offset];
                if (char === 0) break;
                symName += String.fromCharCode(char);
                offset++;
              }

              // Read ordinal (2 bytes)
              const ordinalOffset = ordinalsOffset + i * 2;
              if (ordinalOffset + 2 > data.length) break;
              const ordinal = view.getUint16(ordinalOffset, true);

              // Read function RVA using ordinal
              const funcRVAOffset = functionsOffset + ordinal * 4;
              if (funcRVAOffset + 4 > data.length) break;
              const funcRVA = view.getUint32(funcRVAOffset, true);

              symbols.push({
                name: symName,
                address: imageBase + funcRVA,
                size: 0, // Export directory doesn't specify size
                type: 'function'
              });
            }
          }
        }
      }
    }
  }

  // Proactively add Entry Point as a symbol if not already present
  if (!symbols.some(s => s.address === entryPoint)) {
    symbols.push({
      name: 'EntryPoint',
      address: entryPoint,
      size: 0,
      type: 'function'
    });
  }

  return {
    format: 'PE',
    architecture,
    bitness,
    endianness: 'little', // PE is always little-endian
    entryPoint,
    imageBase,
    sections,
    symbols,
    fileName,
    fileSize: data.length
  };
}
