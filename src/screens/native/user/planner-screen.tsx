import {useLocalSearchParams, useRouter} from 'expo-router';
import Head from 'expo-router/head';
import {useCallback} from 'react';
import {Platform} from 'react-native';

import {pageTitle} from '@/lib/page-titles';
import {PLANNER_TAB_PAGE, PLANNER_TAB_PARAM, plannerTab, type PlannerTab} from '@/lib/planner-tabs';

import CalendarScreen from './calendar-screen';
import AdaptiveSchedulingScreen from './adaptive-scheduling-screen';
import NotesScreen from './notes-screen';
import type {UserNavigate} from './user-ui';

export type {PlannerTab} from '@/lib/planner-tabs';

// Added for Merged Planner: one tab switcher wraps the existing Firebase-backed views.
//
// The open tab is the route's `?tab=` (see `@/lib/planner-tabs`), not local
// state, so the desktop sidebar and title can follow it, and a reload or
// Back lands on the same tab. Switching rewrites the current history entry
// rather than adding one: the tabs are views of one page, so Back leaves the
// page instead of stepping through every tab tapped on it.
export default function PlannerScreen({uid, onNavigate, initialTab = 'calendar'}: {uid: string; onNavigate: UserNavigate; initialTab?: PlannerTab}) {
  const router = useRouter();
  const {page, tab} = useLocalSearchParams<{page?: string; tab?: string}>();
  const activeTab = tab ? plannerTab(page, tab) : initialTab;
  const onTabChange = useCallback((next: PlannerTab) => router.setParams({tab: PLANNER_TAB_PARAM[next]}), [router]);
  const planner = {activeTab, onTabChange};

  // The switcher changes what is on screen without changing the route, so the
  // planner names its own tab in the browser title -- the same name the
  // desktop top bar shows. Its Head sits below the route's, so it wins.
  const title = Platform.OS === 'web' ? <Head><title>{pageTitle('user', PLANNER_TAB_PAGE[activeTab])}</title></Head> : null;

  if (activeTab === 'calendar') return <>{title}<CalendarScreen onNavigate={onNavigate} page="smartlife_calendar_day" planner={planner} uid={uid} /></>;
  if (activeTab === 'notes') return <>{title}<NotesScreen onNavigate={onNavigate} page="smartlife_notes" planner={planner} uid={uid} /></>;
  return <>{title}<AdaptiveSchedulingScreen onNavigate={onNavigate} planner={planner} uid={uid} /></>;
}
