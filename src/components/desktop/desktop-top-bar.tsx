import {StyleSheet, Text, View} from 'react-native';

import {APP_NAME, screenName} from '@/lib/page-titles';

import {DESKTOP_C, DESKTOP_F, TOP_BAR_HEIGHT} from './desktop-theme';

/**
 * The bar above the content: the page's name, nothing else. Add, the bell and
 * the profile all live in the sidebar (เพิ่ม, การแจ้งเตือน with its badge,
 * โปรไฟล์), so a second copy up here only repeated them. `page` is the screen
 * the title names -- for the planner, the one its open tab stands for.
 */
export function DesktopTopBar({page, title: given}: {page: string; title?: string}) {
  // Another shell (the admin portal) names its own pages; the User shell's come from page-titles.
  const title = given ?? screenName('user', page) ?? APP_NAME;
  return (
    <View style={styles.bar}>
      <Text numberOfLines={1} style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.72)', borderBottomWidth: 1, borderColor: DESKTOP_C.border, flexDirection: 'row', height: TOP_BAR_HEIGHT, paddingHorizontal: 28},
  title: {color: DESKTOP_C.pine, flex: 1, fontFamily: DESKTOP_F.b, fontSize: 24},
});
