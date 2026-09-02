import {Text, View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';

import {MaterialIcon} from '@/screens/native/user/user-ui';
import {AdminCard, Empty, KindBadge, Row, SectionHead, items, strings, styles as ui, text} from '../admin-ui';
import type {AdminViewProps} from './view-props';

const KIND_BADGES: Record<string, [string, string]> = {
  burnout: ['Burnout', 'rose'],
  finance: ['Finance', 'amber'],
  note: ['Note', 'green'],
  priority: ['Priority', 'purple'],
  schedule: ['Schedule', 'green'],
};

const STATUS_BADGES: Record<string, [string, string]> = {
  accepted: ['ยอมรับแล้ว', 'purple'],
  dismissed: ['ละทิ้ง', 'muted'],
  new: ['ใหม่', 'green'],
};

export default function AdminAiKnowledgeView({data}: AdminViewProps) {
  const list = items(data.recommendations);

  return (
    <>
      <LinearGradient colors={['#777da5', '#9297bb']} style={ui.insight}>
        <MaterialIcon color="#fff" name="psychology" size={29} />
        <View style={{flex: 1}}>
          <Text style={ui.insightTitle}>AI Context Audit</Text>
          <Text style={ui.insightSub}>ตรวจสอบว่าคำแนะนำอ้างอิงข้อมูลใดบ้าง</Text>
        </View>
      </LinearGradient>

      <AdminCard>
        <SectionHead meta={`${list.length} รายการ`} title="คำแนะนำจาก AI" />
        {list.length ? list.map((item) => (
          <Row
            detail={`แหล่งข้อมูล: ${strings(item.contextSources).join(', ') || 'ไม่ระบุ'}`}
            icon="auto_awesome"
            key={text(item.id)}
            title={text(item.title)}
            tone="purple"
          >
            <Text style={[ui.rowDetail, {color: '#6572b1', marginTop: 6}]}>{text(item.explanation)}</Text>
            <View style={{alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 8}}>
              <KindBadge kind={text(item.kind, 'priority')} mapping={KIND_BADGES} />
              <KindBadge kind={text(item.status, 'new')} mapping={STATUS_BADGES} />
            </View>
          </Row>
        )) : <Empty label="ยังไม่มี AI Recommendation" />}
      </AdminCard>
    </>
  );
}
