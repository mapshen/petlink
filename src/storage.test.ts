import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {
    send = vi.fn().mockResolvedValue({});
  },
  PutObjectCommand: class MockPutObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  },
  DeleteObjectCommand: class MockDeleteObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://bucket.s3.amazonaws.com/signed-url'),
}));

describe('storage', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.S3_BUCKET = 'test-bucket';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_ACCESS_KEY = 'test-key';
    process.env.S3_SECRET_KEY = 'test-secret';
    delete process.env.S3_ENDPOINT;
  });

  it('generateUploadUrl returns signed URL with key and public URL', async () => {
    const { generateUploadUrl } = await import('./storage.ts');
    const result = await generateUploadUrl('pets', 'image/jpeg', 1);
    expect(result.uploadUrl).toContain('signed-url');
    expect(result.key).toMatch(/^pets\/1\/.+\.jpeg$/);
    expect(result.publicUrl).toContain('test-bucket');
  });

  it('key contains correct folder and user id', async () => {
    const { generateUploadUrl } = await import('./storage.ts');
    const result = await generateUploadUrl('avatars', 'image/png', 42);
    expect(result.key).toMatch(/^avatars\/42\/.+\.png$/);
  });
});
