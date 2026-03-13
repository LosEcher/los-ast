import { createKeyValueStore } from '../key-value-store.js';
class KeyValueRepository {
    store;
    constructor(store) {
        this.store = store;
    }
    get(id) {
        return this.store.get(id);
    }
    has(id) {
        return this.store.has(id);
    }
    set(id, value) {
        this.store.set(id, value);
    }
    delete(id) {
        return this.store.delete(id);
    }
    values() {
        return this.store.values();
    }
    entries() {
        return this.store.entries();
    }
    clear() {
        this.store.clear();
    }
    size() {
        return this.store.size();
    }
}
export function createRepository(name) {
    return new KeyValueRepository(createKeyValueStore(name));
}
