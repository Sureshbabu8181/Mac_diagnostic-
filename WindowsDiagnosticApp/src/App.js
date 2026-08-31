const React = require('react');
const { useState, useEffect } = React;

const { ipcRenderer } = window.require('electron');

// ─── Utility ──────────────────────────────────────────────────────
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatUptime = (seconds) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
};

const getStatusColor = (pct) => pct >= 80 ? '#f85149' : pct >= 60 ? '#d29922' : '#3fb950';

// ─── Components ───────────────────────────────────────────────────
function Sidebar({ activePage, onNavigate }) {
  const pages = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'hardware', icon: '🖥️', label: 'Hardware' },
    { id: 'cpu', icon: '⚡', label: 'CPU' },
    { id: 'memory', icon: '🧠', label: 'Memory' },
    { id: 'disk', icon: '💾', label: 'Disk' },
    { id: 'network', icon: '🌐', label: 'Network' },
    { id: 'gpu', icon: '🎮', label: 'GPU' },
    { id: 'battery', icon: '🔋', label: 'Battery' },
    { id: 'drivers', icon: '🔧', label: 'Drivers' },
    { id: 'updates', icon: '🔄', label: 'Software Updates' },
    { id: 'processes', icon: '📋', label: 'Processes' },
    { id: 'reports', icon: '📄', label: 'Reports' },
  ];

  return (
    React.createElement('div', { style: styles.sidebar },
      React.createElement('div', { style: styles.logo },
        React.createElement('div', { style: styles.logoIcon }, '1D'),
        React.createElement('div', { style: styles.logoText }, 'One Diagnose')
      ),
      pages.map((p) =>
        React.createElement('button', {
          key: p.id,
          style: { ...styles.navItem, ...(activePage === p.id ? styles.navItemActive : {}) },
          onClick: () => onNavigate(p.id),
        },
          React.createElement('span', null, p.icon),
          React.createElement('span', null, p.label)
        )
      )
    )
  );
}

function Dashboard({ systemInfo }) {
  if (!systemInfo) return React.createElement('div', { style: styles.loading }, 'Loading...');
  const memUsedPct = Math.round(((systemInfo.totalMemory - systemInfo.freeMemory) / systemInfo.totalMemory) * 100);
  return (
    React.createElement('div', { style: styles.page },
      React.createElement('h1', { style: styles.pageTitle }, 'System Overview'),
      React.createElement('div', { style: styles.statsGrid },
        React.createElement(StatCard, { label: 'Platform', value: systemInfo.platform, icon: '🖥️' }),
        React.createElement(StatCard, { label: 'Architecture', value: systemInfo.arch, icon: '🔧' }),
        React.createElement(StatCard, { label: 'CPU', value: `${systemInfo.cpuCores} cores`, icon: '⚡' }),
        React.createElement(StatCard, { label: 'CPU Model', value: systemInfo.cpuModel, icon: '🏷️' }),
        React.createElement(StatCard, { label: 'Total RAM', value: formatBytes(systemInfo.totalMemory), icon: '🧠' }),
        React.createElement(StatCard, { label: 'Free RAM', value: formatBytes(systemInfo.freeMemory), icon: '🆓' }),
        React.createElement(StatCard, { label: 'RAM Usage', value: `${memUsedPct}%`, icon: '📊', color: getStatusColor(memUsedPct) }),
        React.createElement(StatCard, { label: 'Uptime', value: formatUptime(systemInfo.uptime), icon: '⏱️' }),
        React.createElement(StatCard, { label: 'Hostname', value: systemInfo.hostname, icon: '💻' }),
        React.createElement(StatCard, { label: 'OS Version', value: systemInfo.osVersion, icon: '🪟' }),
      )
    )
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    React.createElement('div', { style: styles.statCard },
      React.createElement('div', { style: styles.statIcon }, icon),
      React.createElement('div', null,
        React.createElement('div', { style: styles.statLabel }, label),
        React.createElement('div', { style: { ...styles.statValue, color: color || '#e6edf3' } }, value)
      )
    )
  );
}

