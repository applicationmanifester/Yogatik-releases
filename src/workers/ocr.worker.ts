import { Job } from 'bullmq';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
// pdf-parse v2 is a class-based API: new PDFParse({ data }) then getText().
// The v1 default-callable import no longer exists.
import { PDFParse } from 'pdf-parse';
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

  // simple OCR simulation: for PDFs use pdf-parse (v2 class API). The parser
  // is destroyed after use — it holds a pdf.js document open otherwise.
  let text = '';
  if (key.endsWith('.pdf')) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }
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
