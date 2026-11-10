/** Level 201 routes. Endpoints are reference grommet hole centres, 894x1280 pixels as 0..1. */
export function showcaseLevel() {
  const C = {
    peach: { name: 'peach', hex: '#F2B79A', dark: '#222222', light: '#FFCDB4' },
    navy: { name: 'navy', hex: '#3A4460', dark: '#222222', light: '#6A7590' },
    cyan: { name: 'cyan', hex: '#3EC0E4', dark: '#222222', light: '#8ADCF6' },
    blue: { name: 'blue', hex: '#1F4CB5', dark: '#222222', light: '#6AA0F0' },
    red: { name: 'red', hex: '#E23B34', dark: '#222222', light: '#FF6A60' },
    redB: { name: 'redB', hex: '#E23B34', dark: '#222222', light: '#FF6A60' },
    maroon: { name: 'maroon', hex: '#7A2E2A', dark: '#222222', light: '#C07068' },
    gold: { name: 'gold', hex: '#F0B429', dark: '#222222', light: '#FFD56A' },
    purple: { name: 'purple', hex: '#6E26FE', dark: '#222222', light: '#B388FF' },
    green: { name: 'green', hex: '#178861', dark: '#222222', light: '#5DDBA0' },
    lime: { name: 'lime', hex: '#8CED2F', dark: '#222222', light: '#C6FF7A' },
  };
  const pegs = [
    { id: 0, nx: 0.5022, ny: 0.2711, capacity: 1, stack: [] },
    { id: 1, nx: 0.4687, ny: 0.3141, capacity: 1, stack: [] },
    { id: 2, nx: 0.3210, ny: 0.4086, capacity: 1, stack: [] },
    { id: 3, nx: 0.5123, ny: 0.4047, capacity: 1, stack: [] },
    { id: 4, nx: 0.7025, ny: 0.4102, capacity: 1, stack: [] },
    { id: 5, nx: 0.4318, ny: 0.4820, capacity: 1, stack: [] },
    { id: 6, nx: 0.6040, ny: 0.4922, capacity: 1, stack: [] },
    { id: 7, nx: 0.3557, ny: 0.5813, capacity: 1, stack: [] },
    { id: 8, nx: 0.6767, ny: 0.5750, capacity: 1, stack: [] },
    { id: 9, nx: 0.5011, ny: 0.5789, capacity: 1, stack: [] },
    { id: 10, nx: 0.5123, ny: 0.7117, capacity: 1, stack: [] },
  ];
  const ropes = [
    { id: 0, color: C.peach, layer: 2, path: [[0.2394,0.5375],[0.2796,0.5000],[0.3412,0.4570],[0.3915,0.4141],[0.4418,0.3711],[0.4922,0.3320],[0.5347,0.3008],[0.5235,0.2695],[0.4698,0.2516],[0.4195,0.2656],[0.4027,0.2875]] },
    { id: 1, color: C.navy, layer: 3, path: [[0.4049,0.3734],[0.3803,0.3984],[0.3669,0.4258]] },
    { id: 2, color: C.cyan, layer: 10, path: [[0.4374,0.3195],[0.5034,0.3516],[0.5705,0.3828],[0.6376,0.4062],[0.7047,0.4258],[0.7718,0.4414],[0.7159,0.4609],[0.6376,0.4336],[0.5593,0.4023],[0.4922,0.3711],[0.4530,0.3477]] },
    { id: 3, color: C.blue, layer: 7, path: [[0.5761,0.3492],[0.6208,0.3711],[0.6432,0.4062],[0.6096,0.4531],[0.5872,0.5156],[0.6096,0.5703],[0.6298,0.6125]] },
    { id: 4, color: C.red, layer: 11, path: [[0.6711,0.3812],[0.7271,0.3945],[0.7718,0.4078],[0.7796,0.4148],[0.7550,0.4258],[0.7159,0.4141]] },
    { id: 5, color: C.redB, layer: 11, path: [[0.7025,0.5547],[0.7114,0.5898],[0.7047,0.6211],[0.6980,0.6242]] },
    { id: 6, color: C.maroon, layer: 4, path: [[0.2796,0.4023],[0.2685,0.4336],[0.2461,0.4609],[0.2685,0.4922],[0.3803,0.5000],[0.4642,0.4844],[0.4474,0.5234],[0.3356,0.5547],[0.3110,0.5781],[0.2964,0.6484]] },
    { id: 7, color: C.gold, layer: 5, path: [[0.2864,0.5180],[0.3579,0.5547],[0.4251,0.5898],[0.4978,0.6211],[0.5649,0.5898],[0.6152,0.5469],[0.6398,0.5000],[0.5984,0.4492],[0.5570,0.4188]] },
    { id: 8, color: C.purple, layer: 6, path: [[0.2517,0.5648],[0.2852,0.5977],[0.3356,0.6367],[0.3915,0.6797],[0.4474,0.7188],[0.4866,0.7539],[0.5425,0.7188],[0.5034,0.6719],[0.4586,0.6445],[0.4306,0.6375]] },
    { id: 9, color: C.green, layer: 8, path: [[0.4810,0.3711],[0.4474,0.4062],[0.4083,0.4531],[0.3803,0.5078],[0.3915,0.5469],[0.4709,0.5742],[0.5369,0.6406],[0.5626,0.6672]] },
    { id: 10, color: C.lime, layer: 12, path: [[0.7394,0.4938],[0.6935,0.5312],[0.6376,0.5742],[0.5761,0.6172],[0.5145,0.6602],[0.4754,0.6953],[0.5257,0.7266],[0.5928,0.7344],[0.6119,0.7195]] },
  ];
  return {
    pegs,
    ropes: ropes.map(r => ({ id: r.id, color: r.color, layer: r.layer, path: r.path, clearing: false, clearT: 0, freeT: 0 })),
    difficulty: 'HARD', seconds: 180, displayLevel: 201, showcase: true,
  };
}
