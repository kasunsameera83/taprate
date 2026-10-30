// Words CUSTOMERS see (rating pages, thank-you page, kiosk, widget, survey emails), in English, Sinhala
// and Tamil. The business's own text (question, thank-you message, reasons) is shown as they wrote it.
// Pure: used in the browser and on the server. Translations should be checked by a native speaker
// before launch; change them here.
import { ICON_SETS, type IconSetId } from "../surveys/iconSets.ts";

export const LANGS = ["en", "si", "ta"] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);

/** How each language is named in the survey settings. */
export const LANG_NAME: Record<Lang, string> = { en: "English", si: "සිංහල (Sinhala)", ta: "தமிழ் (Tamil)" };

const en = {
  tapOne: "Tap one. It takes a second.",
  notCollecting: "This survey isn't collecting ratings right now.",
  notCollectingShort: "Not collecting ratings right now.",
  kioskNotCollecting: "This kiosk isn't collecting ratings right now.",
  feedbackBy: "Feedback by",
  privacy: "Privacy",
  rate: "Rate",
  youRated: "You rated:",
  savingRating: "Saving your rating…",
  ratingSaved: "Rating saved",
  saveFailed: "We couldn't save your rating. Please tap the button in your email again.",
  wentWell: "What did we do well?",
  doBetter: "What could we do better?",
  tapAny: "(tap any)",
  saving: "Saving…",
  saved: "Saved",
  couldntSave: "Couldn't save. Tap again.",
  commentThanks: "Thanks, we've got your comment.",
  yourComment: "Your comment",
  editComment: "Edit comment",
  tellMore: "Want to tell us more?",
  optional: "(optional)",
  commentPlaceholder: "What went well, or what could be better?",
  sendComment: "Send comment",
  sending: "Sending…",
  goTo: "Go to {host}",
  oneMoment: "One moment please, then tap again.",
  done: "Done",
  tapThatFits: "Just tap the one that fits. That's it.",
  reminderNote: "A quick reminder, in case you missed it.",
  reminderPrefix: "Reminder:",
  sentBy: "Sent by {business} using TapTruly.",
  stopEmails: "Stop survey emails from {business}",
  npsLow: "0 = Not likely",
  npsHigh: "10 = Very likely",
  cesLow: "1 = Very difficult",
  cesHigh: "7 = Very easy",
  shareConsent: "{business} may share my comment on their website and social media",
  shareName: "First name to show (optional)",
  shareHint: "Your email is never shown.",
  wallTitle: "What our customers say",
  wallEmpty: "No reviews to show yet.",
  aCustomer: "A customer",
  collectedWith: "Ratings collected with TapTruly",
  recoverySubject: "Did we put it right?",
  recoveryIntro: "Hi {name},\n\nYou told us recently that we didn't get it right. We've worked on it, and we'd love to know how you feel about {business} now.",
};
export type PublicKey = keyof typeof en;

