#!/usr/bin/env -S deno run --allow-all

import $ from "https://deno.land/x/dax@0.30.1/mod.ts";
import { testingAsserts as ta } from "../../deps-test.ts";
import * as ws from "../../lib/universal/whitespace.ts";
import * as sqliteCLI from "../../lib/sqlite/cli.ts";
import * as SQLa from "../../render/mod.ts";
import * as tp from "../typical/mod.ts";
import * as mod from "./models.ts";

const relativeFilePath = (name: string) => {
  const absPath = $.path.fromFileUrl(import.meta.resolve(name));
  return $.path.relative(Deno.cwd(), absPath);
};

const relativeFileContent = (name: string) => {
  const absPath = $.path.fromFileUrl(import.meta.resolve(name));
  return Deno.readTextFileSync($.path.relative(Deno.cwd(), absPath));
};

type EmitContext = typeof ctx;
const ctx = SQLa.typicalSqlEmitContext();
const gts = tp.governedTemplateState<
  tp.TypicalDomainQS,
  tp.TypicalDomainsQS,
  EmitContext
>();

const partyInsertion = mod.party
  .insertDML({
    party_type_id: "PERSON",
    party_name: "person",
  });

const partyID = mod.party.select({ party_type_id: "PERSON" });

const partyIdentifierType = mod.partyIdentifierType
  .insertDML([{
    code: "PASSPORT",
    value: "Passport",
  }, {
    code: "UUID",
    value: "UUID",
  }, {
    code: "DRIVING_LICENSE",
    value: "Driving License",
  }]);

const partyIdentifierTypeID = mod.partyIdentifierType.select({
  code: "PASSPORT",
});

const partyIdentifierInsertion = mod.partyIdentifier
  .insertDML({
    identifier_number: "test identifier",
    party_identifier_type_id: partyIdentifierTypeID,
    party_id: partyID,
  });

const personTypeInsertion = mod.personType
  .insertDML([{
    code: "INDIVIDUAL",
    value: "Individual",
  }, {
    code: "PROFESSIONAL",
    value: "Professional",
  }]);

const personTypeID = mod.personType.select({
  code: "PROFESSIONAL",
});
const personInsertion = mod.person
  .insertDML({
    party_id: partyID,
    person_type_id: personTypeID,
    person_first_name: "Test First Name",
    person_last_name: "Test Last Name",
  });

const partyRole = mod.partyRole
  .insertDML([{
    code: "VENDOR",
    value: "Vendor",
  }, {
    code: "CUSTOMER",
    value: "Customer",
  }]);

const partyRoleID = mod.partyRole.select({ code: "VENDOR" });

const partyRelationInsertion = mod.partyRelation
  .insertDML({
    party_id: partyID,
    related_party_id: partyID,
    relation_type_id: "ORGANIZATION_TO_PERSON",
    party_role_id: partyRoleID,
  });

const organizationInsertion = mod.organization
  .insertDML({
    party_id: partyID,
    name: "Test Name",
    license: "Test License",
    registration_date: new Date("2023-02-06T00:00:00.000Z"),
  });

const personID = mod.person.select({
  person_first_name: "Test First Name",
  person_last_name: "Test Last Name",
});
const organizationID = mod.organization.select({ name: "Test Name" });

const organizationRoleTypeInsertion = mod.organizationRoleType
  .insertDML({
    code: "ASSOCIATE_MANAGER_TECHNOLOGY",
    value: "Associate Manager Technology",
  });

const organizationRoleTypeCode = mod.organizationRoleType.select({
  code: "ASSOCIATE_MANAGER_TECHNOLOGY",
});

const organizationRoleInsertion = mod.organizationRole
  .insertDML({
    person_id: personID,
    organization_id: organizationID,
    organization_role_type_id: organizationRoleTypeCode,
  });

const contactType = mod.contactType
  .insertDML([{
    code: "HOME_ADDRESS",
    value: "Home Address",
  }, {
    code: "OFFICIAL_ADDRESS",
    value: "Official Address",
  }, {
    code: "MOBILE_PHONE_NUMBER",
    value: "Mobile Phone Number",
  }, {
    code: "LAND_PHONE_NUMBER",
    value: "Land Phone Number",
  }, {
    code: "OFFICIAL_EMAIL",
    value: "Official Email",
  }, {
    code: "PERSONAL_EMAIL",
    value: "Personal Email",
  }]);

const contactTypeID = mod.contactType.select({ code: "MOBILE_PHONE_NUMBER" });

const contactElectronicInsertion = mod.contactElectronic
  .insertDML({
    contact_type_id: contactTypeID,
    party_id: partyID,
    electronics_details: "electronics details",
  });

