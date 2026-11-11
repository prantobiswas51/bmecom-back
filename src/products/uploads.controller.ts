import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? 'uploads');

// The extension comes from the checked mime type, never from the client's file name.
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

// TODO: any signed-in role can upload for now; restrict with RolesGuard before launch.
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.diskStorage({
        destination: (_req, _file, done) => {
          mkdirSync(UPLOAD_DIR, { recursive: true });
          done(null, UPLOAD_DIR);
        },
        filename: (_req, file, done) => done(null, `${randomUUID()}${EXTENSIONS[file.mimetype]}`),
      }),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, done) =>
        done(
          file.mimetype in EXTENSIONS ? null : new BadRequestException('Only JPG, PNG, WebP, GIF or AVIF images'),
          file.mimetype in EXTENSIONS,
        ),
    }),
  )
  image(@UploadedFile() file: { filename: string } | undefined) {
    if (!file) throw new BadRequestException('Choose an image to upload');
    return { url: `/uploads/${file.filename}` };
  }
}
