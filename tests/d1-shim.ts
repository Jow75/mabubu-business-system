// A small D1-compatible wrapper around Node's built-in SQLite, so the Worker
// can be tested end-to-end without Cloudflare.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { D1Database, D1PreparedStatement, D1Result } from '../src/worker/env';

type Value = string | number | bigint | null | Uint8Array;

function norm(v: unknown): Value {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v as Value;
}

export function createD1(): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  const dir = join(import.meta.dirname, '..', 'migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, f), 'utf8'));

  const exec = (sql: string, params: unknown[]): D1Result => {
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params.map(norm)) as Record<string, unknown>[];
    const changes = (db.prepare('SELECT changes() AS c').get() as { c: number }).c;
    return { results: rows, success: true, meta: { changes } };
  };

  class Stmt implements D1PreparedStatement {
    constructor(
      readonly sql: string,
      readonly params: unknown[] = [],
    ) {}
    bind(...values: unknown[]): D1PreparedStatement {
      return new Stmt(this.sql, values);
    }
    async first<T>(): Promise<T | null> {
      return ((exec(this.sql, this.params).results[0] as T | undefined) ?? null) as T | null;
    }
    async all<T>(): Promise<D1Result<T>> {
      return exec(this.sql, this.params) as D1Result<T>;
    }
    async run<T>(): Promise<D1Result<T>> {
      return exec(this.sql, this.params) as D1Result<T>;
    }
  }

  return {
    raw: db,
    prepare: (sql: string) => new Stmt(sql),
    async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      db.exec('BEGIN');
      try {
        const out = statements.map((s) => {
          const st = s as Stmt;
          // Measure changes per statement without disturbing changes() for the next one.
          const stmt = db.prepare(st.sql);
          const rows = stmt.all(...st.params.map(norm)) as Record<string, unknown>[];
          return { results: rows, success: true, meta: {} } as D1Result<T>;
        });
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
