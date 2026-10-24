// Jembatan ke sesi media Windows (Spotify, YouTube di browser, dll.) lewat media-bridge.ps1.
// Skrip mengirim satu JSON per baris di stdout dan menerima perintah per baris di stdin.
const { spawn } = require('child_process');
const { helperPath } = require('./helpers-path');

let proc = null;
let stopping = false;
let restartDelay = 1000;
let handler = () => {};

function start(onMessage) {
  handler = onMessage;
  stopping = false;
  spawnBridge();
}

function spawnBridge() {
  proc = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPath('media-bridge.ps1')],
    { windowsHide: true }
  );

  let buffer = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace(/^﻿/, '').trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        handler(JSON.parse(line));
        restartDelay = 1000;
      } catch {
        // abaikan baris yang bukan JSON
      }
    }
  });
  proc.stderr.on('data', (d) => console.error('[media-bridge]', d.toString().trim()));
  proc.on('exit', () => {
    proc = null;
    if (stopping) return;
    setTimeout(spawnBridge, restartDelay);
    restartDelay = Math.min(restartDelay * 2, 30000);
  });
}

function command(cmd) {
  if (proc && proc.stdin.writable) proc.stdin.write(`${cmd}\n`);
}

function stop() {
  stopping = true;
  if (proc) {
    try {
      proc.stdin.end();
      proc.kill();
    } catch {
      // proses sudah selesai
    }
  }
}

module.exports = { start, command, stop };