const si: Record<PublicKey, string> = {
  tapOne: "එකක් ඔබන්න. තත්පරයක් පමණයි.",
  notCollecting: "මෙම සමීක්ෂණය දැනට ඇගයීම් ලබා නොගනී.",
  notCollectingShort: "දැනට ඇගයීම් ලබා නොගනී.",
  kioskNotCollecting: "මෙම යන්ත්‍රය දැනට ඇගයීම් ලබා නොගනී.",
  feedbackBy: "ප්‍රතිචාර සේවාව:",
  privacy: "රහස්‍යතාව",
  rate: "ඇගයීම",
  youRated: "ඔබේ ඇගයීම:",
  savingRating: "ඔබේ ඇගයීම සුරකිමින්…",
  ratingSaved: "ඇගයීම සුරැකිණි",
  saveFailed: "ඔබේ ඇගයීම සුරැකීමට නොහැකි විය. කරුණාකර ඔබේ ඊමේල් පණිවිඩයේ බොත්තම නැවත ඔබන්න.",
  wentWell: "අප හොඳින් කළේ කුමක්ද?",
  doBetter: "අපට වඩා හොඳින් කළ හැක්කේ කුමක්ද?",
  tapAny: "(ඕනෑම එකක් ඔබන්න)",
  saving: "සුරකිමින්…",
  saved: "සුරැකිණි",
  couldntSave: "සුරැකීමට නොහැකි විය. නැවත ඔබන්න.",
  commentThanks: "ස්තූතියි, ඔබේ අදහස අපට ලැබුණා.",
  yourComment: "ඔබේ අදහස",
  editComment: "අදහස වෙනස් කරන්න",
  tellMore: "තවත් යමක් කියන්න කැමතිද?",
  optional: "(අවශ්‍ය නම් පමණක්)",
  commentPlaceholder: "හොඳින් සිදු වූ දේ, හෝ වඩා හොඳ කළ හැකි දේ?",
  sendComment: "අදහස යවන්න",
  sending: "යවමින්…",
  goTo: "{host} වෙත යන්න",
  oneMoment: "මොහොතක් රැඳී සිට නැවත ඔබන්න.",
  done: "අවසන්",
  tapThatFits: "ඔබට ගැළපෙන එක ඔබන්න. එපමණයි.",
  reminderNote: "ඔබට මගහැරුණා නම්, කෙටි සිහිකැඳවීමක්.",
  reminderPrefix: "සිහිකැඳවීම:",
  sentBy: "{business} විසින් TapTruly හරහා යවන ලදී.",
  stopEmails: "{business} වෙතින් එන සමීක්ෂණ ඊමේල් නවත්වන්න",
  npsLow: "0 = ඉඩක් නැත",
  npsHigh: "10 = බොහෝ දුරට ඉඩ ඇත",
  cesLow: "1 = ඉතා අපහසුයි",
  cesHigh: "7 = ඉතා පහසුයි",
  shareConsent: "{business} හට මගේ අදහස ඔවුන්ගේ වෙබ් අඩවියේ සහ සමාජ මාධ්‍යවල බෙදා ගැනීමට හැකිය",
  shareName: "පෙන්විය යුතු මුල් නම (අවශ්‍ය නම් පමණක්)",
  shareHint: "ඔබේ ඊමේල් ලිපිනය කිසිවිටෙක පෙන්වන්නේ නැත.",
  wallTitle: "අපගේ පාරිභෝගිකයින් පවසන දේ",
  wallEmpty: "පෙන්වීමට තවම සමාලෝචන නැත.",
  aCustomer: "පාරිභෝගිකයෙක්",
  collectedWith: "TapTruly මගින් එකතු කළ ඇගයීම්",
  recoverySubject: "අපි එය නිවැරදි කළාද?",
  recoveryIntro: "ආයුබෝවන්,\n\nමෑතකදී අපි නිසි ලෙස කටයුතු නොකළ බව ඔබ අපට පැවසුවා. අපි ඒ ගැන කටයුතු කළා. දැන් {business} ගැන ඔබට කෙසේද හැඟෙන්නේ?",
};

