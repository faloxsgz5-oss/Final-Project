import { useEffect, useRef } from 'react';

import {withLegacyDataBridge} from '@/lib/legacy-data-bridge';
import type {LegacyDataAction} from '@/services/legacy-data';
import type { LegacyAuthRequest, LegacyAuthResult, LegacyOcrResult, LegacyScanRequest, LegacyScanResult } from './legacy-page-dom';

type LegacyPageDomProps = {
  html: string;
  onAuthenticate: (request: LegacyAuthRequest) => Promise<LegacyAuthResult>;
  onBack: () => Promise<void>;
  onNavigate: (href: string) => Promise<void>;
  onScan?: (request: LegacyScanRequest) => Promise<LegacyScanResult>;
  scanResult?: LegacyOcrResult | null;
  onDataRequest?: (pageKey: string) => Promise<unknown>;
  onDataAction?: (pageKey: string, request: LegacyDataAction) => Promise<unknown>;
  dom?: unknown;
};

function withScanBridge(html: string, scanType?: LegacyScanRequest['scanType']) {
  if (!scanType) return html;
  const prepared = html
    .replace(/(<a class="small-control" href=")[^"]+(" aria-label=)/, '$1#smartlife-library$2')
    .replace(/(<a class="shutter" href=")[^"]+(" aria-label=)/, '$1#smartlife-camera$2');
  const script = `<script data-smartlife-native-scan>(()=>{const send=(payload)=>window.__smartlifeSend?.(payload);const bind=(selector,source)=>document.querySelector(selector)?.addEventListener('click',(event)=>{event.preventDefault();event.stopImmediatePropagation();send({type:'smartlife:scan',scanType:'${scanType}',source})},true);bind('.controls .small-control:not(.google-control)','library');bind('.controls .shutter','camera');window.addEventListener('message',(event)=>{const data=event.data;if(data?.type==='smartlife:scan-result'&&!data.ok&&!data.canceled)alert(data.message||'ไม่สามารถอ่านรูปนี้ได้ กรุณาลองใหม่')})})();</script>`;
  return prepared.replace('</body>', `${script}</body>`);
}

function withResultBridge(html: string, result?: LegacyOcrResult | null) {
  if (!result) return html;
  const payload = JSON.stringify(result).replace(/</g, '\\u003c');
  const script = `<script data-smartlife-ocr-result>(()=>{const result=${payload};window.__smartlifeOcrResult=result;if(result.scanType==='receipt'){const parsed=result.parsed||{};const merchant=document.querySelector('.merchant strong');const amount=document.querySelector('.amount-row strong');if(merchant&&parsed.merchant)merchant.textContent=String(parsed.merchant);if(amount&&parsed.total!=null)amount.textContent='฿'+Number(parsed.total).toLocaleString('th-TH')}else{const entries=Array.isArray(result.parsed?.entries)?result.parsed.entries:[];const list=document.querySelector('.course-list');if(list&&entries.length){list.querySelectorAll('.course').forEach((course,index)=>{const entry=entries[index];if(!entry){course.remove();return}const strong=course.querySelector('strong');const small=course.querySelector('small');if(strong)strong.textContent=String(entry.raw||'รายการจากตารางเรียน');if(small)small.textContent=entry.time?'เวลา '+entry.time:'ตรวจสอบรายละเอียดก่อนบันทึก'})}}})();</script>`;
  return html.replace('</body>', `${script}</body>`);
}

export default function LegacyPageDom({ html, onAuthenticate, onBack, onNavigate, onScan, scanResult, onDataRequest, onDataAction }: LegacyPageDomProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const scanType = html.includes('user/smartlife_scan_schedule') ? 'schedule' :
    html.includes('user/smartlife_scan_finance') ? 'receipt' : undefined;

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; href?: string; pageKey?: string; action?: string; payload?: Record<string, unknown> } & Partial<LegacyAuthRequest> & Partial<LegacyScanRequest>;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'smartlife:navigate' && data.href) await onNavigate(data.href);
      else if (data.type === 'smartlife:back') await onBack();
      else if (data.type === 'smartlife:auth' && data.action && data.email) {
        const result = await onAuthenticate(data as LegacyAuthRequest);
        frameRef.current?.contentWindow?.postMessage({ type: 'smartlife:auth-result', ...result }, '*');
      } else if (data.type === 'smartlife:scan' && onScan && data.scanType && data.source) {
        const result = await onScan(data as LegacyScanRequest);
        frameRef.current?.contentWindow?.postMessage({ type: 'smartlife:scan-result', ...result }, '*');
      } else if (data.type === 'smartlife:data-request' && data.pageKey && onDataRequest) {
        try {
          const result = await onDataRequest(data.pageKey);
          frameRef.current?.contentWindow?.postMessage({type: 'smartlife:data-result', pageKey: data.pageKey, data: result}, '*');
        } catch (error) {
          frameRef.current?.contentWindow?.postMessage({type: 'smartlife:data-result', pageKey: data.pageKey, data: {}, message: error instanceof Error ? error.message : 'Load failed'}, '*');
        }
      } else if (data.type === 'smartlife:data-action' && data.pageKey && data.action && onDataAction) {
        try {
          const result = await onDataAction(data.pageKey, {action: data.action, payload: data.payload});
          frameRef.current?.contentWindow?.postMessage({type: 'smartlife:data-action-result', pageKey: data.pageKey, ok: true, data: result}, '*');
        } catch (error) {
          frameRef.current?.contentWindow?.postMessage({type: 'smartlife:data-action-result', pageKey: data.pageKey, ok: false, message: error instanceof Error ? error.message : 'Save failed'}, '*');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuthenticate, onBack, onDataAction, onDataRequest, onNavigate, onScan]);

  return (
    <iframe ref={frameRef} srcDoc={withLegacyDataBridge(withResultBridge(withScanBridge(html, scanType), scanResult))} title="SmartLife"
      style={{ background: '#e9ebe2', border: 0, display: 'block', height: '100%', width: '100%' }} />
  );
}
