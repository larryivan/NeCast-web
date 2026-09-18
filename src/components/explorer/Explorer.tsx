// Corpus explorer: search, filter, inspect and download the 109,248 windows of NeCast-simulations.
// Everything runs in the browser from a 2-MB parquet index; window files come from Hugging Face.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronRight, Copy, Download, ExternalLink, Link2, SlidersHorizontal, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import {
  HF_BASE,
  MIRROR_BASE,
  REPO,
  formatBytes,
  formatInt,
  formatNe,
  fragmentPath,
  loadExplorerData,
  loadLabels,
  metadataPath,
  sampleId,
  type Columns,
  type Summary,
} from './data';
import { FAMILY_NAMES, GROUPS, MAP_NAMES, T, type Lang } from './i18n';
import { LabelsPlot, SitesHistogram, type SitesBin } from './plots';

const ACCENT = 'var(--sl-color-accent)';
const N_BINS = 56;

// group index of every (split, stage) pair
const GROUP_OF = new Int8Array(16).fill(-1);
GROUPS.forEach((g, i) => (GROUP_OF[g.split * 4 + g.stage] = i));

const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel(), sortFns: { basic: sortFn_basic } });
// one table row per window, holding its index into the column arrays (the table wants objects)
type WindowRow = { i: number };
const helper = createColumnHelper<typeof features, WindowRow>();

function parseQuery(text: string): number | null | undefined {
  const s = text.trim().toLowerCase();
  if (!s) return undefined;
  const m = s.match(/^(?:sim_)?0*(\d+)$/);
  return m ? Number(m[1]) : null;
}

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function CopyButton({ text, label, done, icon }: { text: string | (() => string); label: string; done: string; icon?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => navigator.clipboard.writeText(typeof text === 'function' ? text() : text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })}
    >
      {copied ? <Check /> : (icon ?? <Copy />)}
      {copied ? done : label}
    </Button>
  );
}

function Facet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

