const fs = require('fs');
const path = require('path');

it('should eval', function () {
    const filePath = path.join(__dirname, '../src/sample-function.js');
    const data = fs.readFileSync(filePath, 'utf8');
    try {
        const fn = eval(data);
        fn();
        fn().hello();
    } catch (e) {
        console.error('Error evaluating file:', e);
    }
});
