import path from 'node:path';

/** The repository root, whatever folder a test file sits in. */
export const REPO = path.resolve(import.meta.dirname, '../..');
