export class MarkersNotLoadedError extends Error {
  constructor(reason: string);
}
export function parseArgs(argv: string[]): { version: string; registry: boolean };
export function loadMarkers(file: string): string[];
export interface ScannedFile {
  path: string;
  content: string | Uint8Array;
}
export interface ScanResult {
  filesChecked: number;
  contentHits: number;
  nameHits: number;
  contentFiles: string[];
}
export function scanFiles(files: ScannedFile[], markers: string[]): ScanResult;
export function formatScan(result: ScanResult): string;
export function checkAttestation(json: unknown, want: { version: string; commit: string }): { ok: true } | { ok: false; reason: string };
