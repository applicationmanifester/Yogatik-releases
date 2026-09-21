import { Job } from 'bullmq';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import pdfParse from 'pdf-parse';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const bucket = process.env.S3_BUCKET;

export const processDocument = async (job: Job) => {
  const { key } = job.data;
  const tmpDir = os.tmpdir();
  const localPath = path.join(tmpDir, key);

  // download
  const data = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const buffer = await streamToBuffer(data.Body as Readable);
  await fs.writeFile(localPath, buffer);

  // simple OCR simulation: for PDFs use pdf-parse
  let text = '';
  if (key.endsWith('.pdf')) {
    text = (await pdfParse(buffer)).text;
  } else if (['.jpg', '.jpeg', '.png'].some(ext => key.endsWith(ext))) {
    const metadata = await sharp(buffer).metadata();
    text = JSON.stringify(metadata);
  }

  // TODO: store extracted text back to DB or S3

  // cleanup
  await fs.unlink(localPath);
};

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', err => reject(err));
  });
}
