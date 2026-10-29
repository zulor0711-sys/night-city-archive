/* =──────────────────────────────────────────────────────────────
  nc-chrome.js — ripperdoc fitting room data
  Each install costs humanity and buys capability.
  ────────────────────────────────────────────────────────────── */
window.NC_CHROME = [
  {
    id: 'frontalcortex',
    cn: '额叶皮层',
    en: 'FRONTAL CORTEX',
    ware: '记忆优化器 / MEMORY BOOST',
    cost: 6,
    gain: 8,
    color: '#00e5ff',
    text: '把今天压缩成更适合存储的形状。你会记得更多，也会更像一个档案。',
    sym: 'OS'
  },
  {
    id: 'ocular',
    cn: '视觉',
    en: 'OCULAR',
    ware: '基洛西光学 Mk.3 / KIROSHI OPTICS',
    cost: 5,
    gain: 10,
    color: '#7ee7ff',
    text: '看清一切，包括你不该看清的。夜城的每一面墙后面都有人。',
    sym: 'EYE'
  },
  {
    id: 'circulatory',
    cn: '循环系统',
    en: 'CIRCULATORY',
    ware: '肾上腺素泵 / ADRENALINE PUMP',
    cost: 7,
    gain: 9,
    color: '#ff2e63',
    text: '心跳变成可调参数。恐惧不再让你发抖，只是让读数升高。',
    sym: 'HRT'
  },
  {
    id: 'skeleton',
    cn: '骨骼',
    en: 'SKELETON',
    ware: '钛合金骨架 / TITANIUM BONES',
    cost: 8,
    gain: 12,
    color: '#ede9df',
    text: '你终于不会在挨打的时候骨折。但你也终于不能再称作"人"了。',
    sym: 'BON'
  },
  {
    id: 'arms',
    cn: '手臂',
    en: 'ARMS',
    ware: '螳螂刀 / MANTIS BLADES',
    cost: 12,
    gain: 18,
    color: '#ff1b1b',
    text: '藏在前臂里的两把刀。拔出来的时候，声音很像一句道歉。',
    sym: 'ARM'
  },
  {
    id: 'hands',
    cn: '手部',
    en: 'HANDS',
    ware: '智能连接器 / SMART LINK',
    cost: 4,
    gain: 6,
    color: '#c8ff2e',
    text: '手和枪之间不再有误差。也没有犹豫——犹豫已经写不进固件。',
    sym: 'HND'
  },
  {
    id: 'nervous',
    cn: '神经系统',
    en: 'NERVOUS SYSTEM',
    ware: '沙德威斯坦 / SANDEVISTAN',
    cost: 15,
    gain: 22,
    color: '#fcee0a',
    text: '世界慢下来。你在静止的雨里走过去，只有你自己知道自己做过什么。',
    sym: 'SPD'
  },
  {
    id: 'integumentary',
    cn: '表皮',
    en: 'INTEGUMENTARY',
    ware: '亚表层护甲 / SUBDERMAL ARMOR',
    cost: 6,
    gain: 7,
    color: '#b14dff',
    text: '皮肤下面多了一层金属。从此拥抱变成了碰撞。',
    sym: 'SKN'
  }
];

/* how the nervous system reports its own decay */
window.NC_HUMANITY = [
  { min: 86, label: '神经稳定',   en: 'STABLE',                 note: '一切正常。你还能感觉到雨的温度。' },
  { min: 70, label: '轻度排异',   en: 'MILD REJECTION',         note: '偶尔的耳鸣。可能是义体，也可能是你太累了。' },
  { min: 52, label: '解离感',     en: 'DISSOCIATION',           note: '手指动的时候，你会先看到它动，再感觉到它动。' },
  { min: 34, label: '幻听',       en: 'AUDITORY HALLUCINATION', note: '有人在叫你的名字。房间里没有别人。' },
  { min: 16, label: '人格崩解',   en: 'PERSONALITY DECAY',      note: '你说不清那句话是你说的，还是曾经的你说的。' },
  { min: 0,  label: '赛博精神病临界', en: 'CYBERPSYCHOSIS',     note: '系统建议：立即停止植入。系统不会执行这条建议。' }
];
