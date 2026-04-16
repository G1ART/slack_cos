import path from 'node:path';
import fs from 'node:fs/promises';
import { cosRuntimeBaseDir } from '../executionLedger.js';

/** @param {string} sub */
export async function cosToolArtifactSubdir(sub) {
  const dir = path.join(cosRuntimeBaseDir(), 'artifacts', sub);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
