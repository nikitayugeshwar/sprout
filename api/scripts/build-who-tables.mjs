/**
 * Builds Sprout's growth reference dataset directly from the WHO Child Growth
 * Standards published on cdn.who.int.
 *
 * We deliberately do *not* hand-transcribe or hard-code LMS values: this script
 * downloads WHO's own "z-score expanded tables" workbooks, extracts the L/M/S
 * parameters plus WHO's published SD cut-offs, and emits
 *
 *   src/data/who/<indicator>-<sex>.json   — the LMS table the API computes from
 *   tests/fixtures/<indicator>-<sex>.json — WHO's own SD columns, used by the
 *                                           test suite to prove our maths
 *                                           reproduces WHO's published numbers
 *
 * Run with:  npm run who:build --workspace=api
 *            npm run who:build --workspace=api -- --inspect   (dump sheet shape)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(API_ROOT, '.cache', 'who');
const DATA_DIR = path.join(API_ROOT, 'src', 'data', 'who');
const FIXTURE_DIR = path.join(API_ROOT, 'tests', 'fixtures');

const CDN = 'https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators';

/**
 * Note the inconsistent folder names — WHO uses `expanded-tables` for most
 * indicators but `expandable-tables` for length/height-for-age.
 */
const SOURCES = [
  { indicator: 'wfa', label: 'Weight-for-age', sex: 'male', url: `${CDN}/weight-for-age/expanded-tables/wfa-boys-zscore-expanded-tables.xlsx` },
  { indicator: 'wfa', label: 'Weight-for-age', sex: 'female', url: `${CDN}/weight-for-age/expanded-tables/wfa-girls-zscore-expanded-tables.xlsx` },
  { indicator: 'lhfa', label: 'Length/height-for-age', sex: 'male', url: `${CDN}/length-height-for-age/expandable-tables/lhfa-boys-zscore-expanded-tables.xlsx` },
  { indicator: 'lhfa', label: 'Length/height-for-age', sex: 'female', url: `${CDN}/length-height-for-age/expandable-tables/lhfa-girls-zscore-expanded-tables.xlsx` },
  { indicator: 'bfa', label: 'BMI-for-age', sex: 'male', url: `${CDN}/body-mass-index-for-age/expanded-tables/bfa-boys-zscore-expanded-tables.xlsx` },
  { indicator: 'bfa', label: 'BMI-for-age', sex: 'female', url: `${CDN}/body-mass-index-for-age/expanded-tables/bfa-girls-zscore-expanded-tables.xlsx` },
  { indicator: 'hcfa', label: 'Head circumference-for-age', sex: 'male', url: `${CDN}/head-circumference-for-age/expanded-tables/hcfa-boys-zscore-expanded-tables.xlsx` },
  { indicator: 'hcfa', label: 'Head circumference-for-age', sex: 'female', url: `${CDN}/head-circumference-for-age/expanded-tables/hcfa-girls-zscore-expanded-tables.xlsx` },
];

const SD_COLUMNS = ['SD3neg', 'SD2neg', 'SD1neg', 'SD0', 'SD1', 'SD2', 'SD3'];

async function download(url, dest) {
  try {
    await fs.access(dest);
    return { cached: true };
  } catch {
    /* not cached yet */
  }
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return { cached: false };
}

/** Normalises a header cell: "SD3neg " -> "sd3neg", "Month" -> "month". */
const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, '');

/**
 * WHO workbooks are not perfectly uniform (the age column is Day, Week or
 * Month depending on the table), so we locate the header row by looking for the
 * L/M/S triple rather than assuming a fixed layout.
 */
function locateHeader(matrix) {
  for (let i = 0; i < Math.min(matrix.length, 20); i += 1) {
    const cells = (matrix[i] ?? []).map(norm);
    if (cells.includes('l') && cells.includes('m') && cells.includes('s')) {
      return { rowIndex: i, cells };
    }
  }
  throw new Error('could not locate an L/M/S header row');
}

const AGE_UNITS = { day: 'day', week: 'week', month: 'month', age: 'day' };

