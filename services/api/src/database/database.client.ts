import { Kysely, MysqlDialect } from 'kysely';
import { createPool } from 'mysql2';
import type { Environment } from '../config/env.schema.js';

export function createDatabase(env: Environment): Kysely<unknown> {
  return new Kysely({
    dialect: new MysqlDialect({
      pool: createPool({
        host: env.MYSQL_HOST,
        port: env.MYSQL_PORT,
        database: env.MYSQL_DATABASE,
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD,
        connectionLimit: 10,
        timezone: 'Z',
        charset: 'utf8mb4',
      }),
    }),
  });
}