const ta: Record<PublicKey, string> = {
  tapOne: "ஒன்றைத் தட்டுங்கள். ஒரு நொடி போதும்.",
  notCollecting: "இந்தக் கருத்துக்கணிப்பு தற்போது மதிப்பீடுகளை ஏற்கவில்லை.",
  notCollectingShort: "தற்போது மதிப்பீடுகளை ஏற்கவில்லை.",
  kioskNotCollecting: "இந்தக் கருவி தற்போது மதிப்பீடுகளை ஏற்கவில்லை.",
  feedbackBy: "கருத்து சேவை:",
  privacy: "தனியுரிமை",
  rate: "மதிப்பிடு",
  youRated: "உங்கள் மதிப்பீடு:",
  savingRating: "உங்கள் மதிப்பீடு சேமிக்கப்படுகிறது…",
  ratingSaved: "மதிப்பீடு சேமிக்கப்பட்டது",
  saveFailed: "உங்கள் மதிப்பீட்டைச் சேமிக்க முடியவில்லை. உங்கள் மின்னஞ்சலில் உள்ள பொத்தானை மீண்டும் தட்டவும்.",
  wentWell: "நாங்கள் எதைச் சிறப்பாகச் செய்தோம்?",
  doBetter: "நாங்கள் எதை இன்னும் சிறப்பாகச் செய்யலாம்?",
  tapAny: "(எதையும் தட்டலாம்)",
  saving: "சேமிக்கிறது…",
  saved: "சேமிக்கப்பட்டது",
  couldntSave: "சேமிக்க முடியவில்லை. மீண்டும் தட்டவும்.",
  commentThanks: "நன்றி, உங்கள் கருத்து எங்களுக்குக் கிடைத்தது.",
  yourComment: "உங்கள் கருத்து",
  editComment: "கருத்தைத் திருத்து",
  tellMore: "இன்னும் ஏதாவது சொல்ல விரும்புகிறீர்களா?",
  optional: "(விருப்பமானால்)",
  commentPlaceholder: "எது நன்றாக இருந்தது, அல்லது எதை மேம்படுத்தலாம்?",
  sendComment: "கருத்தை அனுப்பு",
  sending: "அனுப்புகிறது…",
  goTo: "{host} க்குச் செல்லவும்",
  oneMoment: "சற்றுப் பொறுத்து மீண்டும் தட்டவும்.",
  done: "முடிந்தது",
  tapThatFits: "உங்களுக்குப் பொருந்துவதைத் தட்டுங்கள். அவ்வளவுதான்.",
  reminderNote: "நீங்கள் தவறவிட்டிருந்தால், ஒரு சிறிய நினைவூட்டல்.",
  reminderPrefix: "நினைவூட்டல்:",
  sentBy: "{business} TapTruly மூலம் அனுப்பியது.",
  stopEmails: "{business} இடமிருந்து வரும் கருத்துக்கணிப்பு மின்னஞ்சல்களை நிறுத்து",
  npsLow: "0 = வாய்ப்பில்லை",
  npsHigh: "10 = மிகவும் வாய்ப்புள்ளது",
  cesLow: "1 = மிகவும் கடினம்",
  cesHigh: "7 = மிகவும் எளிது",
  shareConsent: "{business} எனது கருத்தை அவர்களின் இணையதளத்திலும் சமூக ஊடகங்களிலும் பகிரலாம்",
  shareName: "காட்ட வேண்டிய முதல் பெயர் (விருப்பமானால்)",
  shareHint: "உங்கள் மின்னஞ்சல் ஒருபோதும் காட்டப்படாது.",
  wallTitle: "எங்கள் வாடிக்கையாளர்கள் சொல்வது",
  wallEmpty: "காட்ட இன்னும் மதிப்புரைகள் இல்லை.",
  aCustomer: "ஒரு வாடிக்கையாளர்",
  collectedWith: "TapTruly மூலம் சேகரிக்கப்பட்ட மதிப்பீடுகள்",
  recoverySubject: "நாங்கள் அதைச் சரிசெய்தோமா?",
  recoveryIntro: "வணக்கம்,\n\nசமீபத்தில் நாங்கள் சரியாகச் செய்யவில்லை என்று எங்களிடம் சொன்னீர்கள். அதைச் சரிசெய்ய முயன்றோம். இப்போது {business} பற்றி நீங்கள் எப்படி உணர்கிறீர்கள்?",
};

const STRINGS: Record<Lang, Record<PublicKey, string>> = { en, si, ta };

/** A customer-facing phrase; {name} placeholders are filled from vars. */
export function pt(lang: Lang | undefined, key: PublicKey, vars: Record<string, string> = {}): string {
  const s = STRINGS[lang ?? "en"]?.[key] ?? en[key];
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
}

