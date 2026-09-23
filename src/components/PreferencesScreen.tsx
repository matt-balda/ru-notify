import React, {useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type {ScrollViewInstance} from 'react-native';
import {ADVANCE_NOTICE_MAX_HOURS, ADVANCE_NOTICE_MIN_HOURS} from '../constants';
import {formatTime} from '../services/preferences';
import {normalizeDishName} from '../utils/protein';
import {SERIF_FONT, type ColorTokens} from '../theme';

export type MealTime = {hour: number; minute: number};

export type Preferences = {
  lunchTime: MealTime;
  dinnerTime: MealTime;
  advanceNoticeHours: number;
  worstProteinId: number | null;
  // Copy of the chosen protein's name, see services/preferences.
  worstProteinName: string | null;
  worstProteinKey: string | null;
};

export type Protein = {
  id: number;
  name: string;
  normalizedName: string;
  firstSeenWeek: string | null;
};

type Props = {
  // 'setup' is the one-time screen on first launch; 'edit' is reached from
  // the menu's "Editar" button and can be cancelled.
  mode: 'setup' | 'edit';
  colors: ColorTokens;
  initial: Preferences;
  proteins: Protein[];
  proteinsLoading: boolean;
  proteinsError: string | null;
  // Week key of the loaded menu, to tag the dishes it added to the list.
  currentWeekKey: string | null;
  onRetryProteins: () => void;
  onSave: (prefs: Preferences) => Promise<void>;
  onCancel?: () => void;
};

const MINUTE_STEP = 5;

function stepHour(hour: number, delta: number) {
  return (hour + delta + 24) % 24;
}

// Moves to the next/previous multiple of MINUTE_STEP, wrapping around the hour.
function stepMinute(minute: number, delta: 1 | -1) {
  const floored = Math.floor(minute / MINUTE_STEP) * MINUTE_STEP;
  if (delta > 0) {
    return (floored + MINUTE_STEP) % 60;
  }
  return floored !== minute ? floored : (floored - MINUTE_STEP + 60) % 60;
}

export function PreferencesScreen({
  mode,
  colors,
  initial,
  proteins,
  proteinsLoading,
  proteinsError,
  currentWeekKey,
  onRetryProteins,
  onSave,
  onCancel,
}: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [lunchTime, setLunchTime] = useState(initial.lunchTime);
  const [dinnerTime, setDinnerTime] = useState(initial.dinnerTime);
  const [advanceNoticeHours, setAdvanceNoticeHours] = useState(initial.advanceNoticeHours);
  const [worstProteinId, setWorstProteinId] = useState(initial.worstProteinId);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollViewInstance>(null);
  // onLayout's y is relative to the parent, so the search field's offset in
  // the scroll content is its section's y plus its own y in the section.
  const worstSectionY = useRef(0);
  const searchY = useRef(0);

  const listed = proteins.find(p => p.id === worstProteinId) ?? null;
  // While the list can't be read, the saved choice (still `initial`'s) stays.
  const selectedProtein: Protein | null =
    listed ??
    (worstProteinId !== null &&
    worstProteinId === initial.worstProteinId &&
    initial.worstProteinKey
      ? {
          id: worstProteinId,
          name: initial.worstProteinName ?? initial.worstProteinKey,
          normalizedName: initial.worstProteinKey,
          firstSeenWeek: null,
        }
      : null);
  const normalizedQuery = normalizeDishName(query);
  const visibleProteins = normalizedQuery
    ? proteins.filter(p => p.normalizedName.includes(normalizedQuery))
    : proteins;

  // The worst dish is required, except when the list itself can't be loaded:
  // then the user can still get their meal notifications.
  const listUnavailable = !!proteinsError && !proteins.length;
  const canSave = !saving && (!!selectedProtein || listUnavailable);

  const handleSave = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({
        lunchTime,
        dinnerTime,
        advanceNoticeHours,
        worstProteinId: selectedProtein?.id ?? null,
        worstProteinName: selectedProtein?.name ?? null,
        worstProteinKey: selectedProtein?.normalizedName ?? null,
      });
    } catch (e: any) {
      setSaveError(e?.message ?? 'Não foi possível salvar as preferências.');
      setSaving(false);
    }
  };

  const renderTimeRow = (
    label: string,
    mealName: string,
    time: MealTime,
    setTime: (t: MealTime) => void,
  ) => (
    <View style={styles.timeRow}>
      <Text style={styles.timeRowLabel}>{label}</Text>
      <View style={styles.timeControls}>
        <Stepper
          styles={styles}
          value={String(time.hour).padStart(2, '0')}
          decLabel={`Hora do aviso de ${mealName} mais cedo`}
          incLabel={`Hora do aviso de ${mealName} mais tarde`}
          onDec={() => setTime({...time, hour: stepHour(time.hour, -1)})}
          onInc={() => setTime({...time, hour: stepHour(time.hour, 1)})}
        />
        <Text style={styles.timeColon}>:</Text>
        <Stepper
          styles={styles}
          value={String(time.minute).padStart(2, '0')}
          decLabel={`Minutos do aviso de ${mealName} mais cedo`}
          incLabel={`Minutos do aviso de ${mealName} mais tarde`}
          onDec={() => setTime({...time, minute: stepMinute(time.minute, -1)})}
          onInc={() => setTime({...time, minute: stepMinute(time.minute, 1)})}
        />
      </View>
    </View>
  );

  return (
    // The app draws edge-to-edge, so Android no longer shrinks the window for
    // the keyboard; the padding keeps the search field and results above it.
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.kicker}>
            {mode === 'setup' ? 'Primeiro acesso' : 'Preferências'}
          </Text>
          <Text style={styles.title}>
            {mode === 'setup' ? 'Como você quer ser avisado?' : 'Seus avisos'}
          </Text>
          <Text style={styles.intro}>
            {mode === 'setup'
              ? 'Escolha os horários das notificações do cardápio e o prato que você não quer encarar. Dá para mudar tudo depois em “Editar”.'
              : 'Mude os horários, a antecedência do aviso ou o seu pior cardápio.'}
          </Text>
          <View style={styles.ruleOrn}>
            <View style={styles.ruleLine} />
            <Text style={styles.ruleStar}>✦</Text>
            <View style={styles.ruleLine} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Horário dos avisos</Text>
          <Text style={styles.sectionHint}>
            Todo dia útil, o cardápio da refeição chega nesse horário. Na
            segunda, o cardápio só sai às 10h: um aviso marcado antes disso
            chega quando ele for baixado.
          </Text>
          <View style={styles.card}>
            {renderTimeRow('Almoço', 'almoço', lunchTime, setLunchTime)}
            <View style={styles.cardDivider} />
            {renderTimeRow('Janta', 'janta', dinnerTime, setDinnerTime)}
          </View>
          <Text style={styles.footnote}>
            O RU06 serve almoço das 11:00 às 14:00 e janta das 17:30 às 19:00.
          </Text>
        </View>

        <View
          style={styles.section}
          onLayout={e => {
            worstSectionY.current = e.nativeEvent.layout.y;
          }}>
          <Text style={styles.sectionLabel}>Pior cardápio</Text>
          <Text style={styles.sectionHint}>
            Quando ele aparecer na semana, você recebe um alerta. A lista cresce
            sozinha: toda segunda-feira os pratos principais novos entram nela.
          </Text>

          {selectedProtein && (
            <View style={styles.selectedNote}>
              <Text style={styles.selectedNoteLabel}>Escolhido</Text>
              <Text style={styles.selectedNoteName}>{selectedProtein.name}</Text>
              {!listed && (
                <Text style={styles.selectedNoteHint}>
                  A lista está indisponível agora; sua escolha continua salva.
                </Text>
              )}
            </View>
          )}

          <View
            onLayout={e => {
              searchY.current = e.nativeEvent.layout.y;
            }}>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              onFocus={() =>
                scrollRef.current?.scrollTo({
                  y: Math.max(0, worstSectionY.current + searchY.current - 12),
                  animated: true,
                })
              }
              placeholder="Buscar prato…"
              placeholderTextColor={colors.textFaint}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel="Buscar prato na lista"
            />
          </View>

          <View style={styles.card}>
            {proteinsLoading && (
              <View style={styles.listStatus}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.listStatusText}>
                  Atualizando a lista com o cardápio desta semana…
                </Text>
              </View>
            )}
            {!!proteinsError && (
              <View style={styles.listStatus}>
                <Text style={styles.listStatusText}>{proteinsError}</Text>
                <TouchableOpacity onPress={onRetryProteins} activeOpacity={0.8}>
                  <Text style={styles.linkText}>Tentar de novo</Text>
                </TouchableOpacity>
              </View>
            )}
            {!proteinsLoading && !proteinsError && !visibleProteins.length && (
              <View style={styles.listStatus}>
                <Text style={styles.listStatusText}>
                  {query ? `Nenhum prato com “${query}”.` : 'A lista ainda está vazia.'}
                </Text>
              </View>
            )}
            {visibleProteins.map((protein, i) => {
              const selected = protein.id === worstProteinId;
              const isNew = !!currentWeekKey && protein.firstSeenWeek === currentWeekKey;
              return (
                <TouchableOpacity
                  key={protein.id}
                  style={[
                    styles.option,
                    i > 0 && styles.optionDivider,
                    selected && styles.optionSelected,
                  ]}
                  onPress={() => setWorstProteinId(protein.id)}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{checked: selected}}
                  accessibilityLabel={protein.name}>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected && <View style={styles.radioDot} />}
                  </View>
                  <Text
                    style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {protein.name}
                  </Text>
                  {isNew && <Text style={styles.newTag}>Novo</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Aviso antecipado</Text>
          <Text style={styles.sectionHint}>
            Quanto tempo antes da refeição com o pior cardápio chega o alerta.
          </Text>
          <View style={[styles.card, styles.advanceCard]}>
            <Stepper
              styles={styles}
              value={`${advanceNoticeHours}h`}
              wide
              decLabel="Diminuir antecedência do aviso"
              incLabel="Aumentar antecedência do aviso"
              decDisabled={advanceNoticeHours <= ADVANCE_NOTICE_MIN_HOURS}
              incDisabled={advanceNoticeHours >= ADVANCE_NOTICE_MAX_HOURS}
              onDec={() =>
                setAdvanceNoticeHours(h => Math.max(ADVANCE_NOTICE_MIN_HOURS, h - 1))
              }
              onInc={() =>
                setAdvanceNoticeHours(h => Math.min(ADVANCE_NOTICE_MAX_HOURS, h + 1))
              }
            />
            <Text style={styles.advanceText}>antes da refeição</Text>
          </View>
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            Avisos às {formatTime(lunchTime)} (almoço) e {formatTime(dinnerTime)}{' '}
            (janta).{' '}
            {selectedProtein
              ? `Alerta ${advanceNoticeHours}h antes de cada refeição com ${selectedProtein.name}.`
              : canSave
              ? 'Sem pior cardápio por enquanto.'
              : 'Escolha o seu pior cardápio para continuar.'}
          </Text>
        </View>

        {!!saveError && (
          <View style={styles.errorNote}>
            <Text style={styles.errorNoteText}>{saveError}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryBtn, !canSave && styles.primaryBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{disabled: !canSave}}>
          <Text style={styles.primaryBtnText}>
            {saving ? 'Salvando…' : mode === 'setup' ? 'Salvar e começar' : 'Salvar alterações'}
          </Text>
        </TouchableOpacity>

        {mode === 'edit' && onCancel && (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onCancel}
            disabled={saving}
            activeOpacity={0.8}
            accessibilityRole="button">
            <Text style={styles.secondaryBtnText}>Cancelar</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type StepperProps = {
  styles: ReturnType<typeof createStyles>;
  value: string;
  wide?: boolean;
  decLabel: string;
  incLabel: string;
  decDisabled?: boolean;
  incDisabled?: boolean;
  onDec: () => void;
  onInc: () => void;
};

function Stepper({
  styles,
  value,
  wide,
  decLabel,
  incLabel,
  decDisabled,
  incDisabled,
  onDec,
  onInc,
}: StepperProps) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        style={[styles.stepBtn, decDisabled && styles.stepBtnDisabled]}
        onPress={onDec}
        disabled={decDisabled}
        activeOpacity={0.7}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={decLabel}>
        <Text style={styles.stepBtnText}>−</Text>
      </TouchableOpacity>
      <Text style={[styles.stepValue, wide && styles.stepValueWide]}>{value}</Text>
      <TouchableOpacity
        style={[styles.stepBtn, incDisabled && styles.stepBtnDisabled]}
        onPress={onInc}
        disabled={incDisabled}
        activeOpacity={0.7}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={incLabel}>
        <Text style={styles.stepBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    flex: {flex: 1},
    scrollContent: {padding: 20, paddingBottom: 40},

    header: {paddingBottom: 4},
    kicker: {
      fontSize: 11.5,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: colors.olive,
    },
    title: {
      fontFamily: SERIF_FONT,
      fontWeight: '700',
      fontSize: 26,
      lineHeight: 31,
      letterSpacing: -0.3,
      color: colors.text,
      marginTop: 4,
    },
    intro: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSoft,
      marginTop: 10,
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

    section: {marginTop: 22},
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: colors.accent,
    },
    sectionHint: {
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.textSoft,
      marginTop: 4,
      marginBottom: 10,
    },
    footnote: {
      fontFamily: SERIF_FONT,
      fontStyle: 'italic',
      fontSize: 11.5,
      color: colors.textFaint,
      marginTop: 8,
    },

    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      overflow: 'hidden',
    },
    cardDivider: {
      borderTopWidth: 1,
      borderStyle: 'dashed',
      borderTopColor: colors.border,
      marginHorizontal: 16,
    },

    // Wraps the steppers under the label when they don't fit beside it
    // (narrow screens, large font or display size).
    timeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      rowGap: 8,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    timeRowLabel: {
      fontFamily: SERIF_FONT,
      fontWeight: '600',
      fontSize: 17,
      color: colors.text,
      marginRight: 8,
    },
    timeControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginLeft: 'auto',
    },
    timeColon: {
      fontFamily: SERIF_FONT,
      fontWeight: '700',
      fontSize: 20,
      color: colors.textSoft,
    },

    stepper: {flexDirection: 'row', alignItems: 'center', gap: 6},
    stepBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnDisabled: {opacity: 0.35},
    stepBtnText: {
      fontSize: 17,
      fontWeight: '600',
      lineHeight: 20,
      color: colors.text,
    },
    stepValue: {
      fontFamily: SERIF_FONT,
      fontWeight: '700',
      fontSize: 20,
      minWidth: 28,
      textAlign: 'center',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    stepValueWide: {minWidth: 48},

    selectedNote: {
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 8,
      padding: 12,
      marginBottom: 10,
      gap: 2,
    },
    selectedNoteLabel: {
      fontSize: 10.5,
      fontWeight: '600',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.fishText,
      opacity: 0.75,
    },
    selectedNoteName: {
      fontFamily: SERIF_FONT,
      fontWeight: '700',
      fontSize: 16,
      color: colors.fishText,
    },
    selectedNoteHint: {
      fontSize: 11.5,
      color: colors.fishText,
      opacity: 0.8,
      marginTop: 2,
    },

    search: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 9,
      fontSize: 13.5,
      color: colors.text,
      marginBottom: 10,
    },

    listStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    listStatusText: {
      fontSize: 12.5,
      color: colors.textSoft,
      flexShrink: 1,
    },
    linkText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.accent,
    },

    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    optionDivider: {borderTopWidth: 1, borderTopColor: colors.border},
    optionSelected: {backgroundColor: colors.accentSoft},
    radio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: {borderColor: colors.accent},
    radioDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent,
    },
    optionText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    optionTextSelected: {fontWeight: '700', color: colors.fishText},
    newTag: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.olive,
      borderWidth: 1,
      borderColor: colors.olive,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2,
      overflow: 'hidden',
    },

    advanceCard: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    advanceText: {
      fontFamily: SERIF_FONT,
      fontStyle: 'italic',
      fontSize: 14,
      color: colors.textSoft,
      flexShrink: 1,
    },

    summary: {
      marginTop: 24,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.borderStrong,
    },
    summaryText: {
      fontFamily: SERIF_FONT,
      fontStyle: 'italic',
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSoft,
    },

    errorNote: {
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 10,
      padding: 12,
      marginTop: 14,
    },
    errorNoteText: {fontSize: 12.5, color: colors.text, lineHeight: 18},

    primaryBtn: {
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 18,
    },
    primaryBtnDisabled: {opacity: 0.4},
    primaryBtnText: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.bg,
    },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 999,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 10,
    },
    secondaryBtnText: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.text,
    },
  });
}
