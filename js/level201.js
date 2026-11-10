/** Level 201 control points, 0..1 of the portrait frame. */
export function showcaseLevel() {
  const C = {
    peach: { name: 'peach', hex: '#E2A888', dark: '#5E4639', light: '#FFCCA5' },
    cyan: { name: 'cyan', hex: '#1E8CE0', dark: '#0C3A5E', light: '#24AAFF' },
    red: { name: 'red', hex: '#E8302D', dark: '#611412', light: '#FF3A36' },
    redB: { name: 'redB', hex: '#E23B34', dark: '#5E1815', light: '#FF473F' },
    blue: { name: 'blue', hex: '#1E4FD0', dark: '#0C2157', light: '#2460FD' },
    maroon: { name: 'maroon', hex: '#7A2A26', dark: '#33110F', light: '#94332E' },
    green: { name: 'green', hex: '#1E9A48', dark: '#0C401E', light: '#24BB57' },
    gold: { name: 'gold', hex: '#F0B429', dark: '#644B11', light: '#FFDB32' },
    lime: { name: 'lime', hex: '#7EEA32', dark: '#346215', light: '#99FF3D' },
    purple: { name: 'purple', hex: '#6B25FD', dark: '#2C0F6A', light: '#822DFF' },
    navy: { name: 'navy', hex: '#2A3358', dark: '#111524', light: '#333E6B' },
    orange: { name: 'orange', hex: '#E07A22', dark: '#5E330E', light: '#FF9429' },
  };
  const pegs = [
    { id: 0, nx: 0.2293, ny: 0.5391, anchor: 'rope', capacity: 1, stack: [] },
    { id: 1, nx: 0.5280, ny: 0.3203, anchor: 'rope', capacity: 1, stack: [] },
    { id: 2, nx: 0.4497, ny: 0.3391, anchor: 'rope', capacity: 1, stack: [] },
    { id: 3, nx: 0.8166, ny: 0.4437, anchor: 'rope', capacity: 1, stack: [] },
    { id: 4, nx: 0.6991, ny: 0.3789, anchor: 'rope', capacity: 1, stack: [] },
    { id: 5, nx: 0.7271, ny: 0.4359, anchor: 'rope', capacity: 1, stack: [] },
    { id: 6, nx: 0.7092, ny: 0.5594, anchor: 'rope', capacity: 1, stack: [] },
    { id: 7, nx: 0.6913, ny: 0.6391, anchor: 'rope', capacity: 1, stack: [] },
    { id: 8, nx: 0.5649, ny: 0.3844, anchor: 'rope', capacity: 1, stack: [] },
    { id: 9, nx: 0.6208, ny: 0.5563, anchor: 'rope', capacity: 1, stack: [] },
    { id: 10, nx: 0.2808, ny: 0.4078, anchor: 'rope', capacity: 1, stack: [] },
    { id: 11, nx: 0.2998, ny: 0.6367, anchor: 'rope', capacity: 1, stack: [] },
    { id: 12, nx: 0.4653, ny: 0.3961, anchor: 'rope', capacity: 1, stack: [] },
    { id: 13, nx: 0.5190, ny: 0.5695, anchor: 'rope', capacity: 1, stack: [] },
    { id: 14, nx: 0.4004, ny: 0.5711, anchor: 'rope', capacity: 1, stack: [] },
    { id: 15, nx: 0.6577, ny: 0.4281, anchor: 'rope', capacity: 1, stack: [] },
    { id: 16, nx: 0.7919, ny: 0.5062, anchor: 'rope', capacity: 1, stack: [] },
    { id: 17, nx: 0.6174, ny: 0.7336, anchor: 'rope', capacity: 1, stack: [] },
    { id: 18, nx: 0.2483, ny: 0.5734, anchor: 'rope', capacity: 1, stack: [] },
    { id: 19, nx: 0.5503, ny: 0.7047, anchor: 'rope', capacity: 1, stack: [] },
    { id: 20, nx: 0.3814, ny: 0.3734, anchor: 'rope', capacity: 1, stack: [] },
    { id: 21, nx: 0.4116, ny: 0.4203, anchor: 'rope', capacity: 1, stack: [] },
    { id: 22, nx: 0.2707, ny: 0.5391, anchor: 'rope', capacity: 1, stack: [] },
    { id: 23, nx: 0.3602, ny: 0.5609, anchor: 'rope', capacity: 1, stack: [] },
    { id: 24, nx: 0.4966, ny: 0.2609, anchor: 'top', capacity: 1, stack: [] },
    { id: 25, nx: 0.5056, ny: 0.3922, anchor: 'top', capacity: 1, stack: [] },
    { id: 26, nx: 0.3177, ny: 0.3977, anchor: 'top', capacity: 1, stack: [] },
    { id: 27, nx: 0.4284, ny: 0.4672, anchor: 'top', capacity: 1, stack: [] },
    { id: 28, nx: 0.5951, ny: 0.4711, anchor: 'top', capacity: 1, stack: [] },
    { id: 29, nx: 0.6700, ny: 0.5477, anchor: 'top', capacity: 1, stack: [] },
    { id: 30, nx: 0.5056, ny: 0.6875, anchor: 'top', capacity: 1, stack: [] },
  ];
  const ropes = [
    { id: 0, color: C.peach, layer: 2, ends: [0, 1], path: [[0.2293,0.5391],[0.2483,0.5336],[0.2494,0.5039],[0.2629,0.4938],[0.2875,0.4867],[0.3166,0.4711],[0.3289,0.4641],[0.3658,0.4414],[0.3546,0.4313],[0.3702,0.4375],[0.3859,0.4172],[0.4016,0.4102],[0.3859,0.3867],[0.4251,0.3516],[0.4474,0.3164],[0.4508,0.2883],[0.4374,0.2758],[0.4530,0.2758],[0.4620,0.2648],[0.5324,0.2656],[0.5414,0.2867],[0.5414,0.3047],[0.5280,0.3203]] },
    { id: 1, color: C.cyan, layer: 8, ends: [2, 3], path: [[0.4497,0.3391],[0.4855,0.3469],[0.5145,0.3594],[0.5268,0.3648],[0.5694,0.3812],[0.5817,0.3773],[0.6029,0.3656],[0.6298,0.3703],[0.6499,0.3680],[0.6644,0.3656],[0.6879,0.3906],[0.7204,0.4070],[0.7327,0.4148],[0.7472,0.4305],[0.7830,0.4219],[0.8166,0.4437]] },
    { id: 2, color: C.red, layer: 9, ends: [4, 5], path: [[0.6991,0.3789],[0.7349,0.3852],[0.7640,0.3953],[0.7942,0.4258],[0.8255,0.4437],[0.7998,0.4625],[0.7606,0.4547],[0.7271,0.4359]] },
    { id: 3, color: C.redB, layer: 8, ends: [6, 7], path: [[0.7092,0.5594],[0.7148,0.5750],[0.7148,0.5938],[0.7472,0.6133],[0.7181,0.6297],[0.6913,0.6391]] },
    { id: 4, color: C.blue, layer: 7, ends: [8, 9], path: [[0.5649,0.3844],[0.6096,0.4000],[0.6544,0.4203],[0.6935,0.4453],[0.6879,0.4648],[0.7136,0.4766],[0.6991,0.5078],[0.6600,0.5352],[0.6208,0.5563]] },
    { id: 5, color: C.maroon, layer: 3, ends: [10, 11], path: [[0.2808,0.4078],[0.2931,0.4398],[0.3020,0.4539],[0.3356,0.4727],[0.3669,0.5078],[0.3893,0.5273],[0.3658,0.5398],[0.3803,0.5539],[0.3714,0.5703],[0.3356,0.6016],[0.2998,0.6367]] },
    { id: 6, color: C.green, layer: 4, ends: [12, 13], path: [[0.4653,0.3961],[0.4609,0.4102],[0.4519,0.4172],[0.4407,0.4406],[0.4351,0.4523],[0.4564,0.4844],[0.4463,0.5023],[0.4720,0.5195],[0.4843,0.5367],[0.5213,0.5484],[0.5190,0.5695]] },
    { id: 7, color: C.gold, layer: 6, ends: [14, 15], path: [[0.4004,0.5711],[0.4116,0.5773],[0.4418,0.5594],[0.4866,0.5430],[0.5313,0.5219],[0.5761,0.4984],[0.6219,0.4883],[0.6275,0.4789],[0.6465,0.4766],[0.6432,0.4492],[0.6577,0.4281]] },
    { id: 8, color: C.lime, layer: 10, ends: [16, 17], path: [[0.7919,0.5062],[0.7539,0.5047],[0.7438,0.5133],[0.7494,0.5391],[0.6991,0.5781],[0.6432,0.6172],[0.5928,0.6562],[0.5425,0.6914],[0.5089,0.7148],[0.5313,0.7391],[0.5447,0.7375],[0.5638,0.7352],[0.5828,0.7328],[0.6174,0.7336]] },
    { id: 9, color: C.purple, layer: 5, ends: [18, 19], path: [[0.2483,0.5734],[0.2640,0.5844],[0.2819,0.5945],[0.3110,0.6109],[0.3221,0.6195],[0.3512,0.6422],[0.3781,0.6625],[0.4060,0.6906],[0.4172,0.7023],[0.4698,0.7148],[0.5369,0.7180],[0.5503,0.7047]] },
    { id: 10, color: C.navy, layer: 1, ends: [20, 21], path: [[0.3814,0.3734],[0.4217,0.3750],[0.4452,0.4047],[0.4116,0.4203]] },
    { id: 11, color: C.orange, layer: 5, ends: [22, 23], path: [[0.2707,0.5391],[0.3043,0.5383],[0.3188,0.5484],[0.3602,0.5609]] },
  ];
  for (const r of ropes) {
    pegs[r.ends[0]].stack.push({ ropeId: r.id, end: 0 });
    pegs[r.ends[1]].stack.push({ ropeId: r.id, end: 1 });
  }
  return {
    pegs,
    ropes: ropes.map(r => ({ id: r.id, color: r.color, layer: r.layer, path: r.path, clearing: false, clearT: 0, freeT: 0 })),
    difficulty: 'HARD', seconds: 180, displayLevel: 201, showcase: true,
  };
}
