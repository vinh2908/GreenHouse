import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Root HTML template for Expo Router Web static rendering.
 * Configures PWA metadata, manifest, viewport, and Apple mobile web app tags.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="vi">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>Green House</title>

        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#22C55E" />

        {/* Apple iOS PWA Meta Tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Green House" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icon-512.png" />

        {/* Android & General Mobile Meta */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="Green House" />

        {/* Stringee Web SDK for PWA & Browser audio calling */}
        <script src="https://cdn.stringee.com/sdk/web/latest/stringee-web-sdk.min.js" />

        {/* PWA Service Worker Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(function(reg) {
                    reg.update();
                  }).catch(function() {});
                });
              }
            `,
          }}
        />

        <ScrollViewStyleReset />

        {/* Style cho html, body và #root lấp đầy chiều cao màn hình động của trình duyệt */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body {
                height: 100%;
                width: 100%;
                margin: 0;
                padding: 0;
                background-color: #FFFFFF;
                -webkit-text-size-adjust: 100%;
                overscroll-behavior-y: none;
              }
              #root {
                display: flex;
                flex-direction: column;
                height: 100%;
                min-height: 100%;
                min-height: 100dvh;
                min-height: -webkit-fill-available;
                width: 100%;
                background-color: #FFFFFF;
              }
              @media all and (display-mode: standalone) {
                html, body {
                  min-height: 100%;
                  min-height: calc(100% + env(safe-area-inset-bottom, 0px));
                }
                #root {
                  min-height: 100%;
                  min-height: calc(100% + env(safe-area-inset-bottom, 0px));
                }
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
