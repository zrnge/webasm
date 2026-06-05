declare module 'capstone-wasm' {
  export interface Insn {
    id: number;
    address: number | bigint;
    size: number;
    bytes: Uint8Array;
    mnemonic: string;
    opStr: string;
  }

  export class Capstone {
    constructor(arch: number, mode: number);
    setOption(opt: number, value: any): number;
    close(): void;
    disasm(data: number[] | Uint8Array, options?: {
      address?: number | bigint;
      count?: number;
    }): Insn[];
    getRegName(id: number): string;
    getInsnName(id: number): string;
    getGroupName(id: number): string;
    errNo(): number;
  }

  export function loadCapstone(args?: Record<string, unknown>): Promise<void>;

  export const Const: Record<string, number>;
}
