/** Level 201 traced on the 894x1280 reference. Coordinates are fractions of that frame. Pegs are the 11 stubs. */
export function showcaseLevel() {
  const C = {
    peach: { name: 'peach', hex: '#E2A888', dark: '#654B3D', light: '#FFC9A3' },
    cyan: { name: 'cyan', hex: '#1E8CE0', dark: '#0D3F64', light: '#24A8FF' },
    red: { name: 'red', hex: '#E8302D', dark: '#681514', light: '#FF3936' },
    redB: { name: 'redB', hex: '#E23B34', dark: '#651A17', light: '#FF463E' },
    blue: { name: 'blue', hex: '#1E4FD0', dark: '#0D235D', light: '#245EF9' },
    maroon: { name: 'maroon', hex: '#7A2A26', dark: '#361211', light: '#92322D' },
    green: { name: 'green', hex: '#1E9A48', dark: '#0D4520', light: '#24B856' },
    gold: { name: 'gold', hex: '#F0B429', dark: '#6C5112', light: '#FFD831' },
    lime: { name: 'lime', hex: '#7EEA32', dark: '#386916', light: '#97FF3C' },
    purple: { name: 'purple', hex: '#6B25FD', dark: '#301071', light: '#802CFF' },
  };
  const pegs = [
    { id: 0, nx: 0.4966, ny: 0.2609, capacity: 1, stack: [] },
    { id: 1, nx: 0.6902, ny: 0.3898, capacity: 1, stack: [] },
    { id: 2, nx: 0.5056, ny: 0.3922, capacity: 1, stack: [] },
    { id: 3, nx: 0.3177, ny: 0.3977, capacity: 1, stack: [] },
    { id: 4, nx: 0.4284, ny: 0.4672, capacity: 1, stack: [] },
    { id: 5, nx: 0.5951, ny: 0.4711, capacity: 1, stack: [] },
    { id: 6, nx: 0.6700, ny: 0.5477, capacity: 1, stack: [] },
    { id: 7, nx: 0.3501, ny: 0.5523, capacity: 1, stack: [] },
    { id: 8, nx: 0.4944, ny: 0.5539, capacity: 1, stack: [] },
    { id: 9, nx: 0.5056, ny: 0.6875, capacity: 1, stack: [] },
    { id: 10, nx: 0.3266, ny: 0.4266, capacity: 1, stack: [] },
  ];
  const ropes = [
    { id: 0, color: C.peach, layer: 2, path: [[0.2349,0.5312],[0.2685,0.5000],[0.3076,0.4688],[0.3468,0.4414],[0.3859,0.4141],[0.4195,0.3828],[0.4474,0.3555],[0.4139,0.3047],[0.4474,0.2695],[0.4978,0.2516],[0.5425,0.2773],[0.5481,0.3086]] },
    { id: 1, color: C.cyan, layer: 8, path: [[0.4362,0.3266],[0.4922,0.3477],[0.5481,0.3656],[0.5928,0.3812],[0.6376,0.3969],[0.6823,0.4102],[0.7271,0.4234],[0.7718,0.4359],[0.8054,0.4469]] },
    { id: 2, color: C.red, layer: 9, path: [[0.6711,0.3789],[0.7159,0.3906],[0.7718,0.4062],[0.8054,0.4258],[0.7830,0.4453],[0.7383,0.4336]] },
    { id: 3, color: C.redB, layer: 9, path: [[0.7047,0.5547],[0.7159,0.5859],[0.7159,0.6172],[0.6935,0.6406]] },
    { id: 4, color: C.blue, layer: 7, path: [[0.5705,0.3477],[0.6208,0.3672],[0.6208,0.3906],[0.6040,0.4258],[0.5817,0.4531],[0.5481,0.4805],[0.5313,0.5078],[0.5817,0.5234]] },
    { id: 5, color: C.maroon, layer: 3, path: [[0.2852,0.4023],[0.2629,0.4336],[0.2517,0.4648],[0.2796,0.4922],[0.3579,0.5078],[0.4362,0.5156],[0.4474,0.5469],[0.3803,0.5625],[0.3132,0.5859],[0.3020,0.6406]] },
    { id: 6, color: C.green, layer: 4, path: [[0.4720,0.3828],[0.4430,0.4023],[0.4228,0.4219],[0.4027,0.4414],[0.3870,0.4609],[0.3680,0.4805],[0.3736,0.5195]] },
    { id: 7, color: C.gold, layer: 6, path: [[0.5481,0.4023],[0.5705,0.4336],[0.6096,0.4688],[0.6376,0.4961],[0.6208,0.5234],[0.5872,0.5508],[0.5481,0.5820],[0.5034,0.6133]] },
    { id: 8, color: C.lime, layer: 10, path: [[0.7494,0.4883],[0.7159,0.5156],[0.6711,0.5430],[0.6320,0.5664],[0.6040,0.5898],[0.5761,0.6172],[0.5425,0.6445],[0.5034,0.6719],[0.4698,0.6992],[0.5145,0.7227],[0.5928,0.7344],[0.6376,0.7227]] },
    { id: 9, color: C.purple, layer: 5, path: [[0.2483,0.5625],[0.2685,0.5938],[0.3076,0.6250],[0.3691,0.6562],[0.4251,0.6797],[0.4922,0.7031],[0.5481,0.7148],[0.5034,0.7383],[0.4474,0.7500]] },
  ];
  return {
    pegs,
    ropes: ropes.map(r => ({ id: r.id, color: r.color, layer: r.layer, path: r.path, clearing: false, clearT: 0, freeT: 0 })),
    difficulty: 'HARD', seconds: 180, displayLevel: 201, showcase: true,
  };
}
