const { Fs } = require("@timeax/utilities");

const queryFile = Fs.join(__dirname, "./query.txt");

Fs.copy(queryFile, Fs.join(__dirname, "../dist/media"));
