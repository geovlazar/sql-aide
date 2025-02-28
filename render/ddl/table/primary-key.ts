import { zod as z } from "../../deps.ts";
import * as tmpl from "../../emit/mod.ts";
import * as safety from "../../../lib/universal/safety.ts";
import * as za from "../../../lib/universal/zod-aide.ts";
import * as d from "../../domain/mod.ts";
import * as c from "./column.ts";

// deno-lint-ignore no-explicit-any
type Any = any; // make it easy on linter

export type TablePrimaryKeyColumnDefn<
  ColumnTsType extends z.ZodTypeAny,
  Context extends tmpl.SqlEmitContext,
  DomainQS extends d.SqlDomainQS,
> = d.SqlDomain<ColumnTsType, Context, Any, DomainQS> & {
  readonly isPrimaryKey: true;
  readonly isAutoIncrement: boolean;
};

export function isTablePrimaryKeyColumnDefn<
  ColumnTsType extends z.ZodTypeAny,
  Context extends tmpl.SqlEmitContext,
  DomainQS extends d.SqlDomainQS,
>(
  o: unknown,
): o is TablePrimaryKeyColumnDefn<ColumnTsType, Context, DomainQS> {
  const isTPKCD = safety.typeGuard<
    TablePrimaryKeyColumnDefn<ColumnTsType, Context, DomainQS>
  >("isPrimaryKey", "isAutoIncrement");
  return isTPKCD(o);
}

export function primaryKeyColumnFactory<
  Context extends tmpl.SqlEmitContext,
  DomainQS extends d.SqlDomainQS,
