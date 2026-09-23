/**
 * RUNotify - Cardápio RU06 (RU VALE / Informática)
 *
 * @format
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Platform,
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
import {ensureNotificationSetup} from './src/services/notifications';
import {
  checkAndRunWeeklyJob,
  getCachedWeekMenu,
  runWeeklyMenuJob,
} from './src/services/scheduler';

const SERIF_FONT = Platform.select({ios: 'Georgia', default: 'serif'});

const LIGHT_COLORS = {
  bg: '#f7f1e4',
  surface: '#fffbf2',
  text: '#2a231b',
  textSoft: '#6f6152',
  textFaint: '#9a8d7c',
  border: 'rgba(42,35,27,0.16)',
  borderStrong: 'rgba(42,35,27,0.30)',
  accent: '#7c2d3a',
  accentSoft: '#f0ddb8',
  fishText: '#5c1f29',
  olive: '#65703f',
};

const DARK_COLORS = {
  bg: '#1c1712',
  surface: '#26201a',
  text: '#f2e9da',
  textSoft: '#bdaf9b',
  textFaint: '#8a7c69',
  border: 'rgba(242,233,218,0.14)',
  borderStrong: 'rgba(242,233,218,0.26)',
  accent: '#e0a458',
  accentSoft: 'rgba(224,164,88,0.16)',
  fishText: '#e0a458',
  olive: '#a9b087',
};

type ColorTokens = typeof LIGHT_COLORS;

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
  const colors = isDarkMode ? DARK_COLORS : LIGHT_COLORS;
  const styles = createStyles(colors);

  const [weekData, setWeekData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    await ensureNotificationSetup();
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

  const isInitialLoading = loading && !weekData;
  const isBlockingError = !!error && !weekData;

  const firstDate = weekData?.menu?.lunch?.[0]?.date;
  const lastDate = weekData?.menu?.lunch?.[WEEKDAY_ORDER.length - 1]?.date;
  const weekRangeLabel =
    firstDate && lastDate ? `Semana de ${firstDate} a ${lastDate}` : 'Semana';

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.safeArea, {backgroundColor: colors.bg}]}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }>
          <View style={styles.header}>
            <Text style={styles.brandTitle}>RU06</Text>
            <Text style={styles.brandSub}>RU Vale · Informática — UFRGS</Text>
            <Text style={styles.hoursRow}>
              Almoço 11:00–14:00 · Janta 17:30–19:00
            </Text>
            <View style={styles.ruleOrn}>
              <View style={styles.ruleLine} />
              <Text style={styles.ruleStar}>✦</Text>
              <View style={styles.ruleLine} />
            </View>
          </View>

          {isInitialLoading && (
            <View style={styles.statePanel}>
              <ActivityIndicator
                size="large"
                color={colors.accent}
                style={styles.stateSpinner}
              />
              <Text style={styles.loadingTitle}>
                Preparando o cardápio da semana
              </Text>
              <Text style={styles.loadingSub}>
                Um instante, estamos consultando o RU06…
              </Text>
            </View>
          )}

          {isBlockingError && (
            <View style={styles.statePanel}>
              <View style={styles.errorIconWrap}>
                <Text style={styles.errorIconText}>!</Text>
              </View>
              <Text style={styles.errorTitle}>
                Não foi possível abrir o cardápio
              </Text>
              <Text style={styles.errorSub}>{error}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={handleRefresh}
                activeOpacity={0.85}>
                <Text style={styles.retryBtnText}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          )}

          {weekData && (
            <>
              <View style={styles.metaRow}>
                <Text style={styles.timestamp}>
                  Atualizado em{' '}
                  {new Date(weekData.fetchedAt).toLocaleString('pt-BR')}
                </Text>
                <TouchableOpacity
                  style={styles.refreshBtn}
                  onPress={handleRefresh}
                  activeOpacity={0.8}>
                  <Text style={styles.refreshBtnText}>
                    {refreshing ? 'ATUALIZANDO…' : 'ATUALIZAR'}
                  </Text>
                </TouchableOpacity>
              </View>

              {!!error && (
                <View style={styles.inlineErrorNote}>
                  <Text style={styles.inlineErrorText}>{error}</Text>
                </View>
              )}

              <View style={styles.sectionKicker}>
                <Text style={styles.sectionKickerLabel}>{weekRangeLabel}</Text>
                <Text style={styles.sectionKickerCount}>
                  {WEEKDAY_ORDER.length} dias
                </Text>
              </View>

              <View style={styles.dayList}>
                {WEEKDAY_ORDER.map((weekday, dayIndex) => (
                  <View key={weekday} style={styles.dayCard}>
                    <View style={styles.dayCardAccentBar} />
                    <View style={styles.dayCardHead}>
                      <Text style={styles.dayName}>{weekday}</Text>
                      {!!weekData.menu.lunch[dayIndex]?.date && (
                        <Text style={styles.dayDate}>
                          {weekData.menu.lunch[dayIndex].date}
                        </Text>
                      )}
                    </View>

                    {(['lunch', 'dinner'] as const).map((meal, mealIndex) => {
                      const day = weekData.menu[meal]?.[dayIndex];
                      if (!day) {
                        return null;
                      }
                      return (
                        <React.Fragment key={meal}>
                          {mealIndex > 0 && <View style={styles.mealDivider} />}
                          <View style={styles.mealBlock}>
                            <Text style={styles.mealLabel}>
                              {MEAL_TIMES[meal].label}
                            </Text>
                            <View style={styles.dishList}>
                              {day.dishes.map((dish: string, i: number) =>
                                isFishDish(dish) ? (
                                  <View key={i} style={styles.fishDish}>
                                    <Text style={styles.fishSealLabel}>
                                      🐟 Nota do chef
                                    </Text>
                                    <Text style={styles.fishDishName}>
                                      {dish}
                                    </Text>
                                    <Text style={styles.fishDishTag}>
                                      Proteína do dia
                                    </Text>
                                  </View>
                                ) : (
                                  <Text key={i} style={styles.dishText}>
                                    {dish}
                                  </Text>
                                ),
                              )}
                            </View>
                          </View>
                        </React.Fragment>
                      );
                    })}
                  </View>
                ))}
              </View>

              <Text style={styles.footerNote}>— RU06 · Bom apetite —</Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    safeArea: {flex: 1},
    scrollContent: {padding: 20, paddingBottom: 40},

    header: {paddingBottom: 4},
    brandTitle: {
      fontFamily: SERIF_FONT,
      fontWeight: '700',
      fontSize: 30,
      lineHeight: 33,
      letterSpacing: -0.3,
      color: colors.text,
    },
    brandSub: {
      fontSize: 11.5,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: colors.olive,
      marginTop: 3,
    },
    hoursRow: {
      fontSize: 12.5,
      color: colors.textSoft,
      marginTop: 12,
    },
    ruleOrn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 16,
      marginBottom: 4,
    },
    ruleLine: {flex: 1, height: 1, backgroundColor: colors.borderStrong},
    ruleStar: {
      fontSize: 11,
      color: colors.accent,
      transform: [{rotate: '45deg'}],
    },

    statePanel: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingVertical: 56,
    },
    stateSpinner: {marginBottom: 20},
    loadingTitle: {
      fontFamily: SERIF_FONT,
      fontWeight: '600',
      fontSize: 16,
      color: colors.text,
      marginBottom: 4,
      textAlign: 'center',
    },
    loadingSub: {
      fontSize: 12.5,
      color: colors.textSoft,
      textAlign: 'center',
    },
    errorIconWrap: {
      width: 46,
      height: 46,
      borderRadius: 23,
      borderWidth: 1.5,
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    errorIconText: {fontSize: 20, fontWeight: '700', color: colors.accent},
    errorTitle: {
      fontFamily: SERIF_FONT,
      fontWeight: '600',
      fontSize: 17,
      color: colors.text,
      marginBottom: 6,
      textAlign: 'center',
    },
    errorSub: {
      fontSize: 12.5,
      color: colors.textSoft,
      textAlign: 'center',
      lineHeight: 19,
      maxWidth: 260,
      marginBottom: 20,
    },
    retryBtn: {
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingVertical: 11,
      paddingHorizontal: 20,
    },
    retryBtnText: {
      fontSize: 12.5,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.bg,
    },

    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 6,
    },
    timestamp: {
      fontFamily: SERIF_FONT,
      fontStyle: 'italic',
      fontSize: 11,
      color: colors.textFaint,
      flexShrink: 1,
    },
    refreshBtn: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 13,
    },
    refreshBtnText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: colors.text,
    },

    inlineErrorNote: {
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 10,
      padding: 12,
      marginTop: 10,
    },
    inlineErrorText: {
      fontSize: 12.5,
      color: colors.text,
      lineHeight: 18,
    },

    sectionKicker: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 22,
      marginBottom: 12,
    },
    sectionKickerLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: colors.olive,
    },
    sectionKickerCount: {
      fontFamily: SERIF_FONT,
      fontStyle: 'italic',
      fontSize: 11,
      color: colors.textFaint,
    },

    dayList: {gap: 16},
    dayCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 18,
      position: 'relative',
      overflow: 'hidden',
    },
    dayCardAccentBar: {
      position: 'absolute',
      top: 0,
      left: 18,
      right: 18,
      height: 3,
      backgroundColor: colors.accent,
      opacity: 0.85,
      borderBottomLeftRadius: 3,
      borderBottomRightRadius: 3,
    },
    dayCardHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    dayName: {
      fontFamily: SERIF_FONT,
      fontWeight: '600',
      fontSize: 19,
      color: colors.text,
    },
    dayDate: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textFaint,
    },

    mealBlock: {gap: 9, paddingTop: 8},
    mealDivider: {
      borderTopWidth: 1,
      borderStyle: 'dashed',
      borderTopColor: colors.border,
      marginTop: 6,
    },
    mealLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.accent,
    },

    dishList: {gap: 8},
    dishText: {
      fontSize: 13.5,
      fontWeight: '500',
      color: colors.text,
      lineHeight: 18,
    },
    fishDish: {
      gap: 4,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 8,
      padding: 12,
      marginVertical: 2,
    },
    fishSealLabel: {
      fontFamily: SERIF_FONT,
      fontStyle: 'italic',
      fontWeight: '600',
      fontSize: 11.5,
      color: colors.fishText,
    },
    fishDishName: {
      fontFamily: SERIF_FONT,
      fontWeight: '700',
      fontSize: 16,
      color: colors.fishText,
    },
    fishDishTag: {
      fontSize: 10.5,
      fontWeight: '600',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.fishText,
      opacity: 0.75,
    },

    footerNote: {
      fontFamily: SERIF_FONT,
      fontStyle: 'italic',
      fontSize: 12,
      color: colors.textFaint,
      textAlign: 'center',
      marginTop: 22,
    },
  });
}

export default App;
