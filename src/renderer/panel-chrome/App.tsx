import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PANEL_DEFAULT_WIDTH } from '@shared/constants';
import { toRenderableIconUrl } from '@shared/iconUrl';
import { resolveSurfaceColors } from '@shared/theme';
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
import { ChromeToolbar } from './components/ChromeToolbar';
import { ResizeHandle } from './components/ResizeHandle';
import { SettingsView } from './views/settings/SettingsView';

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
    title: 'SideBar',
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
  const [isViewLoading, setIsViewLoading] = useState(false);
  const [addSiteUrl, setAddSiteUrl] = useState('');
  const [selectedBrowserId, setSelectedBrowserId] = useState('system');
  const [sessionGroup, setSessionGroup] = useState('');
  const [sessionGroups, setSessionGroups] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [customIconPath, setCustomIconPath] = useState<string | null>(null);
  const [autoFavicon, setAutoFavicon] = useState<FaviconFetchResult | null>(null);
  const [faviconLoading, setFaviconLoading] = useState(false);
  const [faviconError, setFaviconError] = useState<string | null>(null);
  const [submittingSite, setSubmittingSite] = useState(false);
  const [addSiteError, setAddSiteError] = useState<string | null>(null);
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [siteInfoError, setSiteInfoError] = useState<string | null>(null);
  const [loadingWidth, setLoadingWidth] = useState(0);
  const [loadingVisible, setLoadingVisible] = useState(false);
  const [loadingDone, setLoadingDone] = useState(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelIdRef = useRef<string | null>(chromeState.panelId);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  };
  const hydrationTokenRef = useRef(0);
  const panelCardRadius = chromeState.edge === 'right' ? 'rounded-l-lg' : 'rounded-r-lg';
  const panelCardBorder = chromeState.edge === 'right' ? 'border-r-0' : 'border-l-0';
  const surface = useMemo(
    () =>
      config
        ? resolveSurfaceColors(config.appearance, true)
        : { bg: '#1b1b1b', fg: '#FFFFFFE6' },
    [config]
  );
  // 自适应描边：亮底用深灰，暗底用浅灰
  const isLightBg = useMemo(() => {
    const hex = surface.bg.replace(/^#/, '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) > 128;
  }, [surface.bg]);
  const borderStyle = isLightBg ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const colors = useMemo(() => {
    if (isLightBg) {
      return {
        innerBg: '#FFFFFF',
        footerBg: '#F5F5F5',
        inputBg: '#F9F9F9',
        text: '#1B1B1B',
        mutedText: 'rgba(27,27,27,0.56)',
        subtleBorder: 'rgba(0,0,0,0.10)',
        hoverBg: 'rgba(0,0,0,0.04)',
      };
    }
    return {
      innerBg: '#202020',
      footerBg: '#1C1C1C',
      inputBg: 'transparent',
      text: surface.fg,
      mutedText: '#FFFFFF8F',
      subtleBorder: 'rgba(255,255,255,0.08)',
      hoverBg: 'rgba(255,255,255,0.04)',
    };
  }, [isLightBg, surface.fg]);

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
    setSessionGroup('');
    setNewGroupName('');
    setShowNewGroupInput(false);
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
          setSessionGroup(targetPanel.web?.sessionGroup ?? '');
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
          const result = await Promise.race([
            window.panelAPI.getSiteInfo({ panelId: targetPanel.id }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('加载超时')), 10000)
            )
          ]).catch((e: Error) => ({ ok: false as const, error: e.message }));

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
      case 'settings':
        resetSiteForm();
        setSiteInfo(null);
        setSiteInfoError(null);
        return;
      default:
        setSiteInfo(null);
        setSiteInfoError(null);
    }
  };

  const applyPayload = async (payload: PanelAnimatePayload | PanelChromePayload): Promise<void> => {
    const token = ++hydrationTokenRef.current;
    // Apply appearance from payload immediately to avoid color flash
    if (payload.appearance) {
      setConfig((prev) => prev ? { ...prev, appearance: payload.appearance! } : prev);
    }
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

    void window.panelAPI.listSessionGroups().then((result) => {
      if (mounted && result.ok) {
        setSessionGroups(result.data);
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
      setIsViewLoading(payload.isLoading ?? false);
    });

    const disposeNavigation = window.panelAPI.onNavigationState((payload: PanelNavigationPayload) => {
      setChromeState((current) =>
        current.panelId === payload.panelId
          ? { ...current, url: payload.url, canGoBack: payload.canGoBack }
          : current
      );
    });

    const disposeLoading = window.panelAPI.onLoadingState((payload) => {
      if (payload.panelId !== panelIdRef.current) return;

      if (payload.isLoading) {
        if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
        setLoadingDone(false);
        setLoadingVisible(true);
        setLoadingWidth(70);
      } else {
        setIsViewLoading(false);
        setLoadingWidth(100);
        loadingTimerRef.current = setTimeout(() => {
          setLoadingDone(true);
          loadingTimerRef.current = setTimeout(() => {
            setLoadingVisible(false);
            setLoadingWidth(0);
            setLoadingDone(false);
          }, 200);
        }, 100);
      }
    });

    const disposeCopyToast = window.panelAPI.onCopyToast(() => {
      showToast('✓ 链接已复制', 'success');
    });

    const disposePanelState = window.panelAPI.onPanelState((state) => {
      setChromeState((prev) =>
        prev.panelMode === state.panelMode ? prev : { ...prev, panelMode: state.panelMode }
      );
    });

    const disposeConfigChanged = window.panelAPI.onConfigChanged((nextConfig) => {
      if (mounted) {
        setConfig(nextConfig);
      }
    });

    return () => {
      mounted = false;
      disposePrepareClose();
      disposeAnimateIn();
      disposeAnimateOut();
      disposeFadeOut();
      disposeFadeIn();
      disposeNavigation();
      disposeLoading();
      disposeCopyToast();
      disposePanelState();
      disposeConfigChanged();
    };
  }, []);

  // 面板切换时清除残留的加载进度条 timer
  useEffect(() => {
    panelIdRef.current = chromeState.panelId;
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    setLoadingVisible(false);
    setLoadingWidth(0);
    setLoadingDone(false);
    setIsViewLoading(false);
  }, [chromeState.panelId]);

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

  const handleFaviconRetry = () => {
    const url = addSiteUrl;
    setAddSiteUrl('');
    setFaviconError(null);
    setTimeout(() => setAddSiteUrl(url), 0);
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

    const resolvedGroup = showNewGroupInput && newGroupName.trim()
      ? newGroupName.trim()
      : sessionGroup;

    const result =
      isEditSitePanel && targetPanelId
        ? await window.panelAPI.updatePanel({
            id: targetPanelId,
            patch: {
              title: deriveTitle(normalizedUrl),
              iconSource,
              web: {
                url: normalizedUrl,
                openInBrowser: selectedBrowserId,
                sessionGroup: resolvedGroup || undefined
              }
            }
          })
        : await window.panelAPI.addPanel({
            type: 'web',
            title: deriveTitle(normalizedUrl),

            iconSource,
            web: {
              url: normalizedUrl,
              openInBrowser: selectedBrowserId,
              zoomFactor: 1,
              userAgentMode: 'desktop',
              notificationsSnoozed: false,
              sessionGroup: resolvedGroup || undefined
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
  const isSettingsPanel = chromeState.builtinWidgetId === 'settings';
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
      onKeyDown={(e) => {
        void window.panelAPI.markSticky();
        if (e.altKey && e.key === '`') {
          e.preventDefault();
          void window.panelAPI.togglePin();
        }
      }}
      onMouseLeave={() => {
        void window.panelAPI.scheduleHide();
      }}
    >
      <div
        className="panel-shell absolute inset-0 overflow-hidden"
        style={{ backgroundColor: surface.bg, color: colors.text }}
      >
        <ResizeHandle edge={chromeState.edge} />
        {toast ? (
          <div
            style={{
              position: 'absolute',
              top: PANEL_TOP_INSET + 6,
              left: chromeState.edge === 'right' ? '50%' : undefined,
              right: chromeState.edge === 'left' ? '50%' : undefined,
              transform: 'translateX(-50%)',
              background: toast.type === 'error' ? '#f87171' : toast.type === 'info' ? '#94a3b8' : '#4ade80',
              color: '#000',
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 14px',
              borderRadius: 20,
              zIndex: 300,
              whiteSpace: 'nowrap',
              pointerEvents: 'none'
            }}
          >
            {toast.message}
          </div>
        ) : null}
        <div
          className={`absolute flex flex-col overflow-hidden shadow-[0_0_0_1px_rgba(0,0,0,0.18)] ${panelCardRadius} ${panelCardBorder}`}
          style={{
            left: chromeState.edge === 'right' ? CONTENT_INSET : 0,
            right: chromeState.edge === 'left' ? CONTENT_INSET : 0,
            top: PANEL_TOP_INSET,
            bottom: CONTENT_INSET,
            backgroundColor: surface.bg,
            borderColor: borderStyle,
            borderWidth: 1,
            borderStyle: 'solid'
          }}
        >
          <div
            className={`flex h-[76px] shrink-0 items-center justify-between px-4 transition-opacity duration-100 ${
              fading ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-1 pr-3">
              {chromeState.panelType === 'web' && chromeState.canGoBack ? (
                <button
                  type="button"
                  title="返回"
                  className="-ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded text-white/72 hover:bg-white/30"
                  onClick={() => void handleGoBack()}
                >
                  <ChevronLeft size={17} />
                </button>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                <div className="min-w-0 truncate text-[15px] font-semibold leading-5" style={{ color: colors.text }}>
                  {chromeState.title}
                </div>
                <div className="min-w-0 truncate text-xs leading-4" style={{ color: colors.mutedText }}>
                  {isSiteFormPanel ? '添加任意网页' : isSettingsPanel ? '配置应用选项与偏好' : chromeState.url || (config ? '正在准备面板...' : 'Loading panel...')}
                </div>
              </div>
            </div>
            <ChromeToolbar
              panelId={chromeState.panelId}
              panelType={chromeState.panelType}
              panelMode={chromeState.panelMode}
              edge={chromeState.edge}
            />
          </div>
          {loadingVisible ? (
            <div
              className={`loading-bar${loadingDone ? ' loading-bar--done' : ''}`}
              style={{ width: `${loadingWidth}%` }}
            />
          ) : null}
          <div className="relative flex-1 overflow-hidden bg-[#242424]">
            {isSiteFormPanel ? (
              <div className="absolute inset-0 flex flex-col" style={{ backgroundColor: colors.innerBg, color: colors.text }}>
                <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-7">
                  <h2 className="mb-7 animate-fade-up text-[15px] font-semibold tracking-cn" style={{ color: colors.text }}>
                    {isEditSitePanel ? '编辑站点' : '添加网页'}
                  </h2>

                  <div className="flex flex-col gap-7 animate-fade-up [animation-delay:60ms]">
                    <div>
                      <label className="field-label mb-2.5">网址</label>
                      <input
                        value={addSiteUrl}
                        onChange={(event) => {
                          setAddSiteUrl(event.target.value);
                          if (addSiteError) {
                            setAddSiteError(null);
                          }
                        }}
                        placeholder="例如 github.com 或 https://example.com"
                        className="input-accent h-11 w-full border bg-transparent px-3 font-mono text-[14px] outline-none transition-colors placeholder:font-body placeholder:text-[13px] placeholder:tracking-cn"
                        style={{ borderColor: colors.subtleBorder, color: colors.text }}
                      />
                      {addSiteError ? (
                        <div className="mt-2.5 flex items-center gap-2 text-[12px] tracking-cn text-[#ff9d9d]">
                          <span className="font-mono text-[10px]">!</span>
                          {addSiteError}
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <div className="field-label mb-3">图标预览</div>
                      <div className="flex min-h-[120px] items-center gap-5 rounded-lg border px-4 py-4" style={{ borderColor: colors.subtleBorder, backgroundColor: colors.inputBg }}>
                        <div
                          className={`relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed${faviconError && !customIconPath ? ' cursor-pointer' : ''}`}
                          style={{
                            borderColor: colors.subtleBorder,
                            backgroundColor: 'transparent',
                          }}
                          onClick={faviconError && !customIconPath ? handleFaviconRetry : undefined}
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
                            <span className="select-none text-[28px] font-light leading-none" style={{ color: colors.mutedText }}>+</span>
                          )}
                          {faviconError && !customIconPath ? (
                            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                              <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }}>↺ 重试</span>
                            </div>
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mb-3 flex items-center gap-2">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                faviconLoading
                                  ? 'animate-pulse bg-amber'
                                  : customIconPath || autoFavicon
                                    ? 'bg-amber'
                                    : faviconError
                                      ? 'bg-[#ff9d9d]'
                                      : 'bg-white/25'
                              }`}
                            />
                            <span className="truncate text-[12px] tracking-cn" style={{ color: colors.mutedText }}>
                              {customIconPath
                                ? '使用自定义图标'
                                : faviconLoading
                                  ? '正在获取站点图标…'
                                  : autoFavicon
                                    ? '已自动获取站点图标'
                                    : faviconError
                                      ? '获取失败，使用字母图标'
                                      : '输入网址后自动获取'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="border bg-transparent px-3 py-1.5 text-[12px] tracking-cn transition-colors hover:border-accent/60 hover:text-accent"
                              style={{ borderColor: colors.subtleBorder, color: colors.mutedText }}
                              onClick={() => void handlePickCustomIcon()}
                            >
                              手动选择
                            </button>
                            {customIconPath ? (
                              <button
                                type="button"
                                className="border bg-transparent px-3 py-1.5 text-[12px] tracking-cn transition-colors hover:border-white/30"
                                style={{ borderColor: colors.subtleBorder, color: colors.mutedText }}
                                onClick={() => setCustomIconPath(null)}
                              >
                                清除
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="field-label mb-2.5">打开方式</label>
                      <select
                        value={selectedBrowserId}
                        onChange={(event) => setSelectedBrowserId(event.target.value)}
                        className="input-accent h-11 w-full border bg-transparent px-3 text-[13px] tracking-cn outline-none transition-colors"
                        style={{ borderColor: colors.subtleBorder, color: colors.text, backgroundColor: colors.inputBg }}
                      >
                        {browsers.map((browser) => (
                          <option key={browser.id} value={browser.id} style={{ backgroundColor: colors.innerBg, color: colors.text }}>
                            {browser.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2.5 border-l-2 pl-3 text-[12px] leading-relaxed tracking-cn" style={{ borderColor: colors.subtleBorder, color: colors.mutedText }}>
                        站内链接继续在侧边栏中打开。外开按钮会使用这里选择的浏览器。
                      </p>
                    </div>

                    <div>
                      <label className="field-label mb-2.5">会话分组</label>
                      <select
                        value={showNewGroupInput ? '__new__' : sessionGroup}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value === '__new__') {
                            setShowNewGroupInput(true);
                            setNewGroupName('');
                          } else {
                            setShowNewGroupInput(false);
                            setSessionGroup(value);
                          }
                        }}
                        className="input-accent h-11 w-full border bg-transparent px-3 text-[13px] tracking-cn outline-none transition-colors"
                        style={{ borderColor: colors.subtleBorder, color: colors.text, backgroundColor: colors.inputBg }}
                      >
                        <option value="" style={{ backgroundColor: colors.innerBg, color: colors.text }}>
                          共享（默认）
                        </option>
                        <option value="__isolated__" style={{ backgroundColor: colors.innerBg, color: colors.text }}>
                          独立会话
                        </option>
                        {sessionGroups.map((group) => (
                          <option key={group} value={group} style={{ backgroundColor: colors.innerBg, color: colors.text }}>
                            {group}
                          </option>
                        ))}
                        <option value="__new__" style={{ backgroundColor: colors.innerBg, color: colors.text }}>
                          新建分组…
                        </option>
                      </select>
                      {showNewGroupInput ? (
                        <input
                          value={newGroupName}
                          onChange={(event) => setNewGroupName(event.target.value)}
                          placeholder="输入分组名称，如：工作、个人"
                          className="input-accent mt-2.5 h-11 w-full border bg-transparent px-3 text-[13px] tracking-cn outline-none transition-colors"
                          style={{ borderColor: colors.subtleBorder, color: colors.text }}
                          autoFocus
                        />
                      ) : null}
                      <p className="mt-2.5 border-l-2 pl-3 text-[12px] leading-relaxed tracking-cn" style={{ borderColor: colors.subtleBorder, color: colors.mutedText }}>
                        同一分组内的站点共享登录态。登录一次 Google，同组站点即可直接使用。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex h-[80px] shrink-0 items-center justify-between border-t pl-8 pr-3" style={{ borderColor: colors.subtleBorder, backgroundColor: colors.footerBg }}>
                  <button
                    type="button"
                    className="ghost-link px-1 py-1 text-[12px] tracking-cn transition-colors"
                    style={{ color: colors.mutedText }}
                    onClick={() => void window.panelAPI.closePanel()}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="group inline-flex items-center gap-2 rounded-md border border-accent/50 bg-accent/10 px-6 py-2.5 text-[12px] font-semibold tracking-cn text-accent transition-colors hover:bg-accent hover:text-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-50 disabled:saturate-0 disabled:hover:bg-transparent"
                    disabled={submittingSite || !addSiteUrl.trim()}
                    onClick={() => void handleSubmitSite()}
                  >
                    <span>
                      {submittingSite
                        ? isEditSitePanel
                          ? '更新中…'
                          : '添加中…'
                        : isEditSitePanel
                          ? '更新站点'
                          : '添加到侧边栏'}
                    </span>
                    <span className="font-mono text-[10px] transition-transform group-enabled:group-hover:translate-x-0.5">
                      →
                    </span>
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

                <div className="flex h-[88px] shrink-0 items-center justify-between border-t px-[24px]" style={{ borderColor: colors.subtleBorder, backgroundColor: colors.footerBg }}>
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
            ) : isSettingsPanel ? (
              <SettingsView colors={colors} onToast={showToast} />
            ) : contentSnapshotDataUrl ? (
              <img
                src={contentSnapshotDataUrl}
                alt=""
                draggable={false}
                className="absolute inset-0 h-full w-full object-fill"
              />
            ) : isViewLoading ? (
              <div className="absolute inset-0 flex flex-col gap-4 bg-[#242424] p-4">
                <div className="panel-loading-skeleton h-4 w-3/4 rounded" />
                <div className="panel-loading-skeleton h-4 w-1/2 rounded" />
                <div className="panel-loading-skeleton h-4 w-5/6 rounded" />
                <div className="panel-loading-skeleton h-4 w-2/3 rounded" />
                <div className="panel-loading-skeleton h-32 w-full rounded-lg mt-2" />
              </div>
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
