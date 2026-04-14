/**
 * LinkInterceptScreen.tsx
 *
 * Main orchestrator for the LinkGuard flow.
 */

import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useNavigation } from '@react-navigation/native';

import { useLinkGuard } from '@/hooks/useLinkGuard';
import ScanningScreen from './ScanningScreen';
import SafeScreen     from './SafeScreen';
import WarningScreen  from './WarningScreen';
import DangerScreen   from './DangerScreen';

export default function LinkInterceptScreen() {
  const navigation = useNavigation();
  const { state, startScan, openInBrowser, cancelAutoOpen, reset } = useLinkGuard();

  useEffect(() => {
    let mounted = true;

    const handleUrl = (url: string) => {
      if (mounted) startScan(url);
    };

    Linking.getInitialURL().then((url) => {
      if (url && mounted) handleUrl(url);
    });

    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [startScan]);

  const goBack = useCallback(() => {
    cancelAutoOpen();
    reset();
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [cancelAutoOpen, navigation, reset]);

  const handleOpenNow = useCallback(() => {
    cancelAutoOpen();
    if (state.url) openInBrowser(state.url);
    goBack();
  }, [cancelAutoOpen, goBack, openInBrowser, state.url]);

  const handleOpenAnyway = useCallback(() => {
    cancelAutoOpen();
    if (state.url) openInBrowser(state.url);
    goBack();
  }, [cancelAutoOpen, goBack, openInBrowser, state.url]);

  const { status, url, fastResult, deepResult, finalVerdict, isPartialScan } = state;

  if (status === 'fast-scanning' || status === 'deep-scanning') {
    return <ScanningScreen url={url} status={status} />;
  }

  if (status === 'complete' && finalVerdict) {
    if (finalVerdict === 'safe') {
      const autoOpenDelay = fastResult?.whitelisted ? 1500 : 3000;
      return (
        <SafeScreen
          url={url}
          fastResult={fastResult}
          deepResult={deepResult}
          onOpenNow={handleOpenNow}
          onGoBack={goBack}
          autoOpenDelay={autoOpenDelay}
        />
      );
    }

    if (finalVerdict === 'suspicious') {
      return (
        <WarningScreen
          url={url}
          fastResult={fastResult}
          deepResult={deepResult}
          onOpenAnyway={handleOpenAnyway}
          onGoBack={goBack}
          isPartialScan={isPartialScan}
        />
      );
    }

    if (finalVerdict === 'dangerous') {
      return (
        <DangerScreen
          url={url}
          fastResult={fastResult}
          deepResult={deepResult}
          onGoBack={goBack}
        />
      );
    }
  }

  return <View style={styles.bg} />;
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
});
