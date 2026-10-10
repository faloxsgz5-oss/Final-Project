import { Href, Redirect } from 'expo-router';
import Head from 'expo-router/head';
import { Platform } from 'react-native';

import { APP_NAME } from '@/lib/page-titles';

export default function IndexScreen() {
  // The bare domain only redirects, but its exported HTML is what a first
  // visit loads, so it carries the app's name rather than an empty title.
  return <>
    {Platform.OS === 'web' ? <Head><title>{APP_NAME}</title><link href="/favicon.ico" rel="icon" /></Head> : null}
    <Redirect href={'/login/login' as Href} />
  </>;
}
