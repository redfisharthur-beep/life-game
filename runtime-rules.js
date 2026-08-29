const fs = require('fs');
const path = require('path');
const Module = require('module');

const serverPath = path.join(__dirname, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

const replacements = [
  ['const HAPPINESS_GOAL = 36;', 'const HAPPINESS_GOAL = 48;'],
  ["  doctor: { name: '醫師', salary: 7, stock: 1.5, land: 2.0, dream: 2.35 },", "  doctor: { name: '醫師', salary: 7, stock: 1.5, land: 2.0, dream: 2.25 },"],
  ["  engineer: { name: '資訊工程師', salary: 8, stock: 2.0, land: 1.0, dream: 2.10 },", "  engineer: { name: '資訊工程師', salary: 8, stock: 2.0, land: 1.0, dream: 2.20 },"],
  ["  sales: { name: '超級業務員', salary: 9, stock: 1.5, land: 1.5, dream: 1.95 },", "  sales: { name: '超級業務員', salary: 9, stock: 1.5, land: 1.5, dream: 2.05 },"],
  ["  office: { name: '白領上班族', salary: 5, stock: 2.0, land: 1.0, dream: 2.975 },", "  office: { name: '白領上班族', salary: 5, stock: 2.0, land: 1.0, dream: 2.60 },"],
  ["  athlete: { name: '職棒球員', salary: 6, stock: 1.0, land: 1.5, dream: 2.70 },", "  athlete: { name: '職棒球員', salary: 6, stock: 1.0, land: 1.5, dream: 2.45 },"],
  ["  rich: { name: '企業富二代', salary: 10, stock: 1.0, land: 2.0, dream: 1.80 },", "  rich: { name: '企業富二代', salary: 10, stock: 1.0, land: 2.0, dream: 2.00 },"],
  ['  const diceCount = forceDoubleDice || round >= 20 ? 2 : 1;', '  const diceCount = forceDoubleDice || round >= 16 ? 2 : 1;'],
  [
    "        roundAnnouncement: room.game.round === 20 && !room.game.forceDoubleDice\n          ? '人生加速！從現在開始每回合擲2顆骰子！'\n          : null,",
    '        roundAnnouncement: null,'
  ],
  ['  if (room.game.round === 20 && !room.game.forceDoubleDice) {', '  if (room.game.round === 16 && !room.game.forceDoubleDice) {'],
  ['      if (currentRoom.game.round !== 20 || currentRoom.game.currentPlayerId) return;', '      if (currentRoom.game.round !== 16 || currentRoom.game.currentPlayerId) return;'],
  ['  const stockUp = Math.random() < 0.65;', '  const stockUp = Math.random() < 0.60;'],
  ['  const landUp = Math.random() < 0.90;', '  const landUp = Math.random() < 0.80;'],
  ['  room.game.stockPrice = round2(room.game.stockPrice * (stockUp ? 1.10 : 0.93));', '  room.game.stockPrice = round2(room.game.stockPrice * (stockUp ? 1.12 : 0.92));'],
  ['  room.game.landPrice = round2(room.game.landPrice * (landUp ? 1.03 : 0.97));', '  room.game.landPrice = round2(room.game.landPrice * (landUp ? 1.04 : 0.96));'],
  ['  return `${stockUp ? \'股票上漲 10%\' : \'股票下跌 7%\'}，${landUp ? \'土地上漲 3%\' : \'土地下跌 3%\'}`;', '  return `${stockUp ? \'股票上漲 12%\' : \'股票下跌 8%\'}，${landUp ? \'土地上漲 4%\' : \'土地下跌 4%\'}`;'],
  [
    '  const salary = PROFESSIONS[player.profession].salary;\n  const income = Math.round(total * salary * 10);',
    '  const salary = PROFESSIONS[player.profession].salary;\n  const salaryRaiseFactor = 1 + (Math.floor((room.game.round - 1) / 5) * 0.1);\n  const effectiveSalary = round2(salary * salaryRaiseFactor);\n  const income = Math.round(total * effectiveSalary * 10);'
  ],
  [
    '    amount: income,\n    auto,',
    '    amount: income,\n    baseSalary: salary,\n    effectiveSalary,\n    salaryRaiseFactor,\n    auto,'
  ],
  ['    const units = round2(total * profession.stock);', '    const units = round2(total * 2 * profession.stock);'],
  ['    const units = round2(total * profession.land);', '    const units = round2(total * 2 * profession.land);'],
  ['    const after = before > 0 ? round2(before * positiveFactor) : round2(before + total);', '    const after = before > 0 ? round2(before * positiveFactor) : before;'],
  ['    const after = before > 0 ? round2(before * negativeFactor) : round2(before - (0.5 * total));', '    const after = before > 0 ? round2(before * negativeFactor) : before;'],
  ['    const after = before > 0 ? round2(before * factor) : round2(before - (0.25 * total));', '    const after = before > 0 ? round2(before * factor) : before;'],
  ['    const after = before > 0 ? round2(before * factor) : round2(before + (0.5 * total));', '    const after = before > 0 ? round2(before * factor) : before;'],
  [
    '  player.cash = actorCashAfter;\n  player.helpCount = (player.helpCount || 0) + 1;',
    '  player.cash = actorCashAfter;\n  player.happiness = round2(Number(player.happiness || 0) + 0.7);\n  player.helpCount = (player.helpCount || 0) + 1;'
  ],
  [
    'const ROOM_IDLE_MS = 15 * 60_000;\nconst TOTAL_ROUNDS = 30;',
    'const ROOM_IDLE_MS = 15 * 60_000;\nconst PROFESSION_AUTO_PICK_MS = 5 * 60_000;\nconst TOTAL_ROUNDS = 30;'
  ],
  [
    'function clearIdleTimer(room) {\n  if (room.idleTimer) {\n    clearTimeout(room.idleTimer);\n    room.idleTimer = null;\n  }\n}\n',
    'function clearIdleTimer(room) {\n  if (room.idleTimer) {\n    clearTimeout(room.idleTimer);\n    room.idleTimer = null;\n  }\n}\n\nfunction clearProfessionTimer(room) {\n  if (room.professionTimer) {\n    clearTimeout(room.professionTimer);\n    room.professionTimer = null;\n  }\n}\n\nfunction scheduleProfessionAutoPick(room) {\n  clearProfessionTimer(room);\n  room.professionTimer = setTimeout(() => {\n    const currentRoom = rooms.get(room.code);\n    if (!currentRoom || currentRoom.phase !== \'profession\') return;\n\n    const used = new Set(currentRoom.players.map((player) => player.profession).filter(Boolean));\n    const available = shuffle(Object.keys(PROFESSIONS).filter((professionId) => !used.has(professionId)));\n    const waitingPlayers = shuffle(currentRoom.players.filter((player) => !player.profession));\n\n    waitingPlayers.forEach((player) => {\n      const professionId = available.shift();\n      if (professionId) player.profession = professionId;\n    });\n\n    currentRoom.professionTimer = null;\n    if (currentRoom.players.length >= 2 && currentRoom.players.every((player) => Boolean(player.profession))) {\n      initializeGame(currentRoom);\n      return;\n    }\n    emitRoom(currentRoom);\n  }, PROFESSION_AUTO_PICK_MS);\n}\n'
  ],
  [
    'function initializeGame(room) {\n  clearTurnTimer(room);',
    'function initializeGame(room) {\n  clearProfessionTimer(room);\n  clearTurnTimer(room);'
  ],
  [
    "  const room = { code, hostId: player.id, players: [player], started: false, phase: 'lobby', game: null, turnTimer: null, idleTimer: null };",
    "  const room = { code, hostId: player.id, players: [player], started: false, phase: 'lobby', game: null, turnTimer: null, idleTimer: null, professionTimer: null };"
  ],
  [
    "    room.started = true; room.phase = 'profession'; room.players.forEach((player) => { player.profession = null; });\n    const snapshot = publicRoom(room);",
    "    room.started = true; room.phase = 'profession'; room.players.forEach((player) => { player.profession = null; });\n    scheduleProfessionAutoPick(room);\n    const snapshot = publicRoom(room);"
  ],
  [
    "    room.players.forEach((player) => { player.profession = null; player.cash = 0; player.stocks = 0; player.land = 0; player.happiness = 0; player.helpCount = 0; player.sabotageCount = 0; });\n    const snapshot = publicRoom(room);",
    "    room.players.forEach((player) => { player.profession = null; player.cash = 0; player.stocks = 0; player.land = 0; player.happiness = 0; player.helpCount = 0; player.sabotageCount = 0; });\n    scheduleProfessionAutoPick(room);\n    const snapshot = publicRoom(room);"
  ],
  [
    "  if (!room.players.length) { clearTurnTimer(room); clearIdleTimer(room); rooms.delete(room.code); return; }",
    "  if (!room.players.length) { clearTurnTimer(room); clearIdleTimer(room); clearProfessionTimer(room); rooms.delete(room.code); return; }"
  ],
  [
    '    clearTurnTimer(currentRoom);\n    rooms.delete(currentRoom.code);',
    '    clearTurnTimer(currentRoom);\n    clearProfessionTimer(currentRoom);\n    rooms.delete(currentRoom.code);'
  ]
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flexibleWhitespacePattern(value) {
  return new RegExp(
    escapeRegExp(value)
      .replace(/\\\r\\\n|\\\n|\\\r/g, '\\s*')
      .replace(/(?:\\ |\\\t)+/g, '\\s+'),
    'm'
  );
}

function applyReplacement(from, to) {
  if (source.includes(to)) return;

  if (source.includes(from)) {
    source = source.replace(from, to);
    return;
  }

  const flexiblePattern = flexibleWhitespacePattern(from);
  if (flexiblePattern.test(source)) {
    source = source.replace(flexiblePattern, to);
    return;
  }

  throw new Error(`Gameplay rule patch target not found: ${from.slice(0, 120)}`);
}

for (const [from, to] of replacements) applyReplacement(from, to);

const runtimeModule = new Module(serverPath, module);
runtimeModule.filename = serverPath;
runtimeModule.paths = Module._nodeModulePaths(path.dirname(serverPath));
runtimeModule._compile(source, serverPath);
