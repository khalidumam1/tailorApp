/**
 * User Guide (Phase 3 task 3.1) — searchable in-app help compiled from
 * `docs/user-guide/` by `tools/build-guide.mjs`. Offline by construction:
 * the pages ship inside the app bundle, so help works without a connection.
 */
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { GUIDE_PAGES, type GuidePage } from '../guide-content';

function GuideBody({ body }: { body: string }) {
  const styles = useAppStyles();
  return (
    <>
      {body.split('\n').map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return null;
        const text = line.replace(/\*\*/g, '');
        if (line.startsWith('## ')) return <Text key={index} style={styles.sectionTitle}>{text.slice(3)}</Text>;
        if (line.startsWith('### ')) return <Text key={index} style={styles.listTitle}>{text.slice(4)}</Text>;
        if (line.startsWith('# ')) return <Text key={index} style={styles.pageTitle}>{text.slice(2)}</Text>;
        if (line.startsWith('- ') || /^\d+\. /.test(line)) {
          return <Text key={index} style={styles.listMeta}>{`• ${text.replace(/^- |\d+\. /, '')}`}</Text>;
        }
        return <Text key={index} style={styles.listMeta}>{text}</Text>;
      })}
    </>
  );
}

export function GuideScreen() {
  const styles = useAppStyles();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('quick-start');
  const pages = useMemo(
    () => GUIDE_PAGES.filter((page) => page.audience === 'business' || page.audience === 'all'),
    [],
  );
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? pages.filter((page) => `${page.title} ${page.keywords} ${page.body}`.toLowerCase().includes(needle))
    : pages;
  const selected: GuidePage | undefined = matches.find((page) => page.id === selectedId) ?? matches[0];

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>User Guide</Text>
          <Text style={styles.pageSubtitle}>Step-by-step help, with a Roman Urdu summary on every page.</Text>
        </View>
      </View>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="Search: order, payment, password…"
        accessibilityLabel="Search the guide"
      />
      {matches.length === 0 && (
        <Text style={styles.listMeta}>No page matches “{query}”. Try a module name like Orders or Payments.</Text>
      )}
      {matches.map((page) => (
        <Pressable
          key={page.id}
          accessibilityRole="button"
          accessibilityLabel={page.title}
          onPress={() => setSelectedId(page.id)}
          style={({ pressed }) => [styles.listCard, pressed && styles.pressed]}
        >
          <View style={styles.listMain}>
            <Text style={styles.listTitle}>{page.title}</Text>
          </View>
        </Pressable>
      ))}
      {selected && (
        <View style={styles.card}>
          <Text style={styles.pageTitle}>{selected.title}</Text>
          <GuideBody body={selected.body} />
        </View>
      )}
    </>
  );
}
