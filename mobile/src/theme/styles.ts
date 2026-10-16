/**
 * Simple, clean style sheet for TailorApp mobile.
 *
 * Design principles:
 * - Light-first, readable in bright conditions
 * - No borders (no white lines), separation via background and spacing
 * - Simple cards, clear typography
 * - Standard mobile patterns
 */
import { StyleSheet } from 'react-native';
import { mixHex, type AppPalette } from './palette';

export type AppStyles = ReturnType<typeof createStyles>;

export function createStyles(palette: AppPalette) {
  const dark = palette.mode === 'dark';
  return StyleSheet.create({
    // --- Layout ---
    grow: { flex: 1 },
    safe: { flex: 1, backgroundColor: palette.background },
    workspace: { flex: 1, minHeight: 0, backgroundColor: palette.background },
    rtlLayout: { direction: 'rtl' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
    centerStack: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: palette.background },

    // --- Typography ---
    heading: { color: palette.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
    subheading: { color: palette.secondaryText, fontSize: 16, fontWeight: '600', marginBottom: 8 },
    body: { color: palette.text, fontSize: 15, lineHeight: 22 },
    caption: { color: palette.mutedText, fontSize: 13, lineHeight: 18 },
    pageTitle: { color: palette.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
    pageSubtitle: { color: palette.mutedText, fontSize: 14, lineHeight: 20, marginBottom: 16 },
    sectionTitle: { color: palette.text, fontSize: 15, fontWeight: '700', marginBottom: 8 },
    sectionLink: { color: palette.primary, fontSize: 13, fontWeight: '700' },

    // --- Header ---
    header: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 12,
      backgroundColor: palette.background,
    },
    headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerBrandName: { color: palette.text, fontSize: 18, fontWeight: '800' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    searchPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 10,
      backgroundColor: palette.surfaceMuted,
    },
    searchPillText: { color: palette.mutedText, fontSize: 14 },
    bellButton: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.surfaceMuted,
    },
    bellBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: palette.danger,
    },
    brandMark: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.primary,
    },
    brandLetter: { color: palette.onPrimary, fontSize: 17, fontWeight: '800' },
    logoImage: { alignItems: 'center', justifyContent: 'center' },

    // --- Auth screen ---
    authContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32 },
    authLanguageRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 12,
    },
    authBrandMark: {
      width: 64,
      height: 64,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.primary,
      marginBottom: 16,
    },
    authBrandLetter: { color: palette.onPrimary, fontSize: 28, fontWeight: '900' },
    authBrandName: { color: palette.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
    authTagline: { color: palette.secondaryText, fontSize: 15, textAlign: 'center', marginTop: 4, marginBottom: 8 },
    authDescription: { color: palette.mutedText, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 },

    // --- Hero card ---
    heroCard: {
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 20,
      marginBottom: 16,
      backgroundColor: palette.surface,
    },
    heroLabel: { color: palette.secondaryText, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
    heroAmount: { color: palette.text, fontSize: 30, fontWeight: '800', marginTop: 6 },
    heroSubLabel: { color: palette.mutedText, fontSize: 12, marginTop: 2 },
    heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    heroPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      backgroundColor: palette.successSurface,
    },
    heroPillText: { color: palette.success, fontSize: 12, fontWeight: '700' },
    heroMeta: { color: palette.mutedText, fontSize: 11 },

    // --- Quick actions ---
    quickRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    quickAction: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: palette.surfaceMuted,
    },
    quickActionIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.primarySoft,
    },
    quickActionLabel: { color: palette.text, fontSize: 11, fontWeight: '700' },

    // --- Cards ---
    card: {
      backgroundColor: palette.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    cardAccentMint: { borderLeftWidth: 4, borderLeftColor: palette.success },
    cardAccentAmber: { borderLeftWidth: 4, borderLeftColor: palette.warning },
    cardAccentPrimary: { borderLeftWidth: 4, borderLeftColor: palette.primary },
    cardAccentBlue: { borderLeftWidth: 4, borderLeftColor: palette.info },
    cardAccentViolet: { borderLeftWidth: 4, borderLeftColor: '#a995e0' },
    listCard: {
      backgroundColor: palette.surface,
      borderRadius: 12,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      gap: 12,
    },
    listMain: { flex: 1 },
    listTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
    listMeta: { color: palette.mutedText, fontSize: 13, marginTop: 3 },
    listPrice: { color: palette.primary, fontSize: 15, fontWeight: '800' },
    listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    avatar: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: palette.primarySoft,
    },
    avatarLg: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: palette.primarySoft,
    },
    avatarText: { color: palette.primaryText, fontSize: 16, fontWeight: '800' },
    avatarTextLg: { color: palette.primaryText, fontSize: 19, fontWeight: '800' },

    iconDot: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: palette.primarySoft,
    },
    iconDotMuted: { backgroundColor: palette.surfaceMuted },
    iconDotMint: { backgroundColor: palette.successSurface },
    iconDotAmber: { backgroundColor: palette.warningSurface },
    iconDotBlue: { backgroundColor: palette.infoSurface },
    iconDotViolet: { backgroundColor: '#f3e8ff' },
    iconDotRed: { backgroundColor: palette.dangerSurface },

    // --- Status pills ---
    statusPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      alignSelf: 'flex-start',
    },
    statusPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
    pillMint: { backgroundColor: palette.successSurface },
    pillMintText: { color: palette.success },
    pillAmber: { backgroundColor: palette.warningSurface },
    pillAmberText: { color: palette.warning },
    pillRed: { backgroundColor: palette.dangerSurface },
    pillRedText: { color: palette.danger },
    pillMuted: { backgroundColor: palette.surfaceMuted },
    pillMutedText: { color: palette.mutedText },

    // --- Dashboard metrics ---
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 10,
      marginBottom: 16,
    },
    metricCard: {
      width: '48.5%',
      minHeight: 112,
      justifyContent: 'flex-end',
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 14,
    },
    metricIcon: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.primarySoft,
    },
    metricValue: { color: palette.text, fontSize: 22, fontWeight: '900', paddingRight: 28 },
    metricLabel: { color: palette.mutedText, fontSize: 13, lineHeight: 18, fontWeight: '600', marginTop: 3 },

    // --- Chips ---
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: palette.surfaceMuted,
    },
    chipSelected: { backgroundColor: palette.primarySoft },
    chipPressed: { backgroundColor: palette.primarySoft, opacity: 0.9 },
    chipText: { color: palette.secondaryText, fontSize: 13, fontWeight: '700' },
    chipTextSelected: { color: palette.primaryText },

    // --- Money card ---
    moneyCard: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
    },
    moneyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
    moneyLabel: { color: palette.secondaryText, fontSize: 13 },
    moneyValue: { color: palette.text, fontSize: 20, fontWeight: '800' },
    moneySecondary: { color: palette.mutedText, fontSize: 11, marginTop: 1 },

    // --- Kanban column ---
    kanbanScroll: { paddingRight: 6 },
    kanbanColumn: {
      width: 240,
      marginRight: 12,
      backgroundColor: palette.surfaceMuted,
      borderRadius: 14,
      padding: 12,
    },
    kanbanHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    kanbanTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
    kanbanCount: {
      color: palette.mutedText,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      fontSize: 12,
      fontWeight: '800',
    },
    kanbanEmpty: { color: palette.mutedText, fontSize: 13, textAlign: 'center', paddingVertical: 12 },

    // --- Chart ---
    chartCard: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 14,
    },
    chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
    chartLabel: { color: palette.mutedText, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
    chartValue: { color: palette.text, fontSize: 24, fontWeight: '900', marginTop: 4 },
    chartPill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: palette.successSurface,
    },
    chartPillText: { color: palette.success, fontSize: 12, fontWeight: '800' },

    // --- Bar list ---
    barRow: { marginBottom: 10 },
    barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    barLabel: { color: palette.text, fontSize: 13, fontWeight: '700' },
    barValue: { color: palette.mutedText, fontSize: 12, fontWeight: '700' },
    barTrack: { height: 8, borderRadius: 4, backgroundColor: palette.surfaceMuted, overflow: 'hidden' },
    barFill: { height: 8, borderRadius: 4, backgroundColor: palette.primary },

    // --- Field / form ---
    field: { marginBottom: 12 },
    fieldLabel: { color: palette.secondaryText, fontSize: 13, fontWeight: '800', marginBottom: 6, letterSpacing: 0.2 },
    input: {
      minHeight: 48,
      borderRadius: 10,
      paddingHorizontal: 14,
      color: palette.text,
      fontSize: 15,
      backgroundColor: palette.surfaceMuted,
    },
    multiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 },
    inputReadonly: { backgroundColor: palette.surfaceMuted, color: palette.mutedText },

    // --- Buttons ---
    actionButton: {
      minHeight: 50,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: palette.primary,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginTop: 6,
    },
    actionButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    actionButtonPressed: {
      backgroundColor: mixHex(palette.primary, '#000000', 0.85),
      opacity: 0.9,
      transform: [{ scale: 0.98 }],
    },
    actionText: { color: palette.onPrimary, fontSize: 15, fontWeight: '800', textAlign: 'center' },
    secondaryButton: { backgroundColor: palette.surfaceMuted, borderRadius: 10 },
    secondaryButtonPressed: {
      backgroundColor: palette.primarySoft,
      opacity: 0.9,
      transform: [{ scale: 0.98 }],
    },
    secondaryText: { color: palette.primaryText },
    loadingButton: { opacity: 0.85 },
    disabled: { opacity: 0.6 },
    pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
    spinner: { marginTop: 12 },
    errorText: { color: palette.danger, fontSize: 14, lineHeight: 20, marginTop: 8 },
    errorBanner: {
      color: palette.danger,
      backgroundColor: palette.dangerSurface,
      borderRadius: 10,
      padding: 12,
      fontSize: 14,
      lineHeight: 19,
      marginBottom: 12,
    },
    offlineHint: { color: palette.secondaryText, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 4 },
    emptyCard: { backgroundColor: palette.surface, borderRadius: 14, padding: 32, alignItems: 'center' },
    emptyText: { color: palette.mutedText, fontSize: 14, textAlign: 'center', lineHeight: 20 },

    // --- Connection ---
    connection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: palette.surfaceMuted,
      borderRadius: 10,
    },
    connectionDot: { width: 8, height: 8, borderRadius: 4 },
    onlineDot: { backgroundColor: palette.success },
    offlineDot: { backgroundColor: palette.warning },
    connectionText: { color: palette.secondaryText, fontSize: 13, fontWeight: '700' },

    // --- Order card ---
    orderCard: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
    },
    orderTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
    orderDue: { color: palette.warning, fontSize: 12, fontWeight: '800', marginTop: 4 },
    nextStageBtn: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: palette.primarySoft,
    },
    nextStageText: { color: palette.primaryText, fontSize: 13, fontWeight: '800' },

    // --- Bottom tab bar ---
    tabBarWrap: {
      height: 60,
      backgroundColor: palette.background,
      paddingBottom: 24,
    },
    tabBar: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      height: 60,
      backgroundColor: palette.background,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
      paddingHorizontal: 4,
      gap: 4,
    },
    tabActive: {},
    tabPressed: { opacity: 0.8 },
    tabLabel: { color: palette.mutedText, fontSize: 10, fontWeight: '700' },
    tabLabelActive: { color: palette.primary, fontWeight: '800' },

    // --- Customer stats ---
    customerStats: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    customerStatPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: palette.surfaceMuted,
    },
    customerStatText: { color: palette.mutedText, fontSize: 11, fontWeight: '700' },
    customerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
    customerAction: { color: palette.primaryText, fontSize: 13, fontWeight: '800' },

    // --- WhatsApp ---
    whatsappDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#25D366' },
    whatsappDotOff: { backgroundColor: palette.mutedText },

    // --- Team rows ---
    teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    teamMain: { flex: 1 },
    teamName: { color: palette.text, fontSize: 14, fontWeight: '800' },
    teamMeta: { color: palette.mutedText, fontSize: 12, marginTop: 2 },
    teamRole: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: palette.primarySoft },
    teamRoleText: { color: palette.primaryText, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },

    // --- Toggle ---
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 4 },
    toggleLabel: { color: palette.text, fontSize: 14, fontWeight: '700', flex: 1 },
    toggleHint: { color: palette.mutedText, fontSize: 12, marginTop: 2 },
    toggleSwitch: { width: 44, height: 26, borderRadius: 14, padding: 3, justifyContent: 'center' },
    toggleSwitchOn: { backgroundColor: palette.success, alignItems: 'flex-end' },
    toggleSwitchOff: { backgroundColor: palette.surfaceMuted, alignItems: 'flex-start' },
    toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#ffffff' },

    // --- Form footer ---
    formFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingTop: 14,
      marginTop: 14,
    },
    formFooterText: { color: palette.mutedText, fontSize: 13, flex: 1 },

    // --- Plan cards ---
    planRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    planCard: {
      flex: 1,
      backgroundColor: palette.surface,
      borderRadius: 12,
      padding: 14,
    },
    planCardActive: { backgroundColor: palette.primarySoft },
    planName: { color: palette.text, fontSize: 14, fontWeight: '800' },
    planPrice: { color: palette.text, fontSize: 18, fontWeight: '900', marginTop: 4 },
    planMeta: { color: palette.mutedText, fontSize: 12, marginTop: 6 },

    // --- Activity row ---
    activityIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#e0f2e9' },
    activityPreview: { color: palette.mutedText, fontSize: 12, marginTop: 2, fontStyle: 'italic' },

    // --- WhatsApp preview ---
    wpIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e0f2e9' },
    wpIconText: { color: '#25D366', fontSize: 16, fontWeight: '900' },

    // --- Sync banner ---
    syncCard: {
      backgroundColor: palette.successSurface,
      borderRadius: 10,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    syncCopy: { flex: 1, paddingRight: 8 },
    syncTitle: { color: palette.success, fontSize: 14, fontWeight: '800' },
    syncMeta: { color: palette.secondaryText, fontSize: 12, marginTop: 2 },

    // --- Language row ---
    languageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    languageRowPressed: { backgroundColor: palette.primarySoft, opacity: 0.9 },
    languageChip: {
      backgroundColor: palette.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    languageChipSelected: { backgroundColor: palette.primarySoft },
    languageChipText: { color: palette.secondaryText, fontSize: 13, fontWeight: '700' },
    radio: { color: palette.primaryText, fontSize: 16 },

    // --- Theme toggle ---
    themeToggle: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: palette.surfaceMuted,
    },
    themeToggleCompact: { width: 44, minHeight: 44, paddingHorizontal: 0, paddingVertical: 0 },
    themeToggleText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },

    // --- Link / misc ---
    authFooter: { color: palette.mutedText, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 12 },
    supportLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: 12 },
    supportLink: { color: palette.primaryText, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },

    // --- Layout helpers ---
    content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 },
    splitRow: { flexDirection: 'row', gap: 10 },
    halfField: { flex: 1 },
    pageHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12, marginBottom: 8 },
    backText: { color: palette.primaryText, fontSize: 15, fontWeight: '800' },
    pendingLabel: { color: palette.warning, fontSize: 13, fontWeight: '700', marginBottom: 4 },
    syncBadge: { color: palette.mutedText, fontWeight: '900' },

    // --- Page ---
    page: { flex: 1, backgroundColor: palette.background },

    // --- Chat ---
    chatList: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 10 },
    chatBubble: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    chatBubbleUser: { flexDirection: 'row-reverse', alignItems: 'flex-end' },
    chatBubbleInner: {
      maxWidth: '80%',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: palette.surface,
    },
    chatBubbleText: { color: palette.text, fontSize: 14, lineHeight: 20 },
    chatBubbleTextUser: { color: palette.onPrimary },
    typingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 6 },
    typingText: { color: palette.mutedText, fontSize: 13, fontStyle: 'italic' },

    // --- Chat input ---
    chatInputWrap: { paddingHorizontal: 16, paddingBottom: 8, backgroundColor: palette.background },
    chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.surfaceMuted, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
    chatInput: { flex: 1, color: palette.text, fontSize: 14 },
    sendButton: { backgroundColor: palette.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    sendButtonDisabled: { backgroundColor: palette.surfaceMuted },
    sendButtonText: { color: palette.onPrimary, fontSize: 14, fontWeight: '800' },

    // --- Conflict resolution ---
    summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    summaryCard: { flex: 1, backgroundColor: palette.surface, borderRadius: 12, padding: 16, alignItems: 'center' },
    summaryLabel: { color: palette.mutedText, fontSize: 12, fontWeight: '700', marginBottom: 4 },
    summaryValue: { color: palette.text, fontSize: 22, fontWeight: '800' },
    conflictCard: { backgroundColor: palette.surface, borderRadius: 12, padding: 16, marginBottom: 10 },
    conflictMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    conflictTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
    conflictMessage: { color: palette.mutedText, fontSize: 13, marginBottom: 10 },
    conflictActions: { flexDirection: 'row', gap: 8 },

    twoFields: { flexDirection: 'row', gap: 10 },
  });
}
