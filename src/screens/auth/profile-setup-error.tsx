import {useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {BrandLogo} from '@/components/brand-logo';
import {ResponsiveSafeArea} from '@/components/layout/responsive-safe-area';
import {Touchable} from '@/components/touchable';
import {MaterialIcon} from '@/screens/native/user/user-ui';

const C = {danger: '#bd625b', green: '#4e704a', muted: '#6f786b', pine: '#2c341b', soft: '#f4f5ef'};
const F = {b: 'Prompt_700Bold', m: 'Prompt_500Medium', r: 'Prompt_400Regular', x: 'Prompt_800ExtraBold'};

/**
 * Shown when an account exists but its profile document could not be written
 * even after retrying (USER-001). It replaces the old behaviour -- deleting the
 * new account and dropping the person on an empty login form -- with a clear
 * message, a retry, and a way out. The account is never removed from here.
 */
export function ProfileSetupErrorScreen({onLogout, onRetry}: {onLogout: () => Promise<void>; onRetry: () => Promise<void>}) {
  const [working, setWorking] = useState<'logout' | 'retry' | null>(null);
  const run = (kind: 'logout' | 'retry', action: () => Promise<void>) => async () => {
    if (working) return;
    setWorking(kind);
    try { await action(); } finally { setWorking(null); }
  };
  return (
    <ResponsiveSafeArea style={styles.safe}>
      <View style={styles.center}>
        <View style={styles.card}>
          <BrandLogo size={64} style={styles.logo} />
          <View style={styles.iconRow}><MaterialIcon color={C.danger} name="cloud_off" size={22} /><Text accessibilityRole="header" style={styles.title}>ตั้งค่าบัญชียังไม่เสร็จ</Text></View>
          <Text style={styles.body}>บัญชีของคุณถูกสร้างแล้วและยังอยู่ครบ แต่ระบบบันทึกข้อมูลโปรไฟล์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วกด “ลองใหม่”</Text>
          <Text style={styles.note}>ถ้ายังไม่สำเร็จ ออกจากระบบแล้วเข้าสู่ระบบใหม่ได้เลย ระบบจะสร้างโปรไฟล์ให้อัตโนมัติ</Text>
          <Touchable accessibilityLabel="ลองตั้งค่าบัญชีใหม่" accessibilityRole="button" disabled={Boolean(working)} onPress={run('retry', onRetry)} style={({pressed}) => [styles.primary, pressed && styles.pressed, working && styles.disabled]}>
            {working === 'retry' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>ลองใหม่</Text>}
          </Touchable>
          <Touchable accessibilityLabel="ออกจากระบบ" accessibilityRole="button" disabled={Boolean(working)} onPress={run('logout', onLogout)} style={({pressed}) => [styles.secondary, pressed && styles.pressed, working && styles.disabled]}>
            {working === 'logout' ? <ActivityIndicator color={C.green} /> : <Text style={styles.secondaryText}>ออกจากระบบ</Text>}
          </Touchable>
        </View>
      </View>
    </ResponsiveSafeArea>
  );
}

const styles = StyleSheet.create({
  body: {color: C.pine, fontFamily: F.m, fontSize: 14, lineHeight: 22, marginTop: 10},
  card: {backgroundColor: '#fff', borderRadius: 24, boxShadow: '0 12px 24px rgba(44,52,27,.1)', maxWidth: 440, padding: 24, width: '100%'},
  center: {alignItems: 'center', flex: 1, justifyContent: 'center', padding: 16},
  disabled: {opacity: .62},
  iconRow: {alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 14},
  logo: {alignSelf: 'flex-start'},
  note: {color: C.muted, fontFamily: F.r, fontSize: 12, lineHeight: 19, marginTop: 8},
  pressed: {opacity: .85},
  primary: {alignItems: 'center', backgroundColor: C.green, borderRadius: 14, justifyContent: 'center', marginTop: 20, minHeight: 50},
  primaryText: {color: '#fff', fontFamily: F.b, fontSize: 15},
  safe: {backgroundColor: C.soft, flex: 1},
  secondary: {alignItems: 'center', borderColor: '#d6dccf', borderRadius: 14, borderWidth: 1, justifyContent: 'center', marginTop: 10, minHeight: 48},
  secondaryText: {color: C.green, fontFamily: F.b, fontSize: 14},
  title: {color: C.pine, fontFamily: F.x, fontSize: 20},
});
