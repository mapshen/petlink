import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_ENDPOINT = process.env.S3_ENDPOINT; // For MinIO or S3-compatible
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || '';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || '';

function getS3Client(): S3Client {
  if (!S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
    throw new Error('S3 storage is not configured');
  }
  const config: ConstructorParameters<typeof S3Client>[0] = {
    region: S3_REGION,
    credentials: {
      accessKeyId: S3_ACCESS_KEY,
      secretAccessKey: S3_SECRET_KEY,
    },
  };
  if (S3_ENDPOINT) {
    config.endpoint = S3_ENDPOINT;
    config.forcePathStyle = true; // Required for MinIO
  }
  return new S3Client(config);
}

export interface SignedUploadUrl {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

export async function generateUploadUrl(
  folder: 'pets' | 'avatars' | 'verifications' | 'walks' | 'sitter-photos',
  contentType: string,
  userId: number
): Promise<SignedUploadUrl> {
  const client = getS3Client();
  const ext = contentType.split('/')[1] || 'bin';
  const key = `${folder}/${userId}/${crypto.randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 }); // 5 min

  const publicUrl = S3_ENDPOINT
    ? `${S3_ENDPOINT}/${S3_BUCKET}/${key}`
    : `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;

  return { uploadUrl, key, publicUrl };
}

export async function deleteObject(key: string): Promise<void> {
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  }));
}
