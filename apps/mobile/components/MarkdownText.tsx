import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppText, type AppTextProps } from './AppText';

type MarkdownTextProps = { content: string; tone?: AppTextProps['tone']; variant?: AppTextProps['variant'] };

type Block = { type: 'paragraph' | 'bullet' | 'numbered'; text: string; marker?: string };

// A deliberately small, dependency-free Markdown subset — just enough for what Family
// Brain's system prompt actually produces (bold emphasis and short lists). Not a full
// CommonMark renderer; unrecognized syntax is left as plain text rather than breaking.
function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() });
      paragraph = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    const bullet = /^[-*]\s+(.*)/.exec(line);
    if (bullet) {
      flushParagraph();
      blocks.push({ type: 'bullet', text: bullet[1] ?? '' });
      continue;
    }
    const numbered = /^(\d+)[.)]\s+(.*)/.exec(line);
    if (numbered) {
      flushParagraph();
      blocks.push({ type: 'numbered', text: numbered[2] ?? '', marker: `${numbered[1]}.` });
      continue;
    }
    const heading = /^#{1,6}\s+(.*)/.exec(line);
    paragraph.push(heading ? heading[1] ?? '' : line);
  }
  flushParagraph();
  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const pattern = /\*\*(.+?)\*\*|`([^`]+?)`|_(.+?)_|\*(.+?)\*/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) nodes.push(<Text key={key++} style={styles.bold}>{match[1]}</Text>);
    else if (match[2] !== undefined) nodes.push(<Text key={key++} style={styles.code}>{match[2]}</Text>);
    else if (match[3] !== undefined) nodes.push(<Text key={key++} style={styles.italic}>{match[3]}</Text>);
    else if (match[4] !== undefined) nodes.push(<Text key={key++} style={styles.italic}>{match[4]}</Text>);
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function MarkdownText({ content, tone = 'text', variant = 'body' }: MarkdownTextProps) {
  const blocks = parseBlocks(content);
  if (blocks.length === 0) return null;

  return (
    <View style={styles.container}>
      {blocks.map((block, index) => {
        if (block.type === 'bullet' || block.type === 'numbered') {
          return (
            <View key={index} style={styles.listRow}>
              <AppText variant={variant} tone={tone} style={styles.marker}>{block.type === 'numbered' ? block.marker : '•'}</AppText>
              <AppText variant={variant} tone={tone} style={styles.listText}>{renderInline(block.text)}</AppText>
            </View>
          );
        }
        return <AppText key={index} variant={variant} tone={tone} style={index > 0 ? styles.paragraphSpacing : undefined}>{renderInline(block.text)}</AppText>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  paragraphSpacing: { marginTop: 4 },
  listRow: { flexDirection: 'row', gap: 6 },
  marker: { minWidth: 16 },
  listText: { flex: 1 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  code: { fontFamily: 'monospace' }
});
