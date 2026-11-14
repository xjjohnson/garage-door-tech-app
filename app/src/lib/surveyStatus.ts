/**
 * What the last tries at using Odoo surveys did (saving inspection answers,
 * reading the checklist), so the Inspection checklists screen can say why
 * nothing showed up or changed. Kept on the phone across restarts. Kept free
 * of React.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SurveyStatus {
  at: number;
  ok: boolean;
  text: string;
}

function channel(key: string) {
  let current: SurveyStatus | null = null;
  const listeners = new Set<() => void>();
  const tell = () => listeners.forEach((l) => l());
  return {
    get: () => current,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    set(s: SurveyStatus) {
      current = s;
      tell();
      AsyncStorage.setItem(key, JSON.stringify(s)).catch(() => undefined);
    },
    async load() {
      try {
        const d = JSON.parse((await AsyncStorage.getItem(key)) ?? 'null') as Partial<SurveyStatus> | null;
        if (d && typeof d.at === 'number' && typeof d.text === 'string' && !current) {
          current = { at: d.at, ok: d.ok === true, text: d.text };
          tell();
        }
      } catch {
        // Nothing saved.
      }
    },
  };
}

const answers = channel('johnsons.surveySync.last');
const list = channel('johnsons.checklistSync.last');

export const getSurveyStatus = answers.get;
export const subscribeSurveyStatus = answers.subscribe;
export const setSurveyStatus = answers.set;
export const getChecklistStatus = list.get;
export const subscribeChecklistStatus = list.subscribe;
export const setChecklistStatus = list.set;
export const loadSurveyStatus = () => Promise.all([answers.load(), list.load()]).then(() => undefined);