function ProgressBar({ value, color }) {
  return (
    React.createElement('div', { style: styles.progressBg },
      React.createElement('div', { style: { ...styles.progressFill, width: `${value}%`, backgroundColor: color || '#3fb950' } })
    )
  );
}

// ─── Hardware Page ────────────────────────────────────────────────
function HardwarePage({ systemInfo, diskInfo, networkInfo, gpuInfo, batteryInfo }) {
  return (
    React.createElement('div', { style: styles.page },
      React.createElement('h1', { style: styles.pageTitle }, 'Hardware Info'),
      React.createElement('div', { style: styles.card },
        React.createElement('h2', { style: styles.cardTitle }, '💻 CPU'),
        React.createElement('p', null, `Model: ${systemInfo?.cpuModel || 'N/A'}`),
        React.createElement('p', null, `Cores: ${systemInfo?.cpuCores || 'N/A'}`),
        React.createElement('p', null, `Speed: ${systemInfo?.cpuSpeed || 'N/A'} MHz`),
      ),
      React.createElement('div', { style: styles.card },
        React.createElement('h2', { style: styles.cardTitle }, '🧠 Memory'),
        React.createElement('p', null, `Total: ${formatBytes(systemInfo?.totalMemory || 0)}`),
        React.createElement('p', null, `Free: ${formatBytes(systemInfo?.freeMemory || 0)}`),
        React.createElement(ProgressBar, {
          value: systemInfo ? Math.round(((systemInfo.totalMemory - systemInfo.freeMemory) / systemInfo.totalMemory) * 100) : 0,
          color: getStatusColor(systemInfo ? Math.round(((systemInfo.totalMemory - systemInfo.freeMemory) / systemInfo.totalMemory) * 100) : 0),
        }),
      ),
      gpuInfo?.length > 0 && React.createElement('div', { style: styles.card },
        React.createElement('h2', { style: styles.cardTitle }, '🎮 GPU'),
        gpuInfo.map((gpu, i) =>
          React.createElement('div', { key: i, style: { marginBottom: 8 } },
            React.createElement('p', null, `Name: ${gpu.name}`),
            gpu.vram && React.createElement('p', null, `VRAM: ${formatBytes(gpu.vram)}`),
            gpu.driver && React.createElement('p', null, `Driver: ${gpu.driver}`)
          )
        )
      ),
      React.createElement('div', { style: styles.card },
        React.createElement('h2', { style: styles.cardTitle }, '💾 Disk'),
        diskInfo?.map((d, i) =>
          React.createElement('div', { key: i, style: { marginBottom: 8 } },
            React.createElement('p', null, `Drive: ${d.mount} (${d.fs})`),
            d.total > 0 && React.createElement(ProgressBar, {
              value: Math.round(((d.total - d.free) / d.total) * 100),
              color: getStatusColor(Math.round(((d.total - d.free) / d.total) * 100)),
            }),
            React.createElement('p', { style: { fontSize: 12, color: '#8b949e' } },
              `${formatBytes(d.total - d.free)} / ${formatBytes(d.total)}`
            )
          )
        )
      ),
      React.createElement('div', { style: styles.card },
        React.createElement('h2', { style: styles.cardTitle }, '🌐 Network'),
        networkInfo?.map((n, i) =>
          React.createElement('p', { key: i }, `${n.name}: ${n.address}`)
        ),
        (!networkInfo || networkInfo.length === 0) && React.createElement('p', { style: { color: '#8b949e' } }, 'No network interfaces detected')
      )
    )
  );
}

