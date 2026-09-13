import { execFileSync } from "node:child_process";
import type { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";

const PSQL_BIN = "/opt/homebrew/bin/psql";
const DB_PORT = process.env.TEST_DB_PORT || "54332";
const DB_NAME = process.env.TEST_DB_NAME || "mahalaxmi_test";

export function executeSql(sql: string): any[] {
  const isQuery = sql.trim().toUpperCase().startsWith("SELECT");
  const commandSql = isQuery
    ? `SELECT json_agg(t) FROM (${sql}) t;`
    : `WITH t AS (${sql}) SELECT json_agg(t) FROM t;`;

  const resultStr = execFileSync(PSQL_BIN, ["-p", DB_PORT, "-U", "postgres", "-d", DB_NAME, "-t", "-A", "-c", commandSql], {
    encoding: "utf8"
  }).trim();

  if (!resultStr || resultStr === "null") {
    return [];
  }

  try {
    return JSON.parse(resultStr);
  } catch {
    return [];
  }
}

export function executeCommand(sql: string): void {
  execFileSync(PSQL_BIN, ["-p", DB_PORT, "-U", "postgres", "-d", DB_NAME, "-c", sql], {
    encoding: "utf8"
  });
}

export function createRealPostgresSupabaseAdmin(): SupabaseAdminService {
  const client = {
    from: (table: string) => {
      let selectedCols = "*";
      let filterCol: string | null = null;
      let filterVal: any = null;

      const builder = {
        select: (cols = "*") => {
          selectedCols = cols;
          return builder;
        },
        eq: (col: string, val: any) => {
          filterCol = col;
          filterVal = val;
          return builder;
        },
        maybeSingle: async () => {
          let sql = `SELECT ${selectedCols} FROM public.${table}`;
          if (filterCol !== null) {
            const safeVal = typeof filterVal === "string" ? `'${filterVal.replace(/'/g, "''")}'` : filterVal;
            sql += ` WHERE ${filterCol} = ${safeVal}`;
          }
          const rows = executeSql(sql);
          return { data: rows[0] || null, error: null };
        },
        insert: async (row: any) => {
          const keys = Object.keys(row).filter((k) => row[k] !== undefined && row[k] !== null);
          const cols = keys.map((k) => `"${k}"`).join(", ");
          const vals = keys
            .map((k) => {
              const v = row[k];
              if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
              return String(v);
            })
            .join(", ");

          const sql = `INSERT INTO public.${table} (${cols}) VALUES (${vals}) RETURNING *`;
          try {
            const rows = executeSql(sql);
            return { data: rows[0] || row, error: null };
          } catch (err: any) {
            return { data: null, error: { message: err.message || "Insert failed" } };
          }
        },
        update: (updates: any) => ({
          eq: async (col: string, val: any) => {
            const keys = Object.keys(updates).filter((k) => updates[k] !== undefined);
            const setClause = keys
              .map((k) => {
                const v = updates[k];
                const safeCol = `"${k}"`;
                if (v === null) return `${safeCol} = NULL`;
                if (typeof v === "string") return `${safeCol} = '${v.replace(/'/g, "''")}'`;
                return `${safeCol} = ${String(v)}`;
              })
              .join(", ");

            const safeVal = typeof val === "string" ? `'${val.replace(/'/g, "''")}'` : val;
            const sql = `UPDATE public.${table} SET ${setClause} WHERE "${col}" = ${safeVal} RETURNING *`;

            try {
              const rows = executeSql(sql);
              return { data: rows[0] || null, error: null };
            } catch (err: any) {
              return { data: null, error: { message: err.message || "Update failed" } };
            }
          }
        })
      };

      return builder;
    }
  };

  return {
    getClient: () => client as any,
    getReadClient: () => client as any,
    createUserClient: () => client as any,
    createReadUserClient: () => client as any
  } as any;
}
