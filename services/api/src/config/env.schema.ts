import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: port.default(3010),
  MYSQL_HOST: z.string().min(1),
  MYSQL_PORT: port,
  MYSQL_DATABASE: z.string().regex(/^[a-z0-9_]+$/),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string().min(8),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: port,
  WECHAT_MODE: z.enum(['mock', 'production']),
  WX_APPID: z.string().default(''),
  WX_SECRET: z.string().default(''),
  TOKEN_SIGNING_SECRET: z.string().min(32),
  PHONE_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i),
  ADMIN_BOOTSTRAP_USERNAME: z.string().default(''),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().default(''),
});

export type Environment = z.infer<typeof schema>;

export function parseEnvironment(input: NodeJS.ProcessEnv | Record<string, string>): Environment {
  const value = schema.parse(input);
  if (value.NODE_ENV === 'production' && value.WECHAT_MODE !== 'production') {
    throw new Error('WECHAT_MODE must be production when NODE_ENV=production');
  }
  if (value.NODE_ENV === 'production' && (!value.WX_APPID || !value.WX_SECRET)) {
    throw new Error('WX_APPID and WX_SECRET are required in production');
  }
  return value;
}
