import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
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
import { createReadStream, createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { diskStorage } from 'multer';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MAX_UPLOADS_PER_USER } from '@homemate/constants';
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
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
    @CurrentUser() user: { sub: string },
  ) {
    if (!file) throw new BadRequestException('Thiếu file (field "file")');
    const relPath = relative(UPLOAD_ROOT, file.path).split(sep).join('/');
    const path = `/uploads/${relPath}`;
    const userId = user?.sub;

    // B86: giới hạn 100 ảnh/người — đếm ảnh đã lưu trên GridFS theo metadata.userId.
    // Vượt giới hạn → 429 + hướng dẫn xóa ảnh cũ (DELETE /uploads/:folder/:filename).
    if (file.mimetype.startsWith('image/') && userId && this.connection?.db) {
      try {
        const bucket = new mongo.GridFSBucket(this.connection.db, { bucketName: 'uploads' });
        const count = await bucket
          .find({
            'metadata.userId': userId,
            'metadata.mimetype': { $regex: '^image/' },
          })
          .limit(MAX_UPLOADS_PER_USER + 1)
          .toArray()
          .then(files => files.length);
        if (count >= MAX_UPLOADS_PER_USER) {
          try {
            unlinkSync(file.path);
          } catch {
            /* Xoá file tạm thất bại thì bỏ qua — đơn đã bị từ chối vì quá giới hạn */
          }
          throw new HttpException(
            `Bạn đã tải lên tối đa ${MAX_UPLOADS_PER_USER} ảnh. Vui lòng xóa ảnh cũ không còn dùng (mở ảnh và chọn xóa) rồi tải lên lại.`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      } catch (err) {
        if (err instanceof HttpException) throw err;
        console.error('[Uploads] Lỗi đếm ảnh người dùng:', err);
      }
    }

    // Lưu bền vững vào MongoDB GridFS để không bị mất khi Render sleep/restart
    try {
      if (this.connection?.db) {
        const bucket = new mongo.GridFSBucket(this.connection.db, { bucketName: 'uploads' });
        await new Promise<void>((resolve, _reject) => {
          const uploadStream = bucket.openUploadStream(relPath, {
            metadata: { mimetype: file.mimetype, size: file.size, userId },
          });
          createReadStream(file.path)
            .pipe(uploadStream)
            .on('error', err => {
              console.error('[Uploads] Lỗi pipe vào GridFS:', err);
              resolve(); // Không chặn upload thành công trên đĩa nếu GridFS lỗi
            })
            .on('finish', () => resolve());
        });
      }
    } catch (err) {
      console.error('[Uploads] Lỗi lưu GridFS:', err);
    }

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

  // B86: xóa ảnh của chính mình (để giải phóng quota 100 ảnh). Chỉ chủ file
  // hoặc admin được xóa; file không có metadata.userId (ảnh cũ) thì admin mới xóa được.
  @Delete(':folder/:filename')
  @ApiOperation({ summary: 'Xóa ảnh/video đã tải lên (chủ file hoặc admin)' })
  async deleteFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @CurrentUser() user: { sub: string; roles?: string[] },
  ) {
    const relPath = `${folder}/${filename}`;
    if (this.connection?.db) {
      const bucket = new mongo.GridFSBucket(this.connection.db, { bucketName: 'uploads' });
      const files = await bucket.find({ filename: relPath }).limit(1).toArray();
      if (files && files.length > 0) {
        const ownerId = (files[0].metadata as any)?.userId as string | undefined;
        const isAdmin = (user?.roles ?? []).includes('admin');
        if (ownerId && ownerId !== user?.sub && !isAdmin) {
          throw new ForbiddenException('Bạn không có quyền xóa ảnh này');
        }
        if (!ownerId && !isAdmin) {
          throw new ForbiddenException('Chỉ quản trị viên mới xóa được ảnh không rõ chủ sở hữu');
        }
        await bucket.delete(files[0]._id);
      }
    }
    const localPath = join(UPLOAD_ROOT, relPath);
    try {
      if (existsSync(localPath)) unlinkSync(localPath);
    } catch {
      /* File local đã mất thì bỏ qua — GridFS vẫn là nguồn chính */
    }
    return { deleted: true, path: `/uploads/${relPath}` };
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
          } catch {
            /* Ghi cache local thất bại thì bỏ qua — vẫn trả file từ GridFS */
          }

          return bucket.openDownloadStreamByName(relPath).pipe(res);
        }
      } catch {
        /* Đọc GridFS thất bại thì trả 404 bên dưới */
      }
    }

    throw new NotFoundException('Tệp tin không tồn tại hoặc đã bị xóa');
  }
}
