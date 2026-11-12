/* One place to change everything that is specific to your business.
   Nothing else in this folder needs editing to go live.

   Replace every `.example` value before you deploy — they are placeholders, and
   `example` is a reserved domain that can never belong to anyone. */

window.BIZORA = {
  // Where the product itself lives. Every "Start free trial" and "Sign in"
  // button points here until a checkout link is set below.
  appUrl: 'https://app.bizora.example',
  signupUrl: 'https://app.bizora.example/signup',

  // Written support. Publish an inbox, never a phone number.
  supportEmail: 'hello@bizora.example',
  city: 'Your city',

  // The name your customer sees on their card or bank statement. With a
  // merchant of record it is the provider, not Bizora — say so on the page and
  // the "I did not authorise this" emails mostly stop. Leave empty to drop the
  // sentence entirely.
  statementDescriptor: '',

  // Payment links, one per plan: Paddle for international, Safepay for PKR.
  // While these are empty, every plan button starts a free trial instead, so
  // the page is safe to publish before the checkout links exist.
  checkout: {
    starter: '',
    growth: '',
    scale: '',
  },
};
