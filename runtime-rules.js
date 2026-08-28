const fs = require('fs');
const path = require('path');
const Module = require('module');

const serverPath = path.join(__dirname, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

const replacements = [
  [
    'const TURN_MS = 10_000;',
    'const TURN_MS = 8_000;'
  ],
  [
    'const HAPPINESS_GOAL = 36;',
    'const HAPPINESS_GOAL = 48;'
  ],
  [
    `function updateMarket(room) {\n  const stockUp = Math.random() < 0.65;\n  const landUp = Math.random() < 0.90;\n  room.game.stockPrice = round2(room.game.stockPrice * (stockUp ? 1.10 : 0.93));\n  room.game.landPrice = round2(room.game.landPrice * (landUp ? 1.03 : 0.97));\n\n  return \`${'${stockUp'} ? '股票上漲 10%' : '股票下跌 7%'}，${'${landUp'} ? '土地上漲 3%' : '土地下跌 3%'}\`;\n}`,
    `function updateMarket(room) {\n  const stockUp = Math.random() < 0.60;\n  const landUp = Math.random() < 0.80;\n  room.game.stockPrice = round2(room.game.stockPrice * (stockUp ? 1.15 : 0.92));\n  room.game.landPrice = round2(room.game.landPrice * (landUp ? 1.04 : 0.96));\n\n  return \`${'${stockUp'} ? '股票上漲 15%' : '股票下跌 8%'}，${'${landUp'} ? '土地上漲 4%' : '土地下跌 4%'}\`;\n}`
  ],
  [
    `  const salary = PROFESSIONS[player.profession].salary;\n  const income = Math.round(total * salary * 10);`,
    `  const salary = PROFESSIONS[player.profession].salary;\n  const salaryRaiseFactor = 1 + (Math.floor((room.game.round - 1) / 5) * 0.1);\n  const effectiveSalary = round2(salary * salaryRaiseFactor);\n  const income = Math.round(total * effectiveSalary * 10);`
  ],
  [
    `    amount: income,\n    auto,`,
    `    amount: income,\n    baseSalary: salary,\n    effectiveSalary,\n    salaryRaiseFactor,\n    auto,`
  ],
  [
    '    const units = round2(total * profession.stock);',
    '    const units = round2(total * 2);'
  ],
  [
    '    const units = round2(total * profession.land);',
    '    const units = round2(total * 2);'
  ],
  [
    `    const after = before > 0 ? round2(before * positiveFactor) : round2(before + total);`,
    `    const after = before > 0 ? round2(before * positiveFactor) : before;`
  ],
  [
    `    const after = before > 0 ? round2(before * negativeFactor) : round2(before - (0.5 * total));`,
    `    const after = before > 0 ? round2(before * negativeFactor) : before;`
  ],
  [
    `    const after = before > 0 ? round2(before * factor) : round2(before - (0.25 * total));`,
    `    const after = before > 0 ? round2(before * factor) : before;`
  ],
  [
    `    const after = before > 0 ? round2(before * factor) : round2(before + (0.5 * total));`,
    `    const after = before > 0 ? round2(before * factor) : before;`
  ]
];

for (const [from, to] of replacements) {
  if (!source.includes(from)) {
    throw new Error(`Gameplay rule patch target not found: ${from.slice(0, 90)}`);
  }
  source = source.replace(from, to);
}

const runtimeModule = new Module(serverPath, module);
runtimeModule.filename = serverPath;
runtimeModule.paths = Module._nodeModulePaths(path.dirname(serverPath));
runtimeModule._compile(source, serverPath);
