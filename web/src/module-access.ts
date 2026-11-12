/**
 * Which module-gated APIs the workspace may call.
 *
 * A business can switch modules off - a shop that only takes orders does not
 * need the measurement book. The API refuses those endpoints with "The
 * <module> module is disabled for this business" (HTTP 403), so the app must
 * not ask for them in the first place: the orders screen has to keep working
 * when the measurements module is off.
 *
 * While the business configuration is still loading we do not know which
 * modules are on, so nothing is called yet - a request that may be refused
 * would only put an error on the screen the user is trying to work in.
 */
export function canCallModuleApi(enabledModules: string[] | undefined, module: string): boolean {
  if (!enabledModules) return false;
  return enabledModules.includes(module);
}

/**
 * Whether the customer's measurement profiles may be loaded.
 *
 * The order form offers the customer's saved measurements, and the measurement
 * book screen lists them - but only when this business has the measurement
 * module switched on. With the module off the API answers 403 ("the
 * measurements module is disabled"), which used to show up as an error banner
 * every single time the orders screen was opened.
 */
export function shouldLoadMeasurementProfiles(input: {
  view: string;
  customerId: string;
  enabledModules: string[] | undefined;
  hasPermission: boolean;
}): boolean {
  if (!input.customerId) return false;
  if (!input.hasPermission) return false;
  if (!canCallModuleApi(input.enabledModules, 'measurements')) return false;
  return input.view === 'orders' || input.view === 'measurements';
}
