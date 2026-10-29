/* =──────────────────────────────────────────────────────────────
  nc-districts.js — data for the seven sectors of Night City
  Written from the official artbook + game canon. Copy is authored
  for this piece (Chinese-led, English terms left intact).
  ────────────────────────────────────────────────────────────── */
window.NC_DISTRICTS = [
  {
    id: 'watson',
    cn: '沃森',
    en: 'WATSON',
    sub: '歌舞伎町 · 小中国 · 北区 · 荒坂海滨',
    color: '#00e5ff',
    mood: '潮湿的地方。霓虹灯管坏了一半，另一半在雨里嗡嗡作响。<b>这里有全城最便宜的义体和最贵的止痛药</b>，中间只隔一条街。凌晨四点，市场开张，卖的是昨天还长在人身上的东西。',
    faction: '漩涡帮 / 虎爪帮',
    places: '来生 · 超大住宅楼 H10 · 歌舞伎町市场',
    danger: 68,
    wealth: 34,
    img: 'assets/img/nc-alley-rain-crowd.webp',
    threat: '威胁等级『极度危险』。帮派犯罪十分猖獗，尤其是歌舞伎区。',
    cap: 'KABUKI · 04:12',
    points: '430,70 610,52 688,130 678,250 596,298 468,288 418,196',
    label: [548, 176]
  },
  {
    id: 'westbrook',
    cn: '威斯布鲁克',
    en: 'WESTBROOK',
    sub: '日本町 · 查特山 · 北橡树',
    color: '#b14dff',
    mood: '和风与广告牌一起生长的地方，连雨落下来都显得贵。虎爪帮在地面收保护费，云层之上，<b>有人正用一杯清酒的价格买下别人一个器官</b>。',
    faction: '虎爪帮 / 动物帮',
    places: '云顶 CLOUDS · 和歌子诊所 · 帝国大厦',
    danger: 44,
    wealth: 71,
    img: 'assets/img/nc-torii-shrine-night.webp',
    threat: '威胁等级『极低』。虎爪帮常在日本街出没，但几乎没有理由相信他们会威胁遵纪守法的居民。',
    cap: 'JAPANTOWN · 21:30',
    points: '700,60 906,102 956,222 902,318 790,326 698,258 698,132',
    label: [822, 182]
  },
  {
    id: 'citycenter',
    cn: '市中心',
    en: 'CITY CENTER',
    sub: '企业广场 · 市政环',
    color: '#ede9df',
    mood: '玻璃、钢铁，和一种绝对的安静。<b>这里的空气是过滤过的，这里死掉的人有公关团队</b>。每一寸地面都写着"私有"，连影子都要报备。',
    faction: '企业与 NCPD（无帮派）',
    places: '荒坂塔 · 米利泰克大厦 · 企业广场',
    danger: 40,
    wealth: 96,
    img: 'assets/img/nc-charter-hill-towers.webp',
    threat: '威胁等级『安全』。至于后街小巷抢劫的谣言，要么言过其实，要么早就过时了。',
    cap: 'CORPO PLAZA · 19:04',
    points: '430,312 598,306 690,348 690,450 598,500 478,480 412,408 402,352',
    label: [548, 396]
  },
  {
    id: 'heywood',
    cn: '海伍德',
    en: 'HEYWOOD',
    sub: '韦尔斯普林斯 · 谷地 · 帕洛马',
    color: '#ff9d2f',
    mood: '家族、教堂和枪。瓦伦蒂诺把忠诚纹在背上，<b>把葬礼办得比婚礼还隆重</b>。这里的人不富有，但他们记得你母亲叫什么名字。',
    faction: '瓦伦蒂诺',
    places: '圣母教堂 · 皮斯托拉街 · 超大住宅楼 H6',
    danger: 63,
    wealth: 41,
    img: 'assets/img/nc-el-padre-sabe-district.webp',
    threat: '威胁等级『部分危险』。东部与南部有帮派活动，绝大多数属于瓦伦蒂诺。',
    cap: 'WELLSPRINGS · 23:47',
    points: '356,548 480,512 552,548 552,640 436,656 334,626',
    label: [444, 586]
  },
  {
    id: 'santodomingo',
    cn: '圣多明戈',
    en: 'SANTO DOMINGO',
    sub: '阿罗约 · 牧场科罗纳多',
    color: '#c8ff2e',
    mood: '工厂、蒸汽和永不熄灭的火。这里生产让整座城市活下去的一切，<b>也包括它自己被掏空的肺</b>。空气是免费的，代价另算。',
    faction: '六街帮 / 铁锈帮',
    places: '电力工厂 · 汽车坟场 · 炼钢厂',
    danger: 57,
    wealth: 33,
    img: 'assets/img/nc-industrial-fog-city.webp',
    threat: '警告：六街帮自称保护邻舍，但 NCPD 已收到大量其参与帮派行动的报告。',
    cap: 'ARROYO · 05:20',
    points: '568,502 700,462 848,516 880,618 758,650 588,634',
    label: [728, 570]
  },
  {
    id: 'pacifica',
    cn: '太平洲',
    en: 'PACIFICA',
    sub: '海岸区 · 西风庄园 · 战斗区',
    color: '#ff2e63',
    mood: '半座建到一半就停手的城。酒店大堂里长着树，泳池里住着人。<b>巫毒帮在数据里建他们的国</b>，而地面上的人只想知道今晚有没有电。',
    faction: '巫毒帮 / 动物帮',
    places: '大帝国酒店 · 战斗区 · 巫毒帮据点',
    danger: 88,
    wealth: 12,
    img: 'assets/img/nc-street-red-dirt-rain.webp',
    threat: '威胁等级『灾难』。走进太平洲的人，出来时多会被摘走器官或昂贵植入体。',
    cap: 'COASTVIEW · 00:41',
    points: '160,458 296,484 352,552 296,620 182,608 118,532',
    label: [232, 546]
  },
  {
    id: 'badlands',
    cn: '恶土',
    en: 'BADLANDS',
    sub: '风力发电场 · 公路 · 废弃机场',
    color: '#d9a441',
    mood: '城市之外没有法律，只有风。<b>游牧民族把家背在车上</b>，沿着公路迁徙，把过去埋在沙里，把明天加满油。',
    faction: '阿德卡多 / 掠夺者',
    places: '太阳能农场 · 71 号公路 · 废弃机场',
    danger: 74,
    wealth: 9,
    img: 'assets/img/nc-badlands-wasteland.webp',
    threat: '警告：数量庞大的流浪者时常出没于郊外。他们是社会的寄生虫。',
    cap: 'ROUTE 71 · 16:08',
    points: '',
    label: [186, 118]
  }
];

/* the outer world: everything not covered by a sector */
window.NC_MAP = {
  land: 'M96,0 L1000,0 L1000,660 L34,660 L88,522 L146,432 L88,318 L128,176 L96,58 Z',
  water: 'M0,0 L1000,0 L1000,660 L0,660 Z',
  roads: [
    '418,196 430,312 478,480 468,512',
    '688,130 690,348 700,462 758,650',
    '352,552 468,512 552,548 700,462',
    '146,432 296,484 356,548 436,656'
  ],
  highway: '96,58 418,196 430,312 690,348 902,318',
  cross: [560, 400]
};
