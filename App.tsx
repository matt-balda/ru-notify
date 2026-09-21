/**
 * RUNotify - Cardápio RU06 (RU VALE / Informática)
 *
 * @format
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import BackgroundFetch from 'react-native-background-fetch';
import {MEAL_TIMES, WEEKDAY_ORDER} from './src/constants';
import {isFishDish} from './src/utils/fishDetector';
import {
  ensureNotificationSetup,
  hasExactAlarmPermission,
  openExactAlarmSettings,
} from './src/services/notifications';
import {
  checkAndRunWeeklyJob,
  getCachedWeekMenu,
  runWeeklyMenuJob,
} from './src/services/scheduler';

async function configureBackgroundFetch() {
  await BackgroundFetch.configure(
    {
      minimumFetchInterval: 15,
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,
      requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
    },
    async taskId => {
      try {
        await checkAndRunWeeklyJob(new Date());
      } catch (error) {
        console.warn('[RUNotify] Falha no background fetch:', error);
      } finally {
        BackgroundFetch.finish(taskId);
      }
    },
    error => {
      console.warn('[RUNotify] Erro ao configurar background fetch:', error);
    },
  );
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [weekData, setWeekData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alarmGranted, setAlarmGranted] = useState(true);

  const bootstrap = useCallback(async () => {
    await ensureNotificationSetup();
    setAlarmGranted(await hasExactAlarmPermission());
    await configureBackgroundFetch();

    const cached = await getCachedWeekMenu();
    if (cached) {
      setWeekData(cached);
    }

    try {
      const fresh = await checkAndRunWeeklyJob(new Date());
      if (fresh) {
        setWeekData(fresh);
      }
    } catch (e: any) {
      if (!cached) {
        setError(e?.message ?? 'Falha ao buscar o cardápio.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const fresh = await runWeeklyMenuJob(new Date());
      setWeekData(fresh);
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao buscar o cardápio.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <SafeAreaProvider>
    <SafeAreaView style={[styles.safeArea, isDarkMode && styles.safeAreaDark]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }>
        <Text style={[styles.title, isDarkMode && styles.textDark]}>
          RU06 · RU Vale / Informática
        </Text>
        <Text style={[styles.subtitle, isDarkMode && styles.textMutedDark]}>
          Almoço 11:00–14:00 · Janta 17:30–19:00
        </Text>

        {!alarmGranted && (
          <TouchableOpacity
            style={styles.warningBanner}
            onPress={openExactAlarmSettings}>
            <Text style={styles.warningText}>
              Para os horários das notificações serem exatos, toque aqui e
              permita "Alarmes e lembretes" para o RUNotify.
            </Text>
          </TouchableOpacity>
        )}

        {loading && !weekData && (
          <ActivityIndicator style={styles.spinner} size="large" />
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        {weekData && (
          <>
            <Text style={[styles.updatedAt, isDarkMode && styles.textMutedDark]}>
              Atualizado em {new Date(weekData.fetchedAt).toLocaleString('pt-BR')}
            </Text>
            {WEEKDAY_ORDER.map((weekday, dayIndex) => (
              <View
                key={weekday}
                style={[styles.dayCard, isDarkMode && styles.dayCardDark]}>
                <Text style={[styles.dayTitle, isDarkMode && styles.textDark]}>
                  {weekday}
                  {weekData.menu.lunch[dayIndex]?.date
                    ? ` · ${weekData.menu.lunch[dayIndex].date}`
                    : ''}
                </Text>
                {(['lunch', 'dinner'] as const).map(meal => {
                  const day = weekData.menu[meal]?.[dayIndex];
                  if (!day) {
                    return null;
                  }
                  return (
                    <View key={meal} style={styles.mealBlock}>
                      <Text style={styles.mealLabel}>
                        {MEAL_TIMES[meal].label}
                      </Text>
                      {day.dishes.map((dish: string, i: number) => (
                        <Text
                          key={i}
                          style={[
                            styles.dishText,
                            isDarkMode && styles.textMutedDark,
                            isFishDish(dish) && styles.fishDishText,
                          ]}>
                          {isFishDish(dish) ? '🐟 ' : '• '}
                          {dish}
                        </Text>
                      ))}
                    </View>
                  );
                })}
              </View>
            ))}
          </>
        )}

        <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
          <Text style={styles.refreshButtonText}>
            {refreshing ? 'Atualizando...' : 'Atualizar agora'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#f5f5f5'},
  safeAreaDark: {backgroundColor: '#121212'},
  scrollContent: {padding: 16, paddingBottom: 32},
  title: {fontSize: 22, fontWeight: '700', color: '#1a1a1a'},
  subtitle: {fontSize: 13, color: '#666', marginTop: 2, marginBottom: 16},
  textDark: {color: '#f5f5f5'},
  textMutedDark: {color: '#aaaaaa'},
  updatedAt: {fontSize: 12, color: '#888', marginBottom: 12},
  spinner: {marginTop: 40},
  errorText: {color: '#c0392b', marginBottom: 12},
  warningBanner: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffe69c',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  warningText: {color: '#664d03', fontSize: 13},
  dayCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  dayCardDark: {backgroundColor: '#1e1e1e'},
  dayTitle: {fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#1a1a1a'},
  mealBlock: {marginBottom: 8},
  mealLabel: {fontSize: 13, fontWeight: '600', color: '#eb9d46', marginBottom: 2},
  dishText: {fontSize: 14, color: '#333', lineHeight: 20},
  fishDishText: {fontWeight: '700', color: '#1c6dd0'},
  refreshButton: {
    marginTop: 8,
    backgroundColor: '#eb9d46',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  refreshButtonText: {color: '#1a1a1a', fontWeight: '700', fontSize: 15},
});

export default App;
