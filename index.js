/**
 * @format
 */

import {AppRegistry} from 'react-native';
import BackgroundFetch from 'react-native-background-fetch';
import App from './App';
import {name as appName} from './app.json';
import {checkAndRunWeeklyJob} from './src/services/scheduler';

// Runs when the OS wakes the app in the background (including after the app
// was killed) to check whether this week's RU06 menu still needs to be
// fetched and scheduled.
const backgroundFetchHeadlessTask = async event => {
  try {
    await checkAndRunWeeklyJob(new Date());
  } catch (error) {
    console.warn('[RUNotify] Falha na tarefa em segundo plano:', error);
  } finally {
    BackgroundFetch.finish(event.taskId);
  }
};

BackgroundFetch.registerHeadlessTask(backgroundFetchHeadlessTask);

AppRegistry.registerComponent(appName, () => App);
