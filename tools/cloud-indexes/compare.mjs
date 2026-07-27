import {
  normalizeExpectedConfiguration,
  normalizeRemoteCollectionsAndIndexes
} from "./normalize.mjs";

function compareKeys(expectedKeys, actualKeys) {
  const differences = [];
  if (expectedKeys.length !== actualKeys.length) {
    differences.push({
      field: "keys.length",
      expected: expectedKeys.length,
      actual: actualKeys.length
    });
  }
  const length = Math.max(expectedKeys.length, actualKeys.length);
  for (let position = 0; position < length; position += 1) {
    const expected = expectedKeys[position];
    const actual = actualKeys[position];
    if (!expected || !actual) {
      continue;
    }
    if (expected.name !== actual.name) {
      differences.push({
        field: `keys[${position}].name`,
        expected: expected.name,
        actual: actual.name
      });
    }
    if (expected.direction !== actual.direction) {
      differences.push({
        field: `keys[${position}].direction`,
        expected: expected.direction,
        actual: actual.direction
      });
    }
  }
  return differences;
}

function evaluateStatus(status, statusPolicy) {
  if (status === "unknown") {
    return statusPolicy.unknown === "error"
      ? { severity: "error", code: "INDEX_STATUS_UNKNOWN" }
      : { severity: "warning", code: "INDEX_STATUS_UNKNOWN" };
  }
  if (statusPolicy.readyValues.includes(status)) {
    return { severity: "ready", code: "" };
  }
  if (statusPolicy.buildingValues.includes(status)) {
    return { severity: "error", code: "INDEX_STATUS_BUILDING" };
  }
  return { severity: "error", code: "INDEX_STATUS_NOT_READY" };
}

function compareUnique(expectedIndex, actualIndex) {
  const acceptsCloudBaseIdVariants =
    expectedIndex.system === true &&
    expectedIndex.name === "_id_" &&
    (actualIndex.unique === true || actualIndex.unique === false);
  if (acceptsCloudBaseIdVariants || expectedIndex.unique === actualIndex.unique) {
    return [];
  }
  return [
    {
      field: "unique",
      expected:
        expectedIndex.system === true && expectedIndex.name === "_id_"
          ? [true, false]
          : expectedIndex.unique,
      actual: actualIndex.unique
    }
  ];
}

export function compareIndexConfiguration(rawExpected, rawRemote) {
  const expected = normalizeExpectedConfiguration(rawExpected);
  const remote = normalizeRemoteCollectionsAndIndexes(rawRemote);
  const remoteCollections = new Map(
    remote.collections.map((collection) => [collection.name, collection])
  );
  const missing = [];
  const mismatched = [];
  const warnings = [];
  const matches = [];
  const requiredIndexCount = expected.collections.reduce(
    (total, collection) =>
      total + collection.indexes.filter((index) => index.required).length,
    0
  );
  let foundCollections = 0;

  for (const expectedCollection of expected.collections) {
    const remoteCollection = remoteCollections.get(expectedCollection.name);
    if (!remoteCollection) {
      missing.push({
        type: "collection",
        collection: expectedCollection.name,
        name: expectedCollection.name
      });
      continue;
    }
    foundCollections += 1;
    const expectedIndexNames = new Set(expectedCollection.indexes.map((index) => index.name));
    const remoteIndexes = new Map(
      remoteCollection.indexes.map((index) => [index.name, index])
    );

    for (const expectedIndex of expectedCollection.indexes) {
      const actualIndex = remoteIndexes.get(expectedIndex.name);
      if (!actualIndex) {
        if (expectedIndex.required) {
          missing.push({
            type: "index",
            collection: expectedCollection.name,
            name: expectedIndex.name,
            expected: expectedIndex
          });
        }
        continue;
      }

      const differences = [
        ...compareKeys(expectedIndex.keys, actualIndex.keys),
        ...compareUnique(expectedIndex, actualIndex)
      ];

      const status = evaluateStatus(actualIndex.status, expected.statusPolicy);
      if (status.severity === "error") {
        differences.push({
          field: "status",
          expected: expected.statusPolicy.readyValues,
          actual: actualIndex.status,
          code: status.code
        });
      } else if (status.severity === "warning") {
        warnings.push({
          code: status.code,
          collection: expectedCollection.name,
          name: expectedIndex.name,
          message:
            "DescribeTable did not expose index build status; name, keys, order, direction and unique were verified."
        });
      }

      if (differences.length) {
        mismatched.push({
          collection: expectedCollection.name,
          name: expectedIndex.name,
          expected: expectedIndex,
          actual: actualIndex,
          differences
        });
      } else {
        matches.push({
          collection: expectedCollection.name,
          name: expectedIndex.name,
          system: expectedIndex.system
        });
      }
    }

    for (const actualIndex of remoteCollection.indexes) {
      if (!expectedIndexNames.has(actualIndex.name)) {
        warnings.push({
          code: "EXTRA_INDEX",
          collection: expectedCollection.name,
          name: actualIndex.name,
          message: "Remote index is not declared in the machine index configuration."
        });
      }
    }
  }

  return {
    passed: missing.length === 0 && mismatched.length === 0,
    environment: remote.environment,
    collections: {
      expected: expected.collections.length,
      found: foundCollections
    },
    indexes: {
      expected: requiredIndexCount,
      matched: matches.filter((match) => {
        const collection = expected.collections.find((item) => item.name === match.collection);
        const index = collection.indexes.find((item) => item.name === match.name);
        return index.required;
      }).length
    },
    matches,
    missing,
    mismatched,
    warnings
  };
}
