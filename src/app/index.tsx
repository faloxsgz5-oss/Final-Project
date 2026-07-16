import { Href, Redirect } from 'expo-router';

export default function IndexScreen() {
  return <Redirect href={'/login/login' as Href} />;
}
