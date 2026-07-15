import { useCallback, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';

import {withLegacyDataBridge} from '@/lib/legacy-data-bridge';
import type {LegacyDataAction} from '@/services/legacy-data';

export type LegacyAuthRequest = {
  action: 'signIn' | 'register' | 'reset';
  displayName?: string;
  email: string;
  password?: string;
};

export type LegacyAuthResult = { message?: string; ok: boolean };

export type LegacyScanRequest = {
  scanType: 'receipt' | 'schedule';
  source: 'camera' | 'library';
};

export type LegacyScanResult = { canceled?: boolean; message?: string; ok: boolean };
export type LegacyOcrResult = {
  parsed: Record<string, unknown>;
  rawText: string;
  scanType: 'receipt' | 'schedule';
  storagePath?: string;
};

type LegacyPageDomProps = {
  html: string;
  onAuthenticate: (request: LegacyAuthRequest) => Promise<LegacyAuthResult>;
  onBack: () => Promise<void>;
  onNavigate: (href: string) => Promise<void>;
  onScan?: (request: LegacyScanRequest) => Promise<LegacyScanResult>;
  scanResult?: LegacyOcrResult | null;
  onDataRequest?: (pageKey: string) => Promise<unknown>;
  onDataAction?: (pageKey: string, request: LegacyDataAction) => Promise<unknown>;
  initialData?: unknown;
  dom?: unknown;
};

function withScanBridge(html: string, scanType?: LegacyScanRequest['scanType']) {
  if (!scanType) return html;
  const prepared = html
    .replace(/(<a class="small-control" href=")[^"]+(" aria-label=)/, '$1#smartlife-library$2')
    .replace(/(<a class="shutter" href=")[^"]+(" aria-label=)/, '$1#smartlife-camera$2');
  const script = `<script data-smartlife-native-scan>(()=>{const send=(payload)=>window.__smartlifeSend?.(payload);const show=()=>{let el=document.getElementById('smartlife-scan-loading');if(!el){el=document.createElement('div');el.id='smartlife-scan-loading';el.style.cssText='position:absolute;inset:0;z-index:99;display:grid;place-items:center;background:rgba(17,24,10,.64);backdrop-filter:blur(8px)';el.innerHTML='<div style="width:250px;padding:24px 18px;border-radius:24px;background:#fbfbf5;color:#263515;text-align:center;font-family:Prompt,sans-serif;box-shadow:0 26px 58px rgba(10,14,7,.35)"><div style="width:54px;height:54px;margin:0 auto 12px;border:5px solid #dfe7dc;border-top-color:#6f8f6d;border-radius:50%;animation:smartlifeSpin .8s linear infinite"></div><strong style="font-size:17px">กำลังอ่านข้อมูล</strong><p style="margin:6px 0 0;font-size:12px;color:#70766a">กำลังอัปโหลดและประมวลผล OCR...</p></div><style>@keyframes smartlifeSpin{to{transform:rotate(360deg)}}</style>';document.querySelector('.screen')?.appendChild(el)}};const bind=(selector,source)=>document.querySelector(selector)?.addEventListener('click',(event)=>{event.preventDefault();event.stopImmediatePropagation();show();send({type:'smartlife:scan',scanType:'${scanType}',source})},true);bind('.controls .small-control:not(.google-control)','library');bind('.controls .shutter','camera');window.addEventListener('message',(event)=>{let data=event.data;if(typeof data==='string'){try{data=JSON.parse(data)}catch{return}}if(data?.type==='smartlife:scan-result'&&!data.ok){document.getElementById('smartlife-scan-loading')?.remove();if(!data.canceled)alert(data.message||'ไม่สามารถอ่านรูปนี้ได้ กรุณาลองใหม่')}})})();</script>`;
  return prepared.replace('</body>', `${script}</body>`);
}

function withResultBridge(html: string, result?: LegacyOcrResult | null) {
  if (!result) return html;
  const payload = JSON.stringify(result).replace(/</g, '\\u003c');
  const script = `<script data-smartlife-ocr-result>(()=>{const result=${payload};window.__smartlifeOcrResult=result;if(result.scanType==='receipt'){const parsed=result.parsed||{};const merchant=document.querySelector('.merchant strong');const amount=document.querySelector('.amount-row strong');if(merchant&&parsed.merchant)merchant.textContent=String(parsed.merchant);if(amount&&parsed.total!=null)amount.textContent='฿'+Number(parsed.total).toLocaleString('th-TH');const rows=document.querySelectorAll('.detail-row strong');if(rows[0]&&parsed.merchant)rows[0].textContent=String(parsed.merchant);if(rows[1]&&parsed.date)rows[1].textContent=String(parsed.date);if(rows[2]&&parsed.time)rows[2].textContent=String(parsed.time)}else{const entries=Array.isArray(result.parsed?.entries)?result.parsed.entries:[];const list=document.querySelector('.course-list');if(list&&entries.length){list.querySelectorAll('.course').forEach((course,index)=>{const entry=entries[index];if(!entry){course.remove();return}const strong=course.querySelector('strong');const small=course.querySelector('small');if(strong)strong.textContent=String(entry.raw||'รายการจากตารางเรียน');if(small)small.textContent=entry.time?'เวลา '+entry.time:'ตรวจสอบรายละเอียดก่อนบันทึก'})}}})();</script>`;
  return html.replace('</body>', `${script}</body>`);
}

function extractAdminBootstrap(html: string) {
  if (!html.includes('admin/')) return '';
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  return scripts.find((script) => script.includes('#admin-app') && script.includes('renderContent')) ?? '';
}

function pageKeyFromHtml(html: string) {
  return html.match(/const pageKey = ["']([^"']+)["']/)?.[1] ?? '';
}

function adminDataInjection(pageKey: string, data: unknown) {
  if (!pageKey.startsWith('admin/') || !data) return '';
  const payload = JSON.stringify(data).replace(/</g, '\\u003c');
  return `;(()=>{const data=${payload};const all=(selector)=>Array.from(document.querySelectorAll(selector));const esc=(value)=>String(value??'').replace(/[&<>"']/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));const formatDate=(value)=>value?new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeZone:'Asia/Bangkok'}).format(new Date(value)):'-';const formatTime=(value)=>value?new Intl.DateTimeFormat('th-TH',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Bangkok'}).format(new Date(value)):'-';if(data.counts){const values=all('.metric strong');const counts=data.counts;[counts.users,counts.schedules,counts.notes,counts.transactions,counts.aiRecommendations].forEach((value,index)=>{if(values[index])values[index].textContent=Number(value||0).toLocaleString('th-TH')})}if(data.users){const body=document.querySelector('tbody');if(body)body.innerHTML=data.users.map((user)=>'<tr><td><span class="person"><span class="person-dot">'+esc(String(user.displayName||'U').slice(0,2))+'</span><span><strong>'+esc(user.displayName||'ผู้ใช้')+'</strong><small>'+esc(user.email||'')+'</small></span></span></td><td><span class="pill '+(user.disabled?'danger':'')+'">'+(user.disabled?'ระงับ':'ใช้งานปกติ')+'</span></td><td>'+formatDate(user.createdAt)+'</td><td>'+formatDate(user.lastSignInAt)+'</td></tr>').join('')}if(data.systemStatus){const list=document.querySelector('.health-list');if(list)list.innerHTML=data.systemStatus.map((item)=>'<div class="health-row"><span class="health-dot"></span><span><strong>'+esc(item.name)+'</strong><small>'+esc(item.detail)+' · '+Number(item.latencyMs||0)+' ms</small></span><span class="pill">'+esc(item.status)+'</span></div>').join('')}if(data.scanLogs){const list=document.querySelector('.activity-list');if(list)list.innerHTML=data.scanLogs.slice(0,5).map((item)=>'<div class="activity-row"><span class="activity-dot"></span><span><strong>'+esc(item.kind==='receipt'?'OCR ใบเสร็จ':'OCR ตารางเรียน')+' สำเร็จ</strong><small>'+esc(String(item.extractedText||'').slice(0,72))+'</small></span><time>'+formatTime(item.createdAt)+'</time></div>').join('');const body=document.querySelector('tbody');if(body)body.innerHTML=data.scanLogs.map((item)=>'<tr><td>'+formatDate(item.createdAt)+' '+formatTime(item.createdAt)+'</td><td>'+esc(item.kind)+'</td><td>'+esc(String(item.extractedText||'').slice(0,80))+'</td><td>'+esc(item.errorMessage||'-')+'</td><td><span class="pill">'+esc(item.status)+'</span></td></tr>').join('')}if(data.feedback){const list=document.querySelector('.feedback-list');if(list)list.innerHTML=data.feedback.map((item)=>'<div class="feedback-row"><span class="person-dot">FB</span><span><strong>'+esc(item.message)+'</strong><small>'+esc(item.type)+' · '+formatDate(item.createdAt)+'</small></span><span class="pill accent">'+esc(item.status)+'</span></div>').join('')}if(data.categories){const groups=all('.category-tags');['note','expense','activity'].forEach((domain,index)=>{if(groups[index])groups[index].innerHTML=data.categories.filter((item)=>item.domain===domain).map((item)=>'<span class="category-tag">'+esc(item.labelTh)+'</span>').join('')})}if(data.announcements){const list=document.querySelector('.activity-list');if(list)list.innerHTML=data.announcements.map((item)=>'<div class="activity-row"><span class="activity-dot"></span><span><strong>'+esc(item.title)+'</strong><small>'+esc(item.message)+'</small></span></div>').join('')}if(data.recommendations){const body=document.querySelector('tbody');if(body)body.innerHTML=data.recommendations.map((item)=>'<tr><td>'+esc(item.title)+'</td><td>'+esc((item.contextSources||[]).join(', '))+'</td><td>'+esc(item.kind)+'</td><td><span class="pill">'+esc(item.status)+'</span></td></tr>').join('')}})();`;
}

export default function LegacyPageDom({ html, onAuthenticate, onBack, onNavigate, onScan, scanResult, onDataRequest, onDataAction, initialData }: LegacyPageDomProps) {
  const webViewRef = useRef<WebView>(null);
  const scanType = html.includes('user/smartlife_scan_schedule') ? 'schedule' :
    html.includes('user/smartlife_scan_finance') ? 'receipt' : undefined;
  const adminBootstrap = extractAdminBootstrap(html);
  const pageKey = pageKeyFromHtml(html);
  const injectedAdminData = adminDataInjection(pageKey, initialData);

  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    const data = parsed as { type?: string; href?: string; pageKey?: string; action?: string; payload?: Record<string, unknown> } & Partial<LegacyAuthRequest> & Partial<LegacyScanRequest>;

    if (data.type === 'smartlife:navigate' && data.href) await onNavigate(data.href);
    else if (data.type === 'smartlife:back') await onBack();
    else if (data.type === 'smartlife:auth' && data.action && data.email) {
      const result = await onAuthenticate(data as LegacyAuthRequest);
      webViewRef.current?.postMessage(JSON.stringify({ type: 'smartlife:auth-result', ...result }));
    } else if (data.type === 'smartlife:scan' && onScan && data.scanType && data.source) {
      const result = await onScan(data as LegacyScanRequest);
      webViewRef.current?.postMessage(JSON.stringify({ type: 'smartlife:scan-result', ...result }));
    } else if (data.type === 'smartlife:data-request' && data.pageKey && onDataRequest) {
      try {
        const result = await onDataRequest(data.pageKey);
        webViewRef.current?.postMessage(JSON.stringify({type: 'smartlife:data-result', pageKey: data.pageKey, data: result}));
      } catch (error) {
        webViewRef.current?.postMessage(JSON.stringify({type: 'smartlife:data-result', pageKey: data.pageKey, data: {}, message: error instanceof Error ? error.message : 'Load failed'}));
      }
    } else if (data.type === 'smartlife:data-action' && data.pageKey && data.action && onDataAction) {
      try {
        const result = await onDataAction(data.pageKey, {action: data.action, payload: data.payload});
        webViewRef.current?.postMessage(JSON.stringify({type: 'smartlife:data-action-result', pageKey: data.pageKey, ok: true, data: result}));
      } catch (error) {
        webViewRef.current?.postMessage(JSON.stringify({type: 'smartlife:data-action-result', pageKey: data.pageKey, ok: false, message: error instanceof Error ? error.message : 'Save failed'}));
      }
    }
  }, [onAuthenticate, onBack, onDataAction, onDataRequest, onNavigate, onScan]);

  const handleShouldStartLoad = useCallback((request: WebViewNavigation) => {
    try {
      const url = new URL(request.url);
      if (url.pathname.endsWith('.html')) {
        const href = `${url.pathname.split('/').pop() ?? ''}${url.hash}`;
        void onNavigate(href);
        return false;
      }
    } catch {
      // Let WebView handle malformed external URLs normally.
    }
    return true;
  }, [onNavigate]);

  return (
    <WebView
      ref={webViewRef}
      source={{ html: withLegacyDataBridge(withResultBridge(withScanBridge(html, scanType), scanResult)), baseUrl: 'https://smartlife.local/' }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      mixedContentMode="compatibility"
      setSupportMultipleWindows={false}
      injectedJavaScript={adminBootstrap
        ? `try { ${adminBootstrap} ${injectedAdminData} } catch (error) { window.ReactNativeWebView?.postMessage(JSON.stringify({type:'smartlife:admin-bootstrap-error', message:String(error)})); } true;`
        : undefined}
      onShouldStartLoadWithRequest={handleShouldStartLoad}
      onMessage={handleMessage}
      style={styles.webView}
    />
  );
}

const styles = StyleSheet.create({
  webView: { backgroundColor: '#e9ebe2', flex: 1 },
});
