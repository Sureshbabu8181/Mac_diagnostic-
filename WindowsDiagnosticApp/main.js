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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
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

// ─── Driver Detection ─────────────────────────────────────────────
ipcMain.handle('get-drivers', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve([]); return; }
    const cmd = 'wmic sysdriver get Name,DisplayName,State,PathName /format:csv';
    exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) { resolve([]); return; }
      const lines = stdout.trim().split('\n').filter(l => l.includes(','));
      const drivers = lines.slice(1).map(line => {
        const parts = line.split(',');
        return {
          name: (parts[3] || '').trim(),
          displayName: (parts[2] || '').trim(),
          state: (parts[4] || '').trim(),
          path: (parts[5] || '').trim(),
        };
      }).filter(d => d.name && d.displayName);
      resolve(drivers);
    });
  });
});

ipcMain.handle('get-driver-updates', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve([]); return; }
    // Use pnputil to list devices with out-of-date drivers
    const cmd = 'pnputil /enum-devices /problem';
    exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) { resolve([]); return; }
      const devices = [];
      const blocks = stdout.split(/Instance ID/i);
      for (const block of blocks.slice(1)) {
        const instanceMatch = block.match(/:\s*(.+)/);
        const problemMatch = block.match(/Problem\s*:\s*(0x\w+)/i);
        const statusMatch = block.match(/Status\s*:\s*(.+)/i);
        if (instanceMatch) {
          devices.push({
            instanceId: instanceMatch[1].trim(),
            problem: problemMatch ? problemMatch[1].trim() : 'Unknown',
            status: statusMatch ? statusMatch[1].trim() : 'Unknown',
          });
        }
      }
      resolve(devices);
    });
  });
});

ipcMain.handle('get-devices-with-drivers', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve([]); return; }
    const cmd = 'wmic path Win32_PnPEntity where "ConfigManagerErrorCode!=0" get DeviceID,Name,Manufacturer,Service,ConfigManagerErrorCode /format:csv';
    exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) { resolve([]); return; }
      const lines = stdout.trim().split('\n').filter(l => l.includes(','));
      const devices = lines.slice(1).map(line => {
        const parts = line.split(',');
        return {
          deviceId: (parts[2] || '').trim(),
          name: (parts[3] || '').trim(),
          manufacturer: (parts[4] || '').trim(),
          service: (parts[5] || '').trim(),
          errorCode: parseInt(parts[1]) || 0,
        };
      }).filter(d => d.name);
      resolve(devices);
    });
  });
});

ipcMain.handle('update-driver', async (_, deviceId) => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve({ success: false, message: 'Windows only' }); return; }
    const cmd = `pnputil /scan-devices`;
    exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) { resolve({ success: false, message: err.message }); return; }
      resolve({ success: true, message: stdout || 'Driver scan completed' });
    });
  });
});

ipcMain.handle('install-windows-updates', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve({ success: false }); return; }
    const cmd = 'powershell -Command "Get-WindowsUpdate | Install-WindowsUpdate -AcceptAll -AutoReboot"';
    exec(cmd, { timeout: 60000 }, (err, stdout) => {
      if (err) { resolve({ success: false, message: err.message }); return; }
      resolve({ success: true, message: stdout || 'Update check completed' });
    });
  });
});

ipcMain.handle('open-device-manager', async () => {
  if (process.platform === 'win32') {
    exec('devmgmt.msc');
  }
  return { success: true };
});

ipcMain.handle('open-windows-update', async () => {
  if (process.platform === 'win32') {
    exec('ms-settings:windowsupdate');
  }
  return { success: true };
});

// ─── Temp File Cleaner ────────────────────────────────────────────
ipcMain.handle('get-temp-files', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve({ files: [], totalSize: 0 }); return; }
    const tempDirs = [
      process.env.TEMP || 'C:\\Windows\\Temp',
      `${process.env.USERPROFILE}\\AppData\\Local\\Temp`,
      'C:\\Windows\\Temp',
    ];
    const uniqueDirs = [...new Set(tempDirs)];
    let allFiles = [];
    let totalSize = 0;
    let done = 0;

    uniqueDirs.forEach((dir) => {
      const cmd = `powershell -Command "Get-ChildItem -Path '${dir}' -Recurse -File -ErrorAction SilentlyContinue | Select-Object FullName,Length,LastWriteTime | ConvertTo-Json"`;
      exec(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 15000 }, (err, stdout) => {
        try {
          const data = JSON.parse(stdout);
          const files = (Array.isArray(data) ? data : [data]).map(f => ({
            path: f.FullName,
            size: f.Length || 0,
            modified: f.LastWriteTime,
            dir: dir,
          }));
          allFiles = allFiles.concat(files);
          totalSize += files.reduce((sum, f) => sum + f.size, 0);
        } catch {}
        done++;
        if (done === uniqueDirs.length) {
          allFiles.sort((a, b) => b.size - a.size);
          resolve({ files: allFiles.slice(0, 500), totalSize, totalCount: allFiles.length });
        }
      });
    });
  });
});

