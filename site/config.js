/* One place to change everything that is specific to your business.
   Nothing else in this folder needs editing to go live.

   Replace every `.example` value before you deploy — they are placeholders, and
   `example` is a reserved domain that can never belong to anyone. */

window.BIZORA = {
  // Where the product itself lives. Every "Sign in" button points here.
  appUrl: 'https://app.bizora.example',

  // Where the API is served. signup.html loads its templates and plans from
  // here and posts the new business to it. The API has to allow this site's
  // origin in CORS_ORIGINS, or the browser will block every request.
  apiBaseUrl: 'https://api.bizora.example',

  // The signup form in this folder. Point it at the app's own screen instead
  // if you build one there.
  signupUrl: 'signup.html',

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
