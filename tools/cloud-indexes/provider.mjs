import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const TCB_API_VERSION = "2018-06-08";
export const READ_ONLY_ACTIONS = ["DescribeEnvs", "DescribeTables", "DescribeTable"];

export class CloudIndexProviderError extends Error {
  constructor(errorCode, message) {
    super(message);
    this.name = "CloudIndexProviderError";
    this.errorCode = errorCode;
  }
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createOfficialTcbClient({ secretId, secretKey, region }) {
  const { Client } = require("tencentcloud-sdk-nodejs-tcb").tcb.v20180608;
  return new Client({
    credential: {
      secretId,
      secretKey
    },
    region,
    profile: {
      httpProfile: {
        endpoint: "tcb.tencentcloudapi.com",
        reqTimeout: 30
      }
    }
  });
}

function wrapProviderError(error) {
  if (error instanceof CloudIndexProviderError) {
    return error;
  }
  const providerCode = normalizeString(error && (error.code || error.name))
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .slice(0, 80);
  return new CloudIndexProviderError(
    "CLOUD_INDEX_PROVIDER_FAILED",
    `CloudBase read-only API failed${providerCode ? ` (${providerCode})` : ""}.`
  );
}

function requireInput(value, errorCode, message) {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw new CloudIndexProviderError(errorCode, message);
  }
  return normalized;
}

async function fetchAllTables(client, { envId, instanceId }) {
  const tables = [];
  const limit = 100;
  let offset = 0;
  let total = 0;
  do {
    const response = await client.DescribeTables({
      EnvId: envId,
      Tag: instanceId,
      MgoLimit: limit,
      MgoOffset: offset
    });
    const pageTables = Array.isArray(response.Tables) ? response.Tables : [];
    tables.push(...pageTables);
    total = Number(response.Pager && response.Pager.Total);
    if (!Number.isFinite(total)) {
      total = tables.length;
    }
    if (!pageTables.length) {
      break;
    }
    offset += pageTables.length;
  } while (offset < total);
  return tables;
}

export async function fetchRemoteCollectionsAndIndexes({
  envId,
  secretId,
  secretKey,
  clientFactory = createOfficialTcbClient
}) {
  const targetEnvId = requireInput(
    envId,
    "CLOUD_INDEX_ENV_REQUIRED",
    "PETMATE_CLOUD_ENV_ID is required."
  );
  const credentialId = requireInput(
    secretId,
    "CLOUD_INDEX_SECRET_ID_REQUIRED",
    "TENCENTCLOUD_SECRET_ID is required."
  );
  const credentialKey = requireInput(
    secretKey,
    "CLOUD_INDEX_SECRET_KEY_REQUIRED",
    "TENCENTCLOUD_SECRET_KEY is required."
  );

  try {
    const environmentClient = clientFactory({
      secretId: credentialId,
      secretKey: credentialKey,
      region: ""
    });
    const environmentResponse = await environmentClient.DescribeEnvs({
      EnvId: targetEnvId,
      Limit: 1,
      Offset: 0
    });
    const environment = (environmentResponse.EnvList || []).find(
      (item) => normalizeString(item.EnvId) === targetEnvId
    );
    if (!environment) {
      throw new CloudIndexProviderError(
        "CLOUD_INDEX_ENV_NOT_FOUND",
        `CloudBase environment ${targetEnvId} was not found.`
      );
    }
    if (normalizeString(environment.Status).toUpperCase() !== "NORMAL") {
      throw new CloudIndexProviderError(
        "CLOUD_INDEX_ENV_NOT_READY",
        `CloudBase environment ${targetEnvId} is not in NORMAL status.`
      );
    }

    const databases = Array.isArray(environment.Databases) ? environment.Databases : [];
    const database =
      databases.find((item) => normalizeString(item.Status).toUpperCase() === "RUNNING") ||
      databases[0];
    if (!database || !normalizeString(database.InstanceId)) {
      throw new CloudIndexProviderError(
        "CLOUD_INDEX_DATABASE_NOT_FOUND",
        `CloudBase environment ${targetEnvId} has no document database instance.`
      );
    }
    if (normalizeString(database.Status).toUpperCase() !== "RUNNING") {
      throw new CloudIndexProviderError(
        "CLOUD_INDEX_DATABASE_NOT_READY",
        `CloudBase environment ${targetEnvId} document database is not RUNNING.`
      );
    }

    const region = requireInput(
      database.Region || environment.Region,
      "CLOUD_INDEX_REGION_NOT_FOUND",
      `CloudBase environment ${targetEnvId} did not expose a database region.`
    );
    const instanceId = normalizeString(database.InstanceId);
    const databaseClient = clientFactory({
      secretId: credentialId,
      secretKey: credentialKey,
      region
    });
    const tableSummaries = await fetchAllTables(databaseClient, {
      envId: targetEnvId,
      instanceId
    });
    const tables = [];
    for (const table of tableSummaries) {
      const tableName = normalizeString(table.TableName);
      if (!tableName) {
        continue;
      }
      const detail = await databaseClient.DescribeTable({
        EnvId: targetEnvId,
        Tag: instanceId,
        TableName: tableName
      });
      tables.push({
        ...table,
        TableName: tableName,
        Indexes: Array.isArray(detail.Indexes) ? detail.Indexes : []
      });
    }

    return {
      environment: {
        envId: targetEnvId,
        region,
        instanceId,
        environmentStatus: normalizeString(environment.Status),
        databaseStatus: normalizeString(database.Status),
        provider: "Tencent CloudBase TCB",
        apiVersion: TCB_API_VERSION,
        actions: [...READ_ONLY_ACTIONS]
      },
      Tables: tables
    };
  } catch (error) {
    throw wrapProviderError(error);
  }
}
