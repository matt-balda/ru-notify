// In-memory AsyncStorage for Jest; __reset() clears it between tests.
const store = new Map();

const AsyncStorage = {
  getItem: async key => (store.has(key) ? store.get(key) : null),
  setItem: async (key, value) => {
    store.set(key, String(value));
  },
  removeItem: async key => {
    store.delete(key);
  },
  clear: async () => {
    store.clear();
  },
  getAllKeys: async () => [...store.keys()],
  __reset: () => store.clear(),
};

module.exports = {__esModule: true, default: AsyncStorage};
