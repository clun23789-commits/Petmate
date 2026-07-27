import assert from "node:assert/strict";

function clone(value) {
  return structuredClone(value);
}

function toMillis(value) {
  if (value instanceof Date) {
    return value.getTime();
  }
  return new Date(value).getTime();
}

function matches(doc, criteria) {
  return Object.entries(criteria || {}).every(([field, expected]) => {
    if (expected && expected.__fakeCommand === "in") {
      return expected.value.includes(doc[field]);
    }
    if (expected && expected.__fakeCommand === "lte") {
      return toMillis(doc[field]) <= toMillis(expected.value);
    }
    return doc[field] === expected;
  });
}

class QueryRef {
  constructor(database, store, collectionName, criteria = {}, transaction = false) {
    this.database = database;
    this.store = store;
    this.collectionName = collectionName;
    this.criteria = criteria;
    this.max = Infinity;
    this.transaction = transaction;
  }

  where(criteria) {
    if (this.transaction && this.database.strictTransactionDocReads) {
      throw new Error(`transaction.where is forbidden: ${this.collectionName}`);
    }
    return new QueryRef(this.database, this.store, this.collectionName, criteria, this.transaction);
  }

  limit(value) {
    this.max = value;
    return this;
  }

  async get() {
    await this.database.waitForReadGate(this.collectionName);
    this.database.consumeFailure(this.collectionName, "get");
    const collection = this.store.get(this.collectionName) || new Map();
    return {
      data: Array.from(collection.values())
        .filter((doc) => matches(doc, this.criteria))
        .slice(0, this.max)
        .map(clone)
    };
  }

  doc(id) {
    return new DocumentRef(this.database, this.store, this.collectionName, id);
  }

  async add({ data }) {
    this.database.consumeFailure(this.collectionName, "add");
    const collection = this.database.ensureCollection(this.store, this.collectionName);
    const id = data._id || `${this.collectionName}-${collection.size + 1}`;
    if (collection.has(id)) {
      throw new Error(`duplicate document: ${this.collectionName}/${id}`);
    }
    collection.set(id, {
      ...clone(data),
      _id: id
    });
    return { _id: id };
  }
}

class DocumentRef {
  constructor(database, store, collectionName, id) {
    this.database = database;
    this.store = store;
    this.collectionName = collectionName;
    this.id = id;
  }

  async get() {
    await this.database.waitForReadGate(this.collectionName);
    this.database.consumeFailure(this.collectionName, "get");
    const collection = this.store.get(this.collectionName) || new Map();
    return {
      data: collection.has(this.id) ? clone(collection.get(this.id)) : null
    };
  }

  async set({ data }) {
    this.database.consumeFailure(this.collectionName, "set");
    const collection = this.database.ensureCollection(this.store, this.collectionName);
    collection.set(this.id, {
      ...clone(data),
      _id: this.id
    });
    return {};
  }

  async update({ data }) {
    this.database.consumeFailure(this.collectionName, "update");
    const collection = this.database.ensureCollection(this.store, this.collectionName);
    if (!collection.has(this.id)) {
      throw new Error(`missing document: ${this.collectionName}/${this.id}`);
    }
    collection.set(this.id, {
      ...collection.get(this.id),
      ...clone(data),
      _id: this.id
    });
    return {};
  }
}

export class FakeDatabase {
  constructor(seed = {}, options = {}) {
    this.store = new Map();
    this.failures = [];
    this.queue = Promise.resolve();
    this.readGates = new Map();
    this.strictTransactionDocReads = options.strictTransactionDocReads !== false;
    this.command = {
      in(value) {
        return { __fakeCommand: "in", value };
      },
      lte(value) {
        return { __fakeCommand: "lte", value };
      },
      set(value) {
        return value;
      }
    };
    for (const [collectionName, docs] of Object.entries(seed)) {
      const collection = new Map();
      for (const doc of docs || []) {
        assert.ok(doc._id, `${collectionName} seed document requires _id`);
        collection.set(doc._id, clone(doc));
      }
      this.store.set(collectionName, collection);
    }
  }

  ensureCollection(store, name) {
    if (!store.has(name)) {
      store.set(name, new Map());
    }
    return store.get(name);
  }

  collection(name) {
    return new QueryRef(this, this.store, name);
  }

  failNext(collectionName, operation) {
    this.failOn(collectionName, operation, 1);
  }

  failOn(collectionName, operation, occurrence) {
    this.failures.push({
      collectionName,
      operation,
      remaining: Math.max(1, Number(occurrence || 1))
    });
  }

  consumeFailure(collectionName, operation) {
    const index = this.failures.findIndex(
      (item) => item.collectionName === collectionName && item.operation === operation
    );
    if (index === -1) {
      return;
    }
    if (this.failures[index].remaining > 1) {
      this.failures[index].remaining -= 1;
      return;
    }
    this.failures.splice(index, 1);
    throw new Error(`injected failure: ${collectionName}.${operation}`);
  }

  blockNextRead(collectionName) {
    let release;
    let enteredResolve;
    const entered = new Promise((resolve) => {
      enteredResolve = resolve;
    });
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    this.readGates.set(collectionName, {
      pending,
      release,
      enteredResolve,
      used: false
    });
    return {
      entered,
      release
    };
  }

  async waitForReadGate(collectionName) {
    const gate = this.readGates.get(collectionName);
    if (!gate || gate.used) {
      return;
    }
    gate.used = true;
    gate.enteredResolve();
    await gate.pending;
    this.readGates.delete(collectionName);
  }

  async runTransaction(callback) {
    const run = async () => {
      const draft = clone(this.store);
      const transaction = {
        collection: (name) => new QueryRef(this, draft, name, {}, true)
      };
      const result = await callback(transaction);
      this.store = draft;
      return { result };
    };
    const promise = this.queue.then(run, run);
    this.queue = promise.then(
      () => undefined,
      () => undefined
    );
    return promise;
  }

  get(collectionName, id) {
    const collection = this.store.get(collectionName) || new Map();
    return collection.has(id) ? clone(collection.get(id)) : null;
  }

  all(collectionName) {
    const collection = this.store.get(collectionName) || new Map();
    return Array.from(collection.values()).map(clone);
  }
}

export function createCloud(openid = "openid-generation-test") {
  return {
    getWXContext() {
      return { OPENID: openid };
    }
  };
}

export function quietLogger() {
  return {
    error() {},
    warn() {},
    log() {}
  };
}
