import type { ParsedBinary, BinarySection, BinarySymbol } from './types';

export function parseELF(data: Uint8Array, fileName: string): ParsedBinary {
  if (data.length < 52) {
    throw new Error('File too small to be an ELF binary (ELF header requires at least 52 bytes).');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // 1. Verify Magic Bytes: 0x7F 'E' 'L' 'F'
  if (data[0] !== 0x7F || data[1] !== 0x45 || data[2] !== 0x4C || data[3] !== 0x46) {
    throw new Error('Invalid ELF signature.');
  }

  // 2. Read ELF Class (Bitness): 1 = 32-bit, 2 = 64-bit
  const elfClass = data[4];
  if (elfClass !== 1 && elfClass !== 2) {
    throw new Error(`Invalid ELF class (${elfClass}).`);
  }
  const bitness = elfClass === 1 ? 32 : 64;

  // 3. Read ELF Data Encoding (Endianness): 1 = Little-endian, 2 = Big-endian
  const elfData = data[5];
  if (elfData !== 1 && elfData !== 2) {
    throw new Error(`Invalid ELF endianness encoding (${elfData}).`);
  }
  const isLittleEndian = elfData === 1;
  const endianness = isLittleEndian ? 'little' : 'big';

  // Helper functions to read multi-byte values based on endianness and bitness
  const readU16 = (offset: number) => view.getUint16(offset, isLittleEndian);
  const readU32 = (offset: number) => view.getUint32(offset, isLittleEndian);
  const readU64 = (offset: number) => {
    const low = view.getUint32(offset, isLittleEndian);
    const high = view.getUint32(offset + 4, isLittleEndian);
    if (isLittleEndian) {
      return low + high * 0x100000000;
    } else {
      return high + low * 0x100000000;
    }
  };
  const readAddress = (offset: number) => {
    return bitness === 32 ? readU32(offset) : readU64(offset);
  };

  // 4. Read Machine (CPU Architecture)
  const machine = readU16(18);
  let architecture: ParsedBinary['architecture'] = 'unknown';
  switch (machine) {
    case 0x03: // EM_386
      architecture = 'x86';
      break;
    case 0x3E: // EM_X86_64
      architecture = 'x86_64';
      break;
    case 0x28: // EM_ARM
      architecture = 'arm';
      break;
    case 0xB7: // EM_AARCH64
      architecture = 'arm64';
      break;
  }

  // 5. Read Entry Point Address
  const entryPoint = readAddress(24);

  // 6. Read Section Headers Table Offset and properties
  let e_shoff = 0;
  let e_shentsize = 0;
  let e_shnum = 0;
  let e_shstrndx = 0;

  if (bitness === 32) {
    e_shoff = readU32(32);
    e_shentsize = readU16(46);
    e_shnum = readU16(48);
    e_shstrndx = readU16(50);
  } else {
    e_shoff = readAddress(40);
    e_shentsize = readU16(58);
    e_shnum = readU16(60);
    e_shstrndx = readU16(62);
  }

  if (e_shoff === 0 || e_shnum === 0) {
    throw new Error('This ELF binary has no section headers, which are required for disassembly.');
  }

  if (e_shoff + e_shnum * e_shentsize > data.length) {
    throw new Error('Section headers table offset out of file bounds.');
  }

  // 7. Load Section Name String Table (.shstrtab)
  const shstrtabHeaderOffset = e_shoff + e_shstrndx * e_shentsize;
  let shstrtabOffset = 0;
  let shstrtabSize = 0;

  if (bitness === 32) {
    shstrtabOffset = readU32(shstrtabHeaderOffset + 16);
    shstrtabSize = readU32(shstrtabHeaderOffset + 20);
  } else {
    shstrtabOffset = readAddress(shstrtabHeaderOffset + 24);
    shstrtabSize = readAddress(shstrtabHeaderOffset + 32);
  }

  const readString = (offset: number, stringTableOffset: number, stringTableSize: number): string => {
    if (offset < 0 || offset >= stringTableSize) return '';
    let name = '';
    let curr = stringTableOffset + offset;
    while (curr < data.length) {
      const char = data[curr];
      if (char === 0) break;
      name += String.fromCharCode(char);
      curr++;
    }
    return name;
  };

  // 8. Parse Sections
  const sections: BinarySection[] = [];
  interface ElfSectionRaw {
    name: string;
    type: number;
    flags: number;
    addr: number;
    offset: number;
    size: number;
    link: number;
    entsize: number;
    index: number;
  }
  const rawSections: ElfSectionRaw[] = [];

  for (let i = 0; i < e_shnum; i++) {
    const sectionOffset = e_shoff + i * e_shentsize;
    
    let sh_name = 0;
    let sh_type = 0;
    let sh_flags = 0;
    let sh_addr = 0;
    let sh_offset = 0;
    let sh_size = 0;
    let sh_link = 0;
    let sh_entsize = 0;

    if (bitness === 32) {
      sh_name = readU32(sectionOffset);
      sh_type = readU32(sectionOffset + 4);
      sh_flags = readU32(sectionOffset + 8);
      sh_addr = readU32(sectionOffset + 12);
      sh_offset = readU32(sectionOffset + 16);
      sh_size = readU32(sectionOffset + 20);
      sh_link = readU32(sectionOffset + 24);
      sh_entsize = readU32(sectionOffset + 36);
    } else {
      sh_name = readU32(sectionOffset);
      sh_type = readU32(sectionOffset + 4);
      sh_flags = readAddress(sectionOffset + 8);
      sh_addr = readAddress(sectionOffset + 16);
      sh_offset = readAddress(sectionOffset + 24);
      sh_size = readAddress(sectionOffset + 32);
      sh_link = readU32(sectionOffset + 40);
      sh_entsize = readAddress(sectionOffset + 56);
    }

    const name = readString(sh_name, shstrtabOffset, shstrtabSize);
    
    // SHF_EXECINSTR (0x4) indicates instructions, SHF_ALLOC (0x2) allocates memory in image
    const isExecutable = (sh_flags & 0x4) !== 0 && sh_addr > 0;

    const section: BinarySection = {
      name: name || `sec_${i}`,
      virtualAddress: sh_addr,
      virtualSize: sh_size,
      fileOffset: sh_offset,
      fileSize: sh_size,
      isExecutable
    };

    sections.push(section);
    rawSections.push({
      name: name || `sec_${i}`,
      type: sh_type,
      flags: sh_flags,
      addr: sh_addr,
      offset: sh_offset,
      size: sh_size,
      link: sh_link,
      entsize: sh_entsize,
      index: i
    });
  }

  // 9. Parse Symbol Tables (.symtab / .dynsym)
  const symbols: BinarySymbol[] = [];

  for (const rawSec of rawSections) {
    // SHT_SYMTAB (2) or SHT_DYNSYM (11)
    if (rawSec.type === 2 || rawSec.type === 11) {
      const symtabOffset = rawSec.offset;
      const symtabSize = rawSec.size;
      const entsize = rawSec.entsize || (bitness === 32 ? 16 : 24);
      
      // Get associated string table section (sh_link points to string table section header index)
      const strtabSecIndex = rawSec.link;
      if (strtabSecIndex >= e_shnum) continue;
      const strtabSec = rawSections[strtabSecIndex];
      const stringTableOffset = strtabSec.offset;
      const stringTableSize = strtabSec.size;

      const numSymbols = Math.floor(symtabSize / entsize);
      for (let j = 0; j < numSymbols; j++) {
        const entryOffset = symtabOffset + j * entsize;
        if (entryOffset + entsize > data.length) break;

        let st_name = 0;
        let st_value = 0;
        let st_size = 0;
        let st_info = 0;

        if (bitness === 32) {
          st_name = readU32(entryOffset);
          st_value = readU32(entryOffset + 4);
          st_size = readU32(entryOffset + 8);
          st_info = data[entryOffset + 12];
        } else {
          st_name = readU32(entryOffset);
          st_info = data[entryOffset + 4];
          st_value = readAddress(entryOffset + 8);
          st_size = readAddress(entryOffset + 16);
        }

        if (st_value === 0) continue; // Skip undefined/external references

        const name = readString(st_name, stringTableOffset, stringTableSize);
        if (!name) continue;

        // ELF Symbol Bind / Type (st_info: lower 4 bits are type, upper 4 bits are binding)
        const symType = st_info & 0xF;
        
        let type: BinarySymbol['type'] = 'other';
        if (symType === 2) { // STT_FUNC
          type = 'function';
        } else if (symType === 1) { // STT_OBJECT
          type = 'object';
        }

        // We only care about functions and objects for disassembling / target resolution
        if (type === 'function' || type === 'object') {
          // Avoid duplicate symbols at same address
          if (!symbols.some(s => s.address === st_value && s.name === name)) {
            symbols.push({
              name,
              address: st_value,
              size: st_size,
              type
            });
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

  // In ELF, image base can be assumed to be 0 or the address of the first loadable segment,
  // but for relative addressing, standard ELF virtual addresses are absolute. 
  // Let's set imageBase to 0 or the lowest executable section address.
  const execSections = sections.filter(s => s.isExecutable);
  const imageBase = execSections.length > 0 ? Math.min(...execSections.map(s => s.virtualAddress)) : 0;

  return {
    format: 'ELF',
    architecture,
    bitness,
    endianness,
    entryPoint,
    imageBase,
    sections,
    symbols,
    fileName,
    fileSize: data.length
  };
}
