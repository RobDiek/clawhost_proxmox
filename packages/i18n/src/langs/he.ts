import type { Translations } from '../types'
import en from './en'

const he: Translations = {
    ...en,
    common: {
        ...en.common,
        loading: 'טוען...',
        save: 'שמור',
        cancel: 'ביטול',
        confirm: 'אישור',
        delete: 'מחיקה',
        deleting: 'מוחק...',
        create: 'יצירה',
        done: 'סיום',
        back: 'חזרה',
        copy: 'העתק',
        copied: 'הועתק.',
        copiedWithLabel: '{{label}} הועתק.',
        show: 'הצג',
        hide: 'הסתר',
        tryAgain: 'נסו שוב',
        addKey: 'הוסף מפתח',
        close: 'סגור',
        none: 'אין',
        all: 'הכל',
        unknown: 'לא ידוע',
        pageNotFound: 'העמוד לא נמצא',
        closeNotification: 'סגור הודעה',
        beta: 'Beta',
        brandName: 'OpenClaw Hosting',
        legalEmail: 'sergei@flowmatic.co.il',
        scrollToBottom: 'גלול למטה'
    },
    setup: {
        welcomeTitle: 'ברוכים הבאים ל-OpenClaw Hosting',
        welcomeDescription: 'הגדירו את הפרופיל שלכם כדי להתחיל.',
        whatsYourName: 'מה השם שלכם?',
        namePlaceholder: 'הכניסו את השם',
        nameHint: 'תמיד אפשר לשנות אחר כך.',
        getStarted: 'בואו נתחיל'
    },
    language: {
        ...en.language,
        he: 'עברית',
        switchLanguage: 'שפה'
    },
    theme: {
        light: 'בהיר',
        dark: 'כהה',
        system: 'מערכת',
        toggleTheme: 'החלף ערכת נושא'
    },
    nav: {
        ...en.nav,
        claws: 'סוכנים',
        sshKeys: 'מפתחות SSH',
        account: 'חשבון',
        billing: 'חיוב',
        signOut: 'התנתק',
        admin: 'ניהול',
        login: 'כניסה',
        deploy: 'הפעלה',
        deployOpenClaw: 'הפעל OpenClaw',
        toggleMenu: 'תפריט',
        cloud: 'ענן',
        cloudSubtitle: 'טכני'
    },
    footer: {
        ...en.footer,
        copyright: 'OpenClaw Hosting by Flowmatic. כל הזכויות שמורות.',
        termsOfService: 'תנאי שימוש',
        privacyPolicy: 'מדיניות פרטיות',
        getInTouch: 'צרו קשר',
        brandDescription: 'הפעילו סוכן OpenClaw על VPS ייעודי בלחיצה אחת. פרטיות מלאה, משאבים ייעודיים.',
        product: 'מוצר',
        howItWorks: 'איך זה עובד',
        features: 'יכולות',
        pricing: 'מחירים',
        faq: 'שאלות',
        blog: 'בלוג',
        changelog: 'עדכונים',
        legalAndMore: 'אחר'
    },
    errors: {
        ...en.errors,
        somethingWentWrong: 'משהו השתבש!',
        notFound: 'העמוד לא נמצא!',
        pageNotFoundDescription: 'העמוד שחיפשתם לא קיים או שהועבר.',
        goToHomepage: 'חזרה לדף הבית'
    },
    auth: {
        ...en.auth,
        loginTitle: 'כניסה',
        loginSubtitle: 'היכנסו לחשבון שלכם כדי לנהל את הסוכנים.',
        emailPlaceholder: 'האימייל שלכם',
        sendCode: 'שלח קוד',
        enterCode: 'הכניסו את הקוד',
        verifyCode: 'אימות',
        codeSent: 'קוד אימות נשלח למייל שלכם.',
        codeExpired: 'הקוד פג תוקף. נסו שוב.',
        invalidCode: 'קוד לא תקין!'
    },
    billing: {
        ...en.billing,
        title: 'חיוב',
        currentPlan: 'תוכנית נוכחית',
        cancelSubscription: 'ביטול מנוי',
        paymentHistory: 'היסטוריית תשלומים'
    },
    dashboard: {
        ...en.dashboard,
        title: 'הסוכנים שלי',
        noClaw: 'אין סוכנים עדיין',
        noClawDescription: 'צרו את הסוכן הראשון שלכם כדי להתחיל.'
    },
    landing: {
        ...en.landing,
        heroTitle1: 'סוכן AI',
        heroTitle2: 'שעובד בשבילכם 24/7',
        heroDescription: 'הקימו סוכן OpenClaw על שרת ייעודי בענן — עם טלגרם, Google, אוטומציות וניתוב מודלים. ללא שורת קוד אחת.',
        heroDescription2: 'בחרו את הסוכנים שלכם, שלמו, ותוך 3 דקות הכל עובד.',
        deployNow: 'הפעילו עכשיו',
        learnMore: 'למדו עוד',
        featuresTitle: 'מה כלול',
        featuresDescription: 'כל מה שצריך כדי להריץ סוכן AI מקצועי.',
        pricingTitle: 'מחירים',
        pricingDescription: 'התוכנית נבחרת אוטומטית לפי הסוכנים שבחרתם.',
        pricingMonthly: '₪{{price}}/חודש',
        faqTitle: 'שאלות נפוצות',
        faqHeading: 'שאלות נפוצות',
        faqDescription: 'כל מה שצריך לדעת על OpenClaw Hosting.'
    },
    createClaw: {
        ...en.createClaw,
        title: 'הפעלת סוכן חדש',
        deploy: 'הפעלה'
    }
}

export default he
