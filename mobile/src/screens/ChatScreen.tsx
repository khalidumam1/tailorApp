/**
 * Chat assistant — simple conversational helper for common shop questions.
 * Answers from locally synced data (orders, customers, payments, dashboard).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, EmptyState, IconDot, StatusPill } from '../theme/primitives';
import { Icon } from '../Icons';
import { useWorkspace } from '../hooks/useWorkspace';
import { formatCurrency } from '../local';

type Message = { id: string; text: string; sender: 'user' | 'assistant'; createdAt: number };

export function ChatScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'assistant', text: copy.chatWelcome ?? 'How can I help with your shop today?', createdAt: Date.now() },
  ]);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const customers = ws.customers ?? [];
  const orders = ws.orders ?? [];
  const dashboard = ws.dashboard ?? {};

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || sending) return;
    const userMessage: Message = { id: String(Date.now()), sender: 'user', text: input.trim(), createdAt: Date.now() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);
    const reply = generateReply(input.trim());
    setTimeout(() => {
      setMessages((prev) => [...prev, { id: String(Date.now() + 1), sender: 'assistant', text: reply, createdAt: Date.now() }]);
      setSending(false);
      scrollToBottom();
    }, 600);
  }, [input, sending, scrollToBottom]);

  const generateReply = (query: string): string => {
    const q = query.toLowerCase();
    const currency = (ws.businessConfiguration?.business.currency as string) ?? 'PKR';

    if (q.includes('order') && (q.includes('today') || q.includes('new'))) {
      const today = new Date().toISOString().slice(0, 10);
      const todayOrders = orders.filter((o) => o.promised_at?.slice(0, 10) === today);
      return `You have ${todayOrders.length} new order${todayOrders.length !== 1 ? 's' : ''} today.`;
    }
    if (q.includes('outstanding') || q.includes('balance') || q.includes('owed')) {
      const outstanding = dashboard.outstanding;
      return outstanding !== undefined ? `Outstanding balance: ${formatCurrency(String(outstanding), currency)}.` : "I don't have outstanding balance data yet.";
    }
    if (q.includes('customer') && (q.includes('count') || q.includes('total') || q.includes('how many'))) {
      return `You have ${customers.length} customer${customers.length !== 1 ? 's' : ''} on record.`;
    }
    if (q.includes('payment') && (q.includes('today') || q.includes('collected'))) {
      const collected = dashboard.collectedToday;
      return collected !== undefined ? `Collected today: ${formatCurrency(String(collected), currency)}.` : "I don't have today's collection data yet.";
    }
    if (q.includes('whatsapp') || q.includes('message')) {
      return 'I can help you send WhatsApp messages to customers. Open an order or customer and use the WhatsApp button.';
    }
    if (q.includes('help') || q.includes('hi') || q.includes('hello')) {
      return 'Ask me about orders today, outstanding balance, customer count, or today\'s collections. I can also help with WhatsApp messages.';
    }
    return "I'm not sure about that. Try asking about orders today, outstanding balance, customer count, or today's collections.";
  };

  return (
    <View style={styles.page}>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.chatAssistant ?? 'Chat assistant'}</Text>
          <Text style={styles.pageSubtitle}>{copy.chatSubtitle ?? 'Ask about orders, customers, payments and collections.'}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.chatList}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={({ item }) => (
            <View style={[styles.chatBubble, item.sender === 'user' && styles.chatBubbleUser]}>
              <View style={styles.chatBubbleInner}>
                {item.sender === 'assistant' ? <IconDot tone="primary" name="chat" /> : <IconDot tone="mint" name="check" />}
                <Text style={[styles.chatBubbleText, item.sender === 'user' && styles.chatBubbleTextUser]}>{item.text}</Text>
              </View>
            </View>
          )}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState title={copy.chatEmpty ?? 'No messages yet'} detail={copy.chatEmptyDetail ?? 'Send a message to start the conversation.'} />}
        />
        {sending ? <View style={styles.typingRow}><ActivityIndicator size="small" color={palette.primary} /><Text style={styles.typingText}>{copy.chatTyping ?? 'Assistant is typing…'}</Text></View> : null}
      </ScrollView>

      <KeyboardAvoidingView behavior="padding" style={styles.chatInputWrap}>
        <View style={styles.chatInputRow}>
          <TextInput
            accessibilityLabel={copy.chatInputLabel ?? 'Type a message'}
            autoCapitalize="sentences"
            autoCorrect={false}
            blurOnSubmit={false}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            placeholder={copy.chatPlaceholder ?? 'Ask about orders, customers, payments…'}
            placeholderTextColor={palette.mutedText}
            style={styles.chatInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.send ?? 'Send'}
            disabled={!input.trim() || sending}
            onPress={handleSend}
            style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
          >
            <Text style={styles.sendButtonText}>{copy.send ?? 'Send'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function formatCustomerName(c: { name?: string | null; phone?: string | null }): string {
  return c.name ?? c.phone ?? 'Customer';
}
