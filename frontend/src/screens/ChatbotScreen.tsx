/**
 * src/screens/ChatbotScreen.tsx
 *
 * Cybot AI chat screen with a slide-in history sidebar.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { api } from '@/services/api';
import { Menu } from 'lucide-react-native';
import type { MainTabsParamList } from '@/navigation/AppNavigator';
import { useAuthContext } from '@/contexts/AuthContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SIDEBAR_WIDTH = Math.min(SCREEN_WIDTH * 0.78, 300);
const CYAN = '#00E5FF';
const BG   = '#080810';
const CARD = '#0F0F1A';

function makeWelcome(name?: string | null): Message {
  const greeting = name
    ? `Hello ${name}!! I'm your cybersecurity AI assistant. Ask me anything about threats, privacy, or ethical tech.`
    : "Hi, I'm Cybot — your cybersecurity AI assistant. Ask me anything about threats, privacy, or ethical tech.";
  return { id: '__welcome__', role: 'assistant', content: greeting };
}

export default function ChatbotScreen() {
  const route = useRoute<RouteProp<MainTabsParamList, 'Chatbot'>>();
  const initialMessage = (route.params as any)?.initialMessage as string | undefined;
  const { user } = useAuthContext();

  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? null;
  const WELCOME = makeWelcome(firstName);

  const [messages,       setMessages]       = useState<Message[]>([WELCOME]);
  const [input,          setInput]          = useState('');
  const [sending,        setSending]        = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const autoSentRef = useRef(false);

  const [sessions,       setSessions]       = useState<ChatSession[]>([]);
  const [sessionsState,  setSessionsState]  = useState<'idle' | 'loading' | 'error'>('idle');
  const [activeId,       setActiveId]       = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const listRef    = useRef<FlatList>(null);
  const sidebarPos = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;

  const loadSessions = useCallback(async () => {
    setSessionsState('loading');
    try {
      const { data } = await api.get<ChatSession[]>('/threats/chat/sessions/');
      setSessions(data ?? []);
      setSessionsState('idle');
    } catch {
      setSessionsState('error');
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Auto-send initialMessage passed from HomeScreen AI Briefing
  useEffect(() => {
    if (!initialMessage || autoSentRef.current) return;
    autoSentRef.current = true;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: initialMessage };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

    api.post<{ reply: string; session_id: string | null }>(
      '/threats/chat/',
      { message: initialMessage, session_id: null },
    ).then(({ data }) => {
      if (data.session_id) {
        setActiveId(data.session_id);
        loadSessions();
      }
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: data.reply ?? 'No response received.' },
      ]);
    }).catch((err: any) => {
      const status = err?.response?.status;
      let content = err?.response?.data?.error ?? 'Sorry, something went wrong. Please try again.';
      if (status === 429) content = 'You are sending messages too fast. Please wait a moment.';
      setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: 'assistant', content }]);
    }).finally(() => {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage]);

  const openSidebar = useCallback(() => {
    setSidebarVisible(true);
    Animated.timing(sidebarPos, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [sidebarPos]);

  const closeSidebar = useCallback(() => {
    Animated.timing(sidebarPos, {
      toValue: -SIDEBAR_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setSidebarVisible(false));
  }, [sidebarPos]);

  const openSession = useCallback(async (session: ChatSession) => {
    closeSidebar();
    if (session.id === activeId) return;

    setActiveId(session.id);
    setMessages([WELCOME]);
    setLoadingSession(true);

    try {
      const { data } = await api.get<{ id: string; role: string; content: string }[]>(
        `/threats/chat/sessions/${session.id}/`,
      );
      const rows: Message[] = (data ?? []).map((r) => ({
        id:      r.id,
        role:    r.role as 'user' | 'assistant',
        content: r.content,
      }));
      setMessages(rows.length > 0 ? [WELCOME, ...rows] : [WELCOME]);
    } catch {
      setMessages([
        WELCOME,
        { id: 'err-load', role: 'assistant', content: 'This chat could not be opened.' },
      ]);
    } finally {
      setLoadingSession(false);
    }
  }, [activeId, closeSidebar]);

  const startNewChat = useCallback(() => {
    setActiveId(null);
    setMessages([WELCOME]);
    setInput('');
    closeSidebar();
  }, [closeSidebar]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    scrollToBottom();

    try {
      const { data } = await api.post<{ reply: string; session_id: string | null }>(
        '/threats/chat/',
        { message: text, session_id: activeId },
      );

      if (data.session_id && data.session_id !== activeId) {
        setActiveId(data.session_id);
        loadSessions();
      }

      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: data.reply ?? 'No response received.' },
      ]);
    } catch (err: any) {
      const status = err?.response?.status;
      let content = err?.response?.data?.error ?? 'Sorry, something went wrong. Please try again.';
      if (status === 429) {
        content = 'You are sending messages too fast. Please wait a moment before trying again.';
      }
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: 'assistant', content },
      ]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  }

  function renderMessage({ item }: { item: Message }) {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
        <Text style={isUser ? styles.userText : styles.botText}>{item.content}</Text>
      </View>
    );
  }

  function renderSession({ item }: { item: ChatSession }) {
    const isActive = item.id === activeId;
    const date     = new Date(item.updated_at);
    const label    = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return (
      <TouchableOpacity
        style={[styles.sessionItem, isActive && styles.sessionItemActive]}
        onPress={() => openSession(item)}
        activeOpacity={0.7}
      >
        <Text
          style={[styles.sessionTitle, isActive && styles.sessionTitleActive]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.title}
        </Text>
        <Text style={styles.sessionDate}>{label}</Text>
      </TouchableOpacity>
    );
  }

  function renderSidebarBody() {
    if (sessionsState === 'error') {
      return (
        <View style={styles.sidebarMsg}>
          <Text style={styles.sidebarMsgText}>
            Unable to load chat history.{'\n'}Please try again.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadSessions}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (sessionsState === 'loading' && sessions.length === 0) {
      return (
        <View style={styles.sidebarMsg}>
          <ActivityIndicator color={CYAN} />
        </View>
      );
    }

    if (sessions.length === 0) {
      return (
        <View style={styles.sidebarMsg}>
          <Text style={styles.sidebarMsgText}>No chat history yet</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        renderItem={renderSession}
        showsVerticalScrollIndicator={false}
        style={styles.sessionList}
      />
    );
  }

  return (
    <View style={styles.root}>
      {sidebarVisible && (
        <TouchableWithoutFeedback onPress={closeSidebar}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
      )}

      {/* Sidebar */}
      <Animated.View style={[styles.sidebar, { transform: [{ translateX: sidebarPos }] }]}>
        <Text style={styles.sidebarHeader}>Chat History</Text>

        <TouchableOpacity style={styles.newChatBtn} onPress={startNewChat} activeOpacity={0.85}>
          <Text style={styles.newChatBtnText}>+ New Chat</Text>
        </TouchableOpacity>

        {renderSidebarBody()}
      </Animated.View>

      {/* Main chat area */}
      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={openSidebar}
            style={styles.menuBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Menu size={22} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>CYBOT AI</Text>
          <View style={{ width: 36 }} />
        </View>

        {loadingSession ? (
          <View style={styles.centred}>
            <ActivityIndicator color={CYAN} size="large" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.list}
            onContentSizeChange={scrollToBottom}
            showsVerticalScrollIndicator={false}
          />
        )}

        {sending && (
          <View style={styles.typingRow}>
            <ActivityIndicator color={CYAN} size="small" />
            <Text style={styles.typingText}>Cybot is thinking…</Text>
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Ask about cybersecurity…"
            placeholderTextColor="#444"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={send}
            returnKeyType="send"
            multiline
            editable={!sending && !loadingSession}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!input.trim() || sending || loadingSession) && styles.sendBtnDisabled,
            ]}
            onPress={send}
            disabled={!input.trim() || sending || loadingSession}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  // Sidebar
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 10,
  },
  sidebar: {
    position:          'absolute',
    top:               0,
    left:              0,
    bottom:            0,
    width:             SIDEBAR_WIDTH,
    backgroundColor:  '#0C0C18',
    borderRightWidth:  1,
    borderRightColor: 'rgba(0,229,255,0.1)',
    zIndex:            20,
    paddingTop:        60,
    paddingHorizontal: 16,
  },
  sidebarHeader: {
    fontSize:    16,
    fontWeight:  '900',
    color:       '#fff',
    marginBottom: 16,
    letterSpacing: 1,
  },
  newChatBtn: {
    backgroundColor: CYAN,
    borderRadius:    10,
    paddingVertical: 12,
    alignItems:      'center',
    marginBottom:    18,
  },
  newChatBtnText: {
    color:      '#000',
    fontWeight: '900',
    fontSize:   14,
    letterSpacing: 0.5,
  },
  sessionList: { flex: 1 },
  sessionItem: {
    paddingVertical:   12,
    paddingHorizontal: 12,
    borderRadius:      10,
    marginBottom:       6,
    backgroundColor:   CARD,
  },
  sessionItemActive: {
    backgroundColor: '#1a1a1a',
    borderWidth:     1,
    borderColor:     CYAN,
  },
  sessionTitle: {
    color:      '#888',
    fontSize:   14,
    fontWeight: '500',
  },
  sessionTitleActive: { color: CYAN, fontWeight: '700' },
  sessionDate: {
    color:     '#444',
    fontSize:  11,
    marginTop:  3,
  },
  sidebarMsg: {
    flex:       1,
    alignItems: 'center',
    paddingTop: 40,
    gap:        12,
  },
  sidebarMsgText: {
    color:      '#444',
    fontSize:   14,
    textAlign:  'center',
    lineHeight: 22,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical:    8,
    backgroundColor:  '#12121E',
    borderRadius:       8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  retryBtnText: { color: CYAN, fontSize: 14, fontWeight: '600' },

  // Chat area
  chatArea: { flex: 1 },
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 16,
    paddingTop:        60,
    paddingBottom:     14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,229,255,0.1)',
  },
  menuBtn:     { width: 36, alignItems: 'flex-start' },
  headerTitle: { fontSize: 15, fontWeight: '900', color: CYAN, letterSpacing: 3 },

  centred: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list:    { paddingHorizontal: 16, paddingVertical: 12 },

  bubble: {
    maxWidth:     '80%',
    borderRadius:  16,
    padding:       13,
    marginBottom:  10,
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: CYAN },
  botBubble:  {
    alignSelf:       'flex-start',
    backgroundColor: CARD,
    borderWidth:      1,
    borderColor:     'rgba(0,229,255,0.1)',
  },
  userText: { color: '#000', fontSize: 15, lineHeight: 22, fontWeight: '600' },
  botText:  { color: '#fff', fontSize: 15, lineHeight: 22 },

  typingRow: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: 20,
    marginBottom:      6,
  },
  typingText: { color: '#444', fontSize: 13, marginLeft: 8 },

  inputRow: {
    flexDirection:  'row',
    padding:         12,
    borderTopWidth:   1,
    borderTopColor:  'rgba(0,229,255,0.1)',
    alignItems:      'flex-end',
    gap:              8,
  },
  input: {
    flex:              1,
    backgroundColor:  CARD,
    borderWidth:        1,
    borderColor:       'rgba(0,229,255,0.12)',
    borderRadius:       20,
    paddingHorizontal:  16,
    paddingVertical:    10,
    color:             '#fff',
    fontSize:           15,
    maxHeight:         100,
  },
  sendBtn: {
    backgroundColor:  CYAN,
    borderRadius:      22,
    width:             44,
    height:            44,
    alignItems:        'center',
    justifyContent:    'center',
  },
  sendBtnDisabled: { opacity: 0.3 },
  sendBtnText: { color: '#000', fontWeight: '900', fontSize: 20 },
});
