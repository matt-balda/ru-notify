/* eslint-env jest */
// Minimal notifee for Jest: records calls, schedules nothing.
const notifee = {
  requestPermission: jest.fn(async () => ({})),
  createChannel: jest.fn(async () => 'channel'),
  getNotificationSettings: jest.fn(async () => ({android: {alarm: 1}})),
  createTriggerNotification: jest.fn(async () => 'id'),
  displayNotification: jest.fn(async () => 'id'),
  getTriggerNotificationIds: jest.fn(async () => []),
  cancelTriggerNotifications: jest.fn(async () => {}),
};

module.exports = {
  __esModule: true,
  default: notifee,
  AlarmType: {SET_EXACT_AND_ALLOW_WHILE_IDLE: 3, SET_AND_ALLOW_WHILE_IDLE: 2},
  AndroidImportance: {HIGH: 4},
  AndroidVisibility: {PUBLIC: 1},
  AndroidNotificationSetting: {ENABLED: 1},
  TriggerType: {TIMESTAMP: 0},
};
