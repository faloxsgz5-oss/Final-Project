import {Text} from 'react-native';

import {Card, PrimaryButton, UserHeader, UserShell, type UserNavigate, userStyles as styles} from './user-ui';

const titleFor = (page: string) => page === 'smartlife_app_tab' ? 'เมนู SmartLife' : page.includes('register') ? 'สมัครสมาชิก' : 'SmartLife';

export default function MiscScreen({page, onNavigate}: {page: string; onNavigate: UserNavigate}) {
  return <UserShell onNavigate={onNavigate}><UserHeader onNavigate={onNavigate} title={titleFor(page)} subtitle="หน้าจอ React Native" /><Card><Text style={styles.cardTitle}>กำลังย้ายหน้าจอนี้เป็น Native</Text><Text style={styles.bodyText}>โครงหน้าจอหลักและข้อมูล Firebase ถูกย้ายออกจาก HTML แล้ว หน้านี้จะใช้ component กลางเพื่อให้ทีมต่อยอดได้โดยไม่ต้องแก้โค้ด WebView</Text><PrimaryButton label="กลับหน้าหลัก" onPress={() => onNavigate('index')} /></Card></UserShell>;
}
