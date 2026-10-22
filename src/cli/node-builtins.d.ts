// Minimal typings for the few Node built-ins the CLI entry point uses; the project does not
// ship @types/node (the rest of src/ is browser code).
declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string): void;
}

declare module 'node:path' {
  export function resolve(...segments: string[]): string;
}
