import { describe, it, expect } from 'vitest';
import { isDatabaseServiceName } from '@/lib/railway/projects';

describe('isDatabaseServiceName', () => {
  it('flags Railway\'s own database plugin names', () => {
    expect(isDatabaseServiceName('Postgres')).toBe(true);
    expect(isDatabaseServiceName('MySQL')).toBe(true);
    expect(isDatabaseServiceName('Redis')).toBe(true);
    expect(isDatabaseServiceName('MongoDB')).toBe(true);
    expect(isDatabaseServiceName('mongo')).toBe(true);
    expect(isDatabaseServiceName('MariaDB')).toBe(true);
  });

  it('flags a database name with Railway\'s random collision suffix', () => {
    expect(isDatabaseServiceName('Postgres-Yjsz')).toBe(true);
    expect(isDatabaseServiceName('redis_primary')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isDatabaseServiceName('POSTGRES')).toBe(true);
    expect(isDatabaseServiceName('postgresql')).toBe(true);
  });

  it('does not flag real web/API service names', () => {
    expect(isDatabaseServiceName('tradeshark-web')).toBe(false);
    expect(isDatabaseServiceName('sefton-pro-script')).toBe(false);
    expect(isDatabaseServiceName('benefit-financial-bank-demo-deploy')).toBe(false);
    expect(isDatabaseServiceName('api')).toBe(false);
    expect(isDatabaseServiceName('web')).toBe(false);
  });

  it('does not false-positive on a name that merely contains a db-like substring', () => {
    // Must anchor on the service NAME starting with the engine name, not
    // just containing it anywhere — a service actually called
    // "my-mysql-migrator" is a real app, not the Railway MySQL plugin.
    expect(isDatabaseServiceName('my-mysql-migrator')).toBe(false);
  });
});
