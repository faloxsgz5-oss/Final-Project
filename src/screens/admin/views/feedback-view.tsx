import {Text, View} from 'react-native';

import {AdminCard, C, Empty, KindBadge, Row, SectionHead, date, items, styles as ui, text} from '../admin-ui';
import type {AdminViewProps} from './view-props';

const TYPE_BADGES: Record<string, [string, string]> = {
  ai: ['AI', 'purple'],
  'expense-category': ['หมวดการเงิน', 'rose'],
  other: ['อื่นๆ', 'muted'],
  'schedule-scan': ['ตารางเรียน', 'green'],
};

export default function AdminFeedbackView({data}: AdminViewProps) {
  const list = items(data.feedback);

  return (
    <AdminCard>
      <SectionHead meta={`${list.length} รายการ`} title="ความคิดเห็นจากผู้ใช้" />
      {list.length ? list.map((item) => (
        <Row detail={date(item.createdAt)} icon="forum" key={text(item.id)} title={text(item.message)}>
          <View style={{alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 8}}>
            <KindBadge kind={text(item.type)} mapping={TYPE_BADGES} />
            <Text style={[ui.rowSide, {color: C.muted}]}>{text(item.status)}</Text>
          </View>
        </Row>
      )) : <Empty label="ยังไม่มี Feedback" />}
    </AdminCard>
  );
}
