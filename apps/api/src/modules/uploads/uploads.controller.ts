import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { diskStorage } from 'multer';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

export const UPLOAD_ROOT = join(process.cwd(), 'uploads');

const ALLOWED = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/heic', '.heic'],
  ['video/mp4', '.mp4'],
  ['video/quicktime', '.mov'],
]);

// Files land in uploads/YYYY-MM/<random>.<ext> and are served statically at /uploads.
const storage = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = join(UPLOAD_ROOT, new Date().toISOString().slice(0, 7));
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = ALLOWED.get(file.mimetype) ?? extname(file.originalname).toLowerCase();
    cb(null, `${randomBytes(12).toString('hex')}${ext}`);
  },
});

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly config: ConfigService) {}

  @Post()
  @ApiOperation({ summary: 'Upload ảnh/video (field "file"), trả về URL công khai' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, cb) =>
        ALLOWED.has(file.mimetype)
          ? cb(null, true)
          : cb(
              new BadRequestException('Chỉ hỗ trợ ảnh JPG/PNG/WEBP/HEIC hoặc video MP4/MOV'),
              false,
            ),
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request) {
    if (!file) throw new BadRequestException('Thiếu file (field "file")');
    const path = `/uploads/${relative(UPLOAD_ROOT, file.path).split(sep).join('/')}`;
    const base = this.config.get<string>('PUBLIC_URL') || `${req.protocol}://${req.get('host')}`;
    return { url: `${base}${path}`, path, size: file.size, mimetype: file.mimetype };
  }
}
