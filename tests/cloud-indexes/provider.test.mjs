import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CloudIndexProviderError,
  READ_ONLY_ACTIONS,
  fetchRemoteCollectionsAndIndexes
} from "../../tools/cloud-indexes/provider.mjs";

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const responses = JSON.parse(
  fs.readFileSync(path.join(fixtureRoot, "provider-responses.json"), "utf8")
);

test("provider resolves the environment then reads tables and indexes only", async () => {
  const calls = [];
  const clientFactory = ({ region }) => {
    if (!region) {
      return {
        async DescribeEnvs(input) {
          calls.push(["DescribeEnvs", input]);
          return responses.environment;
        }
      };
    }
    return {
      async DescribeTables(input) {
        calls.push(["DescribeTables", input]);
        return responses.tables;
      },
      async DescribeTable(input) {
        calls.push(["DescribeTable", input]);
        return responses.workDetail;
      }
    };
  };

  const result = await fetchRemoteCollectionsAndIndexes({
    envId: "test-env",
    secretId: "secret-id",
    secretKey: "secret-key",
    clientFactory
  });

  assert.deepEqual(
    calls.map(([action]) => action),
    READ_ONLY_ACTIONS
  );
  assert.equal(result.environment.envId, "test-env");
  assert.equal(result.environment.region, "ap-shanghai");
  assert.equal(result.environment.instanceId, "tnt-test");
  assert.equal(result.Tables[0].TableName, "works");
  assert.deepEqual(result.Tables[0].Indexes, responses.workDetail.Indexes);
  assert.deepEqual(calls[1][1], {
    EnvId: "test-env",
    Tag: "tnt-test",
    MgoLimit: 100,
    MgoOffset: 0
  });
  assert.deepEqual(calls[2][1], {
    EnvId: "test-env",
    Tag: "tnt-test",
    TableName: "works"
  });
});

test("provider wraps SDK failures without leaking credential values", async () => {
  await assert.rejects(
    fetchRemoteCollectionsAndIndexes({
      envId: "test-env",
      secretId: "secret-id-value",
      secretKey: "secret-key-value",
      clientFactory() {
        return {
          async DescribeEnvs() {
            const error = new Error("secret-id-value secret-key-value");
            error.code = "AuthFailure.UnauthorizedOperation";
            throw error;
          }
        };
      }
    }),
    (error) => {
      assert.ok(error instanceof CloudIndexProviderError);
      assert.equal(error.errorCode, "CLOUD_INDEX_PROVIDER_FAILED");
      assert.equal(error.message.includes("secret-id-value"), false);
      assert.equal(error.message.includes("secret-key-value"), false);
      assert.match(error.message, /AuthFailure\.UnauthorizedOperation/);
      return true;
    }
  );
});

test("provider follows DescribeTables pagination before reading each table detail", async () => {
  const offsets = [];
  const detailNames = [];
  const clientFactory = ({ region }) => {
    if (!region) {
      return {
        async DescribeEnvs() {
          return responses.environment;
        }
      };
    }
    return {
      async DescribeTables(input) {
        offsets.push(input.MgoOffset);
        return {
          Tables: [{ TableName: input.MgoOffset === 0 ? "works" : "orders" }],
          Pager: {
            Total: 2
          }
        };
      },
      async DescribeTable(input) {
        detailNames.push(input.TableName);
        return responses.workDetail;
      }
    };
  };

  const result = await fetchRemoteCollectionsAndIndexes({
    envId: "test-env",
    secretId: "secret-id",
    secretKey: "secret-key",
    clientFactory
  });

  assert.deepEqual(offsets, [0, 1]);
  assert.deepEqual(detailNames, ["works", "orders"]);
  assert.deepEqual(
    result.Tables.map((table) => table.TableName),
    ["works", "orders"]
  );
});

test("provider rejects missing credentials and unavailable targets before index reads", async () => {
  await assert.rejects(
    fetchRemoteCollectionsAndIndexes({
      envId: "test-env",
      secretId: "",
      secretKey: "secret-key"
    }),
    (error) => error.errorCode === "CLOUD_INDEX_SECRET_ID_REQUIRED"
  );

  await assert.rejects(
    fetchRemoteCollectionsAndIndexes({
      envId: "test-env",
      secretId: "secret-id",
      secretKey: "secret-key",
      clientFactory() {
        return {
          async DescribeEnvs() {
            return {
              EnvList: [
                {
                  EnvId: "test-env",
                  Status: "UNAVAILABLE",
                  Databases: []
                }
              ]
            };
          }
        };
      }
    }),
    (error) => error.errorCode === "CLOUD_INDEX_ENV_NOT_READY"
  );
});

test("provider source contains no mutating CloudBase table API calls", () => {
  const providerSource = fs.readFileSync(
    path.resolve(fixtureRoot, "..", "..", "..", "tools", "cloud-indexes", "provider.mjs"),
    "utf8"
  );
  for (const action of ["CreateTable", "UpdateTable", "DeleteTable", "RunCommands"]) {
    assert.equal(providerSource.includes(`.${action}(`), false);
  }
});
