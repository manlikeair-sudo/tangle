/** Level 201 traced from the reference start frame. Coordinates are 0..1 of the portrait frame. */
export function showcaseLevel() {
  const C = {
    peach: { name: 'peach', hex: '#E2A888', dark: '#654B3D', light: '#FFD2AA' },
    cyan: { name: 'cyan', hex: '#1E8CE0', dark: '#0D3F64', light: '#25AFFF' },
    red: { name: 'red', hex: '#E8302D', dark: '#681514', light: '#FF3C38' },
    blue: { name: 'blue', hex: '#1E4FD0', dark: '#0D235D', light: '#2562FF' },
    maroon: { name: 'maroon', hex: '#7A2A26', dark: '#361211', light: '#98342F' },
    green: { name: 'green', hex: '#1E9A48', dark: '#0D4520', light: '#25C05A' },
    gold: { name: 'gold', hex: '#F0B429', dark: '#6C5112', light: '#FFE133' },
    lime: { name: 'lime', hex: '#7EEA32', dark: '#386916', light: '#9DFF3E' },
    purple: { name: 'purple', hex: '#6B25FD', dark: '#301071', light: '#852EFF' },
    orange: { name: 'orange', hex: '#E07A22', dark: '#64360F', light: '#FF982A' },
  };
  const pegs = [
    { id: 0, nx: 0.4966, ny: 0.2513, capacity: 1, stack: [] },
    { id: 1, nx: 0.2360, ny: 0.5466, capacity: 1, stack: [] },
    { id: 2, nx: 0.5839, ny: 0.5208, capacity: 1, stack: [] },
    { id: 3, nx: 0.4430, ny: 0.3098, capacity: 1, stack: [] },
    { id: 4, nx: 0.6633, ny: 0.4122, capacity: 1, stack: [] },
    { id: 5, nx: 0.7875, ny: 0.4388, capacity: 1, stack: [] },
    { id: 6, nx: 0.6353, ny: 0.5927, capacity: 1, stack: [] },
    { id: 7, nx: 0.6029, ny: 0.6255, capacity: 1, stack: [] },
    { id: 8, nx: 0.2752, ny: 0.4731, capacity: 1, stack: [] },
    { id: 9, nx: 0.3054, ny: 0.3895, capacity: 1, stack: [] },
    { id: 10, nx: 0.4306, ny: 0.5497, capacity: 1, stack: [] },
    { id: 11, nx: 0.5201, ny: 0.5669, capacity: 1, stack: [] },
    { id: 12, nx: 0.6242, ny: 0.4802, capacity: 1, stack: [] },
    { id: 13, nx: 0.3837, ny: 0.5677, capacity: 1, stack: [] },
    { id: 14, nx: 0.6096, ny: 0.7028, capacity: 1, stack: [] },
    { id: 15, nx: 0.7472, ny: 0.4848, capacity: 1, stack: [] },
    { id: 16, nx: 0.2483, ny: 0.5755, capacity: 1, stack: [] },
    { id: 17, nx: 0.5179, ny: 0.7692, capacity: 1, stack: [] },
    { id: 18, nx: 0.4027, ny: 0.3864, capacity: 1, stack: [] },
    { id: 19, nx: 0.6152, ny: 0.5114, capacity: 1, stack: [] },
    { id: 20, nx: 0.4969, ny: 0.2687, capacity: 1, stack: [] },
    { id: 21, nx: 0.6899, ny: 0.3976, capacity: 1, stack: [] },
    { id: 22, nx: 0.5057, ny: 0.3999, capacity: 1, stack: [] },
    { id: 23, nx: 0.3177, ny: 0.4054, capacity: 1, stack: [] },
    { id: 24, nx: 0.4289, ny: 0.4749, capacity: 1, stack: [] },
    { id: 25, nx: 0.5952, ny: 0.4788, capacity: 1, stack: [] },
    { id: 26, nx: 0.6699, ny: 0.5554, capacity: 1, stack: [] },
    { id: 27, nx: 0.3500, ny: 0.5601, capacity: 1, stack: [] },
    { id: 28, nx: 0.4949, ny: 0.5616, capacity: 1, stack: [] },
    { id: 29, nx: 0.5056, ny: 0.6952, capacity: 1, stack: [] },
  ];
  const ropes = [
    { id: 0, color: C.peach, ends: [0, 1], path: [[0.4966,0.2513],[0.4385,0.2786],[0.5425,0.2950],[0.4183,0.3059],[0.5380,0.3114],[0.5257,0.3387],[0.4541,0.3661],[0.4575,0.3770],[0.4217,0.3934],[0.3501,0.4536],[0.2651,0.5028],[0.2148,0.5192],[0.2360,0.5466]] },
    { id: 1, color: C.cyan, ends: [2, 3], path: [[0.5839,0.5208],[0.5615,0.5223],[0.5537,0.5153],[0.5604,0.4708],[0.5850,0.4567],[0.6387,0.4544],[0.6465,0.4466],[0.6376,0.4278],[0.5917,0.4012],[0.5805,0.3817],[0.5503,0.3770],[0.4631,0.3411],[0.4183,0.3411],[0.4094,0.3309],[0.4150,0.3177],[0.4430,0.3098]] },
    { id: 2, color: C.red, ends: [4, 5], path: [[0.6633,0.4122],[0.6532,0.3958],[0.6600,0.3856],[0.6812,0.3770],[0.7092,0.3763],[0.7964,0.4106],[0.7998,0.4216],[0.7875,0.4388]] },
    { id: 3, color: C.blue, ends: [6, 7], path: [[0.6353,0.5927],[0.6488,0.6091],[0.6477,0.6239],[0.6286,0.6356],[0.6029,0.6255]] },
    { id: 4, color: C.maroon, ends: [8, 9], path: [[0.2752,0.4731],[0.2584,0.4684],[0.2562,0.4591],[0.2897,0.4309],[0.2796,0.4114],[0.3054,0.3895]] },
    { id: 5, color: C.green, ends: [10, 11], path: [[0.4306,0.5497],[0.5000,0.5411],[0.5235,0.5520],[0.5201,0.5669]] },
    { id: 6, color: C.gold, ends: [12, 13], path: [[0.6242,0.4802],[0.6443,0.4872],[0.6421,0.5145],[0.5257,0.6075],[0.5011,0.6138],[0.4642,0.6098],[0.4027,0.5716],[0.3837,0.5677]] },
    { id: 7, color: C.lime, ends: [14, 15], path: [[0.6096,0.7028],[0.6309,0.7184],[0.6208,0.7348],[0.5604,0.7388],[0.5123,0.7505],[0.4832,0.7466],[0.4642,0.7309],[0.4620,0.7098],[0.4832,0.6763],[0.5123,0.6653],[0.5761,0.6184],[0.6499,0.5403],[0.7181,0.5145],[0.7170,0.4880],[0.7304,0.4809],[0.7472,0.4848]] },
    { id: 8, color: C.purple, ends: [16, 17], path: [[0.2483,0.5755],[0.3121,0.6138],[0.3658,0.6575],[0.3904,0.6645],[0.4418,0.7458],[0.4799,0.7661],[0.5179,0.7692]] },
  ];
  for (const r of ropes) {
    pegs[r.ends[0]].stack.push({ ropeId: r.id, end: 0 });
    pegs[r.ends[1]].stack.push({ ropeId: r.id, end: 1 });
  }
  return {
    pegs,
    ropes: ropes.map(r => ({ id: r.id, color: r.color, path: r.path, clearing: false, clearT: 0, freeT: 0 })),
    difficulty: 'HARD', seconds: 180, displayLevel: 201, showcase: true,
  };
}