function Option({ checked, onChange, label, count, dot }: { checked: boolean; onChange: () => void; label: string; count: string; dot?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm leading-tight">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      {dot && <span className="size-2.5 shrink-0 rounded-full" style={{ background: dot }} />}
      <span className="flex-1">{label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </label>
  );
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export default function Explorer({ lang = 'en' }: { lang?: Lang }) {
  const t = T[lang];
  const [data, setData] = useState<{ summary: Summary; cols: Columns } | null>(null);
  const [error, setError] = useState('');
  const [families, setFamilies] = useState<Set<number>>(new Set());
  const [maps, setMaps] = useState<Set<number>>(new Set());
  const [groups, setGroups] = useState<Set<number>>(new Set());
  const [sitesRange, setSitesRange] = useState<[number, number] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [labels, setLabels] = useState<number[] | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    loadExplorerData().then(setData).catch((e) => setError(String(e?.message ?? e)));
  }, []);

  // log10 range of variant sites, rounded out to 0.1
  const sitesDomain = useMemo<[number, number]>(() => {
    if (!data) return [2.8, 7.1];
    return [Math.floor(Math.log10(data.summary.sites.min) * 10) / 10, Math.ceil(Math.log10(data.summary.sites.max) * 10) / 10];
  }, [data]);
  const range = sitesRange ?? sitesDomain;

  const binOf = useCallback(
    (s: number) => Math.min(N_BINS - 1, Math.max(0, Math.floor(((Math.log10(s) - sitesDomain[0]) / (sitesDomain[1] - sitesDomain[0])) * N_BINS))),
    [sitesDomain],
  );
  const allBins = useMemo(() => {
    const counts = new Int32Array(N_BINS);
    if (data) for (let i = 0; i < data.cols.n; i++) counts[binOf(data.cols.sites[i])]++;
    return counts;
  }, [data, binOf]);

  // one pass: the matching rows, and the count of each option under the other filters
  const result = useMemo(() => {
    const famCounts = new Int32Array(12);
    const mapCounts = new Int32Array(4);
    const groupCounts = new Int32Array(GROUPS.length);
    const bins = new Int32Array(N_BINS);
    const rows: number[] = [];
    let files = 0;
    let bytes = 0;
    if (!data) return { rows, famCounts, mapCounts, groupCounts, bins, files, bytes };
    const c = data.cols;
    const q = parseQuery(query);
    const minSites = 10 ** range[0] - 0.5;
    const maxSites = 10 ** range[1] + 0.5;
    let lastFragment = -1;
    for (let i = 0; i < c.n; i++) {
      if (q !== undefined && c.window[i] !== q) continue;
      const f = c.family[i];
      const m = c.map[i];
      const g = GROUP_OF[c.split[i] * 4 + c.stage[i]];
      const s = c.sites[i];
      const okF = families.size === 0 || families.has(f);
      const okM = maps.size === 0 || maps.has(m);
      const okG = groups.size === 0 || groups.has(g);
      const okS = s >= minSites && s <= maxSites;
      if (okM && okG && okS) famCounts[f]++;
      if (okF && okG && okS) mapCounts[m]++;
      if (okF && okM && okS) groupCounts[g]++;
      if (okF && okM && okG && okS) {
        rows.push(i);
        bins[binOf(s)]++;
        const fragment = c.window[i] >> 2;
        if (fragment !== lastFragment) {
          files += 1;
          bytes += c.npzBytes[i] + c.jsonlBytes[i];
          lastFragment = fragment;
        }
      }
    }
    return { rows, famCounts, mapCounts, groupCounts, bins, files, bytes };
  }, [data, families, maps, groups, range, query, binOf]);

  const histogram = useMemo<SitesBin[]>(
    () =>
      Array.from({ length: N_BINS }, (_, b) => ({
        lo: sitesDomain[0] + ((sitesDomain[1] - sitesDomain[0]) * b) / N_BINS,
        hi: sitesDomain[0] + ((sitesDomain[1] - sitesDomain[0]) * (b + 1)) / N_BINS,
        all: allBins[b],
        matching: result.bins[b],
      })),
    [allBins, result.bins, sitesDomain],
  );

  // table
  const columns = useMemo(() => {
    if (!data) return [];
    const c = data.cols;
    const fam = data.summary.families;
    const mapKeys = data.summary.maps.map((m) => m.key);
    return helper.columns([
      helper.accessor(({ i }) => c.window[i], {
        id: 'window',
        header: t.colWindow,
        sortFn: 'basic',
        cell: (info) => <span className="font-mono text-[0.8rem]">{sampleId(info.getValue() as number)}</span>,
      }),
      helper.accessor(({ i }) => c.family[i], {
        id: 'family',
        header: t.colFamily,
        sortFn: 'basic',
        cell: (info) => {
          const f = fam[info.getValue() as number];
          return (
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: f.colour }} />
              <span className="truncate">{FAMILY_NAMES[f.key][lang]}</span>
            </span>
          );
        },
      }),
      helper.accessor(({ i }) => c.map[i], {
        id: 'map',
        header: t.colMap,
        sortFn: 'basic',
        cell: (info) => {
          const m = MAP_NAMES[mapKeys[info.getValue() as number]];
          return <span className="truncate" title={m[lang]}>{m.short[lang]}</span>;
        },
      }),
      helper.accessor(({ i }) => GROUP_OF[c.split[i] * 4 + c.stage[i]], {
        id: 'group',
        header: t.colGroup,
        sortFn: 'basic',
        cell: (info) => {
          const g = GROUPS[info.getValue() as number];
          return <span className="truncate" title={g.name[lang]}>{g.short[lang]}</span>;
        },
      }),
      helper.accessor(({ i }) => c.sites[i], {
        id: 'sites',
        header: t.colSites,
        sortFn: 'basic',
        cell: (info) => <span className="tabular-nums">{formatInt(info.getValue() as number, lang)}</span>,
      }),
      helper.accessor(({ i }) => c.neMin[i], {
        id: 'ne',
        header: t.colNe,
        sortFn: 'basic',
        cell: (info) => {
          const { i } = info.row.original;
          return <span className="tabular-nums">{`${formatNe(c.neMin[i])}–${formatNe(c.neMax[i])}`}</span>;
        },
      }),
    ]);
  }, [data, lang, t]);

  const tableData = useMemo<WindowRow[]>(() => result.rows.map((i) => ({ i })), [result.rows]);
  const table = useTable({ features, columns, data: tableData });
  const tableRows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: tableRows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 36, overscan: 14 });
  const grid = 'grid grid-cols-[8.2rem_minmax(9rem,1.6fr)_minmax(5.5rem,0.9fr)_minmax(7.5rem,1fr)_5.5rem_6.5rem_1rem] gap-x-3 items-center';

  // selection, and ?w= in the address bar so a window can be shared
  const rowOfWindow = useCallback(
    (w: number) => {
      if (!data) return -1;
      let lo = 0;
      let hi = data.cols.n - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const v = data.cols.window[mid];
        if (v === w) return mid;
        if (v < w) lo = mid + 1;
        else hi = mid - 1;
      }
      return -1;
    },
    [data],
  );
  useEffect(() => {
    if (!data) return;
    const w = new URLSearchParams(window.location.search).get('w');
    const q = w === null ? undefined : parseQuery(w);
    if (typeof q === 'number') {
      const row = rowOfWindow(q);
      if (row >= 0) setSelected(row);
    }
  }, [data, rowOfWindow]);
  useEffect(() => {
    if (!data) return;
    const url = new URL(window.location.href);
    if (selected === null) url.searchParams.delete('w');
    else url.searchParams.set('w', String(data.cols.window[selected]));
    window.history.replaceState(null, '', url);
    setLabels(null);
    if (selected !== null) loadLabels(selected, data.summary).then(setLabels).catch(() => setLabels(null));
  }, [selected, data]);

  const reset = () => {
    setFamilies(new Set());
    setMaps(new Set());
    setGroups(new Set());
    setSitesRange(null);
    setQuery('');
  };

  const exportSelection = (kind: 'python' | 'aria2' | 'aria2-mirror') => {
    if (!data) return;
    const c = data.cols;
    const paths: string[] = [];
    let last = -1;
    for (const i of result.rows) {
      const fragment = c.window[i] >> 2;
      if (fragment === last) continue;
      last = fragment;
      const npz = fragmentPath(c.window[i]);
      paths.push(npz, metadataPath(npz));
    }
    const header = `NeCast-simulations: ${result.rows.length} selected windows in ${result.files} files (${formatBytes(result.bytes, 'en')}).`;
    if (kind === 'python') {
      const windows = result.rows.map((i) => sampleId(c.window[i]));
      downloadText(
        'necast_download.py',
        [
          `# ${header}`,
          '# Run:                   python necast_download.py',
          '# In mainland China:     HF_ENDPOINT=https://hf-mirror.com python necast_download.py',
          '# Read the windows with tools/necast_windows.py (downloaded too); each file holds four windows.',
          'from huggingface_hub import snapshot_download',
          '',
          'files = """',
          ...paths,
          '""".split()',
          '',
          '# the selected windows',
          'windows = """',
          ...windows,
          '""".split()',
          '',
          `snapshot_download("${REPO}", repo_type="dataset", allow_patterns=files + ["tools/necast_windows.py"], local_dir="necast-simulations")`,
          '',
        ].join('\n'),
      );
    } else {
      const base = kind === 'aria2' ? HF_BASE : MIRROR_BASE;
      downloadText(
        kind === 'aria2' ? 'necast_aria2.txt' : 'necast_aria2_mirror.txt',
        [`# ${header}`, '# aria2c -i <this file> -j 4 -x 4', ...[...paths, 'tools/necast_windows.py'].map((p) => `${base}${p}\n  out=${p}`), ''].join('\n'),
      );
    }
  };

  if (error)
    return (
      <div className="necast-ui not-content rounded-lg border p-4 text-sm">
        {t.failed} {error}
      </div>
    );
  if (!data)
    return (
      <div className="necast-ui not-content grid gap-6 lg:grid-cols-[16.5rem_minmax(0,1fr)]" aria-busy="true">
        <div className="hidden flex-col gap-3 lg:flex">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${60 + ((i * 37) % 35)}%` }} />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted-foreground">{t.loading}</p>
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );

  const { summary, cols } = data;
  const sel = selected;

  // the active filters, each removable on its own
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (query.trim()) chips.push({ key: 'q', label: `${t.windowChip} ${query.trim()}`, remove: () => setQuery('') });
  families.forEach((i) => chips.push({ key: `f${i}`, label: FAMILY_NAMES[summary.families[i].key][lang], remove: () => setFamilies(toggle(families, i)) }));
  maps.forEach((i) => chips.push({ key: `m${i}`, label: MAP_NAMES[summary.maps[i].key][lang], remove: () => setMaps(toggle(maps, i)) }));
  groups.forEach((i) => chips.push({ key: `g${i}`, label: GROUPS[i].name[lang], remove: () => setGroups(toggle(groups, i)) }));
  if (sitesRange !== null && (range[0] > sitesDomain[0] || range[1] < sitesDomain[1])) {
    const lo = range[0] <= sitesDomain[0] ? summary.sites.min : Math.round(10 ** range[0]);
    const hi = range[1] >= sitesDomain[1] ? summary.sites.max : Math.round(10 ** range[1]);
    chips.push({ key: 's', label: `${t.sites} ${formatInt(lo, lang)}–${formatInt(hi, lang)}`, remove: () => setSitesRange(null) });
  }

  // with no filter on, a few selections to start from (counts are of the whole corpus then)
  const familyIndex = (key: string) => summary.families.findIndex((f) => f.key === key);
  const testGroup = GROUPS.findIndex((g) => g.key === 'test');
  const humanFamily = familyIndex('empirical_human_ne_template');
  const stdpopsimFamily = familyIndex('stdpopsim_single_pop');
  const cleanMap = summary.maps.findIndex((m) => m.key === 'constant_clean');
  const picks = [
    { key: 'test', label: t.pickTest, count: testGroup >= 0 ? result.groupCounts[testGroup] : 0, apply: () => setGroups(new Set([testGroup])) },
    { key: 'human', label: t.pickHuman, count: humanFamily >= 0 ? result.famCounts[humanFamily] : 0, apply: () => setFamilies(new Set([humanFamily])) },
    { key: 'stdpopsim', label: t.pickStdpopsim, count: stdpopsimFamily >= 0 ? result.famCounts[stdpopsimFamily] : 0, apply: () => setFamilies(new Set([stdpopsimFamily])) },
    { key: 'clean', label: t.pickClean, count: cleanMap >= 0 ? result.mapCounts[cleanMap] : 0, apply: () => setMaps(new Set([cleanMap])) },
  ].filter((p) => p.count > 0);
  const chipClass =
    'inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs leading-none text-foreground transition-colors hover:border-primary hover:text-primary';
  const selWindow = sel === null ? 0 : cols.window[sel];
  const selPath = fragmentPath(selWindow);
  const readCode = [
    'from huggingface_hub import hf_hub_download',
    'import sys',
    '',
    `repo = "${REPO}"`,
    `path = hf_hub_download(repo, "${selPath}", repo_type="dataset")`,
    `hf_hub_download(repo, "${metadataPath(selPath)}", repo_type="dataset")`,
    'reader = hf_hub_download(repo, "tools/necast_windows.py", repo_type="dataset")',
    'sys.path.insert(0, reader.rsplit("/", 1)[0])',
    'from necast_windows import Fragment',
    '',
    `w = Fragment(path).window(${selWindow % 4})   # ${sampleId(selWindow)}`,
  ].join('\n');

  const filters = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase" htmlFor="necast-find">
          {t.find}
        </label>
        <Input id="necast-find" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.findPlaceholder} />
      </div>
      <Facet title={t.families}>
        {summary.families.map((f, i) => (
          <Option
            key={f.key}
            checked={families.has(i)}
            onChange={() => setFamilies(toggle(families, i))}
            label={FAMILY_NAMES[f.key][lang]}
            count={formatInt(result.famCounts[i], lang)}
            dot={f.colour}
          />
        ))}
      </Facet>
      <Facet title={t.maps}>
        {summary.maps.map((m, i) => (
          <Option key={m.key} checked={maps.has(i)} onChange={() => setMaps(toggle(maps, i))} label={MAP_NAMES[m.key][lang]} count={formatInt(result.mapCounts[i], lang)} />
        ))}
      </Facet>
      <Facet title={t.groups}>
        {GROUPS.map((g, i) => (
          <Option key={g.key} checked={groups.has(i)} onChange={() => setGroups(toggle(groups, i))} label={g.name[lang]} count={formatInt(result.groupCounts[i], lang)} />
        ))}
      </Facet>
      <Facet title={t.sites}>
        <Slider
          min={sitesDomain[0]}
          max={sitesDomain[1]}
          step={0.02}
          value={range}
          onValueChange={(v) => setSitesRange([v[0], v[1]])}
          className="my-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{formatInt(range[0] <= sitesDomain[0] ? summary.sites.min : Math.round(10 ** range[0]), lang)}</span>
          <span>{formatInt(range[1] >= sitesDomain[1] ? summary.sites.max : Math.round(10 ** range[1]), lang)}</span>
        </div>
      </Facet>
      <Button variant="outline" onClick={reset}>
        {t.reset}
      </Button>
    </div>
  );

  return (
    <div className="necast-ui not-content grid gap-6 lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <div className="lg:hidden">
        <Button variant="outline" onClick={() => setFiltersOpen(!filtersOpen)}>
          <SlidersHorizontal />
          {t.showFilters}
          {chips.length > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">{chips.length}</span>}
        </Button>
      </div>
      <aside className={`${filtersOpen ? 'block' : 'hidden'} lg:block`}>{filters}</aside>

      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t.selection}</p>
              <p className="m-0 mt-1 text-sm">
                <strong className="text-3xl font-semibold tabular-nums">{formatInt(result.rows.length, lang)}</strong>{' '}
                {t.matching}
                <span className="text-muted-foreground">
                  {' '}
                  · {t.inFiles} {formatInt(result.files, lang)} {t.files}
                  {lang === 'zh' ? `（${formatBytes(result.bytes, lang)}）` : ` (${formatBytes(result.bytes, lang)})`} · {t.of}{' '}
                  {formatInt(cols.n, lang)} {t.allWindows}
                </span>
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t.export}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={result.rows.length === 0} onClick={() => exportSelection('python')}>
                  <Download />
                  {t.script}
                </Button>
                <Button size="sm" variant="outline" disabled={result.rows.length === 0} onClick={() => exportSelection('aria2')}>
                  {t.aria2}
                </Button>
                <Button size="sm" variant="outline" disabled={result.rows.length === 0} onClick={() => exportSelection('aria2-mirror')}>
                  {t.aria2Mirror}
                </Button>
              </div>
            </div>
          </div>
          {chips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.activeFilters}>
              {chips.map((c) => (
                <button key={c.key} type="button" className={chipClass} onClick={c.remove} aria-label={`${t.remove}: ${c.label}`}>
                  {c.label}
                  <X className="size-3" />
                </button>
              ))}
              <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={reset}>
                {t.clearAll}
              </button>
            </div>
          ) : (
            picks.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{t.startWith}</span>
                {picks.map((p) => (
                  <button key={p.key} type="button" className={chipClass} onClick={p.apply}>
                    {p.label}
                    <span className="text-muted-foreground tabular-nums">{formatInt(p.count, lang)}</span>
                  </button>
                ))}
              </div>
            )
          )}
          <p className="m-0 text-xs leading-relaxed text-muted-foreground">
            {t.exportNote} {t.mirrorNote}
          </p>
        </div>

        <div>
          <SitesHistogram bins={histogram} xLabel={t.sites} colour={ACCENT} />
          <p className="m-0 text-xs text-muted-foreground">{t.histNote}</p>
        </div>

        <p className="m-0 -mb-2 text-xs text-muted-foreground">{t.clickHint}</p>
        <div className="overflow-x-auto rounded-lg border">
          <div className="min-w-[45rem]">
          <div className={`${grid} border-b bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground`}>
            {table.getHeaderGroups()[0]?.headers.map((header) => {
              const dir = header.column.getIsSorted();
              return (
                <button
                  key={header.id}
                  type="button"
                  className="flex items-center gap-1 text-left hover:text-foreground"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <table.FlexRender header={header} />
                  {dir === 'asc' ? <ArrowUp className="size-3" /> : dir === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                </button>
              );
            })}
            <span aria-hidden="true" />
          </div>
          <div ref={scrollRef} className="h-[30rem] overflow-y-auto">
            {tableRows.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t.noMatch}</p>
            ) : (
              <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((v) => {
                  const row = tableRows[v.index];
                  const active = row.original.i === selected;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setSelected(row.original.i)}
                      className={`${grid} group absolute top-0 left-0 w-full border-b px-3 text-left text-sm outline-none hover:bg-accent/60 focus-visible:bg-accent/60 ${active ? 'bg-accent' : ''}`}
                      style={{ height: v.size, transform: `translateY(${v.start}px)` }}
                    >
                      {row.getAllCells().map((cell) => (
                        <span key={cell.id} className="min-w-0 truncate">
                          <table.FlexRender cell={cell} />
                        </span>
                      ))}
                      <ChevronRight className="size-4 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </div>
      </section>

      <Sheet open={sel !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="necast-ui w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          {sel !== null && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{sampleId(selWindow)}</SheetTitle>
                <SheetDescription className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">
                    <span className="size-2 rounded-full" style={{ background: summary.families[cols.family[sel]].colour }} />
                    {FAMILY_NAMES[summary.families[cols.family[sel]].key][lang]}
                  </Badge>
                  <Badge variant="secondary">{MAP_NAMES[summary.maps[cols.map[sel]].key][lang]}</Badge>
                  <Badge variant="secondary">{GROUPS[GROUP_OF[cols.split[sel] * 4 + cols.stage[sel]]].name[lang]}</Badge>
                  <Badge variant="outline">{cols.map[sel] === 0 ? t.withoutErrors : t.withErrors}</Badge>
                </SheetDescription>
                <div className="flex flex-wrap gap-2 pt-2">
                  <CopyButton
                    text={() => `${window.location.origin}${window.location.pathname}?w=${selWindow}`}
                    label={t.copyLink}
                    done={t.linkCopied}
                    icon={<Link2 />}
                  />
                  <Button asChild size="sm" variant="ghost">
                    <a href={`https://huggingface.co/datasets/${REPO}/viewer/index/train?search=${sampleId(selWindow)}`} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      {t.metadata}
                    </a>
                  </Button>
                </div>
              </SheetHeader>
              <div className="flex flex-col gap-5 px-4 pb-6">
                <div>
                  <h3 className="mb-1 text-sm font-semibold">{t.labels}</h3>
                  {labels ? <LabelsPlot labels={labels} edges={summary.time_edges} xLabel={t.generations} /> : <div className="h-[220px]" />}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">{t.colSites}</dt>
                  <dd className="tabular-nums">{formatInt(cols.sites[sel], lang)}</dd>
                  <dt className="text-muted-foreground">{t.neRange}</dt>
                  <dd className="tabular-nums">{`${formatNe(cols.neMin[sel])}–${formatNe(cols.neMax[sel])}`}</dd>
                </dl>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">{t.download}</h3>
                  <ul className="m-0 flex list-none flex-col divide-y rounded-lg border p-0">
                    {[
                      { path: selPath, label: t.npzLabel, bytes: cols.npzBytes[sel] },
                      { path: metadataPath(selPath), label: t.jsonlLabel, bytes: cols.jsonlBytes[sel] },
                    ].map((f) => (
                      <li key={f.path} className="m-0 grid grid-cols-1 items-center gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3">
                        <div className="min-w-0">
                          <p className="m-0 text-sm font-medium">{f.label}</p>
                          <p className="m-0 font-mono text-xs break-all text-muted-foreground">
                            {f.path} · {formatBytes(f.bytes, lang)}
                          </p>
                        </div>
                        <div className="flex gap-1.5">
                          <Button asChild size="sm">
                            <a href={`${HF_BASE}${f.path}`}>
                              <Download />
                              {t.official}
                            </a>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <a href={`${MIRROR_BASE}${f.path}`}>{t.mirror}</a>
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="m-0 mt-2 text-xs text-muted-foreground">{t.fileNote.replace('{k}', String(selWindow % 4))}</p>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="m-0 text-sm font-semibold">{t.read}</h3>
                    <CopyButton text={readCode} label={t.copy} done={t.copied} />
                  </div>
                  <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
                    <code>{readCode}</code>
                  </pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
