import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { spacing } from '@familyapp/config';

import { AppText } from './AppText';
import { BrandMark } from './BrandMark';
import { Button } from './Button';
import { Card } from './Card';
import { Screen } from './Screen';
import { TextField } from './TextField';
import { acceptFamilyInvitation, createFamily, FamilyApiError } from '../lib/families';

type Step = 'choices' | 'create' | 'join';

export function FamilyOnboarding({ onComplete }: { onComplete: () => Promise<void> }) {
  const [step, setStep] = useState<Step>('choices');
  const [familyName, setFamilyName] = useState('');
  const [invitationToken, setInvitationToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  async function submitCreate() {
    setError(null);
    setIsSubmitting(true);
    try {
      await createFamily(familyName);
      await onComplete();
    } catch (error) {
      setError(error instanceof FamilyApiError ? error.message : 'Unable to create your family right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitJoin() {
    setError(null);
    setIsSubmitting(true);
    try {
      await acceptFamilyInvitation(invitationToken);
      await onComplete();
    } catch (error) {
      setError(error instanceof FamilyApiError ? error.message : 'Unable to use that invitation right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const choose = (nextStep: Step) => {
    setError(null);
    setStep(nextStep);
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={[styles.layout, isWide && styles.layoutWide]}>
        <View style={styles.intro}>
          <BrandMark />
          <AppText variant="eyebrow" tone="primary" style={styles.eyebrow}>Your family starts here</AppText>
          <AppText variant="display" style={styles.title}>A place for your people.</AppText>
          <AppText variant="body" tone="mutedText" style={styles.description}>Create your family space, or join one with an invitation. You can keep it simple for now.</AppText>
        </View>
        <Card elevated style={styles.card}>
          {step === 'choices' ? <>
            <AppText variant="heading">How would you like to begin?</AppText>
            <AppText variant="body" tone="mutedText" style={styles.cardIntro}>FamilyApp keeps your family space private and close.</AppText>
            <View style={styles.actions}>
              <Button fullWidth label="Create a Family" onPress={() => choose('create')} />
              <Button fullWidth label="Join a Family" onPress={() => choose('join')} variant="secondary" />
            </View>
          </> : <>
            <Pressable accessibilityRole="button" onPress={() => choose('choices')} style={styles.back}><AppText variant="caption" tone="secondary">← Back to choices</AppText></Pressable>
            <AppText variant="heading">{step === 'create' ? 'Name your family' : 'Join your family'}</AppText>
            <AppText variant="body" tone="mutedText" style={styles.cardIntro}>{step === 'create' ? 'Choose a name that feels like home.' : 'Enter the invitation code shared with you.'}</AppText>
            {step === 'create' ? <TextField autoFocus label="Family name" onChangeText={setFamilyName} placeholder="The Wilson family" value={familyName} /> : <TextField autoFocus autoCapitalize="none" label="Invitation code" onChangeText={setInvitationToken} placeholder="Paste your invitation code" value={invitationToken} />}
            {error ? <AppText variant="caption" tone="danger" style={styles.error}>{error}</AppText> : null}
            <Button fullWidth label={step === 'create' ? 'Create family' : 'Join family'} loading={isSubmitting} onPress={step === 'create' ? submitCreate : submitJoin} style={styles.submit} />
          </>}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', paddingBottom: spacing.xl, paddingTop: spacing.xl },
  layout: { alignSelf: 'center', maxWidth: 520, width: '100%' },
  layoutWide: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxxl, maxWidth: 1080 },
  intro: { flex: 1, paddingVertical: spacing.lg },
  eyebrow: { marginTop: spacing.xxl },
  title: { marginTop: spacing.md },
  description: { fontSize: 18, lineHeight: 28, marginTop: spacing.md, maxWidth: 420 },
  card: { flex: 1, padding: spacing.xl, width: '100%' },
  cardIntro: { marginTop: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginBottom: spacing.md },
  error: { marginTop: spacing.md },
  submit: { marginTop: spacing.lg }
});