// ─── Drivers Page ─────────────────────────────────────────────────
function DriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [problemDevices, setProblemDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => { loadDrivers(); }, []);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const [d, p] = await Promise.all([
        ipcRenderer.invoke('get-drivers'),
        ipcRenderer.invoke('get-devices-with-drivers'),
      ]);
      setDrivers(d);
      setProblemDevices(p);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const scanForUpdates = async () => {
    setScanning(true);
    await loadDrivers();
    setScanning(false);
  };

  const openDeviceManager = () => ipcRenderer.invoke('open-device-manager');

  const filteredDrivers = filter === 'problem'
    ? drivers.filter(d => d.state !== 'Running')
    : drivers;

  const runningCount = drivers.filter(d => d.state === 'Running').length;
  const stoppedCount = drivers.filter(d => d.state === 'Stopped').length;

  return (
    React.createElement('div', { style: styles.page },
      React.createElement('h1', { style: styles.pageTitle }, 'Driver Management'),

      React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 20 } },
        React.createElement('button', { style: styles.btn, onClick: scanForUpdates, disabled: scanning },
          scanning ? '🔄 Scanning...' : '🔍 Scan Drivers'
        ),
        React.createElement('button', { style: { ...styles.btn, backgroundColor: '#1f6feb' }, onClick: openDeviceManager },
          '⚙️ Open Device Manager'
        ),
      ),

      React.createElement('div', { style: styles.statsGrid },
        React.createElement(StatCard, { label: 'Total Drivers', value: drivers.length, icon: '📦' }),
        React.createElement(StatCard, { label: 'Running', value: runningCount, icon: '✅' }),
        React.createElement(StatCard, { label: 'Stopped', value: stoppedCount, icon: '⛔' }),
        React.createElement(StatCard, { label: 'Problem Devices', value: problemDevices.length, icon: '⚠️', color: problemDevices.length > 0 ? '#f85149' : '#3fb950' }),
      ),

      problemDevices.length > 0 && React.createElement('div', { style: { ...styles.card, borderColor: '#f8514980' } },
        React.createElement('h2', { style: { ...styles.cardTitle, color: '#f85149' } }, '⚠️ Devices with Issues'),
        React.createElement('table', { style: styles.table },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', { style: styles.th }, 'Device'),
              React.createElement('th', { style: styles.th }, 'Manufacturer'),
              React.createElement('th', { style: styles.th }, 'Error Code'),
            )
          ),
          React.createElement('tbody', null,
            problemDevices.map((d, i) =>
              React.createElement('tr', { key: i, style: i % 2 === 0 ? styles.trEven : {} },
                React.createElement('td', { style: styles.td }, d.name),
                React.createElement('td', { style: styles.td }, d.manufacturer),
                React.createElement('td', { style: { ...styles.td, color: '#f85149', fontWeight: 600 } }, `Error ${d.errorCode}`),
              )
            )
          )
        )
      ),

      React.createElement('div', { style: styles.card },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
          React.createElement('h2', { style: styles.cardTitle }, 'All Drivers'),
          React.createElement('div', { style: { display: 'flex', gap: 8 } },
            ['all', 'running', 'stopped'].map(f =>
              React.createElement('button', {
                key: f,
                style: { ...styles.filterBtn, ...(filter === f ? styles.filterBtnActive : {}) },
                onClick: () => setFilter(f),
              }, f.charAt(0).toUpperCase() + f.slice(1))
            )
          )
        ),
        loading ? React.createElement('div', { style: styles.loading }, 'Loading drivers...') :
        React.createElement('table', { style: styles.table },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', { style: styles.th }, 'Name'),
              React.createElement('th', { style: styles.th }, 'Display Name'),
              React.createElement('th', { style: styles.th }, 'State'),
            )
          ),
          React.createElement('tbody', null,
            filteredDrivers.slice(0, 100).map((d, i) =>
              React.createElement('tr', { key: i, style: i % 2 === 0 ? styles.trEven : {} },
                React.createElement('td', { style: styles.td }, d.name),
                React.createElement('td', { style: styles.td }, d.displayName),
                React.createElement('td', {
                  style: {
                    ...styles.td,
                    color: d.state === 'Running' ? '#3fb950' : d.state === 'Stopped' ? '#f85149' : '#d29922',
                    fontWeight: 600,
                  }
                }, d.state),
              )
            )
          )
        )
      )
    )
  );
}

