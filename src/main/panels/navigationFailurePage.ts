export interface NavigationFailureDetails {
  attemptedUrl: string;
  fallbackUrl: string;
  errorDescription: string;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const serializeForInlineScript = (value: string): string =>
  JSON.stringify(value).replaceAll('<', '\\u003c');

const getDisplayHost = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export const buildNavigationFailurePageUrl = ({
  attemptedUrl,
  fallbackUrl,
  errorDescription
}: NavigationFailureDetails): string => {
  const displayHost = escapeHtml(getDisplayHost(attemptedUrl));
  const displayError = escapeHtml(errorDescription || 'ERR_FAILED');
  const retryUrl = serializeForInlineScript(attemptedUrl);
  const backFallbackUrl = serializeForInlineScript(fallbackUrl || attemptedUrl);
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
    <title>网页加载失败</title>
    <style>
      :root { color-scheme: dark; font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; }
      body { display: grid; place-items: center; background: #242424; color: rgba(255,255,255,.9); }
      main { width: min(430px, calc(100% - 48px)); }
      .mark { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.22); border-radius: 50%; color: rgba(255,255,255,.62); font-size: 18px; }
      h1 { margin: 22px 0 8px; font-size: 21px; font-weight: 600; }
      p { margin: 0; color: rgba(255,255,255,.56); font-size: 13px; line-height: 1.65; }
      .host { color: rgba(255,255,255,.78); overflow-wrap: anywhere; }
      .code { margin-top: 14px; font-family: Consolas, monospace; font-size: 11px; color: rgba(255,255,255,.38); }
      .actions { display: flex; gap: 10px; margin-top: 26px; }
      button { min-width: 92px; height: 36px; border: 1px solid rgba(255,255,255,.18); border-radius: 4px; background: transparent; color: rgba(255,255,255,.82); font: inherit; font-size: 13px; cursor: default; }
      button:hover { background: rgba(255,255,255,.08); }
      .primary { border-color: #4cc2ff; background: #4cc2ff; color: #101010; font-weight: 600; }
      .primary:hover { background: #72cefa; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">!</div>
      <h1>无法打开此网页</h1>
      <p><span class="host">${displayHost}</span> 暂时无法响应。请检查网络连接或代理设置后重试。</p>
      <div class="code">${displayError}</div>
      <div class="actions">
        <button id="retry" class="primary" type="button">重新加载</button>
        <button id="back" type="button">返回</button>
      </div>
    </main>
    <script>
      const retryUrl = ${retryUrl};
      const fallbackUrl = ${backFallbackUrl};
      document.getElementById('retry').addEventListener('click', () => location.replace(retryUrl));
      document.getElementById('back').addEventListener('click', () => {
        if (history.length > 1) history.back();
        else location.replace(fallbackUrl);
      });
    </script>
  </body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
};
