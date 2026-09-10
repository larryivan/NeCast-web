// Loading and addressing the corpus explorer's data (built by scripts/build_explorer_data.py).
import { parquetMetadata, parquetRead } from 'hyparquet';

export const REPO = 'Larrivhan/NeCast-simulations';
export const HF_BASE = `https://huggingface.co/datasets/${REPO}/resolve/main/`;
export const MIRROR_BASE = `https://hf-mirror.com/datasets/${REPO}/resolve/main/`;
const DATA_URL = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}data/explorer/`;

export interface Summary {
  generated: string;
  windows: number;
  fragments: number;
  bytes: { npz: number; jsonl: number };
  time_edges: number[];
  labels: { scale: number; dtype: string; rows_per_file: number; files: number };
  families: { key: string; colour: string; windows: number }[];
  maps: { key: string; windows: number }[];
  splits: { key: string; windows: number }[];
  stages: { key: string; windows: number }[];
  sites: { min: number; max: number };
}

/** One typed array per column; row r of every array describes the same window. */
export interface Columns {
  n: number;
  window: Int32Array;
  family: Int8Array;
  map: Int8Array;
  split: Int8Array;
  stage: Int8Array;
  sites: Int32Array;
  neMin: Int16Array;
  neMax: Int16Array;
  npzBytes: Int32Array;
  jsonlBytes: Int32Array;
}

export async function loadExplorerData(): Promise<{ summary: Summary; cols: Columns }> {
  const [summaryResponse, parquetResponse] = await Promise.all([
    fetch(`${DATA_URL}summary.json`),
    fetch(`${DATA_URL}windows.parquet`),
  ]);
  if (!summaryResponse.ok) throw new Error(`summary.json: HTTP ${summaryResponse.status}`);
  if (!parquetResponse.ok) throw new Error(`windows.parquet: HTTP ${parquetResponse.status}`);
  const summary = (await summaryResponse.json()) as Summary;
  const file = await parquetResponse.arrayBuffer();
  const metadata = parquetMetadata(file);
  const n = Number(metadata.num_rows);
  if (n !== summary.windows) throw new Error(`windows.parquet has ${n} rows, summary.json says ${summary.windows}`);
  const cols: Columns = {
    n,
    window: new Int32Array(n),
    family: new Int8Array(n),
    map: new Int8Array(n),
    split: new Int8Array(n),
    stage: new Int8Array(n),
    sites: new Int32Array(n),
    neMin: new Int16Array(n),
    neMax: new Int16Array(n),
    npzBytes: new Int32Array(n),
    jsonlBytes: new Int32Array(n),
  };
  const target: Record<string, Int32Array | Int16Array | Int8Array> = {
    window: cols.window,
    family: cols.family,
    map: cols.map,
    split: cols.split,
    stage: cols.stage,
    sites: cols.sites,
    ne_min: cols.neMin,
    ne_max: cols.neMax,
    npz_bytes: cols.npzBytes,
    jsonl_bytes: cols.jsonlBytes,
  };
  // column-wise read: without onComplete, hyparquet skips building row objects
  await parquetRead({
    file,
    metadata,
    columns: Object.keys(target),
    onChunk: ({ columnName, columnData, rowStart }) => target[columnName]?.set(columnData as ArrayLike<number>, rowStart),
  });
  return { summary, cols };
}

const labelFiles = new Map<number, Promise<Int16Array>>();

/** The 64 labels (log10 Ne) of the window in row `row`; one 128-kB file holds 1,024 rows. */
export async function loadLabels(row: number, summary: Summary): Promise<number[]> {
  const perFile = summary.labels.rows_per_file;
  const index = Math.floor(row / perFile);
  let pending = labelFiles.get(index);
  if (!pending) {
    pending = fetch(`${DATA_URL}labels/${String(index).padStart(3, '0')}.bin`).then(async (r) => {
      if (!r.ok) throw new Error(`labels/${index}: HTTP ${r.status}`);
      return new Int16Array(await r.arrayBuffer());
    });
    labelFiles.set(index, pending);
  }
  const values = await pending;
  const start = (row % perFile) * 64;
  return Array.from(values.subarray(start, start + 64), (v) => v / summary.labels.scale);
}

export const sampleId = (w: number) => `sim_${String(w).padStart(8, '0')}`;

/** Window w is member w % 4 of fragment w div 4, stored in windows/<chunk div 1000>/. */
export function fragmentPath(w: number): string {
  const chunk = Math.floor(w / 4);
  return `windows/${String(Math.floor(chunk / 1000)).padStart(3, '0')}/fragment_${String(chunk).padStart(8, '0')}.npz`;
}
export const metadataPath = (npz: string) => npz.replace(/\.npz$/, '.jsonl.gz');

export function formatBytes(bytes: number, lang: 'en' | 'zh'): string {
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u += 1;
  }
  const digits = v >= 100 || u === 0 ? 0 : 1;
  return `${v.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[u]}`;
}

export function formatInt(n: number, lang: 'en' | 'zh'): string {
  return n.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US');
}

/** Ne from 1000 * log10 Ne, in a compact form: 870, 12k, 1.4M. */
export function formatNe(scaled: number): string {
  const v = 10 ** (scaled / 1000);
  if (v < 1000) return String(Math.round(v));
  if (v < 1e6) return `${(v / 1e3).toFixed(v < 1e4 ? 1 : 0)}k`;
  return `${(v / 1e6).toFixed(1)}M`;
}

const SUPERSCRIPT: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
/** Tick labels for log axes: 10² … 10⁷ at powers of ten, nothing in between. */
export function pow10Tick(d: number): string {
  const e = Math.log10(d);
  if (Math.abs(e - Math.round(e)) > 1e-9) return '';
  return `10${String(Math.round(e)).split('').map((c) => SUPERSCRIPT[c]).join('')}`;
}
