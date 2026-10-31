import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, mongo } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { diskStorage } from 'multer';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

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
  constructor(
    private readonly config: ConfigService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

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
    const relPath = relative(UPLOAD_ROOT, file.path).split(sep).join('/');
    const path = `/uploads/${relPath}`;

    // Lưu bền vững vào MongoDB GridFS để không bị mất khi Render sleep/restart
    try {
      if (this.connection?.db) {
        const bucket = new mongo.GridFSBucket(this.connection.db, { bucketName: 'uploads' });
        const uploadStream = bucket.openUploadStream(relPath, {
          metadata: { mimetype: file.mimetype, size: file.size },
        });
        createReadStream(file.path).pipe(uploadStream);
      }
    } catch {}

    const configuredBase = this.config.get<string>('PUBLIC_URL');
    let base = configuredBase || `${req.protocol}://${req.get('host')}`;
    if (
      !configuredBase &&
      (req.get('x-forwarded-proto') === 'https' || !base.includes('localhost'))
    ) {
      base = base.replace(/^http:\/\//i, 'https://');
    }
    return { url: `${base}${path}`, path, size: file.size, mimetype: file.mimetype };
  }

  @Public()
  @Get(':folder/:filename')
  @ApiOperation({ summary: 'Tải và xem file tĩnh công khai (vĩnh viễn qua GridFS)' })
  async serveFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const relPath = `${folder}/${filename}`;
    const localPath = join(UPLOAD_ROOT, relPath);

    // 1. Nếu file đã có sẵn trên ổ đĩa local, trả về ngay
    if (existsSync(localPath)) {
      return res.sendFile(localPath);
    }

    // 2. Nếu file không có trên ổ đĩa (do Render xoá ổ tạm), khôi phục từ MongoDB GridFS
    if (this.connection?.db) {
      try {
        const bucket = new mongo.GridFSBucket(this.connection.db, { bucketName: 'uploads' });
        const files = await bucket.find({ filename: relPath }).limit(1).toArray();
        if (files && files.length > 0) {
          const fileMeta = files[0];
          const ext = extname(filename).toLowerCase();
          const contentType =
            (fileMeta.metadata as any)?.mimetype ||
            (ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : ext === '.png'
                ? 'image/png'
                : 'application/octet-stream');
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

          try {
            mkdirSync(dirname(localPath), { recursive: true });
            const writeCache = createWriteStream(localPath);
            bucket.openDownloadStreamByName(relPath).pipe(writeCache);
          } catch {}

          return bucket.openDownloadStreamByName(relPath).pipe(res);
        }
      } catch {}
    }

    throw new NotFoundException('Tệp tin không tồn tại hoặc đã bị xóa');
  }
}
