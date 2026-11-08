import * as os from 'os';
import * as fs from 'fs';

fs.mkdirSync('D:\\tmp', { recursive: true });
process.env.TEMP = 'D:\\tmp';
process.env.TMP = 'D:\\tmp';
process.env.TMPDIR = 'D:\\tmp';
process.env.MONGOMS_TMPDIR = 'D:\\tmp';
process.env.MONGOMS_DOWNLOAD_DIR = 'D:\\tmp\\mongodb-binaries';
try {
  Object.defineProperty(os, 'tmpdir', {
    value: () => 'D:\\tmp',
    configurable: true,
    writable: true,
  });
} catch {}
process.env.OTP_BYPASS = 'true';
