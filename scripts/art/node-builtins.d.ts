// Minimal typings for the Node built-ins the art scripts use; the project does not ship
// @types/node (src/ is browser code).
declare module 'node:child_process' {
  interface ReadableText {
    on(event: 'data', listener: (chunk: { toString(): string }) => void): this;
  }
  interface WritableText {
    write(data: string): boolean;
    end(): void;
  }
  export interface ChildProcess {
    readonly stdin: WritableText;
    readonly stdout: ReadableText;
    readonly stderr: ReadableText;
    kill(signal?: string): boolean;
    on(event: 'close', listener: (code: number | null, signal: string | null) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
  }
  export function spawn(command: string, args: readonly string[], options: { cwd?: string; stdio?: readonly ('pipe' | 'ignore')[] }): ChildProcess;
}

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options: { recursive: true }): void;
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string): void;
  export function appendFileSync(path: string, data: string): void;
  export function copyFileSync(from: string, to: string): void;
  export function renameSync(from: string, to: string): void;
  export function rmSync(path: string, options: { recursive: true; force: true }): void;
  export function statSync(path: string): { readonly mtimeMs: number; readonly size: number; isDirectory(): boolean };
}

declare module 'node:path' {
  export function join(...segments: string[]): string;
  export function relative(from: string, to: string): string;
}

declare const process: {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  cwd(): string;
  exitCode?: number;
};
