/**
 * FEC bulk file downloader.
 * Downloads pipe-delimited bulk data files from fec.gov for a given election cycle.
 *
 * File types:
 * - cn: Candidate master
 * - cm: Committee master
 * - ccl: Candidate-committee linkage
 * - indiv: Individual contributions
 * - pas2: Committee-to-committee contributions
 * - oth: Other committee transactions (operating expenditures)
 */

import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

const FEC_BULK_BASE_URL = 'https://cg-519a459a-0ea3-42c2-b7bc-fa1143481f74.s3-us-gov-west-1.amazonaws.com/bulk-downloads';

export const FEC_FILE_TYPES = ['cn', 'cm', 'ccl', 'indiv', 'pas2', 'oth'] as const;
export type FecFileType = (typeof FEC_FILE_TYPES)[number];

export const FEC_FILE_DESCRIPTIONS: Record<FecFileType, string> = {
  cn: 'Candidate Master',
  cm: 'Committee Master',
  ccl: 'Candidate-Committee Linkage',
  indiv: 'Individual Contributions',
  pas2: 'Committee-to-Committee Contributions',
  oth: 'Other Disbursements / Operating Expenditures',
};

export interface DownloadProgress {
  fileType: FecFileType;
  cycle: string;
  bytesDownloaded: number;
  status: 'downloading' | 'complete' | 'error';
  error?: string;
}

/**
 * Build the URL for an FEC bulk data file.
 * Format: https://.../bulk-downloads/{cycle}/{type}{yy}.zip
 */
export function buildFecUrl(fileType: FecFileType, cycle: string): string {
  const yy = cycle.slice(-2);
  return `${FEC_BULK_BASE_URL}/${cycle}/${fileType}${yy}.zip`;
}

/**
 * Download a single FEC bulk file to the specified output directory.
 * Returns the path to the downloaded zip file.
 */
export async function downloadFecFile(
  fileType: FecFileType,
  cycle: string,
  outputDir: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<string> {
  const url = buildFecUrl(fileType, cycle);
  const filename = `${fileType}${cycle.slice(-2)}.zip`;
  const outputPath = path.join(outputDir, filename);

  mkdirSync(outputDir, { recursive: true });

  const response = await fetch(url);
  if (!response.ok) {
    const error = `Failed to download ${url}: ${response.status} ${response.statusText}`;
    onProgress?.({ fileType, cycle, bytesDownloaded: 0, status: 'error', error });
    throw new Error(error);
  }

  if (!response.body) {
    throw new Error(`No response body for ${url}`);
  }

  let bytesDownloaded = 0;
  const reader = response.body.getReader();
  const nodeStream = new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) {
        this.push(null);
        return;
      }
      bytesDownloaded += value.byteLength;
      onProgress?.({ fileType, cycle, bytesDownloaded, status: 'downloading' });
      this.push(Buffer.from(value));
    },
  });

  await pipeline(nodeStream, createWriteStream(outputPath));

  onProgress?.({ fileType, cycle, bytesDownloaded, status: 'complete' });
  return outputPath;
}

/**
 * Download all FEC bulk files for a given election cycle.
 */
export async function downloadAllFecFiles(
  cycle: string,
  outputDir: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<Map<FecFileType, string>> {
  const results = new Map<FecFileType, string>();

  for (const fileType of FEC_FILE_TYPES) {
    const filePath = await downloadFecFile(fileType, cycle, outputDir, onProgress);
    results.set(fileType, filePath);
  }

  return results;
}
