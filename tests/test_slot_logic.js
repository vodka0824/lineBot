const SYMBOLS = ['7', 'apple', 'bar', 'bell', 'cherry', 'diamond', 'grape', 'lemon', 'orange', 'plum', 'watermelon'];
const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

function testSlot() {
    const layout = [];
    for (let i = 0; i < 9; i++) {
        layout.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
    }

    const winners = [];
    WIN_LINES.forEach(line => {
        const [a, b, c] = line;
        if (layout[a] === layout[b] && layout[b] === layout[c]) {
            winners.push({ line, symbol: layout[a] });
        }
    });

    console.log('Layout:', layout.slice(0, 3).join('|'), '/', layout.slice(3, 6).join('|'), '/', layout.slice(6, 9).join('|'));
    if (winners.length > 0) {
        console.log('Winners:', winners);
    } else {
        console.log('No winners this time.');
    }
}

console.log('Running 5 test spins...');
for (let i = 0; i < 5; i++) {
    testSlot();
}