>() {
  const sdf = d.zodTypeSqlDomainFactory<Any, Context, DomainQS>();
  const zb = za.zodBaggage<
    d.SqlDomain<Any, Context, Any, DomainQS>,
    d.SqlDomainSupplier<Any, Any, Context, DomainQS>
  >("sqlDomain");

  const primaryKey = <ColumnName extends string, ZodType extends z.ZodTypeAny>(
    zodType: ZodType,
  ) => {
    const sqlDomain = sdf.cacheableFrom<ColumnName, typeof zodType>(zodType);
    const pkSD: TablePrimaryKeyColumnDefn<typeof zodType, Context, DomainQS> = {
      ...sqlDomain,
      isPrimaryKey: true,
      isAutoIncrement: false,
      sqlPartial: (dest) => {
        if (dest === "create table, column defn decorators") {
          const ctcdd = sqlDomain?.sqlPartial?.(
            "create table, column defn decorators",
          );
          const decorators: tmpl.SqlTextSupplier<Context> = {
            SQL: () => `PRIMARY KEY`,
          };
          return ctcdd ? [decorators, ...ctcdd] : [decorators];
        }
        return sqlDomain.sqlPartial?.(dest);
      },
    };

    // trick Typescript into thinking the Zod instance is also a SqlDomainSupplier;
    // this allows assignment of a reference to a Zod object or use as a
    // regular Zod schema; the sqlDomain is carried in zodType._def
    // we do special typing of sqlDomain because isPrimaryKey, isExcludedFromInsertDML,
    // etc. are needed by tableDefinition()
    return zb.zodTypeBaggageProxy<typeof zodType>(
      zodType,
      pkSD,
    ) as unknown as typeof zodType & { sqlDomain: typeof pkSD };
  };

  const autoIncPrimaryKey = <ColumnName extends string>(
    overrideZodType: string | z.ZodOptional<z.ZodNumber> = z.number()
      .optional(),
  ) => {
    const zodType = typeof overrideZodType === "string"
      ? z.number().describe(overrideZodType).optional()
      : overrideZodType;
    const sqlDomain = sdf.cacheableFrom<ColumnName, z.ZodOptional<z.ZodNumber>>(
      zodType,
    );
    const aipkSD:
      & TablePrimaryKeyColumnDefn<z.ZodOptional<z.ZodNumber>, Context, DomainQS>
      & c.TableColumnInsertDmlExclusionSupplier<
        z.ZodOptional<z.ZodNumber>,
        Context,
        DomainQS
      > = {
        ...sqlDomain,
        isPrimaryKey: true,
        isExcludedFromInsertDML: true,
        isAutoIncrement: true,
        sqlDataType: (purpose) => ({
          SQL: (ctx: Context) => {
            if (tmpl.isPostgreSqlDialect(ctx.sqlDialect)) {
              return `SERIAL`;
            }
            return sqlDomain.sqlDataType(purpose).SQL(ctx);
          },
        }),
        sqlPartial: (dest) => {
          if (dest === "create table, column defn decorators") {
            const ctcdd = sqlDomain?.sqlPartial?.(
              "create table, column defn decorators",
            );
            const decorators: tmpl.SqlTextSupplier<Context> = {
              SQL: (ctx) => {
                if (tmpl.isMsSqlServerDialect(ctx.sqlDialect)) {
                  return `IDENTITY(1,1) PRIMARY KEY`;
                }
                if (tmpl.isPostgreSqlDialect(ctx.sqlDialect)) {
                  return `PRIMARY KEY`;
                }
                return `PRIMARY KEY AUTOINCREMENT`;
              },
            };
            return ctcdd ? [decorators, ...ctcdd] : [decorators];
          }
          return sqlDomain.sqlPartial?.(dest);
        },
      };

    // trick Typescript into thinking the Zod instance is also a SqlDomainSupplier;
    // this allows assignment of a reference to a Zod object or use as a
    // regular Zod schema; the sqlDomain is carried in zodType._def;
    // we do special typing of sqlDomain because isPrimaryKey, isExcludedFromInsertDML,
    // etc. are needed by tableDefinition()
    return zb.zodTypeBaggageProxy<typeof zodType>(
      zodType,
      aipkSD,
    ) as unknown as typeof zodType & { sqlDomain: typeof aipkSD };
  };

  /**
   * Declare a "user agent defaultable" (`uaDefaultable`) primary key domain.
   * uaDefaultable means that the primary key is required on the way into the
   * database but can be defaulted on the user agent ("UA") side. This type of
   * SqlDomain is useful when the primary key is assigned a value from the client
   * app/service before going into the database.
   * @returns
   */
  const uaDefaultableTextPrimaryKey = <ColumnName extends string>(
    zodType: z.ZodDefault<z.ZodString>,
  ) => {
    const sqlDomain = sdf.cacheableFrom<ColumnName, z.ZodDefault<z.ZodString>>(
      zodType,
    );
    const uadPK:
      & TablePrimaryKeyColumnDefn<z.ZodDefault<z.ZodString>, Context, DomainQS>
      & c.TableColumnInsertableOptionalSupplier<
        z.ZodDefault<z.ZodString>,
        Context,
        DomainQS
      > = {
        ...sqlDomain,
        isPrimaryKey: true,
        isAutoIncrement: false,
        isOptionalInInsertableRecord: true,
        sqlPartial: (dest) => {
          if (dest === "create table, column defn decorators") {
            const ctcdd = sqlDomain?.sqlPartial?.(
              "create table, column defn decorators",
            );
            const decorators: tmpl.SqlTextSupplier<Context> = {
              SQL: () => `PRIMARY KEY`,
            };
            return ctcdd ? [decorators, ...ctcdd] : [decorators];
          }
          return sqlDomain.sqlPartial?.(dest);
        },
      };

    // trick Typescript into thinking the Zod instance is also a SqlDomainSupplier;
    // this allows assignment of a reference to a Zod object or use as a
    // regular Zod schema; the sqlDomain is carried in zodType._def
    // we do special typing of sqlDomain because isPrimaryKey, isExcludedFromInsertDML,
    // etc. are needed by tableDefinition()
    return zb.zodTypeBaggageProxy<typeof zodType>(
      zodType,
      uadPK,
    ) as unknown as typeof zodType & { sqlDomain: typeof uadPK };
  };

  return {
    sdFactory: sdf,
    zodBaggage: zb,
    primaryKey,
    autoIncPrimaryKey,
    uaDefaultableTextPrimaryKey,
  };
}
