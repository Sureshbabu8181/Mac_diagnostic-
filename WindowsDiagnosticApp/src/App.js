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

// ─── Pages ────────────────────────────────────────────────────────
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
    transition: 'background 0.15s',
  },
  navItemActive: { backgroundColor: '#21262d', color: '#e6edf3', fontWeight: 600 },
  main: { flex: 1, overflow: 'auto', backgroundColor: '#0d1117' },
  page: { padding: 24 },
  pageTitle: { fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e6edf3' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
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
