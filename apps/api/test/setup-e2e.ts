import * as os from 'os';
import * as fs from 'fs';

fs.mkdirSync('D:\\tmp', { recursive: true });
process.env.TEMP = 'D:\\tmp';
process.env.TMP = 'D:\\tmp';
process.env.TMPDIR = 'D:\\tmp';
process.env.MONGOMS_TMPDIR = 'D:\\tmp';
process.env.MONGOMS_DOWNLOAD_DIR = 'D:\\tmp\\mongodb-binaries';
(os as any).tmpdir = () => 'D:\\tmp';
process.env.OTP_BYPASS = 'true';
