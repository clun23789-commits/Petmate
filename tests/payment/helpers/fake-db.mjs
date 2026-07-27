import assert from "node:assert/strict";

function clone(value) {
  return structuredClone(value);
}

function matches(doc, criteria = {}) {
  return Object.entries(criteria).every(([field, expected]) => doc[field] === expected);
}

class DocumentRef {
  constructor(database, store, collectionName, id) {
    this.database = database;
    this.store = store;
    this.collectionName = collectionName;
    this.id = id;
  }

  getCollection() {
    if (!this.store.has(this.collectionName)) {
      this.store.set(this.collectionName, new Map());
    }
    return this.store.get(this.collectionName);
  }

  async get() {
    const collection = this.getCollection();
    return {
      data: collection.has(this.id) ? clone(collection.get(this.id)) : null
    };
  }

  async set({ data }) {
    this.database.maybeFail(this.collectionName, "set");
    const collection = this.getCollection();
    collection.set(this.id, {
      ...clone(data),
      _id: this.id
    });
    return {
      _id: this.id
    };
  }

  async update({ data }) {
    this.database.maybeFail(this.collectionName, "update");
    const collection = this.getCollection();
    if (!collection.has(this.id)) {
      throw new Error(`document not found: ${this.collectionName}.${this.id}`);
    }
    collection.set(this.id, {
      ...collection.get(this.id),
      ...clone(data),
      _id: this.id
    });
    return {
      updated: 1
    };
  }
}

class QueryRef {
  constructor(database, store, collectionName, criteria = {}, max = Infinity) {
    this.database = database;
    this.store = store;
    this.collectionName = collectionName;
    this.criteria = criteria;
    this.max = max;
  }

  where(criteria) {
    return new QueryRef(this.database, this.store, this.collectionName, criteria, this.max);
  }

  limit(max) {
    return new QueryRef(this.database, this.store, this.collectionName, this.criteria, max);
  }

  doc(id) {
    return new DocumentRef(this.database, this.store, this.collectionName, id);
  }

  async get() {
    const collection = this.store.get(this.collectionName) || new Map();
    return {
      data: Array.from(collection.values())
        .filter((doc) => matches(doc, this.criteria))
        .slice(0, this.max)
        .map(clone)
    };
  }

  async add({ data }) {
    this.database.maybeFail(this.collectionName, "add");
    const id = data._id;
    assert.equal(typeof id, "string", `${this.collectionName}.add requires data._id in tests`);
    const collection = this.store.get(this.collectionName) || new Map();
    if (collection.has(id)) {
      throw new Error(`duplicate document: ${this.collectionName}.${id}`);
    }
    collection.set(id, clone(data));
    this.store.set(this.collectionName, collection);
    return {
      _id: id
    };
  }
}

export class FakeDatabase {
  constructor(seed = {}) {
    this.store = new Map();
    this.failures = [];
    this.queue = Promise.resolve();

    Object.entries(seed).forEach(([collectionName, docs]) => {
      const collection = new Map();
      docs.forEach((doc) => {
        collection.set(doc._id, clone(doc));
      });
      this.store.set(collectionName, collection);
    });
  }

  collection(name) {
    return new QueryRef(this, this.store, name);
  }

  failNext(collectionName, operation) {
    this.failures.push({
      collectionName,
      operation
    });
  }

  maybeFail(collectionName, operation) {
    const index = this.failures.findIndex((failure) => {
      return failure.collectionName === collectionName && failure.operation === operation;
    });
    if (index < 0) {
      return;
    }
    this.failures.splice(index, 1);
    throw new Error(`injected failure: ${collectionName}.${operation}`);
  }

  async runTransaction(callback) {
    const run = async () => {
      const draft = clone(this.store);
      const transaction = {
        collection: (name) => ({
          doc: (id) => new DocumentRef(this, draft, name, id)
        })
      };
      const result = await callback(transaction);
      this.store = draft;
      return {
        result
      };
    };
    const promise = this.queue.then(run, run);
    this.queue = promise.then(() => undefined, () => undefined);
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

export function createCloud(openid = "user-openid") {
  return {
    getWXContext() {
      return {
        OPENID: openid
      };
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
