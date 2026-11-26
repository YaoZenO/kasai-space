// 车牌字母编号探索页（/plates/）的数据整理层。
//
// 输入：source/_data/plates.yml（唯一事实源，转录自 GA 36-2018 附录 A 表 A.1）。
// 职责：把 YAML 里的（code, place）对照，整理成页面可以直接渲染的结构，并补出
//   A–Z 字母带（区分「有分配 / 空缺 / 特殊用途」），统一计数与排序。
//
// 为什么要有这一层（与 zodiac-data.ts 同一理由）：
//   1. A–Z 补位、字母状态、多字母城市 / 共用代号等「派生事实」应在一处算好，
//      页面、资料库计数、测试都引用同一结果，不各自重算；
//   2. 缺数据、坏数据返回显式空态或错误，而不是悄悄渲染空页面（E-038 / E-047 同源）。
//
// 命名约定：region = 一个省级行政区；allocation = 一条（code, place）对照。

export interface PlatesAllocation {
  code: string;
  place: string;
}

export interface PlatesRegion {
  key: string;
  name: string;
  abbr: string;
  kind: 'municipality' | 'province' | 'autonomous-region';
  codesFull: boolean;
  allocations: PlatesAllocation[];
  // 派生：该省用到的、去重后的发牌机关代号（按字母顺序）
  usedCodes: string[];
  // 派生：A–Z 26 个字母的逐位状态
  band: PlatesBandCell[];
  // 派生：多字母城市（place 出现 >1 次）
  multiLetterPlaces: { place: string; codes: string[] }[];
  // 派生：共用代号（code 出现 >1 次）
  sharedCodes: { code: string; places: string[] }[];
  // 派生：字母空缺（A 到最后一个字母之间、标准里没有出现的字母）
  gaps: string[];
}

export interface PlatesBandCell {
  letter: string;
  state: 'used' | 'special' | 'empty';
  // 该字母对应的地名（可能多个）；special 时为特殊用途说明
  places: string[];
}

export interface PlatesSpecial {
  code: string;
  meaning: string;
  note: string;
}

export interface PlatesRule {
  key: string;
  title: string;
  text: string;
  source: string;
}

// 跨省聚合出的「反常现象」——页面冷知识墙的数据来源。
export interface PlatesMultiLetter {
  region: PlatesRegion;
  place: string;
  codes: string[];
}

export interface PlatesSharedCode {
  region: PlatesRegion;
  code: string;
  places: string[];
}

export interface PlatesAnomalies {
  // 字母带出现「B 空缺」的省（全国仅云南）
  noBRegions: PlatesRegion[];
  // 三字母城市（全国仅佛山 E/X/Y）
  tripleLetterPlaces: PlatesMultiLetter[];
  // 双字母城市（青岛、烟台、潍坊、哈尔滨、福州、南昌、长沙、成都、桂林、伊犁）
  doubleLetterPlaces: PlatesMultiLetter[];
  // 两地共用一个代号（全国仅宁夏吴忠/固原 C）
  sharedCodes: PlatesSharedCode[];
  // 直辖市（A 至 Z 全序列）
  fullAlphabetRegions: PlatesRegion[];
  // 普通省/自治区里用到 Z 的（四川眉山）
  toZRegions: PlatesRegion[];
}