// ─── Software Updates Page ────────────────────────────────────────
function UpdatesPage({ systemInfo }) {
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [installing, setInstalling] = useState(false);

  const checkUpdates = async () => {
    setChecking(true);
    try {
      const result = await ipcRenderer.invoke('install-windows-updates');
      setLastCheck(new Date().toLocaleString());
      if (result.success) {
        setUpdates([{ name: 'Windows Update', status: 'Checked', message: result.message }]);
      } else {
        setUpdates([{ name: 'Windows Update', status: 'Error', message: result.message }]);
      }
    } catch (e) {
      setUpdates([{ name: 'Windows Update', status: 'Error', message: e.message }]);
    }
    setChecking(false);
  };

  const openWindowsUpdate = () => ipcRenderer.invoke('open-windows-update');

  return (
    React.createElement('div', { style: styles.page },
      React.createElement('h1', { style: styles.pageTitle }, 'Software Updates'),

      React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 20 } },
        React.createElement('button', {
          style: styles.btn,
          onClick: checkUpdates,
          disabled: checking || installing,
        }, checking ? '🔄 Checking...' : '🔍 Check for Updates'),
        React.createElement('button', {
          style: { ...styles.btn, backgroundColor: '#1f6feb' },
          onClick: openWindowsUpdate,
        }, '⚙️ Open Windows Update'),
      ),

      systemInfo && React.createElement('div', { style: styles.statsGrid },
        React.createElement(StatCard, { label: 'OS', value: systemInfo.osVersion, icon: '🪟' }),
        React.createElement(StatCard, { label: 'Architecture', value: systemInfo.arch, icon: '🔧' }),
        React.createElement(StatCard, { label: 'Last Check', value: lastCheck || 'Never', icon: '🕐' }),
        React.createElement(StatCard, { label: 'Uptime', value: formatUptime(systemInfo.uptime), icon: '⏱️' }),
      ),

      React.createElement('div', { style: styles.card },
        React.createElement('h2', { style: styles.cardTitle }, '🔄 Update Status'),
        updates.length === 0 ?
          React.createElement('div', { style: { textAlign: 'center', padding: 40, color: '#8b949e' } },
            React.createElement('p', { style: { fontSize: 48, marginBottom: 12 } }, '🔄'),
            React.createElement('p', null, 'Click "Check for Updates" to scan for available software updates'),
          )
        :
        React.createElement('table', { style: styles.table },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', { style: styles.th }, 'Component'),
              React.createElement('th', { style: styles.th }, 'Status'),
              React.createElement('th', { style: styles.th }, 'Details'),
            )
          ),
          React.createElement('tbody', null,
            updates.map((u, i) =>
              React.createElement('tr', { key: i, style: i % 2 === 0 ? styles.trEven : {} },
                React.createElement('td', { style: styles.td }, u.name),
                React.createElement('td', {
                  style: {
                    ...styles.td,
                    color: u.status === 'Checked' ? '#3fb950' : u.status === 'Error' ? '#f85149' : '#d29922',
                    fontWeight: 600,
                  }
                }, u.status),
                React.createElement('td', { style: { ...styles.td, fontSize: 11, color: '#8b949e', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, u.message),
              )
            )
          )
        )
      ),

      React.createElement('div', { style: styles.card },
        React.createElement('h2', { style: styles.cardTitle }, '💡 Tips'),
        React.createElement('ul', { style: { paddingLeft: 20, lineHeight: 2, color: '#8b949e' } },
          React.createElement('li', null, 'Keep Windows updated for the latest security patches'),
          React.createElement('li', null, 'GPU drivers should be updated from the manufacturer (NVIDIA/AMD/Intel)'),
          React.createElement('li', null, 'Use Device Manager to update individual driver issues'),
          React.createElement('li', null, 'Restart your PC after major driver updates'),
        )
      )
    )
  );
}

