// 城市档案页的字段目录与分组（移植自 themes/fluid/scripts/helpers/city-fields.js）。
// 出现顺序由目录定死（规模 → 人口 → 空间 → 交通 → 教育 → 医疗 → 文旅 → 环境 → 气候），
// 不沿用 cities.yml 的采集批次顺序；未登记字段落进「其他」组，不静默消失。

export const LABEL: Record<string, string> = {
  gdp: '地区生产总值', gdp_growth: 'GDP 增速', gdp_per_capita: '人均 GDP',
  fiscal_rev: '一般公共预算收入', wage_avg: '在岗职工平均工资',
  income_disp: '人均可支配收入', consume_exp: '人均消费支出', trade_total: '进出口总额',
  retail_sales: '社会消费品零售总额', deposits: '住户存款余额',
  pop: '常住人口', pop_urban_rate: '城镇化率', pop_net_inflow: '人口净流入',
  pop_density: '人口密度',
  area_km2: '行政面积', builtup_km2: '建成区面积',
  temp_jan: '1 月均温', temp_jul: '7 月均温', temp_year: '年均温',
  precip: '年降水量', rain_days: '年降水日数', sun_hours: '年日照时数',
  thunder_days: '雷暴日数', latitude: '纬度',
  pm25: 'PM2.5 年均', air_good_ratio: '空气优良率', air_good_days: '空气优良天数',
  green_rate: '建成区绿化覆盖率', forest_rate: '森林覆盖率', water_per_capita: '人均水资源',
  hosp_3a: '三甲医院', beds_per_k: '千人床位', doctors_per_k: '千人医师',
  hospitals: '医院数', doctors: '执业（助理）医师数',
  universities: '本科高校', double_first_class: '双一流高校', patents: '专利授权',
  scenic_5a: '5A 景区', scenic_4a: '4A 景区', heritage: '世界遗产',
  visitors: '年接待游客', museums: '博物馆',
  metro_km: '地铁运营里程', metro_lines: '地铁线路', metro_open_year: '地铁开通年份',
  metro_first_year: '地铁首线开通年份',
  airport_pax: '机场旅客吞吐', rail_hubs: '高铁枢纽', port_cargo: '港口吞吐',
  express_handle: '快递处理量',
  house_price: '二手住宅均价', rent: '住宅租金',
};

export const GROUPS = [
  {
    name: '经济',
    fields: ['gdp', 'trade_total', 'retail_sales', 'deposits', 'fiscal_rev',
      'gdp_per_capita', 'income_disp', 'consume_exp', 'wage_avg', 'gdp_growth'],
  },
  {
    name: '人口',
    fields: ['pop', 'pop_urban_rate', 'pop_net_inflow', 'pop_density'],
  },
  {
    name: '空间',
    fields: ['area_km2', 'builtup_km2'],
  },
  {
    name: '交通',
    fields: ['metro_km', 'metro_lines', 'metro_first_year', 'metro_open_year',
      'airport_pax', 'rail_hubs', 'port_cargo', 'express_handle'],
  },
  {
    name: '教育',
    fields: ['universities', 'double_first_class', 'patents'],
  },
  {
    name: '医疗',
    fields: ['hosp_3a', 'hospitals', 'doctors', 'beds_per_k', 'doctors_per_k'],
  },
  {
    name: '文旅',
    fields: ['scenic_5a', 'scenic_4a', 'heritage', 'visitors', 'museums'],
  },
  {
    name: '环境',
    fields: ['pm25', 'air_good_days', 'air_good_ratio', 'green_rate', 'forest_rate', 'water_per_capita'],
  },
  {
    name: '气候',
    fields: ['temp_jan', 'temp_jul', 'temp_year', 'precip', 'rain_days',
      'sun_hours', 'thunder_days', 'latitude'],
  },
  {
    name: '居住',
    fields: ['house_price', 'rent'],
  },
];

export const GROUP_OF: Record<string, string> = {};
for (const g of GROUPS) {
  for (const f of g.fields) GROUP_OF[f] = g.name;
}

export function label(key: string): string {
  return LABEL[key] || key;
}

/** 把一座城市的 metrics 拆成 [{ name, items: [{ key, label, metric }] }]。
 *  exclude：页头要点已经展示过的字段，从档案表里剔掉，避免同一屏里同一数字出现两次。 */
export function groups(metrics: any, exclude?: string[]): any[] {
  const mt = metrics || {};
  const skip: Record<string, boolean> = {};
  for (const k of exclude || []) skip[k] = true;

  const seen: Record<string, boolean> = {};
  const out: any[] = [];

  for (const g of GROUPS) {
    const items: any[] = [];
    for (const k of g.fields) {
      if (skip[k] || seen[k]) continue;
      if (!Object.prototype.hasOwnProperty.call(mt, k)) continue;
      seen[k] = true;
      items.push({ key: k, label: label(k), metric: mt[k] });
    }
    if (items.length) out.push({ name: g.name, items });
  }

  // 兜底组：未在目录里登记的字段一律收进来，不静默丢。
  const rest: any[] = [];
  for (const mk of Object.keys(mt)) {
    if (skip[mk] || seen[mk]) continue;
    seen[mk] = true;
    rest.push({ key: mk, label: label(mk), metric: mt[mk] });
  }
  if (rest.length) out.push({ name: '其他', items: rest });

  return out;
}
