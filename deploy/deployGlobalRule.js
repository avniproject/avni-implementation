const path = require("path");
const fs = require("fs");
const readline = require('readline');

function createInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

let origin, token;

const interface = createInterface();
interface.question('Enter origin (server like https://prerelease.avniproject.org): ', (input) => {
    origin = input;
    interface.question('Enter auth-token: ', (input) => {
        token = input;
        const filePath = path.join(__dirname, '../src/global.js');
        const code = fs.readFileSync(filePath, 'utf8');

        const myHeaders = new Headers();
        myHeaders.append("auth-token", token);
        myHeaders.append("Content-Type", "text/plain");

        const requestOptions = {
            method: "POST",
            headers: myHeaders,
            body: code
        };

        fetch(`${origin}/web/ruleDependency/global`, requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
        interface.close();
    });
});