// ─── Benchmark Page ───────────────────────────────────────────────
function BenchmarkPage() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const runBenchmark = async () => {
    setRunning(true);
    const r = await ipcRenderer.invoke('run-cpu-benchmark');
    setResult(r);
    setRunning(false);
  };
  return (
    React.createElement('div', { style: styles.page },
      React.createElement('h1', { style: styles.pageTitle }, 'CPU Benchmark'),
      React.createElement('div', { style: styles.card },
        React.createElement('p', { style: { marginBottom: 16 } }, 'Run a CPU benchmark to test processing performance.'),
        React.createElement('button', {
          style: { ...styles.btn, ...(running ? styles.btnDisabled : {}) },
          onClick: runBenchmark,
          disabled: running,
        }, running ? 'Running...' : 'Start Benchmark'),
        result && React.createElement('div', { style: { marginTop: 20 } },
          React.createElement('p', null, `Time: ${result.elapsed}ms`),
          React.createElement('p', null, `Score: ${result.score}K ops/sec`),
          React.createElement(ProgressBar, {
            value: Math.min(result.score / 5, 100),
            color: result.score > 300 ? '#3fb950' : result.score > 100 ? '#d29922' : '#f85149',
          }),
        )
      )
    )
  );
}

// ─── Processes Page ───────────────────────────────────────────────
function ProcessesPage() {
  const [procs, setProcs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    ipcRenderer.invoke('get-process-list').then(setProcs).finally(() => setLoading(false));
  }, []);
  return (
    React.createElement('div', { style: styles.page },
      React.createElement('h1', { style: styles.pageTitle }, 'Running Processes'),
      loading ? React.createElement('div', { style: styles.loading }, 'Loading...') :
      React.createElement('table', { style: styles.table },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', { style: styles.th }, 'Name'),
            React.createElement('th', { style: styles.th }, 'PID'),
            React.createElement('th', { style: styles.th }, 'Memory'),
          )
        ),
        React.createElement('tbody', null,
          procs.map((p, i) =>
            React.createElement('tr', { key: i, style: i % 2 === 0 ? styles.trEven : {} },
              React.createElement('td', { style: styles.td }, p.name),
              React.createElement('td', { style: styles.td }, p.pid),
              React.createElement('td', { style: styles.td }, p.memory),
            )
          )
        )
      )
    )
  );
}

// ─── Reports Page ─────────────────────────────────────────────────
function ReportsPage({ systemInfo, diskInfo }) {
  const generateReport = () => {
    if (!systemInfo) return '';
    const memUsedPct = Math.round(((systemInfo.totalMemory - systemInfo.freeMemory) / systemInfo.totalMemory) * 100);
    return `
ONE DIAGNOSE - System Report
Generated: ${new Date().toLocaleString()}
${'='.repeat(50)}

SYSTEM INFO
  Platform: ${systemInfo.platform}
  Architecture: ${systemInfo.arch}
  Hostname: ${systemInfo.hostname}
  OS: ${systemInfo.osVersion}
  Uptime: ${formatUptime(systemInfo.uptime)}

CPU
  Model: ${systemInfo.cpuModel}
  Cores: ${systemInfo.cpuCores}
  Speed: ${systemInfo.cpuSpeed} MHz

MEMORY
  Total: ${formatBytes(systemInfo.totalMemory)}
  Free: ${formatBytes(systemInfo.freeMemory)}
  Usage: ${memUsedPct}%

DISK
${diskInfo?.map(d => `  ${d.mount}: ${formatBytes(d.total - d.free)} / ${formatBytes(d.total)}`).join('\n') || '  No disk info'}
    `.trim();
  };
  const downloadReport = () => {
    const report = generateReport();
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OneDiagnose_Report_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    React.createElement('div', { style: styles.page },
      React.createElement('h1', { style: styles.pageTitle }, 'Reports'),
      React.createElement('div', { style: styles.card },
        React.createElement('p', { style: { marginBottom: 16 } }, 'Generate and download a system diagnostic report.'),
        React.createElement('button', { style: styles.btn, onClick: downloadReport }, '📄 Download Report'),
      ),
      React.createElement('div', { style: { ...styles.card, marginTop: 16 } },
        React.createElement('h2', { style: styles.cardTitle }, 'Report Preview'),
        React.createElement('pre', { style: styles.reportPreview }, generateReport()),
      )
    )
  );
}

