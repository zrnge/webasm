import { loadCapstone, Capstone, Const } from 'capstone-wasm';
import type { Insn } from 'capstone-wasm';
import { parsePE } from '../parser/pe';
import { parseELF } from '../parser/elf';
import type { ParsedBinary, BinarySection } from '../parser/types';

let isCapstoneLoaded = false;

// Listen for messages from the main thread
self.onmessage = async (e: MessageEvent) => {
  const { action, payload } = e.data;

  try {
    switch (action) {
      case 'INIT': {
        const { wasmUrl } = payload;
        if (!isCapstoneLoaded) {
          await loadCapstone({
            locateFile: (path: string) => {
              if (path.endsWith('.wasm')) {
                return wasmUrl;
              }
              return path;
            }
          });
          isCapstoneLoaded = true;
        }
        self.postMessage({ type: 'INIT_SUCCESS' });
        break;
      }

      case 'PARSE_FILE': {
        const { fileName, fileData } = payload; // fileData is ArrayBuffer
        const bytes = new Uint8Array(fileData);

        // Detect format by magic bytes
        if (bytes.length < 4) {
          throw new Error('File too small to be a binary.');
        }

        let parsed: ParsedBinary;
        if (bytes[0] === 0x4D && bytes[1] === 0x5A) { // 'MZ'
          parsed = parsePE(bytes, fileName);
        } else if (bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46) { // '\x7fELF'
          parsed = parseELF(bytes, fileName);
        } else {
          throw new Error('Unsupported file format. Please upload a PE (.exe/.dll) or ELF binary.');
        }

        self.postMessage({ type: 'PARSE_SUCCESS', payload: parsed });
        break;
      }

      case 'DISASSEMBLE_SECTION': {
        const { 
          section, 
          fileData, 
          architecture, 
          bitness, 
          endianness, 
          syntax, // 'intel' | 'att'
          modeType, // 'linear' | 'recursive'
          entryPoint,
          symbols 
        } = payload;

        if (!isCapstoneLoaded) {
          throw new Error('Capstone WASM is not initialized.');
        }

        const bytes = new Uint8Array(fileData);
        const sectionBytes = bytes.subarray(section.fileOffset, section.fileOffset + section.fileSize);

        // Map architecture and mode to Capstone constants
        let csArch = Const.CS_ARCH_X86;
        let csMode = Const.CS_MODE_32;

        if (architecture === 'x86_64') {
          csArch = Const.CS_ARCH_X86;
          csMode = Const.CS_MODE_64;
        } else if (architecture === 'x86') {
          csArch = Const.CS_ARCH_X86;
          csMode = bitness === 64 ? Const.CS_MODE_64 : Const.CS_MODE_32;
        } else if (architecture === 'arm') {
          csArch = Const.CS_ARCH_ARM;
          csMode = endianness === 'big' ? Const.CS_MODE_BIG_ENDIAN : Const.CS_MODE_LITTLE_ENDIAN;
        } else if (architecture === 'arm64') {
          csArch = Const.CS_ARCH_ARM64;
          csMode = Const.CS_MODE_ARM; // ARM64 mode is ARM
        }

        const capstone = new Capstone(csArch, csMode);

        // Apply syntax option for x86/x64
        if (architecture === 'x86' || architecture === 'x86_64') {
          if (syntax === 'att') {
            capstone.setOption(Const.CS_OPT_SYNTAX, Const.CS_OPT_SYNTAX_ATT);
          } else {
            capstone.setOption(Const.CS_OPT_SYNTAX, Const.CS_OPT_SYNTAX_INTEL);
          }
        }

        let instructions: Insn[] = [];

        if (modeType === 'recursive') {
          instructions = disassembleRecursive(
            capstone,
            sectionBytes,
            section,
            entryPoint,
            symbols,
            architecture
          );
        } else {
          instructions = disassembleLinear(
            capstone,
            sectionBytes,
            section.virtualAddress
          );
        }

        capstone.close();

        // Convert bigints to numbers for worker serialization safety if any exist
        const serializedInstructions = instructions.map(insn => ({
          id: insn.id,
          address: typeof insn.address === 'bigint' ? Number(insn.address) : insn.address,
          size: insn.size,
          bytes: insn.bytes,
          mnemonic: insn.mnemonic,
          opStr: insn.opStr
        }));

        self.postMessage({ type: 'DISASSEMBLE_SUCCESS', payload: serializedInstructions });
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', payload: err.message || String(err) });
  }
};

/**
 * Resilient linear sweep disassembly
 */
function disassembleLinear(capstone: Capstone, bytes: Uint8Array, startAddress: number): Insn[] {
  let offset = 0;
  const insns: Insn[] = [];

  while (offset < bytes.length) {
    try {
      const chunk = bytes.subarray(offset);
      const chunkAddr = startAddress + offset;
      const chunkInsns = capstone.disasm(chunk, { address: chunkAddr });

      if (chunkInsns.length === 0) {
        offset += 1; // Skip 1 byte if invalid to recover
      } else {
        insns.push(...chunkInsns);
        for (const insn of chunkInsns) {
          offset += insn.size;
        }
      }
    } catch {
      offset += 1; // Skip 1 byte on error
    }
  }

  return insns;
}

/**
 * Control-flow-aware recursive descent disassembly with linear sweep fallback for gaps
 */
function disassembleRecursive(
  capstone: Capstone,
  bytes: Uint8Array,
  section: BinarySection,
  entryPoint: number,
  symbols: { address: number }[],
  architecture: string
): Insn[] {
  const visited = new Set<number>();
  const queue: number[] = [];
  const insnMap = new Map<number, Insn>();

  // Add entry point if it falls inside this section
  if (entryPoint >= section.virtualAddress && entryPoint < section.virtualAddress + section.virtualSize) {
    queue.push(entryPoint);
  }

  // Add symbol/export addresses that fall inside this section
  for (const sym of symbols) {
    if (sym.address >= section.virtualAddress && sym.address < section.virtualAddress + section.virtualSize) {
      if (!queue.includes(sym.address)) {
        queue.push(sym.address);
      }
    }
  }

  // Fallback: If no entry point or symbols reside in this section, default to section start address
  if (queue.length === 0) {
    queue.push(section.virtualAddress);
  }

  // Tracing control flow
  while (queue.length > 0) {
    const startAddr = queue.shift()!;
    if (visited.has(startAddr)) continue;

    let currAddr = startAddr;
    while (true) {
      if (visited.has(currAddr)) break;

      const offset = currAddr - section.virtualAddress;
      if (offset < 0 || offset >= bytes.length) break;

      let result: Insn[] = [];
      try {
        result = capstone.disasm(bytes.subarray(offset), { address: currAddr, count: 1 });
      } catch {
        break; // Stop tracing this path on disassembly error
      }

      if (result.length === 0) {
        break; // Invalid instruction, stop tracing this path
      }

      const insn = result[0];
      const insnAddr = typeof insn.address === 'bigint' ? Number(insn.address) : insn.address;
      
      visited.add(insnAddr);
      insnMap.set(insnAddr, insn);

      // Parse target address if it exists in operands
      const targetAddress = parseTargetAddress(insn.opStr);
      const isTargetInSection = targetAddress !== null && 
                                targetAddress >= section.virtualAddress && 
                                targetAddress < section.virtualAddress + section.virtualSize;

      // Classify control flow
      const flow = classifyInstruction(insn.mnemonic, architecture);

      if (flow === 'call') {
        if (isTargetInSection && targetAddress !== null) {
          queue.push(targetAddress);
        }
        // Calls fall through to next instruction
        currAddr += insn.size;
      } else if (flow === 'cond-jump') {
        if (isTargetInSection && targetAddress !== null) {
          queue.push(targetAddress);
        }
        // Conditional branches fall through as well
        currAddr += insn.size;
      } else if (flow === 'uncond-jump') {
        if (isTargetInSection && targetAddress !== null) {
          queue.push(targetAddress);
        }
        break; // Stop tracing current straight-line path
      } else if (flow === 'return') {
        break; // End current path on return
      } else {
        // Normal instruction, fall through
        currAddr += insn.size;
      }
    }
  }

  // Create list of instructions parsed by recursive descent
  const recursiveInsns = Array.from(insnMap.values()).sort((a, b) => {
    const addrA = typeof a.address === 'bigint' ? Number(a.address) : a.address;
    const addrB = typeof b.address === 'bigint' ? Number(b.address) : b.address;
    return addrA - addrB;
  });

  // Fall back to Linear Sweep for any gaps to verify we don't leave empty holes in rendering
  const finalInsns: Insn[] = [];
  let currentAddr = section.virtualAddress;
  let recIndex = 0;

  while (currentAddr < section.virtualAddress + bytes.length) {
    if (recIndex < recursiveInsns.length) {
      const recInsn = recursiveInsns[recIndex];
      const recAddr = typeof recInsn.address === 'bigint' ? Number(recInsn.address) : recInsn.address;

      if (currentAddr === recAddr) {
        // Matches recursive descent trace instruction
        finalInsns.push(recInsn);
        currentAddr += recInsn.size;
        recIndex++;
        continue;
      }

      if (currentAddr < recAddr) {
        // Gap exists between currentAddr and recAddr. Linear sweep the gap!
        const gapBytes = bytes.subarray(currentAddr - section.virtualAddress, recAddr - section.virtualAddress);
        const gapInsns = disassembleLinear(capstone, gapBytes, currentAddr);
        finalInsns.push(...gapInsns);
        currentAddr = recAddr;
        continue;
      }

      // If currentAddr > recAddr (should not happen if sorted properly), sync up indices
      recIndex++;
    } else {
      // No more recursive instructions, linear sweep the remainder of the section
      const remainderBytes = bytes.subarray(currentAddr - section.virtualAddress);
      const remainderInsns = disassembleLinear(capstone, remainderBytes, currentAddr);
      finalInsns.push(...remainderInsns);
      break;
    }
  }

  return finalInsns.sort((a, b) => {
    const addrA = typeof a.address === 'bigint' ? Number(a.address) : a.address;
    const addrB = typeof b.address === 'bigint' ? Number(b.address) : b.address;
    return addrA - addrB;
  });
}

/**
 * Extract hex addresses from operand string
 */
function parseTargetAddress(opStr: string): number | null {
  // Matches typical hex addresses: 0x140001000, 0x1030, etc.
  const hexMatch = opStr.match(/0x[0-9a-fA-F]+/);
  if (hexMatch) {
    return parseInt(hexMatch[0], 16);
  }
  
  // Matches decimal branches in some formats
  const decMatch = opStr.match(/\b\d+\b/);
  if (decMatch) {
    const val = parseInt(decMatch[0], 10);
    // Ignore small constant values that aren't memory addresses
    if (val > 0x1000) {
      return val;
    }
  }
  
  return null;
}

/**
 * Classify control flow behavior of instructions
 */
function classifyInstruction(mnemonic: string, arch: string): 'call' | 'uncond-jump' | 'cond-jump' | 'return' | 'normal' {
  const m = mnemonic.toLowerCase();

  if (arch === 'x86' || arch === 'x86_64') {
    if (m === 'call') return 'call';
    if (m === 'jmp' || m === 'jmpq') return 'uncond-jump';
    if (m === 'ret' || m === 'retn' || m === 'sysret') return 'return';
    if (m.startsWith('j')) return 'cond-jump'; // je, jne, jz, jnz, jg, jl, etc.
  } 
  else if (arch === 'arm' || arch === 'arm64') {
    if (m === 'bl' || m === 'blx') return 'call';
    if (m === 'b' || m === 'br' || m === 'bx') {
      // In ARM, bx lr is return, bx reg is unconditional jump
      return 'uncond-jump';
    }
    if (m === 'ret') return 'return';
    if (m.startsWith('b.') || m === 'cbz' || m === 'cbnz' || m === 'tbz' || m === 'tbnz') {
      return 'cond-jump'; // Conditional branches
    }
  }

  return 'normal';
}
