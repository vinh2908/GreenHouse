# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-workflows.spec.ts >> customer: unavailable services show retry without selectable demo data
- Location: tests\browser\mobile-workflows.spec.ts:27:5

# Error details

```
Error: browserContext.newPage: Target page, context or browser has been closed
Browser logs:

<launching> C:\Users\acer\AppData\Local\ms-playwright\chromium_headless_shell-1248\chrome-headless-shell-win64\chrome-headless-shell.exe --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-edgeupdater --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,BlockOriginHeaderModificationOnRedirect,AvoidCorsURLLoaderRestartOnRedirect,Translate,AutoDeElevate,OptimizationHints,NetworkTimeServiceQuerying,AimEnabled,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --disable-updater-scheduler --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --headless --hide-scrollbars --mute-audio --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 --no-sandbox --user-data-dir=C:\Users\acer\AppData\Local\Temp\playwright_chromiumdev_profile-Mzs45x --remote-debugging-pipe --no-startup-window
<launched> pid=15532
[pid=15532][err] [1020/090440.385:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.408:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.414:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.422:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.426:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.429:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.434:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.436:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.443:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.445:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.449:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.454:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.460:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.461:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.465:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.470:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.475:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.480:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.486:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.489:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.495:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.499:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.501:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [1020/090440.506:ERROR:content\browser\network_service_instance_impl.cc:652] Network service crashed or was terminated, restarting service.
[pid=15532][err] [low_level_alloc.cc : 590] RAW: Check new_pages != nullptr failed: VirtualAlloc failed
[pid=15532][err] [1020/090440.616:FATAL:low_level_alloc.cc:590] NOTREACHED hit. Check new_pages != nullptr failed: VirtualAlloc failed
[pid=15532][err] 
[pid=15532][err] [1020/090440.652:ERROR:media\base\win\mf_initializer.cc:46] Failed to start Media Foundation, accelerated media functionality may be disabled. If you're using Windows N, see https://support.microsoft.com/en-us/topic/media-feature-pack-for-windows-10-n-may-2020-ebbdf559-b84c-0fc2-bd51-e23c9f6a4439 for information on how to install the Media Feature Pack. Error: Could not load mf.dll: A dynamic link library (DLL) initialization routine failed. (0x45A)
```