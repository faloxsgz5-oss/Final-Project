import {useMemo, useState} from 'react';
import {Text, View} from 'react-native';

import {AdminCard, C, Empty, Pill, Row, SectionHead, date, items, number, styles as ui, text} from '../admin-ui';
import type {AdminViewProps} from './view-props';

type Filter = 'all' | 'receipt' | 'schedule' | 'review';

export default function AdminOcrLogsView({data}: AdminViewProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const list = useMemo(() => items(data.scanLogs), [data.scanLogs]);

  const filtered = useMemo(() => list.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'review') return item.needsReview === true || item.status === 'failed';
    return item.kind === filter;
  }), [filter, list]);

  return (
    <AdminCard>
      <SectionHead meta={`${filtered.length} / ${list.length} รายการ`} title="ประวัติ OCR ทั้งระบบ" />
      <View style={ui.pillRow}>
        <Pill label="ทั้งหมด" onPress={() => setFilter('all')} selected={filter === 'all'} />
        <Pill label="ใบเสร็จ" onPress={() => setFilter('receipt')} selected={filter === 'receipt'} />
        <Pill label="ตารางเรียน" onPress={() => setFilter('schedule')} selected={filter === 'schedule'} />
        <Pill color={C.red} label="ต้องตรวจสอบ" onPress={() => setFilter('review')} selected={filter === 'review'} />
      </View>

      {filtered.length ? filtered.map((item) => {
        const status = text(item.status);
        const statusColor = status === 'completed' ? C.sage
          : status === 'failed' ? C.red
            : status === 'processing' ? '#6572b1' : C.muted;
        const provider = text(item.provider, 'unknown');
        const providerBackground = provider.startsWith('iapp') ? C.amber
          : provider.startsWith('google-vision') ? '#6572b1' : C.muted;
        const providerLabel = provider.startsWith('iapp') ? 'iApp'
          : provider.startsWith('google-vision') ? 'Google Vision' : 'Fallback';
        const confidence = item.ocrConfidence ?? item.confidence;

        return (
          <Row
            detail={`${text(item.extractedText)} · ${date(item.createdAt)}`}
            icon={item.kind === 'receipt' ? 'receipt_long' : 'document_scanner'}
            key={text(item.id)}
            title={item.kind === 'receipt' ? 'สแกนใบเสร็จ' : 'สแกนตารางเรียน'}
          >
            <View style={{alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8}}>
              <View style={[ui.providerBadge, {backgroundColor: providerBackground}]}>
                <Text style={[ui.providerBadgeText, {color: '#fff'}]}>{providerLabel}</Text>
              </View>
              <Text style={[ui.rowSide, {color: statusColor}]}>{status}</Text>
              {confidence !== undefined ? (
                <Text style={ui.confidenceText}>ความแม่นยำ {number(Number(confidence) * 100)}%</Text>
              ) : null}
              {item.needsReview ? (
                <View style={[ui.providerBadge, {backgroundColor: C.red}]}>
                  <Text style={[ui.providerBadgeText, {color: '#fff'}]}>ต้องตรวจสอบ</Text>
                </View>
              ) : null}
            </View>
          </Row>
        );
      }) : <Empty label="ยังไม่มี OCR Log" />}
    </AdminCard>
  );
}
