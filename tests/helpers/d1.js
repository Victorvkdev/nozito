// D1 de mentira sobre node:sqlite, com a migration real. Só para testes.
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of readdirSync('migrations').filter((n) => n.endsWith('.sql')).sort()) {
    db.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  const clean = (args) => args.map((a) => (a === undefined ? null : a));
  class Stmt {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Stmt(this.sql, clean(args));
    }
    runSync() {
      const info = db.prepare(this.sql).run(...this.args);
      return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
    }
    async run() {
      return this.runSync();
    }
    async first(col) {
      const r = db.prepare(this.sql).get(...this.args);
      if (!r) return null;
      return col ? r[col] : { ...r };
    }
    async all() {
      return { results: db.prepare(this.sql).all(...this.args).map((r) => ({ ...r })) };
    }
  }
  return {
    raw: db,
    prepare: (sql) => new Stmt(sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => s.runSync());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