export interface PlatesOverview {
  meta: {
    updated: string;
    standard: string;
    standardScope: string;
    lede: string;
    scopeNote: string;
  };
  regions: PlatesRegion[];
  special: PlatesSpecial[];
  rules: PlatesRule[];
  anomalies: PlatesAnomalies;
  // 派生统计
  stats: {
    regionCount: number;
    municipalityCount: number;
    allocationCount: number;
    multiLetterPlaceCount: number;
    sharedCodeCount: number;
    gapCount: number;
  };
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function kindLabel(kind: PlatesRegion['kind']): string {
  if (kind === 'municipality') return '直辖市';
  if (kind === 'autonomous-region') return '自治区';
  return '省';
}

// 把 YAML 原始 region 归一成一个可渲染结构。
function buildRegion(raw: any): PlatesRegion | null {
  if (!raw || typeof raw !== 'object') return null;
  const key = raw.key;
  const name = raw.name;
  const abbr = raw.abbr;
  const kind = raw.kind;
  if (!key || !name || !abbr || !kind) return null;

  const isMunicipality = kind === 'municipality';
  const codesFull = isMunicipality || raw.codes === 'full';
  const allocations: PlatesAllocation[] = codesFull
    ? []
    : (Array.isArray(raw.allocations) ? raw.allocations : [])
        .filter((a: any) => a && typeof a.code === 'string' && a.code.length === 1 && typeof a.place === 'string' && a.place.length > 0)
        .map((a: any) => ({ code: a.code.toUpperCase(), place: a.place }));

  // 该省用到的代号集合
  const usedSet = new Set<string>();
  const codePlaces = new Map<string, string[]>();
  const placeCodes = new Map<string, string[]>();

  if (codesFull) {
    ALPHABET.forEach((l) => usedSet.add(l));
  } else {
    allocations.forEach((a) => {
      usedSet.add(a.code);
      const cur = codePlaces.get(a.code) || [];
      cur.push(a.place);
      codePlaces.set(a.code, cur);
      const pc = placeCodes.get(a.place) || [];
      pc.push(a.code);
      placeCodes.set(a.place, pc);
    });
  }

  const usedCodes = Array.from(usedSet).sort();

  // A–Z 字母带：used = 有普通分配；empty = 空缺（直辖市全序列无空缺）
  const band: PlatesBandCell[] = ALPHABET.map((letter) => {
    if (codesFull) {
      return { letter, state: 'used' as const, places: [] };
    }
    if (usedSet.has(letter)) {
      return { letter, state: 'used' as const, places: codePlaces.get(letter) || [] };
    }
    return { letter, state: 'empty' as const, places: [] };
  });

  // 多字母城市（同一 place 对应多个 code）
  const multiLetterPlaces = Array.from(placeCodes.entries())
    .filter(([, codes]) => codes.length > 1)
    .map(([place, codes]) => ({ place, codes: codes.sort() }))
    .sort((a, b) => a.place.localeCompare(b.place, 'zh'));

  // 共用代号（同一 code 对应多个 place）
  const sharedCodes = Array.from(codePlaces.entries())
    .filter(([, places]) => places.length > 1)
    .map(([code, places]) => ({ code, places }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // 字母空缺：A 到最大已用字母之间、标准里没有出现的字母（直辖市除外）
  let gaps: string[] = [];
  if (!codesFull && usedCodes.length > 0) {
    const first = ALPHABET.indexOf(usedCodes[0]);
    const last = ALPHABET.indexOf(usedCodes[usedCodes.length - 1]);
    for (let i = first; i <= last; i += 1) {
      if (!usedSet.has(ALPHABET[i])) gaps.push(ALPHABET[i]);
    }
  }

  return {
    key,
    name,
    abbr,
    kind,
    codesFull,
    allocations,
    usedCodes,
    band,
    multiLetterPlaces,
    sharedCodes,
    gaps
  };
}

export function buildPlates(raw: any): PlatesOverview | null {
  const data = raw || {};
  const list = Array.isArray(data.regions) ? data.regions : [];
  if (!list.length) return null;

  const regions: PlatesRegion[] = [];
  for (const r of list) {
    const region = buildRegion(r);
    if (region) regions.push(region);
  }

  // 排序：直辖市在前，其余按 name 拼音 / 区位不敏感，这里保持 YAML 顺序（已按
  // 直辖市 → 省/自治区 的行政区划惯常顺序排列）。
  const municipalities = regions.filter((r) => r.kind === 'municipality');
  const others = regions.filter((r) => r.kind !== 'municipality');
  const ordered = [...municipalities, ...others];

  const allocationCount = ordered.reduce((n, r) => n + (r.codesFull ? 26 : r.allocations.length), 0);
  const multiLetterPlaceCount = ordered.reduce((n, r) => n + r.multiLetterPlaces.length, 0);
  const sharedCodeCount = ordered.reduce((n, r) => n + r.sharedCodes.length, 0);
  const gapCount = ordered.reduce((n, r) => n + r.gaps.length, 0);

  const meta = (data.meta || {}) as PlatesOverview['meta'];
  const special: PlatesSpecial[] = Array.isArray(data.special)
    ? data.special.filter((s: any) => s && s.code && s.meaning)
    : [];
  const rules: PlatesRule[] = Array.isArray(data.rules)
    ? data.rules.filter((r: any) => r && r.key && r.title && r.text)
    : [];

  // 跨省聚合「反常现象」（冷知识墙）。全部从 regions 的既有派生结果汇总，
  // 不另写一份数据，保证与字母带 / 对照表永远一致。
  const anomalies: PlatesAnomalies = {
    noBRegions: ordered.filter((r) => r.gaps.includes('B')),
    tripleLetterPlaces: [],
    doubleLetterPlaces: [],
    sharedCodes: [],
    fullAlphabetRegions: ordered.filter((r) => r.codesFull),
    toZRegions: ordered.filter((r) => !r.codesFull && r.usedCodes.includes('Z'))
  };
  for (const r of ordered) {
    for (const m of r.multiLetterPlaces) {
      if (m.codes.length >= 3) anomalies.tripleLetterPlaces.push({ region: r, place: m.place, codes: m.codes });
      else if (m.codes.length === 2) anomalies.doubleLetterPlaces.push({ region: r, place: m.place, codes: m.codes });
    }
    for (const s of r.sharedCodes) {
      anomalies.sharedCodes.push({ region: r, code: s.code, places: s.places });
    }
  }

  return {
    meta,
    regions: ordered,
    special,
    rules,
    anomalies,
    stats: {
      regionCount: ordered.length,
      municipalityCount: municipalities.length,
      allocationCount,
      multiLetterPlaceCount,
      sharedCodeCount,
      gapCount
    }
  };
}

export { kindLabel, ALPHABET };
