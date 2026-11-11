import { execFile } from 'node:child_process';
import { open, statfs } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const LOG_LINES = 50;
/** How much of the end of a log file to read; plenty for 50 lines. */
const LOG_TAIL_BYTES = 256 * 1024;

type Pm2Process = {
  name: string;
  pid?: number;
  monit?: { cpu?: number; memory?: number };
  pm2_env?: {
    status?: string;
    pm_uptime?: number;
    restart_time?: number;
    pm_out_log_path?: string;
    pm_err_log_path?: string;
  };
};

export type Pm2Target = {
  key: 'front' | 'back' | 'admin';
  label: string;
  /** The name the process has in `pm2 list`. */
  name: string;
  found: boolean;
  status: string | null;
  pid: number | null;
  uptimeMs: number | null;
  restarts: number | null;
  cpu: number | null;
  memory: number | null;
  logs: { out: string[]; err: string[] };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** npm's version never changes while we run, so ask it once. */
let npmVersion: Promise<string | null> | undefined;
function getNpmVersion(): Promise<string | null> {
  npmVersion ??= new Promise((resolve) => {
    execFile('npm', ['--version'], { timeout: 8000, windowsHide: true, shell: process.platform === 'win32' }, (error, stdout) =>
      resolve(error ? null : stdout.trim() || null),
    );
  });
  return npmVersion;
}

const MQTT_PORTS: Record<string, number> = { 'mqtt:': 1883, 'tcp:': 1883, 'mqtts:': 8883, 'ssl:': 8883, 'tls:': 8883, 'ws:': 80, 'wss:': 443 };

export type MqttStatus = { configured: boolean; connected: boolean; target: string | null; error: string | null };

/** Whether something accepts connections at the broker address (a reachability check, not an MQTT login). */
function checkMqtt(rawUrl: string | undefined): Promise<MqttStatus> {
  if (!rawUrl) return Promise.resolve({ configured: false, connected: false, target: null, error: null });
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return Promise.resolve({ configured: true, connected: false, target: null, error: 'MQTT_URL is not a valid URL.' });
  }
  // Show host and port only, never credentials.
  const port = Number(url.port) || MQTT_PORTS[url.protocol] || 1883;
  const target = `${url.hostname}:${port}`;
  return new Promise((resolve) => {
    const socket = net.connect({ host: url.hostname, port });
    const done = (connected: boolean, error: string | null) => {
      socket.destroy();
      resolve({ configured: true, connected, target, error });
    };
    socket.setTimeout(3000);
    socket.once('connect', () => done(true, null));
    socket.once('timeout', () => done(false, 'Connection timed out.'));
    socket.once('error', (e) => done(false, e.message));
  });
}

/** The last `count` lines of a text file, or an empty list when it cannot be read. */
async function tail(file: string | undefined, count: number): Promise<string[]> {
  if (!file) return [];
  try {
    const handle = await open(file, 'r');
    try {
      const { size } = await handle.stat();
      const length = Math.min(size, LOG_TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, size - length);
      const lines = buffer.toString('utf8').split(/\r?\n/);
      if (size > length) lines.shift(); // the first line may be cut off
      while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      return lines.slice(-count);
    } finally {
      await handle.close();
    }
  } catch {
    return [];
  }
}

@Injectable()
export class SystemService {
  constructor(private readonly config: ConfigService) {}

  /** Share of CPU time spent busy across all cores, measured over a short sample. */
  private async cpuUsage() {
    const snapshot = () =>
      os.cpus().map((c) => ({ idle: c.times.idle, total: Object.values(c.times).reduce((a, b) => a + b, 0) }));
    const before = snapshot();
    await sleep(400);
    const after = snapshot();
    let idle = 0;
    let total = 0;
    after.forEach((c, i) => {
      idle += c.idle - before[i].idle;
      total += c.total - before[i].total;
    });
    const used = total > 0 ? Math.round((1 - idle / total) * 1000) / 10 : 0;
    return {
      used,
      free: Math.round((100 - used) * 10) / 10,
      cores: os.cpus().length,
      model: os.cpus()[0]?.model ?? null,
      load: os.loadavg(),
    };
  }

  private memory() {
    const total = os.totalmem();
    const free = os.freemem();
    return { total, free, used: total - free };
  }

  private async disk() {
    try {
      const root = path.parse(process.cwd()).root;
      const s = await statfs(root);
      const total = s.blocks * s.bsize;
      const free = s.bavail * s.bsize;
      return { path: root, total, free, used: total - free };
    } catch {
      return null;
    }
  }

  private pm2List(): Promise<{ ok: true; list: Pm2Process[] } | { ok: false; error: string }> {
    return new Promise((resolve) => {
      execFile(
        'pm2',
        ['jlist'],
        { timeout: 8000, maxBuffer: 20 * 1024 * 1024, windowsHide: true, shell: process.platform === 'win32' },
        (error, stdout) => {
          if (error) {
            const missing = error.message.includes('ENOENT') || /not recognized|not found/i.test(error.message);
            return resolve({ ok: false, error: missing ? 'pm2 is not installed on this server.' : `pm2 could not be read: ${error.message}` });
          }
          // pm2 may print a notice before the JSON.
          const start = stdout.indexOf('[');
          try {
            resolve({ ok: true, list: JSON.parse(stdout.slice(start)) as Pm2Process[] });
          } catch {
            resolve({ ok: false, error: 'pm2 gave an answer that could not be read.' });
          }
        },
      );
    });
  }

  private async pm2() {
    const targets: Pick<Pm2Target, 'key' | 'label' | 'name'>[] = [
      { key: 'front', label: 'Storefront', name: this.config.get('PM2_FRONT_NAME', 'bmcom-front') },
      { key: 'back', label: 'Backend API', name: this.config.get('PM2_BACK_NAME', 'bmcom-back') },
      { key: 'admin', label: 'Admin panel', name: this.config.get('PM2_ADMIN_NAME', 'bmcom-admin') },
    ];
    const res = await this.pm2List();
    if (!res.ok) return { available: false as const, error: res.error, processes: [] as Pm2Target[] };

    const processes = await Promise.all(
      targets.map(async (t): Promise<Pm2Target> => {
        const p = res.list.find((x) => x.name === t.name);
        if (!p) {
          return { ...t, found: false, status: null, pid: null, uptimeMs: null, restarts: null, cpu: null, memory: null, logs: { out: [], err: [] } };
        }
        const env = p.pm2_env ?? {};
        const [out, err] = await Promise.all([tail(env.pm_out_log_path, LOG_LINES), tail(env.pm_err_log_path, LOG_LINES)]);
        return {
          ...t,
          found: true,
          status: env.status ?? null,
          pid: p.pid ?? null,
          uptimeMs: env.status === 'online' && env.pm_uptime ? Date.now() - env.pm_uptime : null,
          restarts: env.restart_time ?? null,
          cpu: p.monit?.cpu ?? null,
          memory: p.monit?.memory ?? null,
          logs: { out, err },
        };
      }),
    );
    return { available: true as const, error: null, processes };
  }

  async health() {
    const [cpu, disk, pm2, npm, mqtt] = await Promise.all([
      this.cpuUsage(),
      this.disk(),
      this.pm2(),
      getNpmVersion(),
      checkMqtt(this.config.get<string>('MQTT_URL')),
    ]);
    return {
      checkedAt: new Date().toISOString(),
      host: { name: os.hostname(), platform: `${os.type()} ${os.release()}`, uptimeSeconds: os.uptime(), node: process.version, npm },
      cpu,
      memory: this.memory(),
      disk,
      pm2,
      mqtt,
    };
  }
}
