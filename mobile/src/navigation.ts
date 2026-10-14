/**
 * Navigation vocabulary shared by the app shell and the screens.
 * Tabs are the root pages; every other page is pushed onto the back stack.
 */
export type TabKey = 'home' | 'orders' | 'payments' | 'activity' | 'more';

export type NavPage =
  | TabKey
  | 'customers'
  | 'catalog'
  | 'measurements'
  | 'notifications'
  | 'subscription'
  | 'settings'
  | 'business-settings'
  | 'analytics'
  | 'erp';

/** Action to perform once a page opens (e.g. open the order form). */
export type NavIntent = 'new-order' | 'record-payment';

export type Navigate = (page: NavPage, intent?: NavIntent) => void;
