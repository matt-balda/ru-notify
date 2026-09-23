/* eslint-env jest */
const BackgroundFetch = {
  NETWORK_TYPE_ANY: 1,
  configure: jest.fn(async () => 2),
  finish: jest.fn(),
  registerHeadlessTask: jest.fn(),
};

module.exports = {__esModule: true, default: BackgroundFetch};
