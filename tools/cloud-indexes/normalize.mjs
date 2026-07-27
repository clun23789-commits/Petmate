function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value) {
  if (value === true || value === false) {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

export function normalizeDirection(value) {
  const direction = Number(value);
  return direction === 1 || direction === -1 ? direction : null;
}

function normalizeKey(rawKey = {}) {
  return {
    name: normalizeString(rawKey.Name ?? rawKey.name),
    direction: normalizeDirection(rawKey.Direction ?? rawKey.direction)
  };
}

export function normalizeRemoteIndex(collection, rawIndex = {}) {
  const status = normalizeString(
    rawIndex.Status ??
      rawIndex.status ??
      rawIndex.BuildStatus ??
      rawIndex.buildStatus ??
      rawIndex.IndexStatus ??
      rawIndex.indexStatus
  ).toLowerCase();
  const rawKeys = rawIndex.Keys ?? rawIndex.keys;
  return {
    collection,
    name: normalizeString(rawIndex.Name ?? rawIndex.name),
    unique: normalizeBoolean(rawIndex.Unique ?? rawIndex.unique),
    status: status || "unknown",
    keys: Array.isArray(rawKeys) ? rawKeys.map(normalizeKey) : []
  };
}

export function normalizeRemoteCollectionsAndIndexes(raw = {}) {
  const rawTables = raw.Tables ?? raw.tables ?? raw.collections;
  const tables = Array.isArray(rawTables) ? rawTables : [];
  const collections = tables
    .map((rawTable) => {
      const name = normalizeString(
        rawTable.TableName ?? rawTable.tableName ?? rawTable.collection ?? rawTable.name
      );
      const rawIndexes = rawTable.Indexes ?? rawTable.indexes;
      return {
        name,
        indexes: Array.isArray(rawIndexes)
          ? rawIndexes.map((rawIndex) => normalizeRemoteIndex(name, rawIndex))
          : []
      };
    })
    .filter((collection) => collection.name);

  return {
    environment: isObject(raw.environment) ? { ...raw.environment } : {},
    collections
  };
}

function normalizeExpectedIndex(rawIndex, source) {
  if (!isObject(rawIndex)) {
    throw new Error(`Invalid index definition at ${source}.`);
  }
  const name = normalizeString(rawIndex.name);
  const required = rawIndex.required !== false;
  const unique = normalizeBoolean(rawIndex.unique);
  const rawKeys = rawIndex.keys;
  if (!name || unique === null || !Array.isArray(rawKeys) || !rawKeys.length) {
    throw new Error(`Invalid index definition at ${source}.`);
  }
  const keys = rawKeys.map(normalizeKey);
  if (keys.some((key) => !key.name || key.direction === null)) {
    throw new Error(`Invalid index key definition at ${source}.${name}.`);
  }
  return {
    name,
    required,
    unique,
    keys,
    system: rawIndex.system === true
  };
}

function normalizeStatusValues(values, fallback) {
  const source = Array.isArray(values) ? values : fallback;
  return Array.from(
    new Set(source.map((value) => normalizeString(value).toLowerCase()).filter(Boolean))
  );
}

export function normalizeExpectedConfiguration(rawConfig = {}) {
  if (!isObject(rawConfig) || rawConfig.schemaVersion !== 1 || !isObject(rawConfig.collections)) {
    throw new Error("Cloud index configuration must use schemaVersion 1 and define collections.");
  }

  const statusPolicy = isObject(rawConfig.statusPolicy) ? rawConfig.statusPolicy : {};
  const unknownStatus = normalizeString(statusPolicy.unknown).toLowerCase() || "warning";
  if (!["warning", "error"].includes(unknownStatus)) {
    throw new Error("statusPolicy.unknown must be warning or error.");
  }

  const systemIndexes = Array.isArray(rawConfig.systemIndexes)
    ? rawConfig.systemIndexes.map((index, position) => ({
        ...normalizeExpectedIndex(index, `systemIndexes[${position}]`),
        system: true
      }))
    : [];
  const collections = Object.entries(rawConfig.collections).map(([collectionName, rawIndexes]) => {
    if (!collectionName || !Array.isArray(rawIndexes)) {
      throw new Error(`Invalid collection index definition for ${collectionName || "<empty>"}.`);
    }
    const indexes = rawIndexes.map((index, position) =>
      normalizeExpectedIndex(index, `collections.${collectionName}[${position}]`)
    );
    const names = [...systemIndexes, ...indexes].map((index) => index.name);
    if (new Set(names).size !== names.length) {
      throw new Error(`Duplicate index name in collection ${collectionName}.`);
    }
    return {
      name: collectionName,
      indexes: [...systemIndexes, ...indexes]
    };
  });

  return {
    schemaVersion: 1,
    statusPolicy: {
      readyValues: normalizeStatusValues(statusPolicy.readyValues, [
        "ready",
        "normal",
        "active",
        "available"
      ]),
      buildingValues: normalizeStatusValues(statusPolicy.buildingValues, [
        "building",
        "creating",
        "pending",
        "initializing"
      ]),
      unknown: unknownStatus
    },
    collections
  };
}