ipcMain.handle('clean-temp-files', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve({ success: false, message: 'Windows only' }); return; }
    const tempDirs = [
      process.env.TEMP || 'C:\\Windows\\Temp',
      `${process.env.USERPROFILE}\\AppData\\Local\\Temp`,
      'C:\\Windows\\Temp',
    ];
    const uniqueDirs = [...new Set(tempDirs)];
    let removedCount = 0;
    let freedBytes = 0;
    let done = 0;
    let errors = [];

    uniqueDirs.forEach((dir) => {
      const cmd = `powershell -Command "Get-ChildItem -Path '${dir}' -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { try { $size = $_.Length; Remove-Item $_.FullName -Force -ErrorAction Stop; [PSCustomObject]@{Size=$size} } catch {} } | Measure-Object -Property Size -Sum"`;
      exec(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }, (err, stdout) => {
        if (err) { errors.push(err.message); }
        try {
          const match = stdout?.match(/Sum\s*:\s*(\d+)/);
          if (match) freedBytes += parseInt(match[1]);
        } catch {}
        done++;
        if (done === uniqueDirs.length) {
          resolve({
            success: errors.length === 0,
            freedBytes,
            message: errors.length > 0 ? `Cleaned with some errors: ${errors[0]}` : 'Temp files cleaned successfully',
          });
        }
      });
    });
  });
});

// ─── Hardware Tests ───────────────────────────────────────────────
ipcMain.handle('get-display-info', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve({ width: 0, height: 0, refreshRate: 0 }); return; }
    const cmd = 'wmic path Win32_VideoController get CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate /format:csv';
    exec(cmd, (err, stdout) => {
      if (err) { resolve({ width: 0, height: 0, refreshRate: 0 }); return; }
      const lines = stdout.trim().split('\n').filter(l => l.includes(','));
      if (lines.length < 2) { resolve({ width: 0, height: 0, refreshRate: 0 }); return; }
      const parts = lines[1].split(',');
      resolve({
        width: parseInt(parts[1]) || 0,
        height: parseInt(parts[3]) || 0,
        refreshRate: parseInt(parts[2]) || 0,
      });
    });
  });
});

ipcMain.handle('test-speaker', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve({ success: false }); return; }
    // Play a beep sound via PowerShell
    const cmd = 'powershell -Command "[Console]::Beep(800, 500)"';
    exec(cmd, { timeout: 5000 }, (err) => {
      resolve({ success: !err });
    });
  });
});

ipcMain.handle('get-audio-devices', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve([]); return; }
    const cmd = 'powershell -Command "Get-WmiObject Win32_SoundDevice | Select-Object Name,Status | ConvertTo-Json"';
    exec(cmd, (err, stdout) => {
      if (err) { resolve([]); return; }
      try {
        const data = JSON.parse(stdout);
        resolve(Array.isArray(data) ? data : [data]);
      } catch { resolve([]); }
    });
  });
});

ipcMain.handle('get-usb-devices', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve([]); return; }
    const cmd = 'wmic path Win32_USBControllerDevice get Dependent /format:csv';
    exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) { resolve([]); return; }
      const lines = stdout.trim().split('\n').filter(l => l.includes('DeviceID'));
      const devices = lines.slice(0, 30).map(line => {
        const match = line.match(/DeviceID="([^"]+)"/);
        return match ? match[1] : null;
      }).filter(Boolean);
      resolve(devices);
    });
  });
});

ipcMain.handle('get-printers', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve([]); return; }
    const cmd = 'wmic printer get Name,Status,Default /format:csv';
    exec(cmd, (err, stdout) => {
      if (err) { resolve([]); return; }
      const lines = stdout.trim().split('\n').filter(l => l.includes(','));
      const printers = lines.slice(1).map(line => {
        const parts = line.split(',');
        return {
          name: (parts[3] || '').trim(),
          status: (parts[4] || '').trim(),
          isDefault: (parts[1] || '').trim() === 'TRUE',
        };
      }).filter(p => p.name);
      resolve(printers);
    });
  });
});

ipcMain.handle('get-keyboard-layout', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve('Unknown'); return; }
    const cmd = 'powershell -Command "(Get-Culture).KeyboardLayoutId"';
    exec(cmd, (err, stdout) => {
      resolve(stdout?.trim() || 'Unknown');
    });
  });
});

ipcMain.handle('get-bluetooth-devices', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve([]); return; }
    const cmd = 'powershell -Command "Get-PnpDevice -Class Bluetooth | Select-Object FriendlyName,Status | ConvertTo-Json"';
    exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) { resolve([]); return; }
      try {
        const data = JSON.parse(stdout);
        resolve(Array.isArray(data) ? data : [data]);
      } catch { resolve([]); }
    });
  });
});

ipcMain.handle('get-camera-devices', async () => {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve([]); return; }
    const cmd = 'powershell -Command "Get-PnpDevice -Class Camera | Select-Object FriendlyName,Status | ConvertTo-Json"';
    exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) { resolve([]); return; }
      try {
        const data = JSON.parse(stdout);
        resolve(Array.isArray(data) ? data : [data]);
      } catch { resolve([]); }
    });
  });
});
