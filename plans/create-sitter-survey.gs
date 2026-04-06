/**
 * PetLink Sitter Survey — Google Apps Script
 *
 * Instructions:
 * 1. Go to https://script.google.com → New Project
 * 2. Paste this entire script, replacing the default code
 * 3. Click Run → select "createSitterSurvey" → Authorize when prompted
 * 4. Check the Execution Log for the form URL
 * 5. The form will appear in your Google Drive
 */

function createSitterSurvey() {
  var form = FormApp.create('PetLink — Help Us Build a Better Pet Care Platform');
  form.setDescription(
    "We're building PetLink, a new pet services marketplace designed around what sitters actually need. " +
    "This 5-minute survey helps us prioritize the right features. Your responses are confidential and will directly shape the product."
  );
  form.setIsQuiz(false);
  form.setAllowResponseEdits(true);
  form.setCollectEmail(false);
  form.setProgressBar(true);
  form.setConfirmationMessage("Thank you for your time! Your feedback will directly shape PetLink. We'll reach out if you opted in for early access.");

  // ─── Section 1: About You ───

  form.addPageBreakItem()
    .setTitle('About You')
    .setHelpText('Tell us a bit about your pet sitting background.');

  form.addTextItem()
    .setTitle("What's your name?")
    .setRequired(false);

  form.addMultipleChoiceItem()
    .setTitle('How long have you been pet sitting professionally?')
    .setChoiceValues([
      'Less than 6 months',
      '6 months – 1 year',
      '1 – 2 years',
      '2 – 5 years',
      '5+ years'
    ])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('What platforms do you currently use?')
    .setChoiceValues([
      'Rover',
      'Wag',
      'Care.com',
      'Social media (Instagram, RedBook/小红书, WeChat, etc.)',
      'Word of mouth / referrals only',
      'My own website'
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Roughly how much do you earn annually from pet sitting?')
    .setChoiceValues([
      'Less than $5,000',
      '$5,000 – $10,000',
      '$10,000 – $20,000',
      '$20,000 – $30,000',
      '$30,000+',
      'Prefer not to say'
    ])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('What services do you offer?')
    .setChoiceValues([
      'Boarding (pet stays at your home)',
      'House sitting (you stay at the owner\'s home)',
      'Drop-in visits',
      'Dog walking',
      'Daycare'
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('What species do you accept?')
    .setChoiceValues([
      'Dogs',
      'Cats',
      'Birds',
      'Reptiles',
      'Small animals (rabbits, hamsters, etc.)'
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addTextItem()
    .setTitle('Where are you located? (city, state)')
    .setRequired(false);

  // ─── Section 2: Current Platform Pain Points ───

  form.addPageBreakItem()
    .setTitle('Current Platform Pain Points')
    .setHelpText('Help us understand what frustrates you about existing platforms.');

  form.addCheckboxItem()
    .setTitle('What are your biggest frustrations with your current platform(s)?')
    .setChoiceValues([
      'Platform fees are too high',
      'Hard to get discovered as a new sitter',
      'Search/matching algorithm doesn\'t surface the right sitters',
      'Chat/messaging is clunky',
      'App is buggy or drains battery',
      'No real protection or insurance for sitters',
      'No expense tracking for tax filing',
      'Limited analytics (can\'t see who viewed my profile, etc.)',
      'No way to manage repeat clients (CRM)',
      'Video uploading/viewing is poor',
      'Can\'t search chat history',
      'Maintaining star/top sitter status is stressful',
      'Owners don\'t know next steps after booking',
      'Platform punishes declining requests'
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('How do you feel about current platform fees (e.g., Rover\'s ~20% service fee)?')
    .setChoiceValues([
      'Way too high — I take clients off-platform because of it',
      'Too high — but I stay on-platform anyway',
      'About right for what I get',
      'I don\'t mind the fee'
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('What fee structure would you prefer?')
    .setChoiceValues([
      'Percentage-based (e.g., 5–10%) with a cap per booking',
      'Flat fee per booking regardless of price',
      'Monthly subscription (unlimited bookings, no per-booking fee)',
      'Free for sitters, owners pay a service fee',
      'Free for everyone (ad-supported)'
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Have you ever taken clients off-platform to avoid fees?')
    .setChoiceValues([
      'Yes, regularly',
      'Yes, occasionally',
      'No, but I\'ve considered it',
      'No, I prefer staying on-platform'
    ])
    .setRequired(true);

  // ─── Section 3: Trust & Safety ───

  form.addPageBreakItem()
    .setTitle('Trust & Safety')
    .setHelpText('We take safety seriously. Help us understand what matters most.');

  form.addScaleItem()
    .setTitle('How important is a Meet & Greet before accepting a booking?')
    .setBounds(1, 5)
    .setLabels('Not important at all', 'Essential, I always do one')
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('Which safety features matter most to you?')
    .setChoiceValues([
      'Insurance coverage for sitters',
      'Background checks on owners',
      'Emergency contact sharing (both parties)',
      'In-app incident reporting',
      'Camera/monitoring recommendations',
      'GPS walk tracking with photo/video updates',
      'Platform mediation for disputes',
      'Sitter banning protections (appeal process)'
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('How do you currently handle safety during bookings?')
    .setChoiceValues([
      'I carry pepper gel/personal safety items',
      'I use a camera (GoPro or similar)',
      'I require the owner\'s home to have cameras',
      'I always do a Meet & Greet first',
      'I rely on reviews/ratings to vet owners',
      'I get referrals from trusted sources',
      'I don\'t take specific safety measures'
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addScaleItem()
    .setTitle('How concerned are you about platform accountability (e.g., being banned without fair process)?')
    .setBounds(1, 5)
    .setLabels('Not concerned', 'Very concerned, it\'s happened to me or someone I know')
    .setRequired(true);

  // ─── Section 4: Reviews & Reputation ───

  form.addPageBreakItem()
    .setTitle('Reviews & Reputation')
    .setHelpText('Reviews are the lifeblood of your business. Let\'s make them better.');

  form.addScaleItem()
    .setTitle('How important are reviews for getting new clients?')
    .setBounds(1, 5)
    .setLabels('Not important', 'Critical, it\'s the #1 factor')
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Do you feel the current review system is honest?')
    .setChoiceValues([
      'Yes, reviews reflect reality',
      'Mostly, but people avoid leaving negative reviews',
      'No, it\'s inflated — everyone gives 5 stars'
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Would you value a way for owners to give private feedback (not public reviews)?')
    .setChoiceValues([
      'Yes, honest private feedback would help me improve',
      'Maybe, as long as it doesn\'t affect my ranking',
      'No, I only want public reviews'
    ])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('What would encourage more owners to leave reviews?')
    .setChoiceValues([
      'Automated reminders after booking',
      'Small incentives (e.g., discount on next booking)',
      'Making the review process faster/simpler',
      'Allowing photo reviews'
    ])
    .showOtherOption(true)
    .setRequired(true);

  // ─── Section 5: Business Tools & Growth ───

  form.addPageBreakItem()
    .setTitle('Business Tools & Growth')
    .setHelpText('Beyond bookings — what tools would help you run your pet sitting business?');

  form.addCheckboxItem()
    .setTitle('Which business tools would be most valuable to you? (select your top 5)')
    .setChoiceValues([
      'Expense tracking for tax filing',
      'Client management / CRM (notes, preferences, reminders)',
      'Holiday/birthday greeting automation',
      'Revenue analytics and insights',
      'Profile view / request / booking analytics',
      'Customizable pricing per client or booking',
      'Booking calendar with scheduling overview',
      'Promote page with QR code for sharing',
      'Referral program (earn for referring sitters or owners)',
      'Portfolio posts (Instagram-style updates)'
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('How do you currently track expenses for taxes?')
    .setChoiceValues([
      'Spreadsheet (Excel, Google Sheets)',
      'Accounting app (QuickBooks, Wave, etc.)',
      'I don\'t track expenses',
      'My accountant handles it'
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addScaleItem()
    .setTitle('How important is it for the platform to help with tax-related features?')
    .setBounds(1, 5)
    .setLabels('Not important', 'Very important, would be a key reason to use the platform')
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Would you pay for a premium subscription that included advanced tools (analytics, CRM, priority placement)?')
    .setChoiceValues([
      'Yes, if the price is reasonable',
      'Maybe, depends on what\'s included',
      'No, I expect these features to be free',
      'I\'d rather pay per-feature than a subscription'
    ])
    .setRequired(true);

  // ─── Section 6: Client Acquisition & Marketing ───

  form.addPageBreakItem()
    .setTitle('Client Acquisition & Marketing')
    .setHelpText('Understanding how you find and keep clients helps us build the right discovery tools.');

  form.addCheckboxItem()
    .setTitle('How do you find new clients today?')
    .setChoiceValues([
      'Platform search results (Rover, Wag, etc.)',
      'Social media posts (RedBook/小红书, Instagram, WeChat, etc.)',
      'Handing out cards at dog parks',
      'Word of mouth / referrals from existing clients',
      'Friends and personal network'
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('What would help you get more clients?')
    .setChoiceValues([
      'Better search matching (not just reviews and price)',
      'New sitter promotion / boosted visibility period',
      'Paid profile featuring / advertising',
      'Sitter training & certification',
      'Add-on services to differentiate (e.g., medication administration)',
      'Platform-generated marketing materials',
      'Insights on why I\'m not getting bookings'
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('How do you feel about a sitter-to-sitter referral or backup system?')
    .setChoiceValues([
      'Love it — I\'d refer overflow clients to trusted sitters',
      'Cautious — I\'d only refer to personal friends, not competitors',
      'Not interested — I don\'t want to share my client base'
    ])
    .showOtherOption(true)
    .setRequired(true);

  // ─── Section 7: Booking & Communication ───

  form.addPageBreakItem()
    .setTitle('Booking & Communication')
    .setHelpText('The booking flow is where the magic happens. What would make it better?');

  form.addMultipleChoiceItem()
    .setTitle('What\'s your preferred way to communicate with owners?')
    .setChoiceValues([
      'In-app messaging only',
      'In-app messaging + phone calls through the app',
      'I share my personal number early on',
      'Whatever the owner prefers'
    ])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('What would improve the booking experience?')
    .setChoiceValues([
      'Clear next-steps guidance after booking is confirmed',
      'In-app calendar for managing all bookings',
      'Ability to customize pricing per booking',
      'Meet & Greet scheduling built into the flow',
      'Pre-booking inquiry phase (chat before committing)',
      'Care instructions and pet info readily available',
      'Real-time updates to owners during the booking'
    ])
    .showOtherOption(true)
    .setRequired(true);

  // ─── Section 8: What Would Make You Switch? ───

  form.addPageBreakItem()
    .setTitle('What Would Make You Switch?')
    .setHelpText('Last section — help us understand what it takes to win you over.');

  form.addParagraphTextItem()
    .setTitle('What\'s the #1 thing a new platform must have for you to try it?')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('What would make you stay on a new platform long-term?')
    .setRequired(true);

  form.addScaleItem()
    .setTitle('How likely are you to try a new pet care platform in the next 6 months?')
    .setBounds(1, 5)
    .setLabels('Very unlikely', 'Very likely, actively looking')
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Would you be open to a follow-up conversation or early access to PetLink?')
    .setChoiceValues([
      'Yes',
      'Maybe later',
      'No thanks'
    ])
    .setRequired(true);

  form.addTextItem()
    .setTitle('If yes, what\'s the best way to reach you? (email, phone, WeChat, etc.)')
    .setRequired(false);

  // ─── Log the URL ───

  Logger.log('Form created successfully!');
  Logger.log('Edit URL: ' + form.getEditUrl());
  Logger.log('Share URL: ' + form.getPublishedUrl());
}
