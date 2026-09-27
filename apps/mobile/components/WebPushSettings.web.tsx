import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { spacing } from '@familyapp/config';

import { disableWebPush, enableWebPush, getWebPushStatus, type WebPushStatus } from '../lib/push-notifications.web';
import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';

const copy: Record<WebPushStatus, string> = {
  checking: 'Checking browser notification support…',
  unsupported: 'Browser notifications are not available here, or the public notification key has not been configured.',
  'needs-install': 'On iPhone or iPad, add FamilyApp to your Home Screen first, then open the installed app to enable notifications.',
  'not-enabled': 'Get timely FamilyApp alerts even when this page is closed.',
  enabled: 'Browser notifications are enabled on this device.',
  denied: 'Notifications are blocked for FamilyApp. You can allow them in your browser or device settings.',
  error: 'Browser notifications could not be updated. Check your connection and try again.'
};

export function WebPushSettings() {
  const [status, setStatus] = useState<WebPushStatus>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => { void getWebPushStatus().then(setStatus); }, []);

  async function update(action: () => Promise<WebPushStatus>) {
    if (busy) return;
    setBusy(true);
    setStatus(await action());
    setBusy(false);
  }

  return (
    <Card elevated style={styles.card}>
      <View style={styles.copy}>
        <AppText variant="label">Browser notifications</AppText>
        <AppText variant="caption" tone="mutedText" style={styles.description}>{copy[status]}</AppText>
      </View>
      {status === 'checking' ? <ActivityIndicator /> : null}
      {status === 'not-enabled' || status === 'error' ? (
        <Button label={status === 'error' ? 'Try again' : 'Enable'} loading={busy} onPress={() => void update(enableWebPush)} />
      ) : null}
      {status === 'enabled' ? (
        <Button label="Turn off" variant="secondary" loading={busy} onPress={() => void update(disableWebPush)} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between', marginTop: spacing.lg },
  copy: { flex: 1, minWidth: 220 },
  description: { marginTop: spacing.xs }
});
