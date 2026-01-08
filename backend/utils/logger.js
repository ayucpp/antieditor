const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, '../debug.log');

const writeLog = (level, msg) => {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  console.log(line.trim());
  try { fs.appendFileSync(logFile, line); } catch (e) { }
};

const logger = {
  info: (msg) => writeLog('INFO', msg),
  warn: (msg) => writeLog('WARN', msg),
  error: (msg) => writeLog('ERROR', msg),
};

module.exports = logger;