// ─── App ──────────────────────────────────────────────────────────
function App() {
  const [page, setPage] = useState('dashboard');
  const [systemInfo, setSystemInfo] = useState(null);
  const [diskInfo, setDiskInfo] = useState([]);
  const [networkInfo, setNetworkInfo] = useState([]);
  const [gpuInfo, setGpuInfo] = useState([]);
  const [batteryInfo, setBatteryInfo] = useState(null);

  useEffect(() => {
    ipcRenderer.invoke('get-system-info').then(setSystemInfo);
    ipcRenderer.invoke('get-disk-info').then(setDiskInfo);
    ipcRenderer.invoke('get-network-info').then(setNetworkInfo);
    ipcRenderer.invoke('get-gpu-info').then(setGpuInfo);
    ipcRenderer.invoke('get-battery-info').then(setBatteryInfo);
  }, []);

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return React.createElement(Dashboard, { systemInfo });
      case 'hardware': return React.createElement(HardwarePage, { systemInfo, diskInfo, networkInfo, gpuInfo, batteryInfo });
      case 'cpu': return React.createElement(BenchmarkPage);
      case 'drivers': return React.createElement(DriversPage);
      case 'updates': return React.createElement(UpdatesPage, { systemInfo });
      case 'processes': return React.createElement(ProcessesPage);
      case 'reports': return React.createElement(ReportsPage, { systemInfo, diskInfo });
      default: return React.createElement(Dashboard, { systemInfo });
    }
  };

  return (
    React.createElement('div', { style: styles.app },
      React.createElement(Sidebar, { activePage: page, onNavigate: setPage }),
      React.createElement('main', { style: styles.main }, renderPage())
    )
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = {
  app: { display: 'flex', height: '100vh', overflow: 'hidden' },
  sidebar: {
    width: 220, backgroundColor: '#161b22', borderRight: '1px solid #21262d',
    display: 'flex', flexDirection: 'column', paddingTop: 12, flexShrink: 0,
    overflowY: 'auto',
  },
  logo: { display: 'flex', alignItems: 'center', padding: '12px 16px', marginBottom: 8, gap: 10 },
  logoIcon: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: '#238636',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: 16, color: '#FFF',
  },
  logoText: { fontWeight: 700, fontSize: 15, color: '#e6edf3' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
    border: 'none', background: 'none', color: '#8b949e', fontSize: 14,
    cursor: 'pointer', textAlign: 'left', width: '100%',
  },
  navItemActive: { backgroundColor: '#21262d', color: '#e6edf3', fontWeight: 600 },
  main: { flex: 1, overflow: 'auto', backgroundColor: '#0d1117' },
  page: { padding: 24 },
  pageTitle: { fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e6edf3' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 20 },
  statCard: {
    backgroundColor: '#161b22', border: '1px solid #21262d', borderRadius: 8,
    padding: 16, display: 'flex', alignItems: 'center', gap: 12,
  },
  statIcon: { fontSize: 24 },
  statLabel: { fontSize: 12, color: '#8b949e', marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: 600 },
  progressBg: { height: 6, backgroundColor: '#21262d', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, transition: 'width 0.3s' },
  card: {
    backgroundColor: '#161b22', border: '1px solid #21262d', borderRadius: 8,
    padding: 20, marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#e6edf3' },
  btn: {
    backgroundColor: '#238636', color: '#FFF', border: 'none', padding: '10px 20px',
    borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  filterBtn: {
    backgroundColor: '#21262d', color: '#8b949e', border: '1px solid #30363d',
    padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  },
  filterBtnActive: { backgroundColor: '#1f6feb', color: '#FFF', borderColor: '#1f6feb' },
  loading: { padding: 40, textAlign: 'center', color: '#8b949e' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #21262d', color: '#8b949e', fontSize: 12 },
  td: { padding: '10px 12px', borderBottom: '1px solid #21262d', fontSize: 13 },
  trEven: { backgroundColor: '#161b22' },
  reportPreview: {
    backgroundColor: '#0d1117', padding: 16, borderRadius: 6, fontSize: 12,
    fontFamily: 'Consolas, monospace', overflow: 'auto', maxHeight: 400,
    color: '#8b949e', whiteSpace: 'pre-wrap',
  },
};

module.exports = App;