// Standard rating labels.
const LABELS: Record<Exclude<Lang, "en">, Partial<Record<IconSetId, Record<number, string>>>> = {
  si: {
    thumbs: { 1: "ප්‍රයෝජනවත් නැත", 2: "ප්‍රයෝජනවත්" },
    faces3: { 1: "අසතුටුයි", 2: "සාමාන්‍යයි", 3: "සතුටුයි" },
    faces5: { 1: "ඉතා දුර්වලයි", 2: "දුර්වලයි", 3: "සාමාන්‍යයි", 4: "හොඳයි", 5: "විශිෂ්ටයි" },
    ces: { 1: "ඉතා අපහසුයි", 2: "අපහසුයි", 3: "තරමක් අපහසුයි", 4: "මධ්‍යස්ථයි", 5: "තරමක් පහසුයි", 6: "පහසුයි", 7: "ඉතා පහසුයි" },
  },
  ta: {
    thumbs: { 1: "உதவவில்லை", 2: "உதவியது" },
    faces3: { 1: "திருப்தியில்லை", 2: "பரவாயில்லை", 3: "மகிழ்ச்சி" },
    faces5: { 1: "மிக மோசம்", 2: "மோசம்", 3: "பரவாயில்லை", 4: "நன்று", 5: "மிகச் சிறப்பு" },
    ces: { 1: "மிகவும் கடினம்", 2: "கடினம்", 3: "சற்று கடினம்", 4: "இரண்டுமில்லை", 5: "சற்று எளிது", 6: "எளிது", 7: "மிகவும் எளிது" },
  },
};

/** The standard label for a rating in this language (the business's own labels take priority elsewhere). */
export function standardLabel(iconSet: IconSetId, value: number, lang: Lang = "en"): string {
  const english = ICON_SETS[iconSet].options.find((o) => o.value === value)?.label ?? String(value);
  if (lang === "en") return english;
  if (iconSet === "stars5") return lang === "si" ? `තරු ${value}` : `${value} ${value === 1 ? "நட்சத்திரம்" : "நட்சத்திரங்கள்"}`;
  if (iconSet === "nps") return String(value);
  return LABELS[lang][iconSet]?.[value] ?? english;
}

/** BCP 47 tag for the lang attribute (helps screen readers pronounce the page correctly). */
export const HTML_LANG: Record<Lang, string> = { en: "en", si: "si", ta: "ta" };

/** Starting text for a new survey in each language (the business can change all of it). */
export const SURVEY_DEFAULTS: Record<Lang, { question: string; thanks: string; positive: string[]; negative: string[] }> = {
  en: {
    question: "How did we do?",
    thanks: "Thanks for your feedback!",
    positive: ["Fast reply", "Friendly", "Solved my problem", "Easy to understand"],
    negative: ["Slow reply", "Not solved", "Hard to understand", "Unfriendly"],
  },
  si: {
    question: "අපගේ සේවය කෙසේද?",
    thanks: "ඔබේ ප්‍රතිචාරයට ස්තූතියි!",
    positive: ["ඉක්මන් පිළිතුර", "සුහදශීලී", "ගැටලුව විසඳුණා", "තේරුම් ගැනීමට පහසුයි"],
    negative: ["පිළිතුර ප්‍රමාදයි", "ගැටලුව විසඳුණේ නැහැ", "තේරුම් ගැනීමට අපහසුයි", "සුහදශීලී නැහැ"],
  },
  ta: {
    question: "எங்கள் சேவை எப்படி இருந்தது?",
    thanks: "உங்கள் கருத்துக்கு நன்றி!",
    positive: ["விரைவான பதில்", "நட்பானவர்", "பிரச்சினை தீர்ந்தது", "புரிந்துகொள்ள எளிது"],
    negative: ["தாமதமான பதில்", "பிரச்சினை தீரவில்லை", "புரிந்துகொள்ள கடினம்", "நட்பில்லை"],
  },
};
