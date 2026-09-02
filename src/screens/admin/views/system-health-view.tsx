import {Pressable, Text, View} from 'react-native';

import {MaterialIcon} from '@/screens/native/user/user-ui';
import {AdminCard, C, Empty, Row, SectionHead, date, items, number, styles as ui, text} from '../admin-ui';
import type {AdminViewProps} from './view-props';

type Props = AdminViewProps & {onLogout: () => void};

export default function AdminSystemHealthView({data, onLogout, reload}: Props) {
  const list = items(data.systemStatus);

  return (
    <>
      <Pressable onPress={() => { reload(); }} style={({pressed}) => [ui.refreshButton, pressed && ui.pressed]}>
        <MaterialIcon color={C.pine} name="refresh" size={16} />
        <Text style={ui.refreshButtonText}>รีเฟรชสถานะ</Text>
      </Pressable>

      <AdminCard>
        <SectionHead meta={`${list.length} บริการ`} title="สถานะบริการ" />
        {list.length ? list.map((item) => {
          const status = text(item.status);
          const icon = status === 'operational' ? 'check_circle' : status === 'degraded' ? 'warning' : 'error';
          const tone = status === 'operational' ? 'green' : status === 'degraded' ? 'amber' : 'red';
          const label = status === 'operational' ? 'พร้อมใช้งาน' : status === 'degraded' ? 'ประสิทธิภาพลดลง' : 'ขัดข้อง';
          const dotStyle = status === 'operational' ? ui.statusOperational : status === 'degraded' ? ui.statusDegraded : ui.statusOutage;
          const checkedAt = item.checkedAt ? ` · ตรวจสอบเมื่อ ${date(item.checkedAt)}` : '';
          return (
            <Row
              detail={`${text(item.detail)} · ${number(item.latencyMs)} ms${checkedAt}`}
              icon={icon}
              key={text(item.id, text(item.name))}
              title={text(item.name)}
              tone={tone}
            >
              <View style={{alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 6}}>
                <View style={[ui.colorDot, dotStyle]} />
                <Text style={[ui.rowSide, {color: tone === 'amber' ? C.amber : tone === 'red' ? C.red : C.sage}]}>{label}</Text>
              </View>
            </Row>
          );
        }) : <Empty label="กำลังตรวจสอบสถานะระบบ" />}
      </AdminCard>

      <Pressable onPress={onLogout} style={({pressed}) => [ui.logout, pressed && ui.pressed]}>
        <MaterialIcon color={C.red} name="logout" size={19} />
        <Text style={ui.logoutText}>ออกจากระบบ Admin</Text>
      </Pressable>
    </>
  );
}
