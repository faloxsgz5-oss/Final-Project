import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const expoRoot = path.resolve(scriptDirectory, '..');
const sourceRoot = path.resolve(expoRoot, '..');
const outputFile = path.join(expoRoot, 'src', 'generated', 'legacy-pages.tsx');
const screenRoot = path.join(expoRoot, 'src', 'screens', 'legacy');

const sourceGroups = {
  user: path.join(sourceRoot, 'User'),
  admin: path.join(sourceRoot, 'Admin'),
  login: path.join(sourceRoot, 'Login'),
};

function inlineRelativeAssets(html, sourceDirectory) {
  let output = html.replace(
    /<link\b([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
    (fullTag, before, href, after) => {
      if (/^(https?:|data:|\/\/)/i.test(href) || !href.toLowerCase().endsWith('.css')) {
        return fullTag;
      }

      const cssPath = path.resolve(sourceDirectory, href.split(/[?#]/)[0]);
      if (!fs.existsSync(cssPath)) return fullTag;
      const css = fs.readFileSync(cssPath, 'utf8').replace(/<\/style/gi, '<\\/style');
      return `<style data-smartlife-source="${path.basename(cssPath)}">${css}</style>`;
    },
  );

  output = output.replace(
    /<script\b([^>]*?)src=["']([^"']+)["']([^>]*?)>\s*<\/script>/gi,
    (fullTag, before, src) => {
      if (/^(https?:|data:|\/\/)/i.test(src) || !src.toLowerCase().endsWith('.js')) {
        return fullTag;
      }

      const scriptPath = path.resolve(sourceDirectory, src.split(/[?#]/)[0]);
      if (!fs.existsSync(scriptPath)) return fullTag;
      const script = fs.readFileSync(scriptPath, 'utf8').replace(/<\/script/gi, '<\\/script');
      return `<script data-smartlife-source="${path.basename(scriptPath)}">${script}</script>`;
    },
  );

  return output;
}

function replaceDirectNavigation(html) {
  return html
    .replace(
      /(?:window\.)?location\.href\s*=\s*([^;]+);/g,
      "window.__smartlifeSend?.({ type: 'smartlife:navigate', href: $1 });",
    )
    .replace(
      /(?:window\.)?location\.assign\(([^)]+)\)/g,
      "window.__smartlifeSend?.({ type: 'smartlife:navigate', href: $1 })",
    )
    .replace(
      /(?:window\.)?history\.back\(\)/g,
      "window.__smartlifeSend?.({ type: 'smartlife:back' })",
    );
}

function removePrototypeAuthScript(html, pageKey) {
  if (pageKey !== 'login/login') return html;
  return html.replace(/<script>\s*const loginForm =[\s\S]*?<\/script>/i, '');
}

function authBridge(pageKey) {
  if (pageKey === 'login/login') {
    return `
      const form = document.querySelector('#login-form');
      const identity = document.querySelector('#identity');
      const password = document.querySelector('#password');
      const submit = document.querySelector('#login-button');
      const toggle = document.querySelector('#password-toggle');

      form?.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        submit.textContent = 'กำลังเข้าสู่ระบบ...';
        window.__smartlifeSend?.({
          type: 'smartlife:auth',
          action: 'signIn',
          email: identity.value.trim(),
          password: password.value
        });
      });

      toggle?.addEventListener('click', () => {
        const show = password.type === 'password';
        password.type = show ? 'text' : 'password';
        toggle.innerHTML = '<i class="ph-bold ' + (show ? 'ph-eye' : 'ph-eye-slash') + '"></i>';
      });

      document.querySelector('#forgot-password')?.addEventListener('click', (event) => {
        event.preventDefault();
        if (!identity.value.trim()) {
          identity.focus();
          window.alert('กรุณากรอกอีเมลก่อนขอรีเซ็ตรหัสผ่าน');
          return;
        }
        window.__smartlifeSend?.({ type: 'smartlife:auth', action: 'reset', email: identity.value.trim() });
      });

      document.querySelector('#google-login')?.addEventListener('click', () => {
        window.alert('Google Sign-In จะเปิดใช้งานในขั้นเชื่อม OAuth');
      });
      document.querySelector('#facebook-login')?.addEventListener('click', () => {
        window.alert('Facebook Sign-In จะเปิดใช้งานในขั้นเชื่อม OAuth');
      });
    `;
  }

  if (pageKey === 'login/register') {
    return `
      const form = document.querySelector('form');
      const fields = form ? Array.from(form.querySelectorAll('input')) : [];
      const submit = form?.querySelector('button');
      if (submit) submit.type = 'submit';

      form?.addEventListener('submit', (event) => {
        event.preventDefault();
        const [displayName, email, password, confirmation, terms] = fields;
        if (!displayName?.value.trim() || !email?.value.trim() || !password?.value) {
          window.alert('กรุณากรอกข้อมูลให้ครบ');
          return;
        }
        if (password.value !== confirmation?.value) {
          window.alert('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
          return;
        }
        if (terms && !terms.checked) {
          window.alert('กรุณายอมรับข้อตกลงและนโยบายความเป็นส่วนตัว');
          return;
        }
        submit.textContent = 'กำลังสร้างบัญชี...';
        window.__smartlifeSend?.({
          type: 'smartlife:auth',
          action: 'register',
          displayName: displayName.value.trim(),
          email: email.value.trim(),
          password: password.value
        });
      });
    `;
  }

  return '';
}

function bridgeScript(pageKey, activeTab) {
  return `<script data-smartlife-bridge>
    (() => {
      window.__smartlifeSend = (payload) => {
        if (window.ReactNativeWebView?.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        } else {
          window.parent.postMessage(payload, '*');
        }
      };
      const pageKey = ${JSON.stringify(pageKey)};
      const configuredActiveTab = ${JSON.stringify(activeTab || '')};
      const activeTab = configuredActiveTab || decodeURIComponent(window.location.hash.slice(1));
      if (activeTab) {
        document.querySelector('[data-tab="' + activeTab + '"]')?.classList.add('active');
      }

      document.addEventListener('click', (event) => {
        const anchor = event.target.closest?.('a[href]');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#') || /^(https?:|mailto:|tel:|data:)/i.test(href)) return;
        if (href.includes('.html') || href.startsWith('../') || href.startsWith('./')) {
          event.preventDefault();
          window.__smartlifeSend({ type: 'smartlife:navigate', href, pageKey });
        }
      }, true);

      window.addEventListener('message', (event) => {
        let data = event.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch { return; }
        }
        if (!data || typeof data !== 'object') return;
        if (event.source !== window.parent && String(data.type || '').startsWith('smartlife:')) {
          window.__smartlifeSend(data);
          return;
        }
        if (data.type === 'smartlife:auth-result') {
          const submit = document.querySelector('#login-button') || document.querySelector('form button');
          if (!data.ok) {
            if (submit) submit.textContent = pageKey === 'login/register' ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
            window.alert(data.message || 'ไม่สามารถดำเนินการได้');
          }
        }
      });

      ${authBridge(pageKey)}
    })();
  </script>`;
}

function appendBeforeBodyEnd(html, content) {
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${content}</body>`) : `${html}${content}`;
}

function embedLocalFrames(html, sourceDirectory, pageKey) {
  return html.replace(
    /<iframe\b([^>]*?)src=["']([^"']+\.html(?:\?[^"']*)?)["']([^>]*)><\/iframe>/gi,
    (fullTag, before, source, after) => {
      const [relativePath, query = ''] = source.split('?');
      const framePath = path.resolve(sourceDirectory, relativePath);
      if (!fs.existsSync(framePath)) return fullTag;

      const active = new URLSearchParams(query).get('active') || '';
      const frameKey = `${pageKey}:frame:${path.basename(relativePath, '.html')}`;
      let frameHtml = fs.readFileSync(framePath, 'utf8');
      frameHtml = removePrototypeAuthScript(frameHtml, frameKey);
      frameHtml = inlineRelativeAssets(frameHtml, path.dirname(framePath));
      frameHtml = replaceDirectNavigation(frameHtml);
      frameHtml = appendBeforeBodyEnd(frameHtml, bridgeScript(frameKey, active.includes('${') ? '' : active));
      const dataUrl = `data:text/html;charset=utf-8;base64,${Buffer.from(frameHtml, 'utf8').toString('base64')}`;
      const hash = active ? `#${active}` : '';
      return `<iframe${before}src="${dataUrl}${hash}"${after}></iframe>`;
    },
  );
}

function transformPage(filePath, pageKey) {
  const sourceDirectory = path.dirname(filePath);
  let html = fs.readFileSync(filePath, 'utf8');
  html = html.replace(/<meta\s+http-equiv=["']refresh["'][^>]*>/gi, '');
  html = removePrototypeAuthScript(html, pageKey);
  html = inlineRelativeAssets(html, sourceDirectory);
  html = replaceDirectNavigation(html);
  html = embedLocalFrames(html, sourceDirectory, pageKey);
  return appendBeforeBodyEnd(html, bridgeScript(pageKey, ''));
}

const pages = [];
const params = [];

function screenFileName(page) {
  return page.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

for (const [section, directory] of Object.entries(sourceGroups)) {
  const files = fs.readdirSync(directory).filter((file) => file.toLowerCase().endsWith('.html')).sort();
  for (const file of files) {
    const page = path.basename(file, '.html');
    const key = `${section}/${page}`;
    const html = transformPage(path.join(directory, file), key);
    const outputDirectory = path.join(screenRoot, section);
    const outputName = screenFileName(page);
    const screenFile = path.join(outputDirectory, `${outputName}.tsx`);
    const screenSource = `/* Generated from ${section}/${file}. */\n` +
      `import type { ComponentProps } from 'react';\n\n` +
      `import LegacyPageDom from '@/components/legacy/legacy-page-dom';\n\n` +
      `export const legacyHtml = ${JSON.stringify(html)};\n` +
      `export const legacyPage = ${JSON.stringify({ section, page })} as const;\n\n` +
      `type ScreenProps = Omit<ComponentProps<typeof LegacyPageDom>, 'html'>;\n\n` +
      `export default function LegacyScreen(props: ScreenProps) {\n` +
      `  return <LegacyPageDom {...props} html={legacyHtml} />;\n` +
      `}\n`;

    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(screenFile, screenSource, 'utf8');
    pages.push({ key, section, page, outputName });
    params.push({ section, page });
  }
}

const imports = pages.map((entry, index) =>
  `import { legacyHtml as page${index} } from '@/screens/legacy/${entry.section}/${entry.outputName}';`,
).join('\n');
const pageEntries = pages.map((entry, index) => `  ${JSON.stringify(entry.key)}: page${index},`).join('\n');
const source = `/* This file is generated by scripts/migrate-html-to-tsx.mjs. */\n${imports}\n\n` +
  `export const legacyPages: Record<string, string> = {\n${pageEntries}\n};\n\n` +
  `export const legacyPageParams = ${JSON.stringify(params, null, 2)} as const;\n`;

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, source, 'utf8');
console.log(`Migrated ${params.length} HTML pages to individual TSX screens and ${path.relative(expoRoot, outputFile)}.`);
