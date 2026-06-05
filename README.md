# WEBASM - Web Disassembler

[![Author](https://img.shields.io/badge/Author-Zrnge-purple?style=for-the-badge&logo=github)](https://github.com/zrnge)
[![Website](https://img.shields.io/badge/Website-zrnge.github.io-blue?style=for-the-badge&logo=google-chrome)](https://zrnge.github.io)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](https://github.com/zrnge/Online-Disassembler/blob/main/LICENSE)

WEBASM is a premium, 100% client-side multi-architecture static disassembler designed for security analysts and reverse engineers. It runs entirely in the web browser with **no backend servers**, meaning uploaded binaries never leave your machine. It is pre-configured to build and deploy directly as a static site on GitHub Pages.

Live Example: [zrnge.github.io/Online-Disassembler/](https://zrnge.github.io/Online-Disassembler/)

---

## 🚀 Key Features

- **Multi-Architecture Support**: Supports disassembling machine code for **x86**, **x86-64**, **ARM**, and **ARM64** at minimum, leveraging the industry-standard **Capstone Disassembly Engine** compiled to WebAssembly.
- **Client-Side File Parsing**:
  - Automatically detects binary format using magic bytes: `MZ` for PE (`.exe` / `.dll`) and `\x7fELF` for ELF.
  - Automatically parses headers to detect architecture and bitness.
  - Extracts entry point (`AddressOfEntryPoint` / `e_entry`) and executable sections (e.g., `.text`).
  - Resolves function names from **PE Export Directories** and **ELF Symbol Tables** (`.symtab` / `.dynsym`).
- **Interactive Disassembly View**:
  - Virtualized list rendering that handles large sections with millions of instructions at 60 FPS.
  - Interactive operand jumps: clicking a branch target (like `0x401020`) scrolls the view directly to that instruction.
  - Highlights the binary's entry point with custom branding.
  - Resolves call/jump target addresses to symbols inline (e.g. `call 0x401050 <_printf>`).
  - Toggle between **Linear Sweep** and control-flow-aware **Recursive Descent** disassembly.
  - Toggle x86 syntax style between **Intel** and **AT&T**.
- **Integrated Hex Viewer**:
  - Side-by-side virtualized 16-byte aligned Hex Dump representing file offsets, hex values, and ASCII representation.
- **Background Multi-Threading**:
  - All heavy lifting (parsing, loading WASM, and disassembling) is executed inside a background **Web Worker** to prevent browser freezes or lag.
- **Local & Secure**:
  - **No telemetry, no tracking, no backend.** All processing is performed locally on the client machine. Safe for proprietary or confidential malware analysis.

---

## 🛠️ Technology Stack

- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS v4 (with cyber dark aesthetic)
- **Disassembly Core**: `capstone-wasm` (WASM port of Capstone v5.0)
- **Icons**: `lucide-react`
- **CI/CD**: GitHub Actions

---

## 📂 Repository Structure

```
├── .github/workflows/
│   └── deploy.yml           # GitHub Actions workflow for Page builds
├── public/
│   └── favicon.ico          # Favicon icon
├── src/
│   ├── components/
│   │   ├── DisassemblyView.tsx # Custom virtualized scroll instruction table
│   │   ├── FileDropzone.tsx    # Drag-and-drop uploader with security badge
│   │   ├── HexView.tsx         # Virtualized hex editor-style dump panel
│   │   └── MetadataView.tsx    # Sidebar sections/symbols tabs & search
│   ├── parser/
│   │   ├── elf.ts              # Pure TypeScript ELF binary parser
│   │   ├── pe.ts               # Pure TypeScript PE binary parser
│   │   ├── types.ts            # Common parsing type declarations
│   │   └── index.ts
│   ├── worker/
│   │   └── disassembler.worker.ts # Background thread disassembler
│   ├── App.tsx                 # Core workspace state coordinator
│   ├── index.css               # Tailwind CSS imports & theme definitions
│   └── main.tsx                # React mount entrypoint
├── package.json                # Project dependencies
├── tsconfig.json               # TypeScript configuration
├── vite.config.ts              # Vite config (WASM copying & relative pathing)
└── README.md                   # Documentation
```

---

## ⚙️ How to Build and Run Locally

### Prerequisites
- Node.js (v18 or higher recommended)
- npm

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
This boots up a local Vite dev server. The Vite configuration automatically hooks the setup and copies `capstone.wasm` to the `public/` folder for browser delivery.
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Build for Production
This bundles all JavaScript, CSS, and WebAssembly assets using relative paths inside a standalone `dist/` directory.
```bash
npm run build
```

---

## 🌐 How to Deploy to GitHub Pages

The project includes an automated deployment workflow.

### Automated (GitHub Actions)
1. Commit and push the repository to GitHub.
2. Ensure your repository has **Read and write permissions** enabled for workflows:
   - Go to your repository **Settings** -> **Actions** -> **General** -> scroll down to **Workflow permissions**.
   - Select **Read and write permissions** and click **Save**.
3. Push to the `main` branch. GitHub Actions will trigger `.github/workflows/deploy.yml` which builds the project and pushes the compiled assets to the `gh-pages` branch.
4. Go to **Settings** -> **Pages** and ensure the source is set to deploy from the `gh-pages` branch.

---

## 🔍 Technical Details & Architecture

### Capstone WASM Copying & Resolution
To support relative subpath routing on GitHub Pages (e.g. `https://<user>.github.io/<repo-name>/`), we:
1. Copy the Capstone engine binary (`capstone.wasm`) directly into our public static assets using a custom hook in `vite.config.ts`.
2. Resolve its path dynamically inside `App.tsx` relative to the loaded page origin and runtime base URL:
   ```typescript
   const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);
   const wasmUrl = new URL('capstone.wasm', baseUrl).href;
   ```
3. Pass `wasmUrl` into the background Web Worker, which passes it to Capstone's module factory override:
   ```typescript
   await loadCapstone({
     locateFile: (path) => path.endsWith('.wasm') ? wasmUrl : path
   });
   ```

### Disassembly Mode Differences
- **Linear Sweep**: Loops sequentially through raw bytes from section start to section end, decoding everything. If an invalid instruction byte is encountered, it skips a byte and attempts decoding the next chunk.
- **Recursive Descent**: Begins tracing execution paths starting at the entry point and known symbol exports. It parses jump and call target addresses from operand text and queues them for disassembly. When an unconditional branch (`jmp` / `ret` / `bx lr`) is hit, it terminates the trace line and takes the next item from the queue. Gaps between traced code are filled via a secondary linear sweep pass.

---

## ⚠️ Limitations & Notes

- **Deobfuscation & Packing**: This is a static disassembler. Packed or heavily obfuscated binaries (e.g., UPX, VMProtect) will display encrypted/compressed section payloads or stub loaders. Dynamic analysis or unpacking is required before disassembly.
- **Decompilation**: This tool outputs raw assembly mnemonics (Capstone). It does not contain a decompiler (C-like pseudocode generator) or control-flow graph (CFG) rendering, which require native graph solvers.
- **Symbol Names**: Symbol names are extracted from standard header tables (Exports for PE, `.symtab` / `.dynsym` for ELF). If a binary has been stripped of symbols (which is typical for release builds or malicious files), function targets will be resolved to standard addresses instead of names.

---

## 👤 Author

Developed and maintained by **Zrnge**
- **GitHub**: [@zrnge](https://github.com/zrnge)
- **Website & Projects**: [zrnge.github.io](https://zrnge.github.io)
- **Repository**: [WEBASM (Online-Disassembler)](https://github.com/zrnge/Online-Disassembler)
