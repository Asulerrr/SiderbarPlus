import {
  ChevronLeft,
  ExternalLink,
  Minus,
  MoreHorizontal,
  Pin,
  PinOff,
  X
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PANEL_DEFAULT_WIDTH } from '@shared/constants';
import { toRenderableIconUrl } from '@shared/iconUrl';
import type {
  AppConfig,
  BrowserInfo,
  FaviconFetchResult,
  PanelAnimatePayload,
  PanelChromePayload,
  PanelDescriptor,
  PanelNavigationPayload,
  SiteInfo
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
  builtinWidgetId: string | null;
  builtinTargetPanelId: string | null;
  panelMode: 'hover' | 'pinned';
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

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const buildChromeState = (
  descriptor: PanelDescriptor,
  edge: 'left' | 'right',
  fallbackUrl: string,
  config: AppConfig | null
): ChromeState => {
  const targetPanel =
    descriptor.builtin?.targetPanelId && config
      ? config.panels.find((panel) => panel.id === descriptor.builtin?.targetPanelId) ?? null
      : null;

  return {
    panelId: descriptor.id,
    title: descriptor.title,
    url: descriptor.type === 'builtin' ? targetPanel?.web?.url ?? fallbackUrl : fallbackUrl,
    canGoBack: false,
    edge,
    panelType: descriptor.type,
    builtinWidgetId: descriptor.builtin?.widgetId ?? null,
    builtinTargetPanelId: descriptor.builtin?.targetPanelId ?? null
  };
};

const buildFallbackLabel = (panel: PanelDescriptor | null, fallbackText: string): string => {
  if (panel?.iconSource.fallbackLetter) {
    return panel.iconSource.fallbackLetter;
  }

  return fallbackText.trim().slice(0, 1).toUpperCase() || '?';
};

const buildFallbackColor = (panel: PanelDescriptor | null): string =>
  panel?.iconSource.fallbackColor ?? '#375a7f';

export default function App(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [browsers, setBrowsers] = useState<BrowserInfo[]>([]);
  const [chromeState, setChromeState] = useState<ChromeState>({
    panelId: null,
    title: 'SideBar Plus',
    url: '',
    canGoBack: false,
    edge: 'right',
    panelType: 'web',
    builtinWidgetId: null,
    builtinTargetPanelId: null,
    panelMode: 'hover'
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
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [siteInfoError, setSiteInfoError] = useState<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const hydrationTokenRef = useRef(0);
  const panelCardRadius = chromeState.edge === 'right' ? 'rounded-l-lg' : 'rounded-r-lg';
  const panelCardBorder = chromeState.edge === 'right' ? 'border-r-0' : 'border-l-0';

  const loadConfig = async (): Promise<AppConfig | null> => {
    const result = await window.panelAPI.readConfig();
    if (!result.ok) {
      return null;
    }

    setConfig(result.data);
    return result.data;
  };

  const resetSiteForm = (): void => {
    setAddSiteUrl('');
    setSelectedBrowserId('system');
    setCustomIconPath(null);
    setAutoFavicon(null);
    setFaviconLoading(false);
    setFaviconError(null);
    setSubmittingSite(false);
    setAddSiteError(null);
  };

  const hydrateBuiltinPanel = async (
    descriptor: PanelDescriptor,
    nextConfig: AppConfig | null,
    token: number
  ): Promise<void> => {
    if (descriptor.type !== 'builtin') {
      setSiteInfo(null);
      setSiteInfoError(null);
      return;
    }

    const targetPanel =
      descriptor.builtin?.targetPanelId && nextConfig
        ? nextConfig.panels.find((panel) => panel.id === descriptor.builtin?.targetPanelId) ?? null
        : null;

    switch (descriptor.builtin?.widgetId) {
      case 'add-site':
        resetSiteForm();
        setSiteInfo(null);
        setSiteInfoError(null);
        return;
      case 'edit-site':
        resetSiteForm();
        setSiteInfo(null);
        setSiteInfoError(null);

        if (!targetPanel?.web) {
          setAddSiteError('未找到要编辑的站点');
          return;
        }

        {
          const matchedBrowser = browsers.find(
            (browser) =>
              browser.id === targetPanel.web?.openInBrowser ||
              browser.path?.toLowerCase() === targetPanel.web?.openInBrowser.toLowerCase()
          );

          setAddSiteUrl(targetPanel.web.url);
          setSelectedBrowserId(
            matchedBrowser?.id ?? targetPanel.web.openInBrowser ?? 'system'
          );
          setCustomIconPath(
            targetPanel.iconSource.kind === 'custom' ? targetPanel.iconSource.path ?? null : null
          );
        }
        return;
      case 'site-info':
        resetSiteForm();
        setSiteInfo(null);
        setSiteInfoError(null);

        if (!targetPanel) {
          setSiteInfoError('未找到站点信息');
          return;
        }

        {
          const result = await window.panelAPI.getSiteInfo({ panelId: targetPanel.id });
          if (token !== hydrationTokenRef.current) {
            return;
          }

          if (result.ok) {
            setSiteInfo(result.data);
            return;
          }

          setSiteInfoError(result.error);
        }
        return;
      default:
        setSiteInfo(null);
        setSiteInfoError(null);
    }
  };

  const applyPayload = async (payload: PanelAnimatePayload | PanelChromePayload): Promise<void> => {
    const token = ++hydrationTokenRef.current;
    setChromeState((prev) => ({ ...buildChromeState(payload.descriptor, payload.edge, payload.url, config), panelMode: prev.panelMode }));

    const nextConfig = await loadConfig();
    if (token !== hydrationTokenRef.current) {
      return;
    }

    setChromeState((prev) => ({ ...buildChromeState(payload.descriptor, payload.edge, payload.url, nextConfig), panelMode: prev.panelMode }));
    await hydrateBuiltinPanel(payload.descriptor, nextConfig, token);
  };

  useEffect(() => {
    let mounted = true;

    void loadConfig();

    void window.panelAPI.listBrowsers().then((result) => {
      if (mounted && result.ok) {
        setBrowsers(result.data);
      }
    });

    const disposeAnimateIn = window.panelAPI.onAnimateIn((payload) => {
      void applyPayload(payload);
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
      void applyPayload(payload);
      setFading(false);
    });

    const disposeNavigation = window.panelAPI.onNavigationState((payload: PanelNavigationPayload) => {
      setChromeState((current) =>
        current.panelId === payload.panelId
          ? { ...current, url: payload.url, canGoBack: payload.canGoBack }
          : current
      );
    });

    const disposePanelState = window.panelAPI.onPanelState((state) => {
      setChromeState((prev) =>
        prev.panelMode === state.panelMode ? prev : { ...prev, panelMode: state.panelMode }
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
      disposePanelState();
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
    if (result.ok && result.data) {
      setCustomIconPath(result.data);
    }
  };

  const resolveIconSource = async (normalizedUrl: string) => {
    let faviconForSubmit = autoFavicon;

    if (!customIconPath && !faviconForSubmit) {
      const faviconResult = await window.panelAPI.fetchFavicon({ url: normalizedUrl });
      if (faviconResult.ok) {
        faviconForSubmit = faviconResult.data;
        setAutoFavicon(faviconResult.data);
      }
    }

    if (customIconPath) {
      return {
        kind: 'custom' as const,
        path: customIconPath
      };
    }

    if (faviconForSubmit) {
      return {
        kind: 'auto' as const,
        path: faviconForSubmit.iconPath,
        fallbackLetter: faviconForSubmit.fallbackLetter,
        fallbackColor: faviconForSubmit.fallbackColor
      };
    }

    return {
      kind: 'auto' as const,
      fallbackLetter: deriveTitle(normalizedUrl).slice(0, 1).toUpperCase(),
      fallbackColor: '#375a7f'
    };
  };

  const handleSubmitSite = async (): Promise<void> => {
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
    const iconSource = await resolveIconSource(normalizedUrl);
    const isEditSitePanel = chromeState.builtinWidgetId === 'edit-site';
    const targetPanelId = chromeState.builtinTargetPanelId;

    const result =
      isEditSitePanel && targetPanelId
        ? await window.panelAPI.updatePanel({
            id: targetPanelId,
            patch: {
              title: deriveTitle(normalizedUrl),
              iconSource,
              web: {
                url: normalizedUrl,
                openInBrowser: selectedBrowserId
              }
            }
          })
        : await window.panelAPI.addPanel({
            type: 'web',
            title: deriveTitle(normalizedUrl),
            preferredWidth: config?.layout.panelDefaultWidth ?? PANEL_DEFAULT_WIDTH,
            iconSource,
            web: {
              url: normalizedUrl,
              openInBrowser: selectedBrowserId,
              zoomFactor: 1,
              userAgentMode: 'desktop',
              notificationsSnoozed: false
            }
          });

    setSubmittingSite(false);

    if (!result.ok) {
      setAddSiteError(result.error);
      return;
    }

    await loadConfig();
    resetSiteForm();
    await window.panelAPI.closePanel();
  };

  const isAddSitePanel = chromeState.builtinWidgetId === 'add-site';
  const isEditSitePanel = chromeState.builtinWidgetId === 'edit-site';
  const isSiteFormPanel = isAddSitePanel || isEditSitePanel;
  const isSiteInfoPanel = chromeState.builtinWidgetId === 'site-info';
  const targetPanel =
    chromeState.builtinTargetPanelId && config
      ? config.panels.find((panel) => panel.id === chromeState.builtinTargetPanelId) ?? null
      : null;
  const previewLetter = buildFallbackLabel(
    targetPanel,
    isSiteInfoPanel ? targetPanel?.title ?? '站点' : deriveTitle(normalizeUrl(addSiteUrl) || '站点')
  );
  const previewColor = buildFallbackColor(targetPanel);
  const siteInfoIconPath =
    targetPanel?.iconSource.path ?? siteInfo?.customIconPath ?? null;

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
      <div className="panel-shell absolute inset-0 overflow-hidden bg-[#1b1b1b] text-white">
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
                <div className="min-w-0 truncate text-[15px] font-semibold leading-5 text-white">
                  {chromeState.title}
                </div>
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
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
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
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/8"
                title={chromeState.panelMode === 'pinned' ? '取消固定侧窗格' : '固定侧窗格'}
                onClick={() => void window.panelAPI.togglePin()}
              >
                {chromeState.panelMode === 'pinned' ? <Pin size={14} /> : <PinOff size={14} />}
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
            {isSiteFormPanel ? (
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
                        <div
                          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#282828] text-3xl font-semibold text-white/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                          style={{ backgroundColor: customIconPath ? undefined : previewColor }}
                        >
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
                            previewLetter
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mb-4 truncate text-sm font-semibold text-white/48">
                            {customIconPath
                              ? '正在使用自定义图标'
                              : faviconLoading
                                ? '正在自动获取站点图标...'
                                : autoFavicon
                                  ? '已自动获取站点图标'
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
                        站内链接继续在侧边栏中打开，外开按钮会使用这里选择的浏览器。
                      </p>
                    </section>
                  </div>
                </div>

                <div className="flex h-[88px] shrink-0 items-center justify-between border-t border-white/7 bg-[#191919] px-[24px]">
                  <button
                    type="button"
                    className="h-10 rounded-lg px-1 text-sm font-semibold text-white/58 transition-colors hover:text-white/82"
                    onClick={() => void window.panelAPI.closePanel()}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="h-10 min-w-[148px] rounded-xl bg-[#31598c] px-5 text-sm font-semibold text-white/82 transition-colors hover:bg-[#3b67a0] disabled:cursor-not-allowed disabled:bg-[#253c5d] disabled:text-white/38"
                    disabled={submittingSite || !addSiteUrl.trim()}
                    onClick={() => void handleSubmitSite()}
                  >
                    {submittingSite
                      ? isEditSitePanel
                        ? '更新中...'
                        : '添加中...'
                      : isEditSitePanel
                        ? '更新站点'
                        : '添加到侧边栏'}
                  </button>
                </div>
              </div>
            ) : isSiteInfoPanel ? (
              <div className="absolute inset-0 flex flex-col bg-[#111111]">
                <div className="min-h-0 flex-1 overflow-y-auto px-[22px] py-6">
                  {siteInfoError ? (
                    <div className="rounded-xl border border-[#6b3333] bg-[#2a1515] px-5 py-4 text-sm text-[#ffb8b8]">
                      {siteInfoError}
                    </div>
                  ) : siteInfo ? (
                    <div className="flex flex-col gap-4">
                      <section className="rounded-xl border border-white/9 bg-[#191919] px-5 py-5 shadow-[0_16px_42px_rgba(0,0,0,0.24)]">
                        <div className="flex items-center gap-4">
                          <div
                            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-2xl font-semibold text-white/88"
                            style={{ backgroundColor: buildFallbackColor(targetPanel) }}
                          >
                            {siteInfoIconPath ? (
                              <img
                                src={toRenderableIconUrl(siteInfoIconPath)}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              buildFallbackLabel(targetPanel, siteInfo.title)
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[16px] font-semibold text-white">
                              {siteInfo.title}
                            </div>
                            <div className="mt-1 truncate text-sm text-white/46">
                              {siteInfo.currentUrl}
                            </div>
                          </div>
                        </div>
                      </section>

                      <section className="rounded-xl border border-white/9 bg-[#191919] px-5 py-5 shadow-[0_16px_42px_rgba(0,0,0,0.2)]">
                        <div className="mb-4 text-sm font-semibold text-white/58">站点详情</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg border border-white/8 bg-[#202020] px-4 py-3">
                            <div className="text-xs font-semibold text-white/40">当前视图</div>
                            <div className="mt-2 text-sm font-semibold text-white/86">
                              {siteInfo.userAgentMode === 'mobile' ? '移动版' : '桌面版'}
                            </div>
                          </div>
                          <div className="rounded-lg border border-white/8 bg-[#202020] px-4 py-3">
                            <div className="text-xs font-semibold text-white/40">通知状态</div>
                            <div className="mt-2 text-sm font-semibold text-white/86">
                              {siteInfo.notificationsSnoozed ? '已推迟' : '已允许'}
                            </div>
                          </div>
                          <div className="rounded-lg border border-white/8 bg-[#202020] px-4 py-3">
                            <div className="text-xs font-semibold text-white/40">Cookie 数量</div>
                            <div className="mt-2 text-sm font-semibold text-white/86">
                              {siteInfo.cookieCount}
                            </div>
                          </div>
                          <div className="rounded-lg border border-white/8 bg-[#202020] px-4 py-3">
                            <div className="text-xs font-semibold text-white/40">缓存大小</div>
                            <div className="mt-2 text-sm font-semibold text-white/86">
                              {formatBytes(siteInfo.cacheSizeBytes)}
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/9 bg-[#191919] px-5 py-5 text-sm text-white/56 shadow-[0_16px_42px_rgba(0,0,0,0.2)]">
                      正在读取站点信息...
                    </div>
                  )}
                </div>

                <div className="flex h-[88px] shrink-0 items-center justify-between border-t border-white/7 bg-[#191919] px-[24px]">
                  <div className="text-xs font-semibold text-white/34">数据来自当前共享会话</div>
                  <button
                    type="button"
                    className="h-10 min-w-[120px] rounded-xl bg-[#2a2a2a] px-5 text-sm font-semibold text-white/82 transition-colors hover:bg-[#343434]"
                    onClick={() => void window.panelAPI.closePanel()}
                  >
                    关闭
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
