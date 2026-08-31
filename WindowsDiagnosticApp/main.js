const { app, BrowserWindow, ipcMain, systemPreferences } = require('electron');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: 'hidden',
    backgroundColor: '#121212',
    icon: path.join(__dirname, 'assets/icon.ico'),
  });

  mainWindow.loadFile(path.join(__dirname, 'public/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { app.quit(); });

// ─── Hardware Detection ────────────────────────────────────────────
ipcMain.handle('get-system-info', async () => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    osRelease: os.release(),
    osVersion: os.version(),
    cpuModel: cpus[0]?.model || 'Unknown',
    cpuCores: cpus.length,
    cpuSpeed: cpus[0]?.speed || 0,
    totalMemory: totalMem,
    freeMemory: freeMem,
    uptime: os.uptime(),
    tmpdir: os.tmpdir(),
  };
});

ipcMain.handle('get-disk-info', async () => {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec('wmic logicaldisk get DeviceID,Size,FreeSpace,FileSystem /format:csv', (err, stdout) => {
        if (err) { resolve([]); return; }
        const lines = stdout.trim().split('\n').filter(l => l.includes(','));
        const disks = lines.slice(1).map(line => {
          const parts = line.split(',');
          return {
            mount: parts[1] || '',
            total: parseInt(parts[4]) || 0,
            free: parseInt(parts[3]) || 0,
            fs: parts[2] || '',
          };
        }).filter(d => d.mount);
        resolve(disks);
      });
    } else {
      resolve([{ mount: '/', total: 0, free: 0, fs: 'unknown' }]);
    }
  });
});

ipcMain.handle('get-battery-info', async () => {
  try {
    if (process.platform === 'win32') {
      return new Promise((resolve) => {
        exec('WMIC Path Win32_Battery Get EstimatedChargeRemaining,BatteryStatus,Status,Caption /format:csv', (err, stdout) => {
          if (err) { resolve({ available: false }); return; }
          const lines = stdout.trim().split('\n').filter(l => l.includes(','));
          if (lines.length < 2) { resolve({ available: false }); return; }
          const parts = lines[1].split(',');
          resolve({
            available: true,
            charge: parseInt(parts[1]) || 0,
            status: parts[3] || 'Unknown',
            name: parts[4] || 'Battery',
          });
        });
      });
    }
    return { available: false };
  } catch {
    return { available: false };
  }
});

ipcMain.handle('get-network-info', async () => {
  const interfaces = os.networkInterfaces();
  const result = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (addrs) {
      for (const addr of addrs) {
        if (!addr.internal && addr.family === 'IPv4') {
          result.push({ name, address: addr.address, mac: addr.mac });
        }
      }
    }
  }
  return result;
});

ipcMain.handle('run-cpu-benchmark', async () => {
  const iterations = 10000000;
  const start = Date.now();
  let sum = 0;
  for (let i = 0; i < iterations; i++) {
    sum += Math.sqrt(i) * Math.sin(i);
  }
  const elapsed = Date.now() - start;
  return { elapsed, score: Math.round(iterations / elapsed / 1000) };
});

ipcMain.handle('get-process-list', async () => {
  return new Promise((resolve) => {
    exec('tasklist /FO CSV /NH', (err, stdout) => {
      if (err) { resolve([]); return; }
      const lines = stdout.trim().split('\n');
      const procs = lines.slice(0, 50).map(line => {
        const parts = line.split('","');
        return {
          name: (parts[0] || '').replace(/"/g, ''),
          pid: (parts[1] || '').replace(/"/g, ''),
          memory: (parts[4] || '').replace(/"/g, ''),
        };
      });
      resolve(procs);
    });
  });
});

ipcMain.handle('get-gpu-info', async () => {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec('wmic path win32_videocontroller get Name,AdapterRAM,DriverVersion /format:csv', (err, stdout) => {
        if (err) { resolve([]); return; }
        const lines = stdout.trim().split('\n').filter(l => l.includes(','));
        const gpus = lines.slice(1).map(line => {
          const parts = line.split(',');
          return {
            name: parts[3] || 'Unknown GPU',
            vram: parseInt(parts[1]) || 0,
            driver: parts[2] || '',
          };
        }).filter(g => g.name !== 'Unknown GPU');
        resolve(gpus);
      });
    } else {
      resolve([]);
    }
  });
});