function parseWorkbook(buf, { inspect, tag }) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  const { rowIndex, cells } = locateHeader(matrix);
  if (inspect) {
    console.log(`\n[inspect] ${tag} sheets=${JSON.stringify(wb.SheetNames)}`);
    console.log(`[inspect] header row ${rowIndex}: ${JSON.stringify(cells)}`);
    console.log(`[inspect] first data row: ${JSON.stringify(matrix[rowIndex + 1])}`);
    console.log(`[inspect] last data row : ${JSON.stringify(matrix[matrix.length - 1])}`);
    console.log(`[inspect] data rows     : ${matrix.length - rowIndex - 1}`);
  }

  const idx = (name) => cells.indexOf(norm(name));
  const ageKey = Object.keys(AGE_UNITS).find((k) => cells.includes(k));
  if (!ageKey) throw new Error(`no age column in ${JSON.stringify(cells)}`);

  const ageCol = cells.indexOf(ageKey);
  const lCol = idx('l');
  const mCol = idx('m');
  const sCol = idx('s');
  const sdCols = SD_COLUMNS.map((c) => idx(c));

  const rows = [];
  const sdRows = [];

  for (let i = rowIndex + 1; i < matrix.length; i += 1) {
    const r = matrix[i] ?? [];
    const age = Number(r[ageCol]);
    const l = Number(r[lCol]);
    const m = Number(r[mCol]);
    const s = Number(r[sCol]);
    if (![age, l, m, s].every(Number.isFinite)) continue;

    rows.push([age, round(l, 8), round(m, 6), round(s, 8)]);

    // Keep every 30th row as a test fixture — enough coverage to catch a
    // regression anywhere in the curve without committing a huge file.
    if (rows.length % 30 === 1) {
      const sds = sdCols.map((c) => (c >= 0 ? Number(r[c]) : NaN));
      if (sds.every(Number.isFinite)) sdRows.push([age, ...sds.map((v) => round(v, 4))]);
    }
  }

  if (!rows.length) throw new Error('no numeric data rows found');
  return { ageUnit: AGE_UNITS[ageKey], rows, sdRows };
}

function round(n, dp) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

async function main() {
  const inspect = process.argv.includes('--inspect');
  await Promise.all([CACHE_DIR, DATA_DIR, FIXTURE_DIR].map((d) => fs.mkdir(d, { recursive: true })));

  const manifest = [];

  for (const src of SOURCES) {
    const tag = `${src.indicator}-${src.sex}`;
    const file = path.join(CACHE_DIR, `${tag}.xlsx`);
    const { cached } = await download(src.url, file);

    const { ageUnit, rows, sdRows } = parseWorkbook(await fs.readFile(file), { inspect, tag });

    const payload = {
      indicator: src.indicator,
      label: src.label,
      sex: src.sex,
      ageUnit,
      ageMin: rows[0][0],
      ageMax: rows[rows.length - 1][0],
      columns: ['age', 'l', 'm', 's'],
      source: src.url,
      standard: 'WHO Child Growth Standards (2006)',
      rows,
    };

    await fs.writeFile(path.join(DATA_DIR, `${tag}.json`), JSON.stringify(payload));
    await fs.writeFile(
      path.join(FIXTURE_DIR, `who-sd-${tag}.json`),
      JSON.stringify({ indicator: src.indicator, sex: src.sex, ageUnit, columns: ['age', ...SD_COLUMNS], rows: sdRows }),
    );

    manifest.push({ indicator: src.indicator, sex: src.sex, ageUnit, rows: rows.length, fixtures: sdRows.length, source: src.url });
    console.log(
      `${cached ? 'cached ' : 'fetched'}  ${tag.padEnd(14)} ${String(rows.length).padStart(5)} rows  ` +
        `${ageUnit} ${rows[0][0]}–${rows[rows.length - 1][0]}  (${sdRows.length} fixtures)`,
    );
  }

  await fs.writeFile(
    path.join(DATA_DIR, 'manifest.json'),
    JSON.stringify({ standard: 'WHO Child Growth Standards (2006)', builtBy: 'scripts/build-who-tables.mjs', tables: manifest }, null, 2),
  );
  console.log(`\nWrote ${manifest.length} tables to src/data/who/`);
}

main().catch((err) => {
  console.error(`\nWHO table build failed: ${err.message}`);
  process.exit(1);
});
