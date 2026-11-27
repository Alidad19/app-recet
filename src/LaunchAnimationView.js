import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import animationData from '../assets/plug-in-failed.json';
import { LOTTIE_WEB_SCRIPT } from './lottieWebScript';

const BG = '#0B0F2A';

function buildHtml() {
  return `<!doctype html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};overflow:hidden;">
<div id="lottie" style="width:100vw;height:100vh;"></div>
<script>window.__ANIM_DATA__=${JSON.stringify(animationData)};</script>
<script>${LOTTIE_WEB_SCRIPT}</script>
<script>
(function () {
  function finished() {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage('done');
    }
  }
  try {
    var anim = window.lottie.loadAnimation({
      container: document.getElementById('lottie'),
      renderer: 'svg',
      loop: false,
      autoplay: true,
      animationData: window.__ANIM_DATA__,
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    });
    anim.addEventListener('complete', finished);
    anim.addEventListener('data_failed', finished);
  } catch (e) {
    finished();
  }
  // Falls back if the animation never reports completion (older webviews).
  setTimeout(finished, 2600);
})();
</script>
</body>
</html>`;
}

export default function LaunchAnimationView({ onDone }) {
  const html = useMemo(buildHtml, []);

  return (
    <View style={styles.root}>
      <WebView
        source={{ html }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        originWhitelist={['*']}
        pointerEvents="none"
        onMessage={() => onDone?.()}
        onError={() => onDone?.()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  webview: {
    flex: 1,
    backgroundColor: BG,
  },
});
