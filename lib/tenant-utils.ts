export function formatBytes(bytes: number, decimals: number = 2): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function slugifyCampusName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '_')
    .replace(/^-+|-+$/g, '');
}

export function formatOsDisplay(os: any): string {
  if (!os) return 'Linux';
  if (typeof os === 'string') return os.trim();
  const name = String(os.name || os.platform || '').trim();
  const version = String(os.version || '').trim();
  if (!name && !version) return 'Linux';
  if (!version) return name;
  if (!name) return version;
  if (name.toLowerCase() === version.toLowerCase()) return name;
  if (name.toLowerCase().includes(version.toLowerCase())) return name;
  if (version.toLowerCase().includes(name.toLowerCase())) return version;
  return `${name} ${version}`.trim();
}
