'use strict';

// 城市档案页的字段目录与分组（/city/<slug>/ 的「城市档案」一节）。
//
// 为什么要有这一层：
//   1. **出现顺序必须由目录定死，不能沿用 cities.yml 的采集批次顺序。**
//      数据是按批次入库的，上海块的第一个字段是「地铁首线开通年份」、地区生产总值
//      排在第 20 位——21 行里最重要的一项落在倒数第二（2026-11-04 主人指出）。
//      目录顺序 = 阅读顺序：规模 → 人口 → 空间 → 交通 → 教育 → 医疗 → 文旅 → 环境 → 气候。
//   2. **按组呈现，而不是一列平铺 20 行。** 分组口径对齐 CITY-RANK-PRD §4.2 的十组；
//      431 座城市里中位字段数只有 2，组只在该组有字段时才出现，页面自然折叠。
//   3. **未登记的字段落进「其他」组，不静默消失**（E-047 同型：缺数据不静默）。
//      新增字段忘了登记时页面照样显示，只是排在末尾——比无声吞掉安全。
//
// 位置约束：放 themes/fluid/scripts/helpers/ 下且自包含，
// 跨文件 require 在 Hexo 的 vm 加载上下文里解析失败（AGENTS.md §5.2）。

var LABEL = {
  // 经济
  gdp: '地区生产总值', gdp_growth: 'GDP 增速', gdp_per_capita: '人均 GDP',
  fiscal_rev: '一般公共预算收入', wage_avg: '在岗职工平均工资',
  income_disp: '人均可支配收入', consume_exp: '人均消费支出', trade_total: '进出口总额',
  retail_sales: '社会消费品零售总额', deposits: '住户存款余额',
  // 人口
  pop: '常住人口', pop_urban_rate: '城镇化率', pop_net_inflow: '人口净流入',
  pop_density: '人口密度',
  // 空间
  area_km2: '行政面积', builtup_km2: '建成区面积',
  // 气候
  temp_jan: '1 月均温', temp_jul: '7 月均温', temp_year: '年均温',
  precip: '年降水量', rain_days: '年降水日数', sun_hours: '年日照时数',
  thunder_days: '雷暴日数', latitude: '纬度',
  // 环境
  pm25: 'PM2.5 年均', air_good_ratio: '空气优良率', air_good_days: '空气优良天数',
  green_rate: '建成区绿化覆盖率', forest_rate: '森林覆盖率', water_per_capita: '人均水资源',
  // 医疗
  hosp_3a: '三甲医院', beds_per_k: '千人床位', doctors_per_k: '千人医师',
  hospitals: '医院数', doctors: '执业（助理）医师数',
  // 教育与创新
  universities: '本科高校', double_first_class: '双一流高校', patents: '专利授权',
  // 文旅
  scenic_5a: '5A 景区', scenic_4a: '4A 景区', heritage: '世界遗产',
  visitors: '年接待游客', museums: '博物馆',
  // 交通
  metro_km: '地铁运营里程', metro_lines: '地铁线路', metro_open_year: '地铁开通年份',
  metro_first_year: '地铁首线开通年份',
  airport_pax: '机场旅客吞吐', rail_hubs: '高铁枢纽', port_cargo: '港口吞吐',
  express_handle: '快递处理量',
  // 居住
  house_price: '二手住宅均价', rent: '住宅租金'
};

// 组顺序 = 页面阅读顺序。组内顺序 = 该项在该组里的重要程度（规模类在前，比率类在后）。
var GROUPS = [
  {
    name: '经济',
    fields: ['gdp', 'trade_total', 'retail_sales', 'deposits', 'fiscal_rev',
      'gdp_per_capita', 'income_disp', 'consume_exp', 'wage_avg', 'gdp_growth']
  },
  {
    name: '人口',
    fields: ['pop', 'pop_urban_rate', 'pop_net_inflow', 'pop_density']
  },
  {
    name: '空间',
    fields: ['area_km2', 'builtup_km2']
  },
  {
    name: '交通',
    fields: ['metro_km', 'metro_lines', 'metro_first_year', 'metro_open_year',
      'airport_pax', 'rail_hubs', 'port_cargo', 'express_handle']
  },
  {
    name: '教育',
    fields: ['universities', 'double_first_class', 'patents']
  },
  {
    name: '医疗',
    fields: ['hosp_3a', 'hospitals', 'doctors', 'beds_per_k', 'doctors_per_k']
  },
  {
    name: '文旅',
    fields: ['scenic_5a', 'scenic_4a', 'heritage', 'visitors', 'museums']
  },
  {
    name: '环境',
    fields: ['pm25', 'air_good_days', 'air_good_ratio', 'green_rate', 'forest_rate', 'water_per_capita']
  },
  {
    name: '气候',
    fields: ['temp_jan', 'temp_jul', 'temp_year', 'precip', 'rain_days',
      'sun_hours', 'thunder_days', 'latitude']
  },
  {
    name: '居住',
    fields: ['house_price', 'rent']
  }
];

// 字段 key → 组名。一次构建，供「其他」判定复用。
var GROUP_OF = {};
for (var gi = 0; gi < GROUPS.length; gi += 1) {
  for (var fj = 0; fj < GROUPS[gi].fields.length; fj += 1) {
    GROUP_OF[GROUPS[gi].fields[fj]] = GROUPS[gi].name;
  }
}

function label(key) {
  return LABEL[key] || key;
}

// 把一座城市的 metrics 拆成 [{ name, items: [{ key, label, metric }] }]。
// exclude：页头要点已经展示过的字段，从档案表里剔掉，避免同一屏里同一数字出现两次。
// 返回只含有内容的组；一个组都没有时返回空数组，模板据此走空态。
function groups(metrics, exclude) {
  var mt = metrics || {};
  var skip = {};
  var ex = exclude || [];
  for (var ei = 0; ei < ex.length; ei += 1) skip[ex[ei]] = true;

  var seen = {};
  var out = [];

  for (var i = 0; i < GROUPS.length; i += 1) {
    var items = [];
    for (var j = 0; j < GROUPS[i].fields.length; j += 1) {
      var k = GROUPS[i].fields[j];
      if (skip[k] || seen[k]) continue;
      if (!Object.prototype.hasOwnProperty.call(mt, k)) continue;
      seen[k] = true;
      items.push({ key: k, label: label(k), metric: mt[k] });
    }
    if (items.length) out.push({ name: GROUPS[i].name, items: items });
  }

  // 兜底组：未在目录里登记的字段一律收进来，不静默丢。
  var rest = [];
  var keys = Object.keys(mt);
  for (var mi = 0; mi < keys.length; mi += 1) {
    var mk = keys[mi];
    if (skip[mk] || seen[mk]) continue;
    seen[mk] = true;
    rest.push({ key: mk, label: label(mk), metric: mt[mk] });
  }
  if (rest.length) out.push({ name: '其他', items: rest });

  return out;
}

// 测试直连（test/cityrank-e2e.js）：require 本文件时 hexo 未定义，跳过注册。
if (typeof hexo !== 'undefined' && hexo && hexo.extend) {
  hexo.extend.helper.register('cityFields', function () {
    return { label: label, groups: groups };
  });
}

if (typeof module !== 'undefined') {
  module.exports = { LABEL: LABEL, GROUPS: GROUPS, GROUP_OF: GROUP_OF, label: label, groups: groups };
}
