import AsyncStorage from '@react-native-async-storage/async-storage';
import {createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState} from 'react';

import {useAuth} from '@/providers/auth-provider';
import type {InstitutionType} from '@/types/institution';

const storageKey = (uid?: string) => `@smartlife/institution-type/${uid ?? 'guest'}`;

type InstitutionContextValue = {
  institutionType: InstitutionType | null;
  loadingInstitution: boolean;
  setInstitutionType: (value: InstitutionType) => Promise<void>;
};

const InstitutionContext = createContext<InstitutionContextValue | undefined>(undefined);

export function InstitutionProvider({children}: PropsWithChildren) {
  const {user} = useAuth();
  const ownerKey = user?.uid ?? 'guest';
  const [preference, setPreference] = useState<{ownerKey: string; value: InstitutionType | null} | null>(null);
  const institutionType = preference?.ownerKey === ownerKey ? preference.value : null;
  const loadingInstitution = preference?.ownerKey !== ownerKey;

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey(user?.uid))
      .then((stored) => {
        if (!active) return;
        const value = stored === 'university' || stored === 'high-school' ? stored : null;
        setPreference({ownerKey, value});
      });
    return () => {
      active = false;
    };
  }, [ownerKey, user?.uid]);

  const value = useMemo<InstitutionContextValue>(() => ({
    institutionType,
    loadingInstitution,
    setInstitutionType: async (next) => {
      setPreference({ownerKey, value: next});
      await AsyncStorage.setItem(storageKey(user?.uid), next);
    },
  }), [institutionType, loadingInstitution, ownerKey, user?.uid]);

  return <InstitutionContext.Provider value={value}>{children}</InstitutionContext.Provider>;
}

export function useInstitution() {
  const value = useContext(InstitutionContext);
  if (!value) throw new Error('useInstitution must be used inside InstitutionProvider.');
  return value;
}