function sqlDDL() {
  return SQLa.SQL<EmitContext>(gts.ddlOptions)`
    ${mod.sqlDDL()}

    -- synthetic / test data

    ${partyRole}
    ${partyInsertion}
    ${personTypeInsertion}
    ${partyIdentifierType}

    ${partyIdentifierInsertion}

    ${personInsertion}

    ${partyRelationInsertion}

    ${organizationInsertion}

    ${organizationRoleTypeInsertion}

    ${organizationRoleInsertion}

    ${contactType}
    ${contactElectronicInsertion}
    `;
}

if (import.meta.main) {
  const CLI = sqliteCLI.typicalCLI({
    resolveURI: (specifier) =>
      specifier ? import.meta.resolve(specifier) : import.meta.url,
    defaultSql: () => ws.unindentWhitespace(sqlDDL().SQL(ctx)),
  });

  await CLI.commands
    .command(
      "diagram",
      sqliteCLI.diagramCommand(CLI.clii, () => {
        return tp.diaPUML.plantUmlIE(ctx, function* () {
          for (const table of mod.allContentTables) {
            if (SQLa.isGraphEntityDefinitionSupplier(table)) {
              yield table.graphEntityDefn();
            }
          }
        }, tp.diaPUML.typicalPlantUmlIeOptions()).content;
      }),
    )
    .command("driver", tp.sqliteDriverCommand(sqlDDL, ctx)).command(
      "test-fixtures",
      new tp.cli.Command()
        .description("Emit all test fixtures")
        .action(async () => {
          const CLI = relativeFilePath("./models_test.ts");
          const [sql, puml, sh] = [".sql", ".puml", ".sh"].map((extn) =>
            relativeFilePath(`./models_test.fixture${extn}`)
          );
          Deno.writeTextFileSync(sql, await $`./${CLI} sql`.text());
          Deno.writeTextFileSync(puml, await $`./${CLI} diagram`.text());
          Deno.writeTextFileSync(sh, await $`./${CLI} bash`.text());
          [sql, puml, sh].forEach((f) => console.log(f));
        }),
    ).parse(Deno.args);
}

/**
 * This is an "end-to-end" test strategy; we generate our fixtures whenever
 * our information model (schema) changes and git-track those files so that
 * if SQLa or other library changes impact what's generated we'll know because
 * the Deno test will fail.
 *
 * to re-generate all fixtures
 * $ ./models_test.ts test-fixtures
 *
 * to re-generate the fixtures one at a time:
 * $ ./models_test.ts sql --dest models_test.fixture.sql
 * $ ./models_test.ts diagram --dest models_test.fixture.puml
 * $ ./models_test.ts driver --dest ./models_test.fixture.sh && chmod +x ./models_test.fixture.sh
 */
Deno.test("Information Assurance Pattern", async (tc) => {
  const CLI = relativeFilePath("./models_test.ts");

  await tc.step("CLI SQL content", async () => {
    const output = await $`./${CLI} sql`.text();
    ta.assertEquals(
      output,
      relativeFileContent("./models_test.fixture.sql"),
    );
  });

  await tc.step("CLI diagram", async () => {
    const output = await $`./${CLI} diagram`.text();
    ta.assertEquals(
      output,
      relativeFileContent("./models_test.fixture.puml"),
    );
  });

  await tc.step("CLI driver content", async () => {
    const output = await $`./${CLI} bash`.text();
    ta.assertEquals(
      output,
      relativeFileContent("./models_test.fixture.sh"),
    );
  });

  /**
   * Execute the "driver" so that it creates an in-memory SQLite database and
   * returns the total number of objects found in the SQLite ephemeral DB. If
   * the count is equivalent to our expectation it means everything worked.
   */
  await tc.step("CLI driver execution result", async () => {
    const sh = relativeFilePath("./models_test.fixture.sh");
    // TODO: right now we just check the total count of object but this should be
    // improved to actually check the names of each table, view, etc.
    // deno-fmt-ignore
    const output = await $`./${sh} :memory: "select count(*) as objects_count from sqlite_master"`.text();
    ta.assertEquals(output, "28");
  });

  // deno-lint-ignore require-await
  await tc.step("Typescript SQL", async () => {
    const output = sqlDDL().SQL(ctx);
    ta.assertEquals(
      output,
      relativeFileContent("./models_test.fixture.sql"),
    );
  });
});

Deno.test("Infra Assurance Pattern Module", async (tc) => {
  await tc.step("CLI SQL content", () => {
    const output = sqlDDL().SQL(ctx);
    ta.assertEquals(
      output,
      relativeFileContent("./models_test.fixture.sql"),
    );
  });
});
