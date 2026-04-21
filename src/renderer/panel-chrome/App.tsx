import {
  ChevronLeft,
  ExternalLink,
  Minus,
  MoreHorizontal,
  PinOff,
  X
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BUILTIN_ADD_SITE_ID, PANEL_DEFAULT_WIDTH } from '@shared/constants';
import { toRenderableIconUrl } from '@shared/iconUrl';
import type {
  AppConfig,
  BrowserInfo,
  FaviconFetchResult,
  PanelAnimatePayload,
  PanelChromePayload,
  PanelNavigationPayload
} from '@shared/types';

const CONTENT_INSET = 8;
const PANEL_TOP_INSET = 8;

interface ChromeState {
  panelId: string | null;
  title: string;
  url: string;
  canGoBack: boolean;
  edge: 'left' | 'right';
  panelType: 'web' | 'builtin';
}

const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const deriveTitle = (url: string): string => {
  try {
    const target = new URL(url);
    return target.hostname.replace(/^www\./, '') || '新网站';
  } catch {
    return '新网站';
  }
};

export default function App(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [browsers, setBrowsers] = useState<BrowserInfo[]>([]);
  const [chromeState, setChromeState] = useState<ChromeState>({
    panelId: null,
    title: 'SideBar Plus',
    url: '',
    canGoBack: false,
    edge: 'right',
    panelType: 'web'
  });
  const [fading, setFading] = useState(false);
  const [contentSnapshotDataUrl, setContentSnapshotDataUrl] = useState<string | null>(null);
  const [addSiteUrl, setAddSiteUrl] = useState('');
  const [selectedBrowserId, setSelectedBrowserId] = useState('system');
  const [customIconPath, setCustomIconPath] = useState<string | null>(null);
  const [autoFavicon, setAutoFavicon] = useState<FaviconFetchResult | null>(null);
  const [faviconLoading, setFaviconLoading] = useState(false);
  const [faviconError, setFaviconError] = useState<string | null>(null);
  const [submittingSite, setSubmittingSite] = useState(false);
  const [addSiteError, setAddSiteError] = useState<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelCardRadius = chromeState.edge === 'right' ? 'rounded-l-lg' : 'rounded-r-lg';
  const panelCardBorder = chromeState.edge === 'right' ? 'border-r-0' : 'border-l-0';

  useEffect(() => {
    let mounted = true;

    void window.panelAPI.readConfig().then((result) => {
      if (mounted && result.ok) {
        setConfig(result.data);
      }
    });

    void window.panelAPI.listBrowsers().then((result) => {
      if (mounted && result.ok) {
        setBrowsers(result.data);
      }
    });

    const applyPayload = (payload: PanelAnimatePayload | PanelChromePayload): void => {
      setChromeState({
        panelId: 'panelId' in payload ? payload.panelId : payload.descriptor.id,
        title: payload.descriptor.title,
        url: payload.url,
        canGoBack: false,
        edge: payload.edge,
        panelType: payload.descriptor.type
      });
    };

    const disposeAnimateIn = window.panelAPI.onAnimateIn((payload) => {
      applyPayload(payload);
      setFading(false);
      setContentSnapshotDataUrl(payload.snapshotDataUrl ?? null);
    });

    const disposeAnimateOut = window.panelAPI.onAnimateOut(() => {
      setContentSnapshotDataUrl(null);
      void window.panelAPI.closeMenu();
    });

    const disposePrepareClose = window.panelAPI.onPrepareClose((payload) => {
      setChromeState((current) =>
        current.panelId === payload.panelId
          ? {
              ...current
            }
          : current
      );
      setContentSnapshotDataUrl(payload.snapshotDataUrl);
    });

    const disposeFadeOut = window.panelAPI.onChromeFadeOut(() => {
      setFading(true);
    });

    const disposeFadeIn = window.panelAPI.onChromeFadeIn((payload) => {
      applyPayload(payload);
      setFading(false);
    });

    const disposeNavigation = window.panelAPI.onNavigationState((payload: PanelNavigationPayload) => {
      setChromeState((current) =>
        current.panelId === payload.panelId
          ? { ...current, url: payload.url, canGoBack: payload.canGoBack }
          : current
      );
    });

    return () => {
      mounted = false;
      disposePrepareClose();
      disposeAnimateIn();
      disposeAnimateOut();
      disposeFadeOut();
      disposeFadeIn();
      disposeNavigation();
    };
  }, []);

  useEffect(() => {
    if (customIconPath) {
      return;
    }

    const normalizedUrl = normalizeUrl(addSiteUrl);
    if (!normalizedUrl) {
      setAutoFavicon(null);
      setFaviconError(null);
      setFaviconLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setFaviconLoading(true);
      setFaviconError(null);

      void window.panelAPI.fetchFavicon({ url: normalizedUrl }).then((result) => {
        if (cancelled) {
          return;
        }

        setFaviconLoading(false);
        if (result.ok) {
          setAutoFavicon(result.data);
          return;
        }

        setAutoFavicon(null);
        setFaviconError(result.error);
      });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [addSiteUrl, customIconPath]);

  const handleOpenExternal = async (): Promise<void> => {
    if (!chromeState.panelId || chromeState.panelType !== 'web') {
      return;
    }

    await window.panelAPI.openExternal({
      panelId: chromeState.panelId
    });
  };

  const handleGoBack = async (): Promise<void> => {
    if (!chromeState.panelId || chromeState.panelType !== 'web' || !chromeState.canGoBack) {
      return;
    }

    await window.panelAPI.goBack({
      panelId: chromeState.panelId
    });
  };

  const handlePickCustomIcon = async (): Promise<void> => {
    const result = await window.panelAPI.pickIcon();
    if (result.ok) {
      setCustomIconPath(result.data);
    }
  };

  const handleAddSite = async (): Promise<void> => {
    const normalizedUrl = normalizeUrl(addSiteUrl);
    if (!normalizedUrl) {
      setAddSiteError('请输入网站地址');
      return;
    }

    try {
      const parsed = new URL(normalizedUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('仅支持 http 或 https 地址');
      }
    } catch (error) {
      setAddSiteError(error instanceof Error ? error.message : '请输入有效的网址');
      return;
    }

    setSubmittingSite(true);
    setAddSiteError(null);
    let faviconForSubmit = autoFavicon;

    if (!customIconPath && !faviconForSubmit) {
      const faviconResult = await window.panelAPI.fetchFavicon({ url: normalizedUrl });
      if (faviconResult.ok) {
        faviconForSubmit = faviconResult.data;
        setAutoFavicon(faviconResult.data);
      }
    }

    const result = await window.panelAPI.addPanel({
      type: 'web',
      title: deriveTitle(normalizedUrl),
      preferredWidth: config?.layout.panelDefaultWidth ?? PANEL_DEFAULT_WIDTH,
      iconSource: customIconPath
        ? {
            kind: 'custom',
            path: customIconPath
          }
        : faviconForSubmit
          ? {
              kind: 'auto',
              path: faviconForSubmit.iconPath,
              fallbackLetter: faviconForSubmit.fallbackLetter,
              fallbackColor: faviconForSubmit.fallbackColor
            }
        : {
            kind: 'auto',
            fallbackLetter: deriveTitle(normalizedUrl).slice(0, 1).toUpperCase(),
            fallbackColor: '#375a7f'
          },
      web: {
        url: normalizedUrl,
        openInBrowser: selectedBrowserId,
        zoomLevel: 1,
        userAgentMode: 'desktop',
        notificationsSnoozed: false
      }
    });

    setSubmittingSite(false);

    if (!result.ok) {
      setAddSiteError(result.error);
      return;
    }

    setAddSiteUrl('');
    setSelectedBrowserId('system');
    setCustomIconPath(null);
    setAutoFavicon(null);
    setFaviconError(null);
    await window.panelAPI.closePanel();
  };

  const isBuiltinAddSite = chromeState.panelId === BUILTIN_ADD_SITE_ID;

  return (
    <main
      className="relative h-screen w-full bg-transparent"
      onMouseEnter={() => {
        void window.panelAPI.cancelHide();
      }}
      onMouseDown={() => {
        void window.panelAPI.markSticky();
      }}
      onKeyDown={() => {
        void window.panelAPI.markSticky();
      }}
      onMouseLeave={() => {
        void window.panelAPI.scheduleHide();
      }}
    >
      <div
        className="panel-shell absolute inset-0 overflow-hidden bg-[#1b1b1b] text-white"
      >
        <div
          className={`absolute flex flex-col overflow-hidden border border-white/6 bg-[#202020] shadow-[0_0_0_1px_rgba(0,0,0,0.18)] ${panelCardRadius} ${panelCardBorder}`}
          style={{
            left: chromeState.edge === 'right' ? CONTENT_INSET : 0,
            right: chromeState.edge === 'left' ? CONTENT_INSET : 0,
            top: PANEL_TOP_INSET,
            bottom: CONTENT_INSET
          }}
        >
          <div
            className={`flex h-[76px] shrink-0 items-center justify-between bg-[#202020] px-4 transition-opacity duration-100 ${
              fading ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-1 pr-3">
              {chromeState.panelType === 'web' && chromeState.canGoBack ? (
                <button
                  type="button"
                  title="返回"
                  className="-ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded text-white/72 hover:bg-white/8"
                  onClick={() => void handleGoBack()}
                >
                  <ChevronLeft size={17} />
                </button>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                <div className="min-w-0 truncate text-[15px] font-semibold leading-5 text-white">{chromeState.title}</div>
                <div className="min-w-0 truncate text-xs leading-4 text-white/42">
                  {chromeState.url || (config ? '正在准备面板...' : 'Loading panel...')}
                </div>
              </div>
            </div>
            <div className="relative flex shrink-0 items-center">
              <button
                type="button"
                title="在浏览器中打开"
                className={`flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/8 ${
                  chromeState.panelType === 'web' ? '' : 'pointer-events-none opacity-35'
                }`}
                onClick={() => void handleOpenExternal()}
              >
                <ExternalLink size={14} />
              </button>
              <button
                ref={menuButtonRef}
                type="button"
                title="更多"
                className={`flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/8 ${
                  chromeState.panelType === 'web' ? '' : 'pointer-events-none opacity-35'
                }`}
                onClick={() => {
                  if (!chromeState.panelId || !menuButtonRef.current || chromeState.panelType !== 'web') {
                    return;
                  }

                  const rect = menuButtonRef.current.getBoundingClientRect();
                  void window.panelAPI.openMenu({
                    panelId: chromeState.panelId,
                    edge: chromeState.edge,
                    x: rect.right,
                    y: rect.bottom + 6
                  });
                }}
              >
                <MoreHorizontal size={14} />
              </button>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/8">
                <PinOff size={14} />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/8"
                onClick={() => void window.panelAPI.minimizePanel()}
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/8"
                onClick={() => void window.panelAPI.closePanel()}
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="relative flex-1 overflow-hidden bg-[#242424]">
            {isBuiltinAddSite ? (
              <div className="absolute inset-0 flex flex-col bg-[#111111]">
                <div className="min-h-0 flex-1 overflow-y-auto px-[22px] py-6">
                  <div className="flex flex-col gap-4">
                    <section className="rounded-xl border border-white/9 bg-[#191919] px-5 py-5 shadow-[0_16px_42px_rgba(0,0,0,0.24)]">
                      <label className="mb-3 block text-sm font-semibold text-white/58">网址</label>
                      <input
                        value={addSiteUrl}
                        onChange={(event) => {
                          setAddSiteUrl(event.target.value);
                          if (addSiteError) {
                            setAddSiteError(null);
                          }
                        }}
                        placeholder="例如 github.com 或 https://example.com"
                        className="h-11 w-full rounded-lg border border-white/10 bg-[#242424] px-4 text-[15px] font-semibold text-white outline-none transition-colors placeholder:text-white/24 focus:border-white/22"
                      />
                      {addSiteError ? (
                        <div className="mt-3 text-sm text-[#ff9d9d]">{addSiteError}</div>
                      ) : null}
                    </section>

                    <section className="rounded-xl border border-white/9 bg-[#191919] px-5 py-5 shadow-[0_16px_42px_rgba(0,0,0,0.2)]">
                      <div className="mb-4 text-sm font-semibold text-white/58">图标预览</div>
                      <div className="flex min-h-[132px] items-center gap-5 rounded-xl border border-dashed border-white/14 bg-[#181818] px-6 py-5">
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#282828] text-3xl font-semibold text-white/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                          {customIconPath ? (
                            <img
                              src={toRenderableIconUrl(customIconPath)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : autoFavicon ? (
                            <img
                              src={autoFavicon.dataUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            deriveTitle(normalizeUrl(addSiteUrl) || '站点').slice(0, 1).toUpperCase()
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mb-4 truncate text-sm font-semibold text-white/48">
                            {customIconPath
                              ? '正在使用自定义图标'
                              : faviconLoading
                                ? '正在自动获取站点图标...'
                                : autoFavicon
                                  ? `已自动获取站点图标`
                                  : faviconError
                                    ? '自动获取失败，将使用字母图标'
                                    : '输入网址后自动获取站点图标'}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="h-10 rounded-lg border border-white/12 bg-[#272727] px-4 text-sm font-semibold text-white/82 transition-colors hover:bg-[#303030]"
                              onClick={() => void handlePickCustomIcon()}
                            >
                              手动选择图标
                            </button>
                            <button
                              type="button"
                              className="h-10 rounded-lg border border-white/12 bg-[#272727] px-4 text-sm font-semibold text-white/68 transition-colors hover:bg-[#303030] hover:text-white/86"
                              onClick={() => setCustomIconPath(null)}
                            >
                              清除自定义
                            </button>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-xl border border-white/9 bg-[#191919] px-5 py-5 shadow-[0_16px_42px_rgba(0,0,0,0.2)]">
                      <label className="mb-3 block text-sm font-semibold text-white/58">
                        打开方式 <span className="text-white/38">(1.0 点位)</span>
                      </label>
                      <select
                        value={selectedBrowserId}
                        onChange={(event) => setSelectedBrowserId(event.target.value)}
                        className="h-11 w-full rounded-lg border border-white/10 bg-[#242424] px-4 text-[15px] font-semibold text-white outline-none"
                      >
                        {browsers.map((browser) => (
                          <option key={browser.id} value={browser.id}>
                            {browser.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-3 text-sm font-semibold leading-5 text-white/34">
                        仅页面级切换生效，实际打开后自动浏览器延续该应用。退居后生上来后台获取真实路由。
                      </p>
                    </section>
                  </div>
                </div>

                <div className="flex h-[88px] shrink-0 items-center justify-between border-t border-white/7 bg-[#191919] px-[24px]">
                  <button
                    type="button"
                    className="h-10 rounded-lg px-1 text-sm font-semibold text-white/58 transition-colors hover:text-white/82"
                    onClick={() => void window.panelAPI.minimizePanel()}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="h-10 min-w-[148px] rounded-xl bg-[#31598c] px-5 text-sm font-semibold text-white/82 transition-colors hover:bg-[#3b67a0] disabled:cursor-not-allowed disabled:bg-[#253c5d] disabled:text-white/38"
                    disabled={submittingSite || !addSiteUrl.trim()}
                    onClick={() => void handleAddSite()}
                  >
                    {submittingSite ? '添加中...' : '添加到侧边栏'}
                  </button>
                </div>
              </div>
            ) : contentSnapshotDataUrl ? (
              <img
                src={contentSnapshotDataUrl}
                alt=""
                draggable={false}
                className="absolute inset-0 h-full w-full object-fill"
              />
            ) : (
              <div className="absolute inset-0 flex items-start justify-start bg-[#242424] p-4">
                <div className="h-2 w-2 rounded-full border border-white/18" />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
